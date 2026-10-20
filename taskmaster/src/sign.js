// One signing primitive for the app: the quote card's seal and the Whop webhook's signature check both use it.
// WebCrypto, so the same code runs on Node and on an edge runtime, and nothing here is synchronous by accident.

const enc = new TextEncoder();

export async function hmacHex(secret, data) {
  if (!secret) throw new Error("no signing secret");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant time in the length the two strings share, and never short-circuits on an early byte. A length mismatch
// is still a mismatch, which leaks only the length of a value the caller already knows.
export function safeEqual(a, b) {
  const x = String(a ?? ""), y = String(b ?? ""), n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) | 0) ^ (y.charCodeAt(i) | 0); // past the end: NaN | 0 is 0
  return diff === 0;
}

// Canonical JSON: keys sorted at every level, so a seal computed here matches a seal computed anywhere else over the
// same values. Objects a model has reordered on the way through still verify; a changed value does not.
export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}
