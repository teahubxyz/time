// The whole thing, end to end, against a fake Venice and a fake Whop: greet, haggle, quote card, a simulated
// signed payment, then coach mode. Nothing is bought and nothing is created on Whop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";
import { sign, SIG_HEADER, TS_HEADER } from "../src/webhook.js";
import { memorySink } from "../src/deallog.js";
import { PRODUCT } from "../src/mode.js";
import { QUOTE_TOOL } from "../src/voice.js";
import { unseal } from "../src/cards.js";
import { buyerOf, packIndex } from "../src/seats.js";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const ENV = { TASKMASTER_CARD_SECRET: "card-secret", WHOP_WEBHOOK_SECRET: "whsec_test",
              TASKMASTER_SHEET: "You are Taskmaster. [sheet]", TASKMASTER_SHARE_URL: "https://taskmaster.whop.site/" };

// A fake Venice that plays a script: each entry is either a line, or a line plus the quote tool call the character
// would have made. It also records what prompt it was sent, which is how the mode tests below read the mode.
function script(turns) {
  const seen = [];
  const voice = {
    async say({ system, messages, tools, max_tokens }) {
      seen.push({ system, messages, tools, max_tokens });
      const next = turns.shift() ?? { text: "..." };
      return { text: next.text ?? "", calls: next.quote ? [{ id: `c${seen.length}`, name: "quote", args: next.quote }] : [], usage: null };
    },
  };
  voice.seen = seen;
  return voice;
}

// A fake Whop that answers the way Whop answers: `membershipsFor` returns what that user *holds*, so a lead's seat
// pack is the lead's and a seat holder of theirs holds nothing at all. A merge really merges, so a write is visible
// to the next read. `arm` pins the anchor-height experiment, so these tests read one mechanic rather than whichever
// arm the member's id happens to hash into.
function world({ turns = [], memberships = [], now = NOW, arm = "list", checkout, merge } = {}) {
  const deals = new Map(), threads = new Map(), writes = [];
  const sink = memorySink();
  const packs = packIndex();
  const whop = {
    membershipsFor: async (user) => memberships.filter((m) => buyerOf(m) === user),
    membership: async (id) => memberships.find((m) => m.id === id) ?? null,
    checkout: checkout ?? (async ({ tier, price, deal }) => ({ id: `cfg_${tier}_${price}`, url: `https://whop.com/checkout/cfg_${tier}_${price}`,
                                                               variant: `${tier}:${price}`, reused: false, metadata: { deal } })),
    mergeMembershipMetadata: merge ?? (async (id, patch) => {
      writes.push([id, patch]);
      const m = memberships.find((x) => x.id === id);
      if (m) m.metadata = { ...m.metadata, ...patch };
      return m ?? { id };
    }),
  };
  const voice = script(turns);
  const fetch = app(ENV, {
    voice, whop, packs, clock: () => now, log: sink, experiments: { arm: async () => arm },
    deals: { get: async (id) => deals.get(id) ?? null, save: async (d) => void deals.set(d.id, d) },
    threads: { get: async (id) => threads.get(id) ?? null, save: async (t) => void threads.set(t.id, t) },
  });
  return { fetch, deals, threads, writes, sink, voice, memberships, packs };
}

