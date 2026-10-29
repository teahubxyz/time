// Simulated, signed webhooks. Nothing is bought: the signature, the deal lookup and the amount check are what the
// test exercises, with a fake Whop payload.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verify, sign, handle, SIG_HEADER, TS_HEADER, TOLERANCE_S } from "../src/webhook.js";
import { openDeal, quote, agree } from "../src/dealdesk.js";
import { memorySink, record } from "../src/deallog.js";

const SECRET = "whsec_test";
const NOW = Date.parse("2026-10-20T12:00:00Z");

const agreed = (over = {}) => {
  const d = openDeal({ id: "d1", tier: "sprint", member: "ann", thread: "t1", now: NOW });
  quote(d, { tier: "sprint", price: 100 });
  quote(d, { tier: "sprint", price: 92, reason: "scope", note: "smaller job" });
  agree(d, { now: NOW });
  return Object.assign(d, over);
};

const body = (over = {}) => JSON.stringify({
  action: "payment.succeeded",
  data: { id: "pay_1", membership_id: "mem_1", final_amount: 92, metadata: { deal: "d1", member: "ann", thread: "t1" } },
  ...over,
});

async function signed(raw, { timestamp = Math.floor(NOW / 1000), secret = SECRET } = {}) {
  return { [SIG_HEADER]: await sign(raw, secret, { timestamp }), [TS_HEADER]: String(timestamp) };
}

function deps(deal) {
  const sink = memorySink();
  const store = new Map(deal ? [[deal.id, deal]] : []);
  return {
    sink,
    saved: store,
    deals: { get: async (id) => store.get(id) ?? null, save: async (d) => void store.set(d.id, d) },
    log: (d) => record(d, { sink, now: NOW }),
  };
}

test("a signed body verifies; a tampered one does not", async () => {
  const raw = body();
  const headers = await signed(raw);
  assert.deepEqual(await verify(raw, headers, SECRET, { now: NOW }), { ok: true });
  assert.equal((await verify(raw.replace("92", "5"), headers, SECRET, { now: NOW })).ok, false);
  assert.equal((await verify(raw, headers, "another-secret", { now: NOW })).ok, false);
  assert.equal((await verify(raw, {}, SECRET, { now: NOW })).why, "no signature");
  assert.equal((await verify(raw, { [SIG_HEADER]: "deadbeef" }, SECRET, { now: NOW })).why, "signature does not match");
});

test("a replayed webhook is refused once it is stale", async () => {
  const raw = body();
  const old = await signed(raw, { timestamp: Math.floor(NOW / 1000) - TOLERANCE_S - 60 });
  assert.match((await verify(raw, old, SECRET, { now: NOW })).why, /old/);
  assert.equal((await verify(raw, { ...await signed(raw), [TS_HEADER]: "soon" }, SECRET, { now: NOW })).why, "bad timestamp");
});

test("a body signed without a timestamp verifies as the raw body alone", async () => {
  const raw = body();
  const headers = { [SIG_HEADER]: await sign(raw, SECRET) };
  assert.equal((await verify(raw, headers, SECRET, { now: NOW })).ok, true);
});

test("Headers objects work as well as plain ones, since that is what a request carries", async () => {
  const raw = body();
  assert.equal((await verify(raw, new Headers(await signed(raw)), SECRET, { now: NOW })).ok, true);
});

test("a verified payment moves the deal to paid, logs it and unlocks coach mode", async () => {
  const deal = agreed();
  const d = deps(deal);
  const raw = body();
  const out = await handle(raw, await signed(raw), { secret: SECRET, now: NOW, deps: d });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, deal: "d1", mode: "coach" });
  assert.equal(deal.outcome, "paid");
  assert.equal(deal.receipt, "pay_1");
  assert.equal(deal.membership, "mem_1");
  assert.equal(d.sink.rows.length, 1);
  assert.equal(d.sink.rows[0].final, 92);
  assert.equal(d.sink.rows[0].outcome, "paid");
});

test("a forged payment moves nothing", async () => {
  const deal = agreed();
  const d = deps(deal);
  const raw = body();
  const out = await handle(raw, { [SIG_HEADER]: "0".repeat(64), [TS_HEADER]: String(Math.floor(NOW / 1000)) },
    { secret: SECRET, now: NOW, deps: d });
  assert.equal(out.status, 401);
  assert.equal(deal.outcome, "agreed");
  assert.equal(d.sink.rows.length, 0);
});

test("a payment for less than was agreed is a mismatch to look at, not a cheaper deal", async () => {
  const deal = agreed();
  const d = deps(deal);
  const raw = body({ data: { id: "pay_2", membership_id: "mem_1", final_amount: 5, metadata: { deal: "d1" } } });
  const out = await handle(raw, await signed(raw), { secret: SECRET, now: NOW, deps: d });
  assert.deepEqual(out.body.mismatch, { deal: "d1", agreed: 92, paid: 5 });
  assert.equal(deal.outcome, "agreed");
});

test("an event that is not a payment, or names no deal, is acknowledged and ignored", async () => {
  const deal = agreed();
  const d = deps(deal);
  for (const [raw, key] of [[body({ action: "membership.went_invalid" }), "ignored"],
                            [body({ data: { id: "pay_3", metadata: {} } }), "ignored"],
                            [JSON.stringify({ action: "payment.succeeded", data: { metadata: { deal: "nope" } } }), "ignored"]]) {
    const out = await handle(raw, await signed(raw), { secret: SECRET, now: NOW, deps: d });
    assert.equal(out.status, 200);
    assert.ok(key in out.body, JSON.stringify(out.body));
  }
  assert.equal(deal.outcome, "agreed");
  assert.equal((await handle("not json", await signed("not json"), { secret: SECRET, now: NOW, deps: d })).status, 400);
});

test("the same payment twice pays once", async () => {
  const deal = agreed();
  const d = deps(deal);
  const raw = body();
  const headers = await signed(raw);
  await handle(raw, headers, { secret: SECRET, now: NOW, deps: d });
  const again = await handle(raw, headers, { secret: SECRET, now: NOW, deps: d });
  assert.deepEqual(again.body, { ok: true, already: "d1" });
  assert.equal(d.sink.rows.length, 1);
});

test("a paid seat pack hands the membership on, so its seat list can be set up", async () => {
  const deal = agreed({ tier: "seats5", seats: 5, price: 500, anchor: 500, floor: 400 });
  const d = deps(deal);
  const packed = [];
  const raw = body({ data: { id: "pay_4", membership_id: "mem_pack", final_amount: 500, metadata: { deal: "d1" } } });
  await handle(raw, await signed(raw), { secret: SECRET, now: NOW,
    deps: { ...d, seats: async (m, tier) => packed.push([m, tier]) } });
  assert.deepEqual(packed, [["mem_pack", "seats5"]]);
});
