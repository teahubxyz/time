// The two cards the haggle produces.
//
// The quote card is the one the model cannot edit. It is built here from the deal desk's own state — never from
// anything the model wrote — and sealed with an HMAC over its fields. The chat renders the card, so the card's
// text passes through the model's context on the way; `unseal` is what makes a card that came back changed
// worthless. The checkout button is the card's only action.
//
// The share card is Poke's loop: people posted the price they got and asked whether anyone went lower, so the
// haggle was also the marketing. It carries the price, the tier and how many rounds it took — never the chat.

import { tier, CURRENCY, net } from "./tiers.js";
import { hmacHex, safeEqual, canonical } from "./sign.js";

// Only these fields are sealed, and only these are what a buyer is agreeing to. `seal` itself is not sealed.
const SEALED = ["kind", "deal", "tier", "label", "price", "currency", "seats", "includes", "access", "checkout"];

export async function quoteCard(deal, { checkout = null, secret, now } = {}) {
  if (deal.price == null) throw new Error(`deal ${deal.id} has no agreed price`);
  const t = tier(deal.tier);
  const card = {
    kind: "quote",
    deal: deal.id,
    tier: t.id,
    label: t.seats ? `${t.label} — ${t.seats} seats` : t.label,
    price: deal.price,
    currency: CURRENCY,
    seats: t.seats,
    includes: t.includes,
    access: t.access,
    checkout: checkout ?? null,   // null until the deal desk has a Whop checkout; the button waits on it
    issued: new Date(now ?? Date.now()).toISOString(),
  };
  card.seal = await seal(card, secret);
  return card;
}

export async function seal(card, secret) {
  return hmacHex(secret, canonical(Object.fromEntries(SEALED.map((k) => [k, card[k] ?? null]))));
}

// True only if every sealed field is exactly as issued. A model that rewrote the price, swapped the tier or pointed
// the button somewhere else fails here, and the server refuses to act on the card.
export async function unseal(card, secret) {
  if (!card || typeof card !== "object" || card.kind !== "quote") return false;
  return safeEqual(card.seal, await seal(card, secret));
}

export function shareCard(deal, { url = null } = {}) {
  const t = tier(deal.tier);
  return {
    kind: "share",
    deal: deal.id,
    tier: t.id,
    headline: `I got Taskmaster down to $${deal.price} for a ${t.label.toLowerCase()}`,
    sub: `Opened at $${deal.opening ?? deal.anchor}. ${deal.round} round${deal.round === 1 ? "" : "s"}.`,
    price: deal.price,
    opening: deal.opening ?? deal.anchor,
    rounds: deal.round,
    prompt: "Anyone get it lower?",
    url,
  };
}

// What the owner sees on a closed deal, in dollars that actually arrive.
export const takeHome = (deal) => (deal.price == null ? null : net(deal.price));
