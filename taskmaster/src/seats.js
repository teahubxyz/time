// Seat packs, for an org whose lead haggles once and then hands seats out.
//
// A Whop checkout has no quantity, so a pack is one membership and the pack size is the variant (seats5, seats10).
// The seat list lives in that membership's metadata, which Whop's membership API can merge into, so there is still
// no database to run: the membership is both the receipt and the seat list.
//
// Swaps are allowed — people leave teams — but rate-limited, so a pack of five cannot be rented round a company of
// fifty. The limit is a count per rolling window, kept in the same metadata as the seats.
//
// What the buyer sees: seats and usage. Never anyone's chats. `buyerView` is built from a fixed key list and
// `assertNoChats` is what stops a future field from quietly adding them.
//
// One thing a pack needs that metadata alone cannot give: a way to find it. A seat holder holds no membership of
// their own — the pack belongs to the lead who bought it — so asking Whop for the seat holder's memberships
// answers nothing, however valid the pack is. `packIndex` is the answer to "which pack should I even look at for
// this username", and nothing more: see its note below.

import { tier, TIERS } from "./tiers.js";

export const SWAP_LIMIT = 3;                     // removals per window
export const SWAP_WINDOW_DAYS = 30;
const USER = /^[A-Za-z0-9_.-]{1,32}$/;           // a Whop username, not a display name

const iso = (now) => new Date(now ?? Date.now()).toISOString();
const norm = (u) => String(u ?? "").trim().replace(/^@/, "").toLowerCase();

// Where to look, never who is allowed. A seat is only real if Whop's own metadata still lists it, so the server
// reads every pack this names straight from Whop before anyone is coached: a stale entry costs one read and grants
// nothing, and an entry that is missing costs a seat holder their coach mode until the pack is touched again. It is
// therefore derived state — rebuildable from the packs' metadata — which is why the in-memory default is enough for
// one process and the tests, and a host that outlives a process passes a KV-backed index with the same three
// methods, exactly as it does for the deal and thread stores.
export function packIndex() {
  const by = new Map();
  return {
    async for(user) { return [...(by.get(norm(user)) ?? [])]; },
    async remember(user, membership) {
      const u = norm(user);
      if (!u || !membership) return;
      by.set(u, [...new Set([...(by.get(u) ?? []), membership])]);
    },
    async forget(user, membership) {
      const u = norm(user);
      const left = (by.get(u) ?? []).filter((id) => id !== membership);
      if (left.length) by.set(u, left); else by.delete(u);
    },
  };
}

export const seatsOf = (membership) => membership?.metadata?.seats ?? [];
export const swapsOf = (membership) => membership?.metadata?.seat_swaps ?? [];

// A pack's size is its tier's, never a number carried in metadata a member could have written. An individual
// membership and an unknown tier are both "not a pack", which is what `assign` refuses on.
export function size(membership) {
  const id = membership?.metadata?.tier ?? null;
  if (!id || !Object.hasOwn(TIERS, id)) return 0;
  return tier(id).seats ?? 0;
}

function recentSwaps(membership, now) {
  const cut = (now ?? Date.now()) - SWAP_WINDOW_DAYS * 86400000;
  return swapsOf(membership).filter((ts) => new Date(ts).getTime() > cut);
}

// Returns the metadata patch to merge into the membership, or throws with what is wrong. Nothing is written here:
// the caller hands the patch to the Whop client, so a refused plan never touches Whop.
export function assign(membership, { add = [], remove = [], now } = {}) {
  const seats = seatsOf(membership);
  const cap = size(membership);
  if (!cap) throw new Error("that membership is not a seat pack");

  const dropping = remove.map(norm).filter(Boolean);
  for (const u of dropping) {
    if (!seats.some((s) => norm(s.user) === u)) throw new Error(`${u} does not hold a seat`);
  }
  const adding = [];
  for (const raw of add) {
    const u = norm(raw);
    if (!USER.test(u)) throw new Error(`${JSON.stringify(raw)} is not a Whop username`);
    if (adding.includes(u)) continue;
    if (seats.some((s) => norm(s.user) === u) && !dropping.includes(u)) throw new Error(`${u} already holds a seat`);
    adding.push(u);
  }

  const swaps = recentSwaps(membership, now);
  if (dropping.length && swaps.length + dropping.length > SWAP_LIMIT) {
    throw new Error(`${SWAP_LIMIT} seat swaps per ${SWAP_WINDOW_DAYS} days; ${swaps.length} used`);
  }

  const kept = seats.filter((s) => !dropping.includes(norm(s.user)));
  const next = [...kept, ...adding.map((user) => ({ user, assigned: iso(now), used: 0 }))];
  if (next.length > cap) throw new Error(`that pack has ${cap} seats; ${next.length} would be assigned`);

  return {
    seats: next,
    seat_swaps: [...swaps, ...dropping.map(() => iso(now))],
  };
}

// Usage, counted in days a seat was used rather than messages sent: it is the number the buyer actually wants, it
// is one metadata write a day instead of one a turn, and it cannot be read back as a message count. Still a
// count, never a transcript. Returns null when there is nothing to write.
export function useSeat(membership, user, { now } = {}) {
  const u = norm(user);
  const seats = seatsOf(membership);
  const seat = seats.find((s) => norm(s.user) === u);
  if (!seat) throw new Error(`${u} does not hold a seat`);
  const day = iso(now).slice(0, 10);
  if (String(seat.last ?? "").slice(0, 10) === day) return null;
  return { seats: seats.map((s) => (s === seat ? { ...s, used: (s.used ?? 0) + 1, last: iso(now) } : s)) };
}

// Whose pack it is. The checkout's metadata carries the member who bought it; `user_id` is Whop's own answer to the
// same question, and either will do. A pack with no buyer on it is nobody's, and `isBuyer` says no to everyone.
export const buyerOf = (membership) =>
  membership?.metadata?.member ?? membership?.user_id ?? membership?.user ?? null;

export function isBuyer(membership, who) {
  const buyer = buyerOf(membership);
  return Boolean(buyer) && Boolean(who) && norm(buyer) === norm(who);
}

const VIEW_SEAT = ["user", "assigned", "used", "last"];

// Everything the buyer is allowed to see. Nothing in a seat row is free text a member wrote, so there is no chat
// to leak: a seat is a username, two timestamps and a count.
export function buyerView(membership, { now } = {}) {
  const cap = size(membership);
  const seats = seatsOf(membership).map((s) => Object.fromEntries(VIEW_SEAT.map((k) => [k, s[k] ?? null])));
  const swaps = recentSwaps(membership, now);
  return assertNoChats({
    membership: membership?.id ?? null,
    tier: membership?.metadata?.tier ?? null,
    seats: cap,
    assigned: seats.length,
    open: Math.max(0, cap - seats.length),
    used: seats.reduce((n, s) => n + (s.used ?? 0), 0),
    swaps_used: swaps.length,
    swaps_left: Math.max(0, SWAP_LIMIT - swaps.length),
    swap_window_days: SWAP_WINDOW_DAYS,
    holders: seats,
  });
}

const CHATTY = ["chat", "message", "messages", "transcript", "thread", "text", "reply", "replies", "note", "notes", "prompt"];

export function assertNoChats(view) {
  const walk = (node, path) => {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (CHATTY.includes(k.toLowerCase())) throw new Error(`the buyer view must not carry ${path}${k}`);
      walk(v, `${path}${k}.`);
    }
  };
  walk(view, "");
  return view;
}
