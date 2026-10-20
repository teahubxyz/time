// Taskmaster's server. A plain fetch handler, so it runs on Whop's hosting under their template's route or on its
// own; `app(env, deps)` returns `fetch(request)` and holds no module state.
//
//   POST /api/chat        { thread, text }   one turn. The server decides the mode and sends that prompt.
//   POST /api/agree       { thread, card }   the member takes the sealed quote; answers with the checkout.
//   POST /api/webhooks/whop                  signed by Whop; the only thing that unlocks coach mode.
//   GET  /api/return?thread=              back from checkout: ask Whop whether the membership is there yet.
//   GET  /api/seats?membership=           the pack buyer's seats and usage. Never anyone's chats.
//   POST /api/seats       { membership, add, remove }
//
// The shape of a turn:
//
//   1. The server asks Whop who this member is — never the member. `modeFor` answers haggle or coach.
//   2. In coach mode it sends the coach prompt with no tools, and the deal is over.
//   3. In haggle mode it sends the haggle prompt with one tool, `quote`. If the model calls it, the deal desk
//      answers and the desk's verdict goes back for one more turn, so the character says the desk's number.
//   4. On accept it seals a quote card. The card carries the checkout; the share card follows the payment.
//
// What a member types never moves step 1. "Paid $100 via Cash App" goes to the model as text like anything else
// and the mode stays what Whop says it is.

import { openDeal, quote, agree, walkaway, MAX_ROUNDS } from "./dealdesk.js";
import { quoteCard, shareCard, unseal } from "./cards.js";
import { modeFor, promptFor, PRODUCT } from "./mode.js";
import { record } from "./deallog.js";
import { assign, buyerView, useSeat, size } from "./seats.js";
import { handle as handleWebhook } from "./webhook.js";
import { armFor, openingFor } from "./experiments.js";
import { tier, TIERS, IDS } from "./tiers.js";
import { QUOTE_TOOL, HAGGLE_MAX_TOKENS, COACH_MAX_TOKENS, limiter } from "./voice.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const MAX_TEXT = 2000;

