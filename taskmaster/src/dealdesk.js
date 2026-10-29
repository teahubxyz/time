// The deal desk. The character haggles; this decides.
//
// OpenPoke's split, applied to price: the voice talks, the workers act. Taskmaster's character never sets a price.
// It calls `quote(deal, { tier, price, reason, note })` and the desk answers accept, counter or refuse. A price the
// desk did not accept is not a price, and the quote card (cards.js) is built from the desk's state, not from
// anything the model wrote.
//
// The rules, all four of them:
//
//   Anchor high.        The opening is the tier's list price. The desk never quotes above it — anchoring past the
//                       published price would be a lie — and never walks a price back up mid-deal.
//   Keep a real floor.  A quote under the tier's floor is countered at the floor. The floor is the stop; the
//                       concessions below can never reach past it.
//   Earn every step.    A step down needs one of four reasons the member actually gave — scope, urgency,
//                       commitment, pay_now — each worth a fixed slice of the anchor and each spendable once.
//                       No reason, no step: the desk just repeats its standing price.
//   Three rounds.       Every answer that puts a number on the table is a round, the opening included, so a haggle
//                       runs open-concede-concede at most. Then the standing price is the price: a fourth quote is
//                       refused, and the member can still take what is on the table, or walk.
//
// Two refusals are about honesty rather than money, and neither spends a round, because they are the character
// misbehaving and not a move in the negotiation:
//
//   Price on what they tell you, never on who they are. The desk takes a tier, a price and a reason tag. A note
//   that reaches for the member's profile, following, employer, means or country is refused outright. This is the
//   one place Taskmaster deviates from Poke's bouncer, which sized you up before it priced you.
//   No invented scarcity and no fake deadlines. The haggle is a game with real rules, not pressure.
//
// This module is deliberately the only thing in the app that knows a price. The factory's own deal desk lives at
// https://teahub.xyz/teahubxyz/dealdesk and card #66 asks for it to be imported rather than rebuilt; that host is
// not reachable from the build container, so the rules are implemented here behind the same seam — every caller
// goes through `openDeal`/`quote`/`agree`/`walkaway`, so swapping the import is a one-file change and the tests
// come with it.

import { tier, cents, TIERS } from "./tiers.js";

export const MAX_ROUNDS = 3;

// What each earned reason is worth, as a slice of the anchor. Spendable once per tier: all four together come to
// 30% off, which is deeper than any floor here, so the floor is always what actually stops the slide.
export const REASONS = {
  scope: 0.1,       // they cut what they are asking for
  urgency: 0.05,    // they need it now, which is worth something to the owner's calendar
  commitment: 0.1,  // they are buying more than one, or committing for longer
  pay_now: 0.05,    // they are paying today rather than thinking about it
};

// A note that prices the person instead of the work. Checked case-insensitively as substrings.
export const FORBIDDEN = [
  "follower", "following", "profile", "bio", "avatar", "verified", "big account", "small account",
  "income", "salary", "net worth", "wealth", "looks rich", "they can afford", "can clearly afford",
  "employer", "job title", "company size", "headcount", "country", "city", "timezone wealth",
  "past purchases", "whop history", "spend history", "cheap crowd",
];

// Invented pressure. The haggle has real rules; it does not need a fake clock.
export const SCARCITY = [
  "last spot", "last seat", "only today", "today only", "expires tonight", "expires today", "deadline",
  "one left", "two left", "spots left", "closing soon", "limited time", "limited spots", "price goes up",
  "before midnight", "while it lasts", "act now", "final offer today",
];

const iso = (now) => new Date(now ?? Date.now()).toISOString();
const lower = (s) => String(s ?? "").toLowerCase();

// `opening` lets the anchor-height experiment open lower than the list price. It is clamped to the tier's own
// range, so an arm can choose where the haggle starts but never where it stops.
export function openDeal({ id, tier: id0, member, thread, opening, now } = {}) {
  const t = tier(id0);
  const anchor = opening == null ? t.anchor : Math.min(t.anchor, Math.max(t.floor, cents(opening)));
  return {
    id: String(id ?? `deal_${Math.random().toString(36).slice(2, 10)}`),
    member: member ?? null,
    thread: thread ?? null,
    tier: t.id,
    seats: t.seats,
    list: t.anchor,
    anchor,
    floor: t.floor,
    opened: iso(now),
    round: 0,
    price: null,       // the standing price: what is on the table right now
    opening: null,     // the first price the desk put on the table
    quotes: [],        // one row per spent round: { round, price, reason, verdict }
    spent: [],         // reason tags already cashed in on this tier
    exhausted: false,
    outcome: "open",   // open -> agreed -> paid, or walkaway
    closed: null,
  };
}

// The desk's answer carries `tell`: a short line for the character, not for the member. The character writes its
// own words; what it may not do is invent a number.
function answer(deal, { verdict, price, rule, tell, reason = null, spend = true }) {
  const out = {
    ok: verdict === "accept",
    verdict,
    price: price == null ? null : cents(price),
    standing: deal.price,
    anchor: deal.anchor,
    floor: deal.floor,
    tier: deal.tier,
    seats: deal.seats,
    round: deal.round,
    rounds_left: Math.max(0, MAX_ROUNDS - deal.round),
    reason,
    rule,
    tell,
  };
  if (verdict === "refuse" || !spend) return out;
  deal.round += 1;
  deal.price = out.price;
  deal.opening ??= out.price;
  deal.quotes.push({ round: deal.round, tier: deal.tier, price: out.price, reason, verdict });
  if (reason) deal.spent.push(reason);   // a counter that moved the desk's price spent the reason too
  if (deal.round >= MAX_ROUNDS) deal.exhausted = true;
  out.round = deal.round;
  out.standing = deal.price;
  out.rounds_left = Math.max(0, MAX_ROUNDS - deal.round);
  return out;
}

