// Taskmaster's server. A plain fetch handler, so it runs on Whop's hosting under their template's route or on its
// own; `app(env, deps)` returns `fetch(request)` and holds no module state.
//
//   POST /api/chat        { thread, text }   one turn. The server decides the mode and sends that prompt.
//   POST /api/agree       { thread, card }   the member takes the sealed quote; answers with the checkout.
//   POST /api/webhooks/whop                  signed by Whop; one of the two things that unlock coach mode.
//   GET  /api/return?thread=              back from checkout: ask Whop whether the membership is there yet.
//   GET  /api/seats?thread=&membership=   the pack buyer's seats and usage. Never anyone's chats.
//   POST /api/seats       { thread, membership, add, remove }
//
// A thread is this app's identity: the server wrote down who is in it, so `thread.member` is the one thing on a
// request that a member cannot pick for themselves. Every route that speaks for a member goes through one, which
// is why the seats routes take a thread too — a pack's seat list is the buyer's, not anyone's who knows the
// membership id. Under Whop's app frame a verified user token takes that job over: the seam is the one line in
// each route that turns a request into a member, and `isBuyer` (seats.js) is what that member is then checked by.
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

import { openDeal, quote, agree, walkaway, paid, MAX_ROUNDS } from "./dealdesk.js";
import { quoteCard, shareCard, unseal } from "./cards.js";
import { modeFor, promptFor, PRODUCT } from "./mode.js";
import { record } from "./deallog.js";
import { assign, buyerView, useSeat, size, isBuyer, packIndex, seatsOf } from "./seats.js";
import { handle as handleWebhook } from "./webhook.js";
import { armFor, openingFor } from "./experiments.js";
import { tier, TIERS, IDS } from "./tiers.js";
import { QUOTE_TOOL, HAGGLE_MAX_TOKENS, COACH_MAX_TOKENS, limiter } from "./voice.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const MAX_TEXT = 2000;

