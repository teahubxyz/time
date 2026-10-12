// A venture's backend on Cloudflare: its own domain in front of its GitHub Pages folder, plus a small API.
// Time deploys one copy per venture (script time-<slug>) with its own D1 database; see .github/time/cloudflare.py.
//
//   GET  /api/health      -> { ok, slug, rev, ai }
//   POST /api/items       -> { id, link }   save a JSON creation (<= 64 KB), for share links
//   GET  /api/items/:id   -> the saved JSON
//   POST /api/ai          -> { text }       { prompt, system? } through Workers AI, rate limited
//   accounts, with passkeys (WebAuthn): no passwords, no email, nothing to configure
//   POST /api/auth/register/start  { name }  -> { challengeId, publicKey }   options for navigator.credentials.create
//   POST /api/auth/register/finish            -> { user }                     sets the session cookie
//   POST /api/auth/login/start                -> { challengeId, publicKey }   options for navigator.credentials.get
//   POST /api/auth/login/finish               -> { user }                     sets the session cookie
//   GET  /api/auth/me     -> { user } or 401        POST /api/auth/logout
//   GET  /api/me/items    -> { items }       what the signed-in person saved (POST /api/items records the owner)
//   anything else         -> the venture's page on GitHub Pages (ORIGIN), served under this domain
//
// Accounts live on the venture's own domain: the passkey's relying party is this host, and the session is a
// __Host- cookie (HttpOnly, Secure, SameSite=Lax). On GitHub Pages or in the checks there is no session, by design.
//
// Bindings: DB (D1), AI (Workers AI). Vars: SLUG, ORIGIN, PAGES_ORIGIN, REV, AI_MODEL, AI_DAILY, SAVE_DAILY.

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, data TEXT NOT NULL, created TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS quota (k TEXT PRIMARY KEY, n INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, created TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS creds (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, spki TEXT NOT NULL, alg INTEGER NOT NULL, " +
    "counter INTEGER NOT NULL, created TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, challenge TEXT NOT NULL, kind TEXT NOT NULL, user_id TEXT, " +
    "name TEXT, expires INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS owned (item_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created TEXT NOT NULL)",
];
const COOKIE = "__Host-time";
const SESSION_DAYS = 30;
const CHALLENGE_MS = 5 * 60 * 1000;
const MAX_ITEM = 65536;
const MAX_PROMPT = 4000;
let ready = null;

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

function cors(req, env) {
  const origin = req.headers.get("origin");
  if (!origin) return {};
  const self = new URL(req.url).origin;
  const ok = origin === self || (env.PAGES_ORIGIN && origin === env.PAGES_ORIGIN);
  return ok ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST",
                "access-control-allow-headers": "content-type", "vary": "origin" } : {};
}

async function setup(env) {
  ready ??= env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))).catch((e) => { ready = null; throw e; });
  return ready;
}