// The character's one tool. `note` is the member's own words behind the reason: it shapes the verdict and is then
// dropped — it never reaches the deal, the log or Whop.
export function quote(deal, { tier: want, price, reason = null, note = "" } = {}) {
  if (!deal || deal.outcome !== "open") {
    return answer(deal ?? openDeal({ tier: "sprint" }), { verdict: "refuse", rule: "closed", tell: "that deal is closed" });
  }

  const text = lower(note) + " " + lower(reason);
  const forbidden = FORBIDDEN.find((w) => text.includes(w));
  if (forbidden) {
    return answer(deal, { verdict: "refuse", rule: "who_they_are",
      tell: `price the project, not the person — drop "${forbidden}" and quote on scope, urgency, commitment or paying now` });
  }
  const pressure = SCARCITY.find((w) => text.includes(w));
  if (pressure) {
    return answer(deal, { verdict: "refuse", rule: "scarcity", tell: `no invented deadlines — drop "${pressure}"` });
  }

  // A tier switch is allowed (the character may talk them up or down a tier) but it resets the anchor, the floor
  // and the concessions, so a switch is not a way around the floor.
  if (want && want !== deal.tier) {
    if (!TIERS[want]) return answer(deal, { verdict: "refuse", rule: "tier", tell: `no such tier: ${want}` });
    const t = tier(want);
    deal.tier = t.id;
    deal.seats = t.seats;
    deal.list = t.anchor;
    deal.anchor = t.anchor;
    deal.floor = t.floor;
    deal.spent = [];
    deal.price = null;
  }

  const p = cents(Number(price));
  if (!Number.isFinite(p) || p <= 0) {
    return answer(deal, { verdict: "refuse", rule: "price", tell: "a quote needs a price in dollars" });
  }
  if (p > deal.anchor) {
    return answer(deal, { verdict: "refuse", rule: "above_anchor",
      tell: `${deal.tier} opens at ${deal.anchor} — never quote above the opening` });
  }

  const standing = deal.price ?? deal.anchor;

  if (deal.exhausted) {
    return p === standing
      ? answer(deal, { verdict: "accept", price: p, rule: "last_price", tell: `done haggling at ${p}`, spend: false })
      : answer(deal, { verdict: "refuse", rule: "rounds",
          tell: `${MAX_ROUNDS} rounds is the cap — ${standing} is the price, take it or leave it` });
  }

  const step = cents(standing - p);
  if (step < 0) {
    return answer(deal, { verdict: "counter", price: standing, rule: "no_walk_up",
      tell: `${standing} is already on the table and the desk does not walk a price back up` });
  }
  if (step === 0) {
    return answer(deal, { verdict: "accept", price: p, rule: "standing", tell: `holding at ${p}` });
  }

  if (!Object.hasOwn(REASONS, reason)) {
    return answer(deal, { verdict: "counter", price: standing, rule: "no_reason",
      tell: `no step down for nothing — ${standing} stands until they give you scope, urgency, commitment or paying now` });
  }
  if (deal.spent.includes(reason)) {
    return answer(deal, { verdict: "counter", price: standing, rule: "reason_spent",
      tell: `${reason} is already cashed in — ${standing} stands` });
  }

  // The floor first, because it is the hard rule: a reason buys a step, never a price under the floor.
  if (p < deal.floor) {
    return answer(deal, { verdict: "counter", price: deal.floor, rule: "floor", reason,
      tell: `${deal.floor} is the floor on ${deal.tier} — counter at ${deal.floor}` });
  }
  const earned = cents(REASONS[reason] * deal.anchor);
  if (step > earned) {
    const counter = Math.max(deal.floor, cents(standing - earned));
    return answer(deal, { verdict: "counter", price: counter, rule: "over_earned", reason,
      tell: `${reason} earns ${earned} off, not ${step} — counter at ${counter}` });
  }
  return answer(deal, { verdict: "accept", price: p, rule: "earned", reason, tell: `${reason} earns it — ${p} agreed` });
}

// The member takes the standing price. From here the price is fixed and the quote card can be sealed; payment is
// Whop's to confirm.
export function agree(deal, { now } = {}) {
  if (deal.outcome !== "open") throw new Error(`deal ${deal.id} is ${deal.outcome}`);
  if (deal.price == null) throw new Error(`deal ${deal.id} has no price to agree to`);
  deal.outcome = "agreed";
  deal.agreed = iso(now);
  return deal;
}

// They left. Logged like any other deal, because a walkaway is the half of price discovery a payment cannot show.
export function walkaway(deal, { now } = {}) {
  if (deal.outcome === "paid") throw new Error(`deal ${deal.id} was paid`);
  deal.outcome = "walkaway";
  deal.closed = iso(now);
  return deal;
}

// Whop confirmed the money. Only the webhook (or a membership check on return from checkout) calls this.
export function paid(deal, { now, receipt = null } = {}) {
  if (deal.outcome !== "agreed") throw new Error(`deal ${deal.id} is ${deal.outcome}, not agreed`);
  deal.outcome = "paid";
  deal.closed = iso(now);
  deal.receipt = receipt;
  return deal;
}