const post = (fetch, path, body) => fetch(new Request(`https://taskmaster.whop.site${path}`,
  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const get = (fetch, path) => fetch(new Request(`https://taskmaster.whop.site${path}`));

test("greet, haggle, quote card, simulated payment, coach mode", async () => {
  const w = world({
    turns: [
      { text: "So you are stuck on a launch you keep moving." },                                      // greet
      { text: "", quote: { tier: "sprint", price: 100 } },                                            // opens at the anchor
      { text: "A hundred. One hour, one blocker." },
      { text: "", quote: { tier: "sprint", price: 92, reason: "scope", note: "only the API part" } },  // earned step
      { text: "Ninety-two, since you cut the write-up." },
    ],
  });
  w.threads.set("t1", { id: "t1", member: "user_ann", deal: null, turns: [] });

  const greet = await (await post(w.fetch, "/api/chat", { thread: "t1", text: "hi" })).json();
  assert.equal(greet.mode, "haggle");
  assert.equal(greet.reply, "So you are stuck on a launch you keep moving.");
  assert.deepEqual(greet.cards, []);
  assert.deepEqual(w.voice.seen[0].tools, [QUOTE_TOOL], "the haggle prompt gets exactly one tool");
  assert.ok(w.voice.seen[0].system.startsWith(ENV.TASKMASTER_SHEET));

  const open = await (await post(w.fetch, "/api/chat", { thread: "t1", text: "how much?" })).json();
  assert.equal(open.verdict, "accept");
  assert.equal(open.deal.price, 100);
  assert.equal(open.deal.round, 1);
  assert.equal(open.cards.length, 1, "an accepted price is a card straight away");

  const deal = [...w.deals.values()][0];
  assert.equal(deal.outcome, "agreed");

  // the desk's verdict is handed back to the character, so it says the desk's number and not its own
  const handback = w.voice.seen[2].messages.at(-1).content;
  assert.match(handback, /\[deal desk\] accept/);

  const card = open.cards[0];
  assert.equal(card.price, 100);
  assert.equal(card.checkout, "https://whop.com/checkout/cfg_sprint_100");
  assert.ok(await unseal(card, ENV.TASKMASTER_CARD_SECRET));

  // the member presses the button; a card that came back edited does not buy anything
  const taken = await (await post(w.fetch, "/api/agree", { thread: "t1", card })).json();
  assert.equal(taken.checkout, card.checkout);
  const forged = await post(w.fetch, "/api/agree", { thread: "t1", card: { ...card, price: 5 } });
  assert.equal(forged.status, 400);

  // ---- a simulated, signed Whop payment. No money moves; this is the shape of the event.
  const raw = JSON.stringify({ action: "payment.succeeded",
    data: { id: "pay_1", membership_id: "mem_ann", final_amount: 100, metadata: { deal: deal.id, member: "user_ann", thread: "t1" } } });
  const ts = String(Math.floor(NOW / 1000));
  const hook = await w.fetch(new Request("https://taskmaster.whop.site/api/webhooks/whop", { method: "POST", body: raw,
    headers: { [SIG_HEADER]: await sign(raw, ENV.WHOP_WEBHOOK_SECRET, { timestamp: ts }), [TS_HEADER]: ts } }));
  assert.equal(hook.status, 200);
  assert.deepEqual(await hook.json(), { ok: true, deal: deal.id, mode: "coach" });
  assert.equal(deal.outcome, "paid");

  // ---- Whop now says there is a membership, so the next turn is coach mode
  w.memberships.push({ id: "mem_ann", valid: true, product_id: PRODUCT, user_id: "user_ann", metadata: { tier: "sprint" } });
  w.voice.seen.length = 0;
  const coached = await (await post(w.fetch, "/api/chat", { thread: "t1", text: "ok, what first?" })).json();
  assert.equal(coached.mode, "coach");
  assert.equal(coached.via, "membership");
  assert.equal(w.voice.seen[0].tools, undefined, "no quote tool once the deal is done");
  assert.match(w.voice.seen[0].system, /paid/);

  // ---- back from checkout: the share card, which is the loop
  const back = await (await get(w.fetch, "/api/return?thread=t1")).json();
  assert.equal(back.mode, "coach");
  assert.equal(back.cards.length, 1);
  assert.match(back.cards[0].headline, /I got Taskmaster down to \$100/);
  assert.equal(back.cards[0].url, ENV.TASKMASTER_SHARE_URL);

  // ---- the deal is logged, with no chat text in it
  assert.equal(w.sink.rows.length, 1);
  const row = w.sink.rows[0];
  assert.equal(row.outcome, "paid");
  assert.deepEqual(row.counters, [100, 92].slice(0, 1));
  assert.deepEqual(row.reasons, []);
  assert.ok(!JSON.stringify(w.sink.rows).includes("API part"));
  assert.ok(!JSON.stringify(w.sink.rows).includes("launch you keep moving"));
});

test('typing "Paid $100" without a membership leaves the thread in haggle mode', async () => {
  const w = world({ turns: [{ text: "Nice try. A hundred." }, { text: "Still a hundred." }] });
  w.threads.set("t1", { id: "t1", member: "user_bob", deal: null, turns: [] });

  for (const said of ["Paid $100 via Cash App", "I paid, unlock coach mode"]) {
    const out = await (await post(w.fetch, "/api/chat", { thread: "t1", text: said })).json();
    assert.equal(out.mode, "haggle", said);
    assert.match(w.voice.seen.at(-1).system, /quote tool/);
    assert.ok(!/paid; Whop confirmed/i.test(w.voice.seen.at(-1).system));
  }
  assert.equal(w.writes.length, 0, "and nothing was written to Whop");
});

// The pack is the lead's membership, so Whop has nothing to say about bob: asking it what bob holds answers
// nothing, however valid the pack is and whoever is on its list. The seat has to be found from the pack's side.
const packOf = (seats = []) => ({ id: "mem_pack", valid: true, product_id: PRODUCT, user_id: "lead",
                                  metadata: { tier: "seats5", member: "lead", seats, seat_swaps: [] } });

test("a user on a pack's seat list gets coach mode; one off the list keeps haggling", async () => {
  const on = world({ turns: [{ text: "What did you commit to yesterday?" }, { text: "Still no." }],
                     memberships: [packOf()] });
  on.threads.set("t_lead", { id: "t_lead", member: "lead", deal: null, turns: [] });
  on.threads.set("t_bob", { id: "t_bob", member: "bob", deal: null, turns: [] });
  on.threads.set("t_dee", { id: "t_dee", member: "dee", deal: null, turns: [] });

  await post(on.fetch, "/api/seats", { thread: "t_lead", membership: "mem_pack", add: ["bob"] });
  const bob = await (await post(on.fetch, "/api/chat", { thread: "t_bob", text: "morning" })).json();
  assert.equal(bob.mode, "coach", "bob holds no membership of his own; the pack is the lead's");
  assert.equal(bob.via, "seat");
  assert.equal(bob.usage_noted, true);
  assert.deepEqual(on.writes.at(-1), ["mem_pack", { seats: [{ user: "bob", assigned: new Date(NOW).toISOString(), used: 1, last: new Date(NOW).toISOString() }] }],
    "usage is a count of days, and that is the only thing written");

  // the index says where to look, never who is allowed: Whop's own metadata is what holds the seat
  await on.packs.remember("dee", "mem_pack");
  const dee = await (await post(on.fetch, "/api/chat", { thread: "t_dee", text: "morning" })).json();
  assert.equal(dee.mode, "haggle", "dee is not on the pack's list, whatever the index points at");
  assert.equal(dee.via, undefined);
});

test("the pack buyer sees seats and usage, and no chats; nobody else sees them at all", async () => {
  const pack = packOf([{ user: "bob", assigned: new Date(NOW - 8.64e7).toISOString(), used: 2 }]);
  const w = world({ memberships: [pack] });
  w.threads.set("t_lead", { id: "t_lead", member: "lead", deal: null, turns: [] });
  w.threads.set("t_bob", { id: "t_bob", member: "bob", deal: null, turns: [] });

  const view = await (await get(w.fetch, "/api/seats?thread=t_lead&membership=mem_pack")).json();
  assert.equal(view.seats, 5);
  assert.equal(view.assigned, 1);
  assert.equal(view.open, 4);
  assert.equal(view.used, 2);
  assert.deepEqual(Object.keys(view.holders[0]).sort(), ["assigned", "last", "used", "user"]);
  assert.ok(!JSON.stringify(view).toLowerCase().includes("chat"));

  // a membership id is not a password: a seat holder of the pack is not its buyer either
  assert.equal((await get(w.fetch, "/api/seats?thread=t_bob&membership=mem_pack")).status, 403);
  assert.equal((await post(w.fetch, "/api/seats", { thread: "t_bob", membership: "mem_pack", add: ["cy"] })).status, 403);
  assert.equal((await get(w.fetch, "/api/seats?membership=mem_pack")).status, 404, "and a thread is how a caller says who they are");
  assert.equal(w.writes.length, 0);

  const after = await (await post(w.fetch, "/api/seats", { thread: "t_lead", membership: "mem_pack", add: ["cy", "dee"] })).json();
  assert.deepEqual(after.holders.map((h) => h.user), ["bob", "cy", "dee"]);
  assert.equal(w.writes.length, 1);
  assert.deepEqual(await w.packs.for("cy"), ["mem_pack"], "and the new seats are where the server can find them");
  const full = await post(w.fetch, "/api/seats", { thread: "t_lead", membership: "mem_pack", add: ["e", "f", "g", "h", "i"] });
  assert.equal(full.status, 400);
  assert.match((await full.json()).error, /has 5 seats/);
  assert.equal(w.writes.length, 1, "a refused assignment writes nothing to Whop");

  // a swap takes the seat away, and the index stops pointing at the pack for them
  await post(w.fetch, "/api/seats", { thread: "t_lead", membership: "mem_pack", add: ["eve"], remove: ["cy"] });
  assert.deepEqual(await w.packs.for("cy"), []);
  assert.deepEqual(await w.packs.for("eve"), ["mem_pack"]);
});

// Whop answers membership queries to a user id and seat lists are written in usernames, so a thread carries both.
// A seat holder whose thread knows only the id would be a stranger to every seat list there is.
test("a seat is held by a username while a membership is held by a user id, and one person is both", async () => {
  const pack = packOf([{ user: "bobby", used: 0 }]);
  const w = world({ turns: [{ text: "What did you commit to yesterday?" }], memberships: [pack] });
  w.threads.set("t_bob", { id: "t_bob", member: "user_7f3a", username: "bobby", deal: null, turns: [] });
  await w.packs.remember("bobby", "mem_pack");

  const bob = await (await post(w.fetch, "/api/chat", { thread: "t_bob", text: "morning" })).json();
  assert.equal(bob.mode, "coach");
  assert.equal(bob.via, "seat");
  assert.deepEqual(w.writes.at(-1)[1].seats.map((s) => s.user), ["bobby"], "the usage is the username's, not the id's");

  // and the lead, whose pack Whop hands back under their user id, is still its buyer
  const lead = world({ memberships: [{ ...pack, metadata: { ...pack.metadata, member: undefined, seats: [] }, user_id: "user_lead" }] });
  lead.threads.set("t_lead", { id: "t_lead", member: "user_lead", username: "leadia", deal: null, turns: [] });
  const view = await (await get(lead.fetch, "/api/seats?thread=t_lead&membership=mem_pack")).json();
  assert.equal(view.seats, 5);
  assert.equal(view.assigned, 0);
});

test("a seat holder still gets their answer when Whop will not take the usage write", async () => {
  // which is every day of card #66: the live guard refuses membership writes until the previews are approved
  const w = world({ turns: [{ text: "What did you commit to yesterday?" }], memberships: [packOf([{ user: "bob", used: 0 }])],
                    merge: async () => { throw new Error("refusing to write membership metadata"); } });
  w.threads.set("t_bob", { id: "t_bob", member: "bob", deal: null, turns: [] });
  await w.packs.remember("bob", "mem_pack");

  const out = await post(w.fetch, "/api/chat", { thread: "t_bob", text: "morning" });
  assert.equal(out.status, 200, "bookkeeping does not get to 500 a turn the member paid for");
  const body = await out.json();
  assert.equal(body.mode, "coach");
  assert.equal(body.reply, "What did you commit to yesterday?");
  assert.equal(body.usage_noted, false, "and the failed write is reported rather than swallowed");
});

// The webhook can be late, lost, or named something other than the events webhook.js matches on. A membership is
// the same confirmation by the other road, and the deal has to close on it: an agreed deal left open would be
// logged as a walkaway the moment the thread closed, which would put a paid deal in the log as a lost one.
test("back from checkout with no webhook: the membership closes the deal, logs it once and shares it", async () => {
  const w = world({ turns: [{ text: "", quote: { tier: "lite", price: 50 } }, { text: "Fifty." }] });
  w.threads.set("t1", { id: "t1", member: "user_eve", deal: null, turns: [] });
  const open = await (await post(w.fetch, "/api/chat", { thread: "t1", text: "how much for the short one?" })).json();
  assert.equal(open.verdict, "accept");
  const deal = [...w.deals.values()][0];
  assert.equal(deal.outcome, "agreed");

  // they paid. Whop has a membership for it; no webhook ever arrives.
  w.memberships.push({ id: "mem_eve", valid: true, product_id: PRODUCT, user_id: "user_eve",
                       metadata: { tier: "lite", member: "user_eve", deal: deal.id } });
  const back = await (await get(w.fetch, "/api/return?thread=t1")).json();
  assert.equal(back.mode, "coach");
  assert.equal(back.deal.outcome, "paid");
  assert.equal(deal.receipt, "mem_eve");
  assert.equal(back.cards.length, 1);
  assert.match(back.cards[0].headline, /I got Taskmaster down to \$50/);
  assert.equal(w.sink.rows.length, 1);
  assert.equal(w.sink.rows[0].outcome, "paid");

  // and it closes once, however often they come back or however the thread ends
  await get(w.fetch, "/api/return?thread=t1");
  assert.deepEqual(await (await post(w.fetch, "/api/walkaway", { thread: "t1" })).json(), { ok: true });
  assert.equal(w.sink.rows.length, 1, "a paid deal is never logged as a walkaway");
});

test("a membership from another deal does not close this one", async () => {
  const w = world({ turns: [{ text: "", quote: { tier: "sprint", price: 100 } }, { text: "A hundred." }] });
  w.threads.set("t1", { id: "t1", member: "user_fay", deal: null, turns: [] });
  await post(w.fetch, "/api/chat", { thread: "t1", text: "how much?" });
  // last month's sprint, still valid: coach mode, yes — this haggle paid for, no
  w.memberships.push({ id: "mem_old", valid: true, product_id: PRODUCT, user_id: "user_fay",
                       metadata: { tier: "sprint", member: "user_fay", deal: "deal_lastmonth" } });
  const back = await (await get(w.fetch, "/api/return?thread=t1")).json();
  assert.equal(back.mode, "coach");
  assert.equal(back.deal.outcome, "agreed");
  assert.deepEqual(back.cards, []);
  assert.equal(w.sink.rows.length, 0);
});

test("Whop refusing the checkout costs the button, not the deal", async () => {
  const w = world({
    turns: [{ text: "", quote: { tier: "sprint", price: 100 } }, { text: "A hundred." }],
    checkout: async () => { throw new Error("refusing to create a checkout configuration: pass live: true"); },
  });
  w.threads.set("t1", { id: "t1", member: "user_gil", deal: null, turns: [] });
  const open = await (await post(w.fetch, "/api/chat", { thread: "t1", text: "how much?" })).json();
  assert.equal(open.verdict, "accept", "the price was the desk's and it stands");
  assert.equal(open.cards.length, 1);
  assert.equal(open.cards[0].price, 100);
  assert.equal(open.cards[0].checkout, null, "the card has no button yet");
  assert.ok(await unseal(open.cards[0], ENV.TASKMASTER_CARD_SECRET), "and it is still a card the model cannot edit");

  const pressed = await post(w.fetch, "/api/agree", { thread: "t1", card: open.cards[0] });
  assert.equal(pressed.status, 503);
  assert.equal((await pressed.json()).price, 100);

  // once Whop will take it, the same card buys at the same price: the URL comes from the server, not the card
  const live = world({ turns: [{ text: "", quote: { tier: "sprint", price: 100 } }, { text: "A hundred." }] });
  live.threads.set("t1", { id: "t1", member: "user_gil", deal: null, turns: [] });
  live.deals.set(open.cards[0].deal, { ...[...w.deals.values()][0] });
  const again = await (await post(live.fetch, "/api/agree", { thread: "t1", card: open.cards[0] })).json();
  assert.equal(again.checkout, "https://whop.com/checkout/cfg_sprint_100");
  assert.equal(again.price, 100);
});

test("a walkaway is logged, and the thread's own rate limit holds", async () => {
  const w = world({ turns: [{ text: "", quote: { tier: "sprint", price: 100 } }, { text: "A hundred." }] });
  w.threads.set("t1", { id: "t1", member: "user_cy", deal: null, turns: [] });
  await post(w.fetch, "/api/chat", { thread: "t1", text: "how much?" });
  const gone = await (await post(w.fetch, "/api/walkaway", { thread: "t1" })).json();
  assert.equal(gone.outcome, "walkaway", "a quote card taken to checkout and never paid is a walkaway");
  assert.equal(w.sink.rows.length, 1);
  assert.equal(w.sink.rows[0].outcome, "walkaway");
  assert.equal(w.sink.rows[0].final, 100);
  assert.deepEqual(await (await post(w.fetch, "/api/walkaway", { thread: "t1" })).json(), { ok: true });
  assert.equal(w.sink.rows.length, 1, "and it is logged once");
});

test("the routes refuse what they should", async () => {
  const w = world();
  assert.equal((await post(w.fetch, "/api/chat", { thread: "nope", text: "hi" })).status, 404);
  assert.equal((await post(w.fetch, "/api/chat", { thread: "t1", text: "" })).status, 400);
  assert.equal((await post(w.fetch, "/api/chat", { thread: "t1", text: "x".repeat(2001) })).status, 413);
  assert.equal((await get(w.fetch, "/api/seats?membership=nope")).status, 404);
  assert.equal((await get(w.fetch, "/api/return?thread=nope")).status, 404);
  assert.equal((await get(w.fetch, "/api/nothing")).status, 404);
  const tiers = await (await get(w.fetch, "/api/tiers")).json();
  assert.ok(tiers.tiers.some((t) => t.id === "sprint"));
  assert.ok(tiers.tiers.every((t) => !("anchor" in t) && !("floor" in t)), "the floors are not the client's business");
});

test("a member cannot spend the owner's tokens without limit", async () => {
  const w = world({ turns: Array.from({ length: 200 }, () => ({ text: "No." })) });
  w.threads.set("t1", { id: "t1", member: "user_dee", deal: null, turns: [] });
  let last;
  for (let i = 0; i < 60; i++) last = await post(w.fetch, "/api/chat", { thread: "t1", text: "again" });
  assert.equal(last.status, 429);
  assert.ok((await last.json()).retry_after_ms > 0);
});