async function who(req, env) {
  const ip = req.headers.get("cf-connecting-ip") || "?";
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.SLUG}:${ip}`));
  return [...new Uint8Array(raw).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// One counter per (day, kind, person) and one per (day, kind): over either limit means no.
async function spend(env, kind, person, perPerson, total) {
  const day = new Date().toISOString().slice(0, 10);
  const bump = (k) => env.DB.prepare("INSERT INTO quota (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n").bind(k);
  const [mine, all] = await env.DB.batch([bump(`${day}:${kind}:${person}`), bump(`${day}:${kind}:*`)]);
  return mine.results[0].n <= perPerson && all.results[0].n <= total;
}

// ---------- passkeys (WebAuthn) ----------

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
const sha256 = async (data) => new Uint8Array(await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : data));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const ALGS = {
  "-7": { importAs: { name: "ECDSA", namedCurve: "P-256" }, verifyAs: { name: "ECDSA", hash: "SHA-256" }, der: true },
  "-257": { importAs: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verifyAs: { name: "RSASSA-PKCS1-v1_5" }, der: false },
};

// Authenticators sign ES256 as DER (SEQUENCE of two INTEGERs); WebCrypto wants r || s, 32 bytes each.
function derToRaw(der) {
  let i = 2;
  if (der[1] & 0x80) i += der[1] & 0x7f;
  const part = () => {
    if (der[i++] !== 0x02) throw new Error("bad signature");
    const len = der[i++];
    let v = der.slice(i, i + len);
    i += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = part(), s = part();
  const raw = new Uint8Array(64);
  raw.set(r);
  raw.set(s, 32);
  return raw;
}

async function challenge(env, kind, extra = {}) {
  const id = b64u(random(12)), value = b64u(random(32)), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM challenges WHERE expires < ?").bind(now),
    env.DB.prepare("INSERT INTO challenges (id, challenge, kind, user_id, name, expires) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, value, kind, extra.user ?? null, extra.name ?? null, now + CHALLENGE_MS),
  ]);
  return { id, value };
}

// One use only: the row is gone whether or not the answer checks out.
async function takeChallenge(env, id, kind) {
  const row = await env.DB.prepare("DELETE FROM challenges WHERE id = ? RETURNING challenge, kind, user_id, name, expires")
    .bind(String(id || "")).first();
  if (!row || row.kind !== kind || row.expires < Date.now()) throw new AuthError("that sign-in attempt expired; try again");
  return row;
}

class AuthError extends Error {}

// What the browser and the authenticator both vouched for: the ceremony, our challenge, our origin, our host.
async function checkCeremony(url, type, expected, clientDataB64, authDataB64) {
  const clientRaw = unb64u(clientDataB64);
  const client = JSON.parse(new TextDecoder().decode(clientRaw));
  if (client.type !== type) throw new AuthError("wrong ceremony");
  if (client.challenge !== expected) throw new AuthError("challenge mismatch");
  if (client.origin !== url.origin) throw new AuthError("wrong origin");
  const auth = unb64u(authDataB64);
  if (auth.length < 37 || !same(auth.slice(0, 32), await sha256(url.hostname))) throw new AuthError("wrong relying party");
  const flags = auth[32];
  if (!(flags & 0x01)) throw new AuthError("no user presence");
  const counter = new DataView(auth.buffer, auth.byteOffset + 33, 4).getUint32(0);
  return { clientRaw, auth, flags, counter };
}

async function startSession(env, url, userId, h) {
  const token = b64u(random(32));
  const expires = Date.now() + SESSION_DAYS * 86400e3;
  await env.DB.prepare("INSERT INTO sessions (hash, user_id, expires) VALUES (?, ?, ?)").bind(b64u(await sha256(token)), userId, expires).run();
  const user = await env.DB.prepare("SELECT id, name FROM users WHERE id = ?").bind(userId).first();
  return json({ user }, 200, { ...h, "set-cookie": `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}` });
}

function cookieToken(req) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)`));
  return m ? m[1] : null;
}

async function currentUser(req, env) {
  const token = cookieToken(req);
  if (!token) return null;
  return env.DB.prepare("SELECT users.id, users.name FROM sessions JOIN users ON users.id = sessions.user_id " +
                        "WHERE sessions.hash = ? AND sessions.expires > ?").bind(b64u(await sha256(token)), Date.now()).first();
}