// deps: { voice, whop, deals, threads, log, experiments?, clock? }
//   deals   { get(id), save(deal) }
//   threads { get(id), save(thread) }   a thread is { id, member, deal, turns: [{role, content}] }
//   log     a deal-log sink (deallog.js)
export function app(env = {}, deps = {}) {
  const now = () => (deps.clock ? deps.clock() : Date.now());
  const gate = deps.limit ?? limiter({ clock: now });
  const secret = env.TASKMASTER_CARD_SECRET;
  const prompts = { haggle: env.TASKMASTER_PROMPT_HAGGLE, coach: env.TASKMASTER_PROMPT_COACH };
  const sheet = env.TASKMASTER_SHEET;

  // Whop is asked, the member is not. A pack membership is deliberately not an individual membership: a lead who
  // buys ten seats and keeps none for themselves is a buyer, not a seat holder, and gets the seats view rather
  // than coaching. Putting their own username on the list is all it takes.
  async function whoIs(member) {
    const held = await deps.whop.membershipsFor(member);
    const packs = held.filter((m) => size(m) > 0);
    return modeFor({ memberships: held.filter((m) => size(m) === 0), packs, user: member, product: PRODUCT, now: now() });
  }

  async function chat({ thread: id, text }) {
    if (typeof text !== "string" || !text.trim()) return json({ error: "nothing to answer" }, 400);
    if (text.length > MAX_TEXT) return json({ error: "too long" }, 413);
    const thread = (await deps.threads.get(id)) ?? { id, member: null, deal: null, turns: [] };
    if (!thread.member) return json({ error: "unknown thread" }, 404);

    const allowed = gate.take(thread.member);
    if (!allowed.ok) return json({ error: "slow down", retry_after_ms: allowed.retry_after_ms }, 429);

    const who = await whoIs(thread.member);
    const system = promptFor(who.mode, { sheet, prompts });
    thread.turns.push({ role: "user", content: text });

    if (who.mode === "coach") {
      const said = await deps.voice.say({ system, messages: turns(thread), max_tokens: COACH_MAX_TOKENS });
      thread.turns.push({ role: "assistant", content: said.text });
      if (who.via === "seat" && who.membership) {
        const patch = useSeat(await deps.whop.membership(who.membership), thread.member, { now: now() });
        if (patch) await deps.whop.mergeMembershipMetadata(who.membership, patch);
      }
      await deps.threads.save(thread);
      return json({ mode: "coach", via: who.via, reply: said.text, cards: [] });
    }

    const deal = await dealFor(thread);
    const said = await deps.voice.say({ system, messages: turns(thread), tools: [QUOTE_TOOL], max_tokens: HAGGLE_MAX_TOKENS });
    const call = said.calls.find((c) => c.name === "quote");
    if (!call) {
      thread.turns.push({ role: "assistant", content: said.text });
      await deps.threads.save(thread);
      return json({ mode: "haggle", reply: said.text, cards: [], deal: dealView(deal) });
    }

    const verdict = quote(deal, call.args);
    await deps.deals.save(deal);
    // One more turn, so the character delivers the desk's number in its own words instead of its own number.
    thread.turns.push({ role: "assistant", content: said.text || "", tool: call.name });
    const after = await deps.voice.say({
      system,
      messages: [...turns(thread), { role: "user", content: `[deal desk] ${verdict.verdict}: ${verdict.tell}` }],
      max_tokens: HAGGLE_MAX_TOKENS,
    });
    thread.turns.push({ role: "assistant", content: after.text });

    const cards = [];
    if (verdict.ok) {
      agree(deal, { now: now() });
      const checkout = await deps.whop.checkout({
        tier: deal.tier, price: deal.price, member: deal.member, thread: thread.id, deal: deal.id,
        affiliate_code: thread.affiliate_code ?? null,
      });
      deal.checkout = checkout.id ?? null;
      await deps.deals.save(deal);
      cards.push(await quoteCard(deal, { checkout: checkout.url, secret, now: now() }));
    }
    await deps.threads.save(thread);
    return json({ mode: "haggle", reply: after.text, cards, deal: dealView(deal), verdict: verdict.verdict });
  }

  async function dealFor(thread) {
    if (thread.deal) {
      const open = await deps.deals.get(thread.deal);
      if (open && open.outcome === "open") return open;
    }
    const id = thread.want && TIERS[thread.want] ? thread.want : "sprint";
    const { arm } = await armFor("anchor_height", thread.member, { client: deps.experiments ?? null });
    const made = openDeal({ tier: id, member: thread.member, thread: thread.id, opening: openingFor(tier(id), arm), now: now() });
    made.arm = arm;
    thread.deal = made.id;
    await deps.deals.save(made);
    return made;
  }

  // The member presses the card's button. The card is checked against its seal first: a card the model rewrote on
  // the way through does not buy anything.
  async function takeIt({ thread: id, card }) {
    const thread = await deps.threads.get(id);
    if (!thread) return json({ error: "unknown thread" }, 404);
    if (!(await unseal(card, secret))) return json({ error: "that quote card is not one I issued" }, 400);
    const deal = await deps.deals.get(card.deal);
    if (!deal || deal.thread !== id) return json({ error: "unknown deal" }, 404);
    if (deal.price !== card.price || deal.tier !== card.tier) return json({ error: "that card is out of date" }, 409);
    return json({ ok: true, checkout: card.checkout, price: deal.price, tier: deal.tier });
  }

  // Back from checkout. Whop's webhook is the receipt, but it can be late, so the membership is checked here too:
  // either way the switch comes from Whop and not from the member.
  async function back(url) {
    const id = url.searchParams.get("thread");
    const thread = id ? await deps.threads.get(id) : null;
    if (!thread) return json({ error: "unknown thread" }, 404);
    const who = await whoIs(thread.member);
    const deal = thread.deal ? await deps.deals.get(thread.deal) : null;
    const cards = [];
    if (who.mode === "coach" && deal?.outcome === "paid") cards.push(shareCard(deal, { url: env.TASKMASTER_SHARE_URL ?? null }));
    return json({ mode: who.mode, via: who.via, cards, deal: deal ? dealView(deal) : null });
  }

  // They left. An agreed deal counts too: a member who took a quote card to checkout and never paid is the most
  // useful walkaway there is, and Whop has no record of it.
  async function gone({ thread: id }) {
    const thread = await deps.threads.get(id);
    const deal = thread?.deal ? await deps.deals.get(thread.deal) : null;
    if (!deal || !["open", "agreed"].includes(deal.outcome)) return json({ ok: true });
    walkaway(deal, { now: now() });
    await deps.deals.save(deal);
    await record(deal, { sink: deps.log, now: now() });
    return json({ ok: true, outcome: "walkaway" });
  }

  async function seats(req, url) {
    if (req.method === "GET") {
      const id = url.searchParams.get("membership");
      const m = id ? await deps.whop.membership(id) : null;
      if (!m) return json({ error: "unknown membership" }, 404);
      return json(buyerView(m, { now: now() }));
    }
    const body = await req.json().catch(() => ({}));
    const m = body.membership ? await deps.whop.membership(body.membership) : null;
    if (!m) return json({ error: "unknown membership" }, 404);
    let patch;
    try { patch = assign(m, { add: body.add ?? [], remove: body.remove ?? [], now: now() }); }
    catch (e) { return json({ error: e.message }, 400); }
    await deps.whop.mergeMembershipMetadata(body.membership, patch);
    return json(buyerView({ ...m, metadata: { ...m.metadata, ...patch } }, { now: now() }));
  }

  return async function fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/api/chat" && req.method === "POST") return await chat(await req.json().catch(() => ({})));
      if (path === "/api/agree" && req.method === "POST") return await takeIt(await req.json().catch(() => ({})));
      if (path === "/api/walkaway" && req.method === "POST") return await gone(await req.json().catch(() => ({})));
      if (path === "/api/return" && req.method === "GET") return await back(url);
      if (path === "/api/seats") return await seats(req, url);
      if (path === "/api/tiers" && req.method === "GET") {
        return json({ tiers: IDS.map((id) => ({ id, label: TIERS[id].label, includes: TIERS[id].includes, access: TIERS[id].access })) });
      }
      if (path === "/api/webhooks/whop" && req.method === "POST") {
        const raw = await req.text();
        const out = await handleWebhook(raw, req.headers, {
          secret: env.WHOP_WEBHOOK_SECRET, now: now(),
          deps: { deals: deps.deals, log: (deal) => record(deal, { sink: deps.log, now: now() }), seats: deps.onPack ?? null },
        });
        return json(out.body, out.status);
      }
      return json({ error: "no such route" }, 404);
    } catch (e) {
      return json({ error: String(e?.message ?? e) }, 500);
    }
  };
}

// What the client may see of a deal: the numbers on the table and how much haggling is left. Not the desk's
// internals, and nothing a member wrote.
const dealView = (deal) => ({
  id: deal.id, tier: deal.tier, seats: deal.seats, price: deal.price, opening: deal.opening,
  round: deal.round, rounds_left: Math.max(0, MAX_ROUNDS - deal.round), outcome: deal.outcome,
});

// The last turns, trimmed: the owner pays for these tokens.
const turns = (thread, keep = 12) => thread.turns.slice(-keep).map(({ role, content }) => ({ role, content }));
