// Offline test for passkey accounts in worker.js: a real SQLite standing in for D1 (node:sqlite) and a software
// authenticator with real P-256 and RSA keys. Run: node .github/time/cloudflare/test_auth.mjs
// Skips (and says so) when this node has no node:sqlite.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let DatabaseSync;
try {
  process.removeAllListeners("warning");
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  console.log("AUTH SKIPPED: no node:sqlite");
  process.exit(0);
}
const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(join(here, "worker.js"))).default;

// D1's surface over SQLite: prepare/bind/run/first/all, and batch as one transaction.
class D1 {
  constructor() { this.db = new DatabaseSync(":memory:"); }
  prepare(sql) {
    const db = this.db;
    const make = (args) => ({
      bind: (...a) => make(a),
      exec: () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => ({ results: db.prepare(sql).all(...args) }),
      first: async () => db.prepare(sql).all(...args)[0] ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    });
    return make([]);
  }
  async batch(stmts) {
    this.db.exec("BEGIN");
    try {
      const out = stmts.map((s) => s.exec());
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}

const HOST = "mdecks.yolo.lol", ORIGIN = `https://${HOST}`;
const env = { DB: new D1(), SLUG: "mdecks", REV: "r", ORIGIN: "https://o.github.io/r/ventures/mdecks/", PAGES_ORIGIN: "https://o.github.io" };
const enc = new TextEncoder();
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => new Uint8Array(Buffer.from(s, "base64url"));
const sha256 = async (d) => new Uint8Array(await crypto.subtle.digest("SHA-256", typeof d === "string" ? enc.encode(d) : d));
let ip = 0;
const call = (path, { body, cookie, origin, host = HOST } = {}) => worker.fetch(new Request(`https://${host}${path}`, {
  method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
  headers: { "content-type": "application/json", "cf-connecting-ip": `10.0.0.${++ip % 250}`, ...(cookie ? { cookie } : {}),
             ...(origin ? { origin } : {}) } }), env);
const cookieOf = (r) => (r.headers.get("set-cookie") || "").split(";")[0];

// The software authenticator: what a phone or a laptop's passkey would hand the page.
function authData(rpHash, flags, counter) {
  const a = new Uint8Array(37);
  a.set(rpHash);
  a[32] = flags;
  new DataView(a.buffer).setUint32(33, counter);
  return a;
}
function rawToDer(raw) {
  const int = (b) => {
    let v = [...b];
    while (v.length > 1 && v[0] === 0 && !(v[1] & 0x80)) v.shift();
    if (v[0] & 0x80) v = [0, ...v];
    return [0x02, v.length, ...v];
  };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return new Uint8Array([0x30, body.length, ...body]);
}
class Authenticator {
  static async make(kind = "ES256") {
    const a = new Authenticator();
    a.kind = kind;
    a.alg = kind === "ES256" ? -7 : -257;
    a.keys = kind === "ES256"
      ? await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
      : await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]),
                                         hash: "SHA-256" }, true, ["sign", "verify"]);
    a.id = b64u(crypto.getRandomValues(new Uint8Array(16)));
    a.counter = 0;
    return a;
  }
  async create(options, { origin = ORIGIN } = {}) {
    const clientData = enc.encode(JSON.stringify({ type: "webauthn.create", challenge: options.publicKey.challenge, origin }));
    return { challengeId: options.challengeId, id: this.id, alg: this.alg, clientDataJSON: b64u(clientData),
             authenticatorData: b64u(authData(await sha256(options.publicKey.rp.id), 0x45, this.counter)),
             publicKey: b64u(await crypto.subtle.exportKey("spki", this.keys.publicKey)) };
  }
  async get(options, { origin = ORIGIN, counter = ++this.counter, rpId = options.publicKey.rpId } = {}) {
    const clientData = enc.encode(JSON.stringify({ type: "webauthn.get", challenge: options.publicKey.challenge, origin }));
    const ad = authData(await sha256(rpId), 0x05, counter);
    const signed = new Uint8Array([...ad, ...(await sha256(clientData))]);
    const algo = this.kind === "ES256" ? { name: "ECDSA", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5" };
    let sig = new Uint8Array(await crypto.subtle.sign(algo, this.keys.privateKey, signed));
    if (this.kind === "ES256") sig = rawToDer(sig);
    return { challengeId: options.challengeId, id: this.id, clientDataJSON: b64u(clientData), authenticatorData: b64u(ad),
             signature: b64u(sig) };
  }
}

