// Whop's webhook: Whop telling the app the money arrived, which is one of the two ways it can.
//
// The old app's handler logged invoices and did nothing. Here the signature is checked before anything else, the
// deal named in the payment's metadata is the one that moves, and the thread switches mode because Whop said the
// money arrived — not because a member typed "Paid".
//
// The other way is the member coming back from checkout to a membership Whop has already issued (`/api/return` in
// server.js), because a webhook can be late, can be lost, and is matched here on event names that are still the
// operator's to confirm. Both roads end in `paid()` on the same deal, and whichever gets there first closes and
// logs it once; neither of them is the member's word for it.
//
// Unconfirmed, and in one place so it is one line to correct: the header names and whether the signed string is
// the raw body alone or a timestamp joined to it. Both shapes are verified — a request carrying a timestamp header
// is checked as `${timestamp}.${body}` and refused if the timestamp is outside the tolerance, and one without is
// checked as the body alone. The body is verified as the bytes that arrived; nothing re-serializes JSON first.

import { hmacHex, safeEqual } from "./sign.js";
import { paid } from "./dealdesk.js";

export const SIG_HEADER = "x-whop-signature";
export const TS_HEADER = "x-whop-timestamp";
export const TOLERANCE_S = 300;

// The events that mean money arrived. Whop's own names for them are the operator's to confirm; an event not on
// this list is acknowledged and ignored rather than guessed at.
export const PAID_EVENTS = ["payment.succeeded", "payment_succeeded", "membership.went_valid", "membership_went_valid"];

const header = (headers, name) =>
  typeof headers?.get === "function" ? headers.get(name) : (headers?.[name] ?? headers?.[name.toLowerCase()] ?? null);

export async function sign(raw, secret, { timestamp = null } = {}) {
  return hmacHex(secret, timestamp == null ? raw : `${timestamp}.${raw}`);
}

export async function verify(raw, headers, secret, { now, tolerance = TOLERANCE_S } = {}) {
  const got = header(headers, SIG_HEADER);
  if (!got) return { ok: false, why: "no signature" };
  const ts = header(headers, TS_HEADER);
  if (ts != null) {
    const t = Number(ts);
    if (!Number.isFinite(t)) return { ok: false, why: "bad timestamp" };
    const age = Math.abs((now ?? Date.now()) / 1000 - t);
    if (age > tolerance) return { ok: false, why: `timestamp is ${Math.round(age)}s old` };
  }
  const want = await sign(raw, secret, { timestamp: ts });
  return safeEqual(got, want) ? { ok: true } : { ok: false, why: "signature does not match" };
}

// deps: { deals: { get(id), save(deal) }, log: (deal) => Promise, seats?: (membership, tier) => Promise }
// Returns what the server should answer with, and never throws on a bad signature: it answers 401 and writes
// nothing, so a forged payment cannot move a thread.
export async function handle(raw, headers, { secret, now, deps }) {
  const checked = await verify(raw, headers, secret, { now });
  if (!checked.ok) return { status: 401, body: { error: checked.why } };

  let event;
  try { event = JSON.parse(raw); } catch { return { status: 400, body: { error: "body is not JSON" } }; }

  const kind = event?.action ?? event?.event ?? event?.type ?? null;
  if (!PAID_EVENTS.includes(kind)) return { status: 200, body: { ok: true, ignored: kind } };

  const data = event.data ?? event;
  const meta = data.metadata ?? data.checkout_metadata ?? {};
  if (!meta.deal) return { status: 200, body: { ok: true, ignored: "no deal in metadata" } };

  const deal = await deps.deals.get(meta.deal);
  if (!deal) return { status: 200, body: { ok: true, ignored: `unknown deal ${meta.deal}` } };
  if (deal.outcome === "paid") return { status: 200, body: { ok: true, already: deal.id } };
  if (deal.outcome !== "agreed") return { status: 200, body: { ok: true, ignored: `deal ${deal.id} is ${deal.outcome}` } };

  // The price is the desk's, not the payment's: a payment for less than was agreed is a mismatch to look at, never
  // a cheaper deal that quietly closes.
  const amount = Number(data.final_amount ?? data.amount ?? meta.price);
  if (Number.isFinite(amount) && Math.abs(amount - deal.price) > 0.01) {
    return { status: 200, body: { ok: true, mismatch: { deal: deal.id, agreed: deal.price, paid: amount } } };
  }

  paid(deal, { now, receipt: data.id ?? data.membership_id ?? null });
  deal.membership = data.membership_id ?? data.membership ?? null;
  await deps.deals.save(deal);
  await deps.log(deal);
  if (deal.seats && deal.membership && deps.seats) await deps.seats(deal.membership, deal.tier);

  return { status: 200, body: { ok: true, deal: deal.id, mode: "coach" } };
}