// deps: { voice, whop, deals, threads, log, packs?, experiments?, clock? }
//   deals   { get(id), save(deal) }
//   threads { get(id), save(thread) }   a thread is { id, member, username?, deal, turns: [{role, content}] }
//   log     a deal-log sink (deallog.js)
//   packs   { for(user), remember(user, membership), forget(user, membership) }   where to look for a seat (seats.js)
export function app(env = {}, deps = {}) {
  const now = () => (deps.clock ? deps.clock() : Date.now());
  const gate = deps.limit ?? limiter({ clock: now });
  const packs = deps.packs ?? packIndex();
  const secret = env.TASKMASTER_CARD_SECRET;
  const prompts = { haggle: env.TASKMASTER_PROMPT_HAGGLE, coach: env.TASKMASTER_PROMPT_COACH };
  const sheet = env.TASKMASTER_SHEET;

  // Two names for one person, because Whop answers to both. `member` is the Whop user id its membership queries
  // take; `username` is what a seat list holds, because a lead assigns seats by Whop username and nobody types a
  // `user_…` id into a seat form. A thread carries both, and where the host only knows one it stands for both.
  const idOf = (thread) => thread?.member ?? null;
  const nameOf = (thread) => thread?.username ?? thread?.member ?? null;

  // Whop is asked, the member is not. A pack membership is deliberately not an individual membership: a lead who
  // buys ten seats and keeps none for themselves is a buyer, not a seat holder, and gets the seats view rather
  // than coaching. Putting their own username on the list is all it takes.
  //
  // Two questions, because Whop answers only the first. "What does this member hold?" finds their own membership,
  // and the lead's pack. "Which pack seats this member?" cannot be asked of Whop at all — a seat holder holds
  // nothing, the pack is the lead's — so the index says which packs to look at and Whop's own metadata on each one
  // says whether the seat is really there. Without that second question a seat holder is a stranger: coach mode
  // for a pack would only ever work for the lead who bought it.
  async function whoIs(thread) {
    const held = await deps.whop.membershipsFor(idOf(thread));
    const seen = new Set(held.map((m) => m?.id).filter(Boolean));
    const seated = [];
    for (const id of await packs.for(nameOf(thread))) {
      if (seen.has(id)) continue;
      const m = await deps.whop.membership(id).catch(() => null);
      if (m) { seen.add(id); seated.push(m); }
    }
    return modeFor({
      memberships: held.filter((m) => size(m) === 0),
      packs: [...held.filter((m) => size(m) > 0), ...seated],
      user: nameOf(thread), product: PRODUCT, now: now(),
    });
  }

  async function chat({ thread: id, text }) {
    if (typeof text !== "string" || !text.trim()) return json({ error: "nothing to answer" }, 400);
    if (text.length > MAX_TEXT) return json({ error: "too long" }, 413);
    const thread = (await deps.threads.get(id)) ?? { id, member: null, deal: null, turns: [] };
    if (!thread.member) return json({ error: "unknown thread" }, 404);

    const allowed = gate.take(thread.member);
    if (!allowed.ok) return json({ error: "slow down", retry_after_ms: allowed.retry_after_ms }, 429);

    const who = await whoIs(thread);
    const system = promptFor(who.mode, { sheet, prompts });
    thread.turns.push({ role: "user", content: text });

    if (who.mode === "coach") {
      const said = await deps.voice.say({ system, messages: turns(thread), max_tokens: COACH_MAX_TOKENS });
      thread.turns.push({ role: "assistant", content: said.text });
      const noted = who.via === "seat" && who.membership ? await noteSeatUse(who.membership, nameOf(thread)) : null;
      await deps.threads.save(thread);
      return json({ mode: "coach", via: who.via, reply: said.text, cards: [], ...(noted === null ? {} : { usage_noted: noted }) });
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
      const checkout = await mintCheckout(deal, thread);
      await deps.deals.save(deal);
      cards.push(await quoteCard(deal, { checkout: checkout?.url ?? null, secret, now: now() }));
    }
    await deps.threads.save(thread);
    return json({ mode: "haggle", reply: after.text, cards, deal: dealView(deal), verdict: verdict.verdict });
  }

  // The agreed price is the desk's and it is already agreed; the checkout is Whop's and Whop can say no — it does
  // say no for the whole of card #66, where nothing may be created there yet, and it can be down on any day after.
  // Neither is a reason to drop the deal on the floor, so a refused checkout is a quote card with no button on it
  // (cards.js has always allowed that) and `/api/agree` tries again when the member presses it.
  async function mintCheckout(deal, thread) {
    try {
      const made = await deps.whop.checkout({
        tier: deal.tier, price: deal.price, member: deal.member, thread: thread.id, deal: deal.id,
        affiliate_code: thread.affiliate_code ?? null,
      });
      deal.checkout = made.id ?? null;
      return made;
    } catch (e) {
      deal.checkout = null;
      deal.checkout_error = String(e?.message ?? e);
      return null;
    }
  }

  // Usage is bookkeeping, written to Whop, and the member has already paid for the answer sitting in front of
  // them. A refused or failed write is reported and never thrown: losing a day's count is a smaller wrong than
  // 500ing a coaching turn.
  async function noteSeatUse(membership, user) {
    try {
      const patch = useSeat(await deps.whop.membership(membership), user, { now: now() });
      if (patch) await deps.whop.mergeMembershipMetadata(membership, patch);
      return true;
    } catch {
      return false;
    }
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
    // A card issued while Whop would not take a checkout has no button. The price was agreed all the same, so the
    // button is minted now if Whop will have it: the URL comes from the server, never from the card.
    if (!card.checkout) {
      const made = await mintCheckout(deal, thread);
      await deps.deals.save(deal);
      if (!made?.url) return json({ error: "that price is yours, but the checkout is not open yet", price: deal.price, tier: deal.tier }, 503);
      return json({ ok: true, checkout: made.url, price: deal.price, tier: deal.tier });
    }
    return json({ ok: true, checkout: card.checkout, price: deal.price, tier: deal.tier });
  }

  // Back from checkout. Whop's webhook is the receipt, but it can be late, it can be lost, and the event names it
  // is matched on are still the operator's to confirm — so the membership is checked here too, and a membership is
  // the same confirmation arriving by the other road. Either way the switch comes from Whop and not from the
  // member, and either way the deal closes exactly once: an agreed deal left open here would be logged as a
  // walkaway the moment the thread closed, which is the one lie the price-discovery log must not carry.
  async function back(url) {
    const id = url.searchParams.get("thread");
    const thread = id ? await deps.threads.get(id) : null;
    if (!thread) return json({ error: "unknown thread" }, 404);
    const who = await whoIs(thread);
    const deal = thread.deal ? await deps.deals.get(thread.deal) : null;
    if (deal?.outcome === "agreed" && who.mode === "coach" && who.via === "membership") await close(deal, who.membership);
    const cards = [];
    if (who.mode === "coach" && deal?.outcome === "paid") cards.push(shareCard(deal, { url: env.TASKMASTER_SHARE_URL ?? null }));
    return json({ mode: who.mode, via: who.via, cards, deal: deal ? dealView(deal) : null });
  }

  // Whop says this member holds a membership on Taskmaster's product and this thread has an agreed deal waiting on
  // one. The membership is read for its metadata before the deal is closed on it: if it names a deal, it has to be
  // this one — a member who bought a sprint last month does not get this month's haggle for free. Whether Whop
  // copies a checkout's metadata onto the membership is unconfirmed, so a membership that names no deal still
  // counts: it is a membership this member holds, on this product, with one deal of theirs outstanding.
  async function close(deal, membership) {
    const m = membership ? await deps.whop.membership(membership).catch(() => null) : null;
    const named = m?.metadata?.deal ?? null;
    if (named && named !== deal.id) return false;
    if (deal.outcome !== "agreed") return false;   // the webhook got there during that read; it closed and logged it
    paid(deal, { now: now(), receipt: membership ?? null });
    deal.membership = membership ?? null;
    await deps.deals.save(deal);
    await record(deal, { sink: deps.log, now: now() });
    return true;
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

  // The pack's seats and usage, and the assignments, both for the buyer alone: a membership id is not a password,
  // and a seat list is a paying org's staff list. The caller proves who they are the way every other route does,
  // with a thread the server wrote the member into.
  async function seats(req, url) {
    const body = req.method === "GET" ? Object.fromEntries(url.searchParams) : await req.json().catch(() => ({}));
    const thread = body.thread ? await deps.threads.get(body.thread) : null;
    if (!thread?.member) return json({ error: "unknown thread" }, 404);
    const m = body.membership ? await deps.whop.membership(body.membership).catch(() => null) : null;
    if (!m) return json({ error: "unknown membership" }, 404);
    if (!isBuyer(m, idOf(thread)) && !isBuyer(m, nameOf(thread))) return json({ error: "that pack is not yours" }, 403);

    if (req.method === "GET") return json(buyerView(m, { now: now() }));
    let patch;
    const before = seatsOf(m).map((s) => s.user);
    try { patch = assign(m, { add: body.add ?? [], remove: body.remove ?? [], now: now() }); }
    catch (e) { return json({ error: e.message }, 400); }
    try { await deps.whop.mergeMembershipMetadata(body.membership, patch); }
    catch (e) { return json({ error: String(e?.message ?? e) }, 503); }
    // Written to Whop, so now the index can say where these seats are. A swap takes the old holder's pointer with
    // it, so a turn of theirs costs no read, and Whop's metadata would have refused them anyway.
    const after = patch.seats.map((s) => s.user);
    for (const u of after) await packs.remember(u, m.id);
    for (const u of before) if (!after.includes(u)) await packs.forget(u, m.id);
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
