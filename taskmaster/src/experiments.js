// The three experiments the card asks for, bucketed by user.
//
// Whop has an Experiments API and that is where these belong, so the bucket is asked for through an injected
// client. It is also a hard dependency on a service that may be down, and an experiment that falls back to "no
// bucket" silently stops measuring, so there is a local assignment too: a stable hash of user + experiment, which
// gives the same person the same arm every time without a round trip. Whop's answer wins when there is one.
//
// Nothing here changes a price. An experiment picks which mechanic a member meets; the deal desk's floors hold in
// every arm.

import { hmacHex } from "./sign.js";

export const EXPERIMENTS = {
  // The headline test. Which converts better, and at what average price?
  haggle_vs_fixed: { arms: ["haggle", "fixed"], note: "haggling against the tier's fixed price" },
  // Poke opened at $292 for a deal that closed at $29. Is a high anchor worth it, or does it just lose people?
  anchor_height: { arms: ["list", "modest"], note: "the tier's list price against a modest opening" },
  // One free push before payment, against nothing free at all.
  free_push: { arms: ["none", "one"], note: "nothing free before payment against one free push" },
};

export function arms(key) {
  const e = EXPERIMENTS[key];
  if (!e) throw new Error(`no such experiment: ${key}`);
  return e.arms;
}

// Deterministic and even: the first bytes of an HMAC over user + experiment, taken modulo the number of arms.
export async function localArm(key, user, { salt = "taskmaster" } = {}) {
  const list = arms(key);
  if (!user) return list[0];
  const hex = await hmacHex(salt, `${key}:${user}`);
  return list[parseInt(hex.slice(0, 8), 16) % list.length];
}

// client: { arm({ experiment, user }) -> string | null }. A client that throws, or answers with an arm this
// experiment does not have, is treated as no answer.
export async function armFor(key, user, { client = null, salt } = {}) {
  const list = arms(key);
  if (client) {
    try {
      const got = await client.arm({ experiment: key, user });
      if (got && list.includes(got)) return { arm: got, via: "whop" };
    } catch { /* fall through to the local assignment rather than stop measuring */ }
  }
  return { arm: await localArm(key, user, salt ? { salt } : {}), via: "local" };
}

// The opening an arm asks for, passed to `openDeal` as its anchor. "modest" opens halfway between the list price
// and the floor — low enough to feel different, high enough to leave a round of movement — and the floor itself is
// the same in both arms, so the experiment measures the opening and nothing else.
export function openingFor(t, arm) {
  if (arm !== "modest") return t.anchor;
  return Math.max(t.floor, Math.round((t.anchor + t.floor) / 2));
}
