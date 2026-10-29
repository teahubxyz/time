// The deal desk's four rules, and the two refusals that are about honesty rather than money.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDeal, quote, agree, walkaway, paid, MAX_ROUNDS, REASONS } from "../src/dealdesk.js";
import { TIERS, tier, fee, net, variantKey } from "../src/tiers.js";

const sprint = () => openDeal({ id: "d1", tier: "sprint", member: "ann", thread: "t1", now: 0 });

test("the tier catalog carries the old prices, and the pack's discount is 17%", () => {
  assert.equal(TIERS.sprint.anchor, 100);
  assert.equal(TIERS.sprint.floor, 80);           // the published intro price is the floor
  assert.equal(TIERS.lite.anchor, 50);
  assert.equal(TIERS.daily.anchor, 10);
  assert.equal(TIERS.checkins.anchor, 5);
  assert.equal(TIERS.pack3.floor, 250);
  assert.equal(Math.round((1 - 250 / 300) * 100), 17, "3 for 250 saves 17% against 300, not 15%");
  assert.equal(TIERS.seats5.anchor, 500);          // 5 seats x the per-seat anchor
  assert.equal(TIERS.seats10.floor, 720);          // 10 seats x a per-seat floor that takes the pack's 17%
  assert.equal(TIERS.daily.kind, "renewal");
  assert.equal(TIERS.daily.billing_period, 1);
  assert.equal(TIERS.sprint.kind, "one_time");
  assert.ok(TIERS.sprint.expiration_days > 0);
});

test("fees are about 9.5% of $5 and 3.8% of $100, the figures the card quotes", () => {
  assert.ok(Math.abs(fee(5) / 5 - 0.095) < 0.002, fee(5));
  assert.ok(Math.abs(fee(100) / 100 - 0.038) < 0.002, fee(100));
  assert.equal(net(100), 96.2, "a $100 sprint arrives as $96.20");
  assert.equal(net(5), 4.52, "a $5 day arrives as $4.52: small tickets lose three times the share");
});

test("matching deals share a variant key, different prices do not", () => {
  assert.equal(variantKey("sprint", 80), variantKey("sprint", 80.0));
  assert.notEqual(variantKey("sprint", 80), variantKey("sprint", 90));
  assert.notEqual(variantKey("sprint", 80), variantKey("lite", 80));
});

test("the opening is the anchor, and the desk never quotes above it or walks a price back up", () => {
  const d = sprint();
  assert.equal(d.anchor, 100);
  const open = quote(d, { tier: "sprint", price: 100 });
  assert.equal(open.verdict, "accept");
  assert.equal(d.price, 100);
  assert.equal(d.opening, 100);

  const up = quote(d, { tier: "sprint", price: 120 });
  assert.equal(up.verdict, "refuse");
  assert.equal(up.rule, "above_anchor");
  assert.equal(d.price, 100, "a refusal changes nothing");

  const back = quote(d, { tier: "sprint", price: 95, reason: "scope", note: "they want more now" });
  assert.equal(back.verdict, "accept", "95 is a step down of 5, inside what scope earns");
  const walkUp = quote(d, { tier: "sprint", price: 100 });
  assert.equal(walkUp.verdict, "counter");
  assert.equal(walkUp.rule, "no_walk_up");
  assert.equal(walkUp.price, 95);
});

test("no step down for nothing", () => {
  const d = sprint();
  quote(d, { tier: "sprint", price: 100 });
  const free = quote(d, { tier: "sprint", price: 85 });
  assert.equal(free.verdict, "counter");
  assert.equal(free.rule, "no_reason");
  assert.equal(free.price, 100, "the standing price stands");

  const unknown = quote(d, { tier: "sprint", price: 85, reason: "they seem nice" });
  assert.equal(unknown.verdict, "counter");
  assert.equal(unknown.rule, "no_reason");
});

test("a step is capped at what its reason earns, and each reason is spendable once", () => {
  const d = sprint();
  quote(d, { tier: "sprint", price: 100 });
  const over = quote(d, { tier: "sprint", price: 85, reason: "scope", note: "dropping the write-up" });
  assert.equal(over.verdict, "counter");
  assert.equal(over.rule, "over_earned");
  assert.equal(over.price, 90, `scope earns ${REASONS.scope * 100}% of 100`);
  assert.equal(d.price, 90, "the desk's counter is the new standing price");

  const again = quote(d, { tier: "sprint", price: 85, reason: "scope", note: "cutting more" });
  assert.equal(again.verdict, "counter");
  assert.equal(again.rule, "reason_spent", "the counter cashed scope in");
  assert.equal(again.price, 90);
});

test("the floor is the real stop, whatever reason is given", () => {
  const d = sprint();
  quote(d, { tier: "sprint", price: 100 });
  const under = quote(d, { tier: "sprint", price: 10, reason: "commitment", note: "they will take three" });
  assert.equal(under.verdict, "counter");
  assert.equal(under.rule, "floor");
  assert.equal(under.price, 80);
  const again = quote(d, { tier: "sprint", price: 79, reason: "pay_now", note: "card out now" });
  assert.equal(again.rule, "floor");
  assert.equal(again.price, 80);
  assert.ok(again.price >= TIERS.sprint.floor);
});

test("every reason together still cannot reach under the floor", () => {
  const total = Object.values(REASONS).reduce((a, b) => a + b, 0);
  for (const id of Object.keys(TIERS)) {
    const t = tier(id);
    assert.ok(t.anchor * (1 - total) < t.floor, `${id}: the floor, not the concessions, has to be the stop`);
  }
});

