// Offline test for worker.js: a fake D1 (just the statements the worker uses), fake Workers AI and a fake Pages origin.
// Run: node .github/time/cloudflare/test_worker.mjs   (test_time.py runs it when node is around)
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(join(here, "worker.js"))).default;

class FakeD1 {
  constructor() { this.items = new Map(); this.quota = new Map(); this.created = 0; }
  prepare(sql) {
    const db = this;
    const stmt = {
      args: [],
      bind(...a) { return { ...stmt, args: a }; },
      async run() { return this.exec(); },
      async first() { return (await this.exec()).results[0] ?? null; },
      async exec() {
        const a = this.args;
        if (sql.startsWith("CREATE TABLE")) { db.created++; return { results: [] }; }
        if (sql.startsWith("INSERT INTO quota")) {
          const n = (db.quota.get(a[0]) || 0) + 1; db.quota.set(a[0], n); return { results: [{ n }] };
        }
        if (sql.startsWith("INSERT INTO items")) { db.items.set(a[0], a[1]); return { results: [] }; }
        if (sql.startsWith("SELECT data FROM items")) { return { results: db.items.has(a[0]) ? [{ data: db.items.get(a[0]) }] : [] }; }
        throw new Error("unexpected sql " + sql);
      },
    };
    return stmt;
  }
  async batch(stmts) { return Promise.all(stmts.map((s) => s.exec())); }
}

const prompts = [];
const env = {
  DB: new FakeD1(), SLUG: "mdecks", REV: "abc123", ORIGIN: "https://o.github.io/r/ventures/mdecks/", PAGES_ORIGIN: "https://o.github.io",
  AI_MODEL: "@cf/test/model", AI_DAILY: "3", SAVE_DAILY: "100",
  AI: { async run(model, input) { prompts.push({ model, input }); return { response: "a crisp title" }; } },
};
const pages = [];
globalThis.fetch = async (url, init) => {
  pages.push({ url, init });
  if (url.endsWith("/ventures/mdecks/shots")) return new Response(null, { status: 301, headers: { location: "https://o.github.io/r/ventures/mdecks/shots/" } });
  return new Response(`<html>${url}</html>`, { status: 200, headers: { "content-type": "text/html" } });
};
const call = (path, init = {}, ip = "1.1.1.1") =>
  worker.fetch(new Request("https://mdecks.yolo.lol" + path, { ...init, headers: { "cf-connecting-ip": ip, ...(init.headers || {}) } }), env);
const post = (path, body, ip, headers = {}) =>
  call(path, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } }, ip);

// health, without touching the database
let r = await call("/api/health");
assert.deepEqual(await r.json(), { ok: true, slug: "mdecks", rev: "abc123", ai: true });
assert.equal(env.DB.created, 0);

// save and load a creation; the link comes back to this domain
r = await post("/api/items", { slides: ["# Hi"] });
assert.equal(r.status, 201);
const saved = await r.json();
assert.match(saved.id, /^[a-f0-9]{12}$/);
assert.equal(saved.link, `https://mdecks.yolo.lol/?s=${saved.id}`);
assert.equal(env.DB.created, 7);  // every table, created once
r = await call(`/api/items/${saved.id}`);
assert.deepEqual(await r.json(), { slides: ["# Hi"] });
assert.equal((await call("/api/items/doesnotexist1")).status, 404);
assert.equal((await post("/api/items", "not json")).status, 400);
assert.equal((await post("/api/items", JSON.stringify({ x: "y".repeat(70000) }))).status, 413);

// AI through Workers AI with the configured model; per-person and daily limits
r = await post("/api/ai", { prompt: "title for my deck", system: "be brief" }, "2.2.2.2");
assert.deepEqual(await r.json(), { text: "a crisp title" });
assert.equal(prompts[0].model, "@cf/test/model");
assert.deepEqual(prompts[0].input.messages.map((m) => m.role), ["system", "user"]);
assert.equal((await post("/api/ai", { prompt: "" }, "2.2.2.2")).status, 400);
assert.equal((await post("/api/ai", { prompt: "two" }, "3.3.3.3")).status, 200);
assert.equal((await post("/api/ai", { prompt: "three" }, "4.4.4.4")).status, 200);
assert.equal((await post("/api/ai", { prompt: "over the day" }, "5.5.5.5")).status, 429);
assert.equal(prompts.length, 3);

// newer models answer in the OpenAI shape
const openai = { ...env, DB: new FakeD1(), AI: { async run() { return { choices: [{ message: { content: "from choices" } }] }; } } };
r = await worker.fetch(new Request("https://mdecks.yolo.lol/api/ai", { method: "POST", body: JSON.stringify({ prompt: "hi" }),
                                     headers: { "cf-connecting-ip": "9.9.9.9" } }), openai);
assert.deepEqual(await r.json(), { text: "from choices" });

// CORS: this domain and the Pages origin, nobody else
r = await call("/api/health", { headers: { origin: "https://o.github.io" } });
assert.equal(r.headers.get("access-control-allow-origin"), "https://o.github.io");
r = await call("/api/health", { headers: { origin: "https://evil.example" } });
assert.equal(r.headers.get("access-control-allow-origin"), null);
assert.equal((await call("/api/nope")).status, 404);

// a broken database answers 500 with JSON, not an exception
const broken = { ...env, DB: { prepare() { throw new Error("D1 down"); }, batch() { return Promise.reject(new Error("D1 down")); } } };
r = await worker.fetch(new Request("https://x.yolo.lol/api/items", { method: "POST", body: "{}" }), broken);
assert.equal(r.status, 500);
assert.match((await r.json()).detail, /D1 down/);

// the page: Pages under this domain, query kept, redirects kept on this host
r = await call("/?s=" + saved.id);
assert.equal(pages.at(-1).url, "https://o.github.io/r/ventures/mdecks/?s=" + saved.id);
assert.equal(r.headers.get("x-time-venture"), "mdecks");
assert.match(await r.text(), /ventures\/mdecks\//);
r = await call("/app.js");
assert.equal(pages.at(-1).url, "https://o.github.io/r/ventures/mdecks/app.js");
r = await call("");
assert.equal(pages.at(-1).url, "https://o.github.io/r/ventures/mdecks/");
r = await call("/shots");
assert.equal(r.status, 301);
assert.equal(r.headers.get("location"), "/shots/");

console.log("WORKER OK");
