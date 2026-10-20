// Every deal logged, no chat text in it, and the log read back as price discovery.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDeal, quote, agree, paid, walkaway } from "../src/dealdesk.js";
import { line, validate, record, memorySink, summary, KEYS } from "../src/deallog.js";

const NOW = Date.parse("2026-10-20T12:00:00Z");

function haggled({ tier = "sprint", steps, outcome }) {
  const d = openDeal({ id: `d_${outcome}_${tier}`, tier, member: "ann", thread: "t1", now: NOW });
  for (const [price, reason, note] of steps) quote(d, { tier, price, reason, note });
  if (outcome === "walkaway") walkaway(d, { now: NOW + 1000 });
  else { agree(d, { now: NOW + 1000 }); if (outcome === "paid") paid(d, { now: NOW + 2000, receipt: "pay_1" }); }
  return d;
}

test("a logged deal is the opening, the counters, the final price, the rounds and the outcome", () => {
  const d = haggled({ steps: [[100], [92, "scope", "only the API part, not the whole launch"]], outcome: "paid" });
  const row = validate(line(d, { now: NOW + 3000 }));
  assert.equal(row.tier, "sprint");
  assert.equal(row.list, 100);
  assert.equal(row.anchor, 100);
  assert.equal(row.floor, 80);
  assert.equal(row.opening, 100);
  assert.deepEqual(row.counters, [100, 92]);
  assert.deepEqual(row.reasons, ["scope"]);
  assert.equal(row.final, 92);
  assert.equal(row.rounds, 2);
  assert.equal(row.outcome, "paid");
  assert.equal(row.net, 88.48);
  assert.equal(row.member, "ann");
});

test("no chat text, by construction and by validation", () => {
  const d = haggled({ steps: [[100], [92, "scope", "only the API part, not the whole launch"]], outcome: "paid" });
  const row = line(d, { now: NOW });
  assert.ok(!JSON.stringify(row).includes("API part"));
  assert.deepEqual(KEYS.filter((k) => /note|text|chat|message|said|reply/.test(k)), []);
  assert.throws(() => validate({ ...row, note: "I keep missing my own deadlines" }), /not a deal-log field/);
  assert.throws(() => validate({ ...row, member: "ann said: I am broke" }), /member must be an id/);
  assert.throws(() => validate({ ...row, reasons: ["they seemed keen"] }), /earned-reason tags/);
  assert.throws(() => validate({ ...row, outcome: "sort of paid" }), /outcome must be one of/);
  assert.throws(() => validate({ ...row, rounds: 9 }), /rounds must be 0\.\.3/);
  assert.throws(() => validate({ ...row, ts: "last Tuesday" }), /ts must be an ISO date/);
  assert.throws(() => validate({ ...row, final: "ninety-two" }), /final must be a number/);
});

test("a walkaway is logged too: it is the half of price discovery a payment cannot show", async () => {
  const sink = memorySink();
  const gone = haggled({ steps: [[100], [90, "scope", "smaller"]], outcome: "walkaway" });
  const row = await record(gone, { sink, now: NOW + 5000 });
  assert.equal(row.outcome, "walkaway");
  assert.equal(row.final, 90, "the price they would not take is the useful number");
  assert.equal(sink.rows.length, 1);
});

test("the log reads back as prices per tier, which is what replaces the haggle later", async () => {
  const sink = memorySink();
  await record(haggled({ steps: [[100], [92, "scope", "x"]], outcome: "paid" }), { sink, now: NOW });
  await record(haggled({ steps: [[100], [90, "commitment", "x"]], outcome: "paid" }), { sink, now: NOW });
  await record(haggled({ steps: [[100], [85, "pay_now", "x"]], outcome: "walkaway" }), { sink, now: NOW });
  await record(haggled({ tier: "lite", steps: [[50]], outcome: "paid" }), { sink, now: NOW });

  const out = summary(sink.rows);
  const sprint = out.find((t) => t.tier === "sprint");
  assert.equal(sprint.deals, 3);
  assert.equal(sprint.paid, 2);
  assert.equal(sprint.walkaways, 1);
  assert.equal(sprint.low, 90);
  assert.equal(sprint.high, 92);
  assert.equal(sprint.median_price, 90);
  assert.equal(sprint.median_rounds, 2);
  assert.equal(sprint.net, 175.03);
  assert.equal(out.find((t) => t.tier === "lite").median_price, 50);
});

test("the default sink appends one JSON line per deal", async () => {
  const written = [];
  const { fileSink } = await import("../src/deallog.js");
  const sink = fileSink("deals.jsonl", { fs: { appendFile: async (p, s) => written.push([p, s]) } });
  await record(haggled({ steps: [[100]], outcome: "paid" }), { sink, now: NOW });
  assert.equal(written.length, 1);
  assert.equal(written[0][0], "deals.jsonl");
  assert.ok(written[0][1].endsWith("\n"));
  assert.equal(JSON.parse(written[0][1]).final, 100);
});