test("three rounds, then the standing price is the price", () => {
  const d = sprint();
  assert.equal(quote(d, { tier: "sprint", price: 100 }).round, 1);
  assert.equal(quote(d, { tier: "sprint", price: 90, reason: "scope", note: "smaller job" }).round, 2);
  const third = quote(d, { tier: "sprint", price: 85, reason: "pay_now", note: "paying today" });
  assert.equal(third.round, MAX_ROUNDS);
  assert.equal(third.rounds_left, 0);
  assert.ok(d.exhausted);

  const fourth = quote(d, { tier: "sprint", price: 82, reason: "urgency", note: "needs it tonight" });
  assert.equal(fourth.verdict, "refuse");
  assert.equal(fourth.rule, "rounds");
  assert.equal(d.price, 85, "the last price is untouched");

  const takeIt = quote(d, { tier: "sprint", price: 85 });
  assert.equal(takeIt.verdict, "accept", "they can still take what is on the table");
  assert.equal(d.round, MAX_ROUNDS, "and that does not spend a fourth round");
});

test("price on what they tell you, never on who they are", () => {
  for (const note of ["they have 40k followers so they can afford it", "their profile says they work at a bank",
                      "big account, charge the list", "their country is rich"]) {
    const d = sprint();
    quote(d, { tier: "sprint", price: 100 });
    const out = quote(d, { tier: "sprint", price: 95, reason: "scope", note });
    assert.equal(out.verdict, "refuse", note);
    assert.equal(out.rule, "who_they_are");
    assert.equal(d.round, 1, "an honesty refusal does not spend a round");
    assert.equal(d.price, 100);
  }
});

test("no invented scarcity and no fake deadlines", () => {
  for (const note of ["last spot at this price", "today only", "the price goes up at midnight"]) {
    const d = sprint();
    quote(d, { tier: "sprint", price: 100 });
    const out = quote(d, { tier: "sprint", price: 90, reason: "urgency", note });
    assert.equal(out.verdict, "refuse", note);
    assert.equal(out.rule, "scarcity");
    assert.equal(d.round, 1);
  }
});

test("the member's words never reach the deal", () => {
  const d = sprint();
  quote(d, { tier: "sprint", price: 100 });
  quote(d, { tier: "sprint", price: 92, reason: "scope", note: "I only need the API bit, not the whole launch" });
  const dump = JSON.stringify(d);
  assert.ok(!dump.includes("API bit"), dump);
  assert.deepEqual(d.quotes.map((q) => q.reason), [null, "scope"]);
});

test("a tier switch resets the anchor, the floor and the concessions", () => {
  const d = sprint();
  quote(d, { tier: "sprint", price: 100 });
  quote(d, { tier: "sprint", price: 90, reason: "scope", note: "smaller" });
  const sw = quote(d, { tier: "lite", price: 50 });
  assert.equal(sw.verdict, "accept");
  assert.equal(d.tier, "lite");
  assert.equal(d.anchor, 50);
  assert.equal(d.floor, 40);
  assert.deepEqual(d.spent, [], "a switch is not a way around the floor");
  assert.equal(quote(d, { tier: "lite", price: 60 }).rule, "above_anchor");
});

test("a seat pack is priced as a pack, inside a per-seat floor", () => {
  const d = openDeal({ id: "p1", tier: "seats5", member: "lead", thread: "t2", now: 0 });
  assert.equal(d.seats, 5);
  quote(d, { tier: "seats5", price: 500 });
  const under = quote(d, { tier: "seats5", price: 300, reason: "commitment", note: "five seats up front" });
  assert.equal(under.verdict, "counter");
  assert.equal(under.rule, "floor");
  assert.equal(under.price, 400, "80 a seat is the floor");
  const more = quote(d, { tier: "seats5", price: 380, reason: "pay_now", note: "paying today" });
  assert.equal(more.rule, "floor", "once the desk is at the floor, another reason just gets the floor back");
  assert.equal(more.price, 400);
});

test("a modest opening still stops at the same floor", () => {
  const d = openDeal({ id: "d2", tier: "sprint", opening: 90, now: 0 });
  assert.equal(d.anchor, 90);
  assert.equal(d.list, 100);
  assert.equal(d.floor, 80);
  assert.equal(quote(d, { tier: "sprint", price: 95 }).rule, "above_anchor");
  quote(d, { tier: "sprint", price: 90 });
  const step = quote(d, { tier: "sprint", price: 80, reason: "scope", note: "less work" });
  assert.equal(step.rule, "over_earned");
  assert.equal(step.price, 81, "a modest anchor earns smaller steps: 10% of 90, not of 100");
  assert.equal(quote(d, { tier: "sprint", price: 70, reason: "urgency", note: "needs it today" }).rule, "floor");
  assert.equal(openDeal({ tier: "sprint", opening: 5, now: 0 }).anchor, 80, "an arm cannot open under the floor");
  assert.equal(openDeal({ tier: "sprint", opening: 400, now: 0 }).anchor, 100, "nor above the list price");
});

test("agree, walk away and get paid", () => {
  const d = sprint();
  quote(d, { tier: "sprint", price: 100 });
  assert.throws(() => paid(d, { now: 1 }), /not agreed/);
  agree(d, { now: 1 });
  assert.equal(d.outcome, "agreed");
  assert.equal(quote(d, { tier: "sprint", price: 90 }).rule, "closed", "an agreed deal takes no more quotes");
  paid(d, { now: 2, receipt: "pay_1" });
  assert.equal(d.outcome, "paid");
  assert.equal(d.receipt, "pay_1");
  assert.throws(() => walkaway(d, { now: 3 }), /was paid/);

  const gone = sprint();
  quote(gone, { tier: "sprint", price: 100 });
  walkaway(gone, { now: 5 });
  assert.equal(gone.outcome, "walkaway");
  assert.equal(quote(gone, { tier: "sprint", price: 100 }).rule, "closed");
});