async function auth(req, env, url, path, h) {
  // Accounts belong to this domain: refuse cross-origin calls outright.
  const origin = req.headers.get("origin");
  if (origin && origin !== url.origin) return json({ error: "sign in on the venture's own domain" }, 403, h);
  if (path === "/api/auth/me") {
    const user = await currentUser(req, env);
    return user ? json({ user }, 200, h) : json({ error: "not signed in" }, 401, h);
  }
  if (path === "/api/auth/logout" && req.method === "POST") {
    const token = cookieToken(req);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE hash = ?").bind(b64u(await sha256(token))).run();
    return json({ ok: true }, 200, { ...h, "set-cookie": `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0` });
  }
  if (req.method !== "POST") return json({ error: "no such endpoint" }, 404, h);
  let body;
  try { body = await req.json(); } catch { return json({ error: "send JSON" }, 400, h); }
  try {
    if (path === "/api/auth/register/start") {
      if (!(await spend(env, "register", await who(req, env), 20, 2000))) return json({ error: "over today's limit" }, 429, h);
      const name = String(body.name || "").trim().slice(0, 40) || "Me";
      const user = b64u(random(16));
      const c = await challenge(env, "register", { user, name });
      return json({ challengeId: c.id, publicKey: {
        challenge: c.value, rp: { name: env.SLUG, id: url.hostname }, user: { id: user, name, displayName: name },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { residentKey: "required", userVerification: "preferred" }, attestation: "none", timeout: 60000,
      } }, 200, h);
    }
    if (path === "/api/auth/register/finish") {
      const c = await takeChallenge(env, body.challengeId, "register");
      const { flags, counter } = await checkCeremony(url, "webauthn.create", c.challenge, body.clientDataJSON, body.authenticatorData);
      if (!(flags & 0x40)) throw new AuthError("no credential in the answer");
      const alg = ALGS[String(body.alg)];
      if (!alg || !body.publicKey || !/^[A-Za-z0-9_-]{16,1400}$/.test(String(body.id))) throw new AuthError("unsupported passkey");
      await crypto.subtle.importKey("spki", unb64u(body.publicKey), alg.importAs, false, ["verify"]);  // throws if it isn't a key
      const now = new Date().toISOString();
      try {
        await env.DB.batch([
          env.DB.prepare("INSERT INTO users (id, name, created) VALUES (?, ?, ?)").bind(c.user_id, c.name, now),
          env.DB.prepare("INSERT INTO creds (id, user_id, spki, alg, counter, created) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(body.id, c.user_id, body.publicKey, Number(body.alg), counter, now),
        ]);
      } catch { throw new AuthError("that passkey is already registered here"); }
      return startSession(env, url, c.user_id, h);
    }
    if (path === "/api/auth/login/start") {
      if (!(await spend(env, "login", await who(req, env), 60, 5000))) return json({ error: "over today's limit" }, 429, h);
      const c = await challenge(env, "login");
      return json({ challengeId: c.id, publicKey: { challenge: c.value, rpId: url.hostname, userVerification: "preferred",
                                                    timeout: 60000 } }, 200, h);
    }
    if (path === "/api/auth/login/finish") {
      const c = await takeChallenge(env, body.challengeId, "login");
      const { clientRaw, auth: authData, counter } = await checkCeremony(url, "webauthn.get", c.challenge, body.clientDataJSON,
                                                                          body.authenticatorData);
      const cred = await env.DB.prepare("SELECT user_id, spki, alg, counter FROM creds WHERE id = ?").bind(String(body.id || "")).first();
      if (!cred) throw new AuthError("unknown passkey for this site");
      const alg = ALGS[String(cred.alg)];
      const key = await crypto.subtle.importKey("spki", unb64u(cred.spki), alg.importAs, false, ["verify"]);
      const signed = new Uint8Array(authData.length + 32);
      signed.set(authData);
      signed.set(await sha256(clientRaw), authData.length);
      let sig = unb64u(body.signature);
      if (alg.der) sig = derToRaw(sig);
      if (!(await crypto.subtle.verify(alg.verifyAs, key, sig, signed))) throw new AuthError("signature does not check out");
      if ((counter || cred.counter) && counter <= cred.counter) throw new AuthError("this passkey looks cloned");
      await env.DB.prepare("UPDATE creds SET counter = ? WHERE id = ?").bind(counter, body.id).run();
      return startSession(env, url, cred.user_id, h);
    }
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 400, h);
    throw e;
  }
  return json({ error: "no such endpoint" }, 404, h);
}