// sign up: options for this host, then the passkey's answer makes the account and a session
const key = await Authenticator.make();
let r = await call("/api/auth/register/start", { body: { name: "Ada" } });
let opts = await r.json();
assert.equal(opts.publicKey.rp.id, HOST);
assert.equal(opts.publicKey.user.name, "Ada");
assert.deepEqual(opts.publicKey.pubKeyCredParams.map((p) => p.alg), [-7, -257]);
r = await call("/api/auth/register/finish", { body: await key.create(opts) });
assert.equal(r.status, 200, await r.clone().text());
const ada = (await r.json()).user;
assert.equal(ada.name, "Ada");
let cookie = cookieOf(r);
assert.match(r.headers.get("set-cookie"), /^__Host-time=[A-Za-z0-9_-]+; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000$/);

// the session knows who it is, and keeps what they save
assert.deepEqual((await (await call("/api/auth/me", { cookie })).json()).user, ada);
r = await call("/api/items", { body: { deck: "# mine" }, cookie });
const mine = (await r.json()).id;
await call("/api/items", { body: { deck: "# someone else's" } });
r = await call("/api/me/items", { cookie });
assert.deepEqual((await r.json()).items.map((i) => i.id), [mine]);
assert.equal((await call("/api/me/items")).status, 401);

// sign out, then sign back in with the same passkey (discoverable: no username asked)
r = await call("/api/auth/logout", { body: {}, cookie });
assert.match(r.headers.get("set-cookie"), /Max-Age=0/);
assert.equal((await call("/api/auth/me", { cookie })).status, 401);
opts = await (await call("/api/auth/login/start", { body: {} })).json();
assert.equal(opts.publicKey.rpId, HOST);
const answer = await key.get(opts);
r = await call("/api/auth/login/finish", { body: answer });
assert.equal(r.status, 200, await r.clone().text());
cookie = cookieOf(r);
assert.deepEqual((await (await call("/api/auth/me", { cookie })).json()).user, ada);
assert.deepEqual((await (await call("/api/me/items", { cookie })).json()).items.map((i) => i.id), [mine]);

// what must fail
const fails = async (path, body, why) => {
  const res = await call(path, { body });
  assert.equal(res.status, 400, `${why}: ${res.status}`);
  return (await res.json()).error;
};
assert.match(await fails("/api/auth/login/finish", answer, "replayed answer"), /expired/);
let o = await (await call("/api/auth/login/start", { body: {} })).json();
assert.match(await fails("/api/auth/login/finish", await key.get(o, { origin: "https://evil.example" }), "phishing origin"), /origin/);
o = await (await call("/api/auth/login/start", { body: {} })).json();
assert.match(await fails("/api/auth/login/finish", await key.get(o, { rpId: "evil.example" }), "other site's passkey"), /relying party/);
o = await (await call("/api/auth/login/start", { body: {} })).json();
assert.match(await fails("/api/auth/login/finish", await key.get(o, { counter: 1 }), "counter went back"), /cloned/);
o = await (await call("/api/auth/login/start", { body: {} })).json();
const forged = await key.get(o);
const bad = unb64u(forged.signature);
bad[bad.length - 1] ^= 1;
assert.match(await fails("/api/auth/login/finish", { ...forged, signature: b64u(bad) }, "tampered signature"), /signature/);
o = await (await call("/api/auth/login/start", { body: {} })).json();
const stranger = await Authenticator.make();
assert.match(await fails("/api/auth/login/finish", await stranger.get(o), "unregistered passkey"), /unknown passkey/);
o = await (await call("/api/auth/register/start", { body: { name: "Again" } })).json();
assert.match(await fails("/api/auth/register/finish", await key.create(o), "same passkey twice"), /already registered/);
o = await (await call("/api/auth/register/start", { body: { name: "Eve" } })).json();
assert.match(await fails("/api/auth/register/finish", await stranger.create(o, { origin: "https://o.github.io" }), "from Pages"), /origin/);
assert.equal((await call("/api/auth/login/start", { body: {}, origin: "https://o.github.io" })).status, 403);
assert.equal((await call("/api/auth/me", { cookie: "__Host-time=forged" })).status, 401);
// a failed sign-up left no half-made account behind
assert.equal(env.DB.db.prepare("SELECT COUNT(*) AS n FROM users").all()[0].n, 1);

// RSA passkeys (RS256, some Windows Hello setups) work too
const rsa = await Authenticator.make("RS256");
o = await (await call("/api/auth/register/start", { body: { name: "Grace" } })).json();
r = await call("/api/auth/register/finish", { body: await rsa.create(o) });
assert.equal(r.status, 200, await r.clone().text());
o = await (await call("/api/auth/login/start", { body: {} })).json();
r = await call("/api/auth/login/finish", { body: await rsa.get(o) });
assert.equal((await r.json()).user.name, "Grace");

// the other endpoints still work on a database that has accounts
r = await call("/api/health");
assert.equal((await r.json()).ok, true);

console.log("AUTH OK");
