// What Taskmaster sells, what each tier opens at, and where its floor is.
//
// The anchors are the prices the old Taskmaster quoted. Only one discount was ever published — a sprint's $100 list
// against its $80 intro, 20% off — so that is the ratio the other individual floors take; the 3-sprint pack keeps
// its own published price ($250 against $300, which is 17% off, not the 15% the old prompt claimed). Seat packs
// price per seat, and the ten-seat pack's floor takes the pack's 17%.
//
// None of these numbers is the answer. They are where the haggle starts: every deal is logged (price, rounds,
// outcome, never the chat), and once there are enough deals the operator sets fixed tiers from that log, the way
// Poke replaced its bouncer with Free / $19 / $199. Change the numbers here, not in the character.
//
// Fees, because they decide whether a floor is worth having: a card charge plus orchestration costs about
// $0.30 + 3.5% of the ticket, which is the 9.5% of $5 and 3.8% of $100 the card quotes. `net()` puts that on every
// logged deal, so a floor is judged on what reaches the owner rather than on the sticker.

export const CURRENCY = "usd";
export const FEE_FIXED = 0.3;
export const FEE_RATE = 0.035;

export const cents = (n) => Math.round(n * 100) / 100;
export const fee = (price) => cents(FEE_FIXED + FEE_RATE * price);
export const net = (price) => cents(price - fee(price));

// kind: "one_time" is a Whop plan with expiration_days; "renewal" is a subscription with a billing period.
// per_seat marks a pack: its anchor and floor are per seat, multiplied by `seats`.
const CATALOG = [
  { id: "sprint", label: "1-hour sprint", kind: "one_time", anchor: 100, floor: 80, expiration_days: 14,
    includes: ["One hour on one blocker", "A plan you leave with", "Commitments tracked until the next one"],
    access: "14 days to book and run it" },
  { id: "lite", label: "30-minute lite sprint", kind: "one_time", anchor: 50, floor: 40, expiration_days: 14,
    includes: ["Thirty minutes on one blocker", "One next step, written down"], access: "14 days to book and run it" },
  { id: "pack3", label: "3 sprints", kind: "one_time", anchor: 300, floor: 250, expiration_days: 90,
    includes: ["Three 1-hour sprints", "Commitments carried between them"], access: "90 days to use all three" },
  { id: "daily", label: "Ongoing coaching", kind: "renewal", billing_period: 1, anchor: 10, floor: 8,
    includes: ["Daily check-in on what you committed to", "Called out when you stall"], access: "Daily, cancel any day" },
  { id: "checkins", label: "Email check-ins", kind: "renewal", billing_period: 1, anchor: 5, floor: 4,
    includes: ["One check-in email a day", "A reply that holds you to it"], access: "Daily, cancel any day" },
  { id: "seats5", label: "5 seats", kind: "one_time", seats: 5, per_seat: { anchor: 100, floor: 80 }, expiration_days: 90,
    includes: ["Five 1-hour sprints, one per seat", "Seats you assign by Whop username", "Seats and usage, never anyone's chats"],
    access: "90 days for the pack" },
  { id: "seats10", label: "10 seats", kind: "one_time", seats: 10, per_seat: { anchor: 100, floor: 72 }, expiration_days: 90,
    includes: ["Ten 1-hour sprints, one per seat", "Seats you assign by Whop username", "Seats and usage, never anyone's chats"],
    access: "90 days for the pack" },
];

export const TIERS = Object.fromEntries(CATALOG.map((t) => {
  const seats = t.seats ?? null;
  const anchor = t.per_seat ? cents(t.per_seat.anchor * seats) : t.anchor;
  const floor = t.per_seat ? cents(t.per_seat.floor * seats) : t.floor;
  return [t.id, { ...t, seats, anchor, floor }];
}));

export const IDS = Object.keys(TIERS);
export const PACKS = IDS.filter((id) => TIERS[id].seats);

export function tier(id) {
  const t = TIERS[id];
  if (!t) throw new Error(`no such tier: ${JSON.stringify(id)}`);
  return t;
}

// A Whop variant is reused rather than created per deal, so matching deals share one inline plan. The key is
// everything that makes two deals the same sale: tier, plan shape, price, currency and term.
export function variantKey(id, price) {
  const t = tier(id);
  const term = t.kind === "renewal" ? `p${t.billing_period}d` : `x${t.expiration_days}d`;
  return [t.id, t.kind, cents(price).toFixed(2), CURRENCY, term, t.seats ? `s${t.seats}` : "s1"].join(":");
}