async function api(req, env, url, h) {
  const path = url.pathname.replace(/\/+$/, "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (path === "/api/health") return json({ ok: true, slug: env.SLUG, rev: env.REV, ai: !!env.AI }, 200, h);
  await setup(env);
  if (path.startsWith("/api/auth/")) return auth(req, env, url, path, h);
  if (path === "/api/me/items") {
    const user = await currentUser(req, env);
    if (!user) return json({ error: "not signed in" }, 401, h);
    const rows = await env.DB.prepare("SELECT item_id, created FROM owned WHERE user_id = ? ORDER BY created DESC LIMIT 50")
      .bind(user.id).all();
    return json({ items: rows.results.map((r) => ({ id: r.item_id, link: `${url.origin}/?s=${r.item_id}`, created: r.created })) }, 200, h);
  }
  if (path === "/api/items" && req.method === "POST") {
    const text = await req.text();
    if (text.length > MAX_ITEM) return json({ error: "too big (64 KB max)" }, 413, h);
    try { JSON.parse(text); } catch { return json({ error: "send JSON" }, 400, h); }
    if (!(await spend(env, "save", await who(req, env), 50, Number(env.SAVE_DAILY || 2000))))
      return json({ error: "over today's limit" }, 429, h);
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const now = new Date().toISOString();
    const user = await currentUser(req, env);
    await env.DB.batch([env.DB.prepare("INSERT INTO items (id, data, created) VALUES (?, ?, ?)").bind(id, text, now),
                        ...(user ? [env.DB.prepare("INSERT INTO owned (item_id, user_id, created) VALUES (?, ?, ?)").bind(id, user.id, now)] : [])]);
    return json({ id, link: `${url.origin}/?s=${id}` }, 201, h);
  }
  const item = path.match(/^\/api\/items\/([a-z0-9]{6,32})$/);
  if (item && req.method === "GET") {
    const row = await env.DB.prepare("SELECT data FROM items WHERE id = ?").bind(item[1]).first();
    return row ? new Response(row.data, { headers: { "content-type": "application/json; charset=utf-8", ...h } })
               : json({ error: "not found" }, 404, h);
  }
  if (path === "/api/ai" && req.method === "POST") {
    if (!env.AI) return json({ error: "no AI on this venture" }, 501, h);
    let body;
    try { body = await req.json(); } catch { return json({ error: "send JSON" }, 400, h); }
    const prompt = String(body.prompt || "").slice(0, MAX_PROMPT);
    if (!prompt) return json({ error: "prompt is empty" }, 400, h);
    if (!(await spend(env, "ai", await who(req, env), 20, Number(env.AI_DAILY || 200))))
      return json({ error: "over today's limit" }, 429, h);
    const messages = [...(body.system ? [{ role: "system", content: String(body.system).slice(0, MAX_PROMPT) }] : []),
                      { role: "user", content: prompt }];
    const out = await env.AI.run(env.AI_MODEL, { messages, max_tokens: 512 });
    // older models answer { response }, newer ones the OpenAI shape { choices: [{ message: { content } }] }
    const text = out.response ?? out.choices?.[0]?.message?.content ?? "";
    return json({ text: typeof text === "string" ? text : JSON.stringify(text) }, 200, h);
  }
  return json({ error: "no such endpoint" }, 404, h);
}

// The page itself: the venture's folder on GitHub Pages, under this domain. Pages redirects folder URLs without a
// trailing slash to its own host; those are rewritten to stay here.
async function page(req, env, url) {
  const origin = env.ORIGIN.replace(/\/+$/, "");
  const up = await fetch(origin + url.pathname + url.search, { redirect: "manual", cf: { cacheTtl: 60, cacheEverything: true } });
  const headers = new Headers(up.headers);
  const loc = headers.get("location");
  if (loc && loc.startsWith(origin)) headers.set("location", loc.slice(origin.length) || "/");
  headers.set("x-time-venture", env.SLUG);
  return new Response(up.body, { status: up.status, headers });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const h = cors(req, env);
      try { return await api(req, env, url, h); }
      catch (e) { return json({ error: "backend error", detail: String(e).slice(0, 200) }, 500, h); }
    }
    return page(req, env, url);
  },
};
