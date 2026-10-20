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

// `arm` pins the anchor-height experiment, so these tests read one mechanic rather than whichever arm the member's
// id happens to hash into.
function world({ turns = [], memberships = [], now = NOW, arm = "list" } = {}) {
  const deals = new Map(), threads = new Map(), writes = [];
  const sink = memorySink();
  const whop = {
    membershipsFor: async () => memberships,
    membership: async (id) => memberships.find((m) => m.id === id) ?? null,
    checkout: async ({ tier, price, deal }) => ({ id: `cfg_${tier}_${price}`, url: `https://whop.com/checkout/cfg_${tier}_${price}`,
                                                  variant: `${tier}:${price}`, reused: false, metadata: { deal } }),
    mergeMembershipMetadata: async (id, patch) => { writes.push([id, patch]); return { id }; },
  };
  const voice = script(turns);
  const fetch = app(ENV, {
    voice, whop, clock: () => now, log: sink, experiments: { arm: async () => arm },
    deals: { get: async (id) => deals.get(id) ?? null, save: async (d) => void deals.set(d.id, d) },
    threads: { get: async (id) => threads.get(id) ?? null, save: async (t) => void threads.set(t.id, t) },
  });
  return { fetch, deals, threads, writes, sink, voice, memberships };
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
  w.memberships.push({ id: "mem_ann", valid: true, product_id: PRODUCT, metadata: { tier: "sprint" } });
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

test("a user on a pack's seat list gets coach mode; one off the list keeps haggling", async () => {
  const pack = { id: "mem_pack", valid: true, product_id: PRODUCT,
                 metadata: { tier: "seats5", seats: [{ user: "bob", used: 0 }], seat_swaps: [] } };
  const on = world({ turns: [{ text: "What did you commit to yesterday?" }], memberships: [pack] });
  on.threads.set("t_bob", { id: "t_bob", member: "bob", deal: null, turns: [] });
  const bob = await (await post(on.fetch, "/api/chat", { thread: "t_bob", text: "morning" })).json();
  assert.equal(bob.mode, "coach");
  assert.equal(bob.via, "seat");
  assert.deepEqual(on.writes, [["mem_pack", { seats: [{ user: "bob", used: 1, last: new Date(NOW).toISOString() }] }]],
    "usage is a count of days, and that is the only thing written");

  const off = world({ turns: [{ text: "You are not on that list. Five hundred for five seats." }], memberships: [pack] });
  off.threads.set("t_dee", { id: "t_dee", member: "dee", deal: null, turns: [] });
  const dee = await (await post(off.fetch, "/api/chat", { thread: "t_dee", text: "morning" })).json();
  assert.equal(dee.mode, "haggle");
  assert.equal(dee.via, undefined);
});

test("the pack buyer sees seats and usage, and no chats", async () => {
  const pack = { id: "mem_pack", valid: true, product_id: PRODUCT,
                 metadata: { tier: "seats5", seats: [{ user: "bob", assigned: new Date(NOW - 8.64e7).toISOString(), used: 2 }],
                             seat_swaps: [] } };
  const w = world({ memberships: [pack] });
  const view = await (await get(w.fetch, "/api/seats?membership=mem_pack")).json();
  assert.equal(view.seats, 5);
  assert.equal(view.assigned, 1);
  assert.equal(view.open, 4);
  assert.equal(view.used, 2);
  assert.deepEqual(Object.keys(view.holders[0]).sort(), ["assigned", "last", "used", "user"]);
  assert.ok(!JSON.stringify(view).toLowerCase().includes("chat"));

  const after = await (await post(w.fetch, "/api/seats", { membership: "mem_pack", add: ["cy", "dee"] })).json();
  assert.deepEqual(after.holders.map((h) => h.user), ["bob", "cy", "dee"]);
  assert.equal(w.writes.length, 1);
  const full = await post(w.fetch, "/api/seats", { membership: "mem_pack", add: ["e", "f", "g", "h", "i"] });
  assert.equal(full.status, 400);
  assert.match((await full.json()).error, /has 5 seats/);
  assert.equal(w.writes.length, 1, "a refused assignment writes nothing to Whop");
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
