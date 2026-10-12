// A venture's backend on Cloudflare: its own domain in front of its GitHub Pages folder, plus a small API.
// Time deploys one copy per venture (script time-<slug>) with its own D1 database; see .github/time/cloudflare.py.
//
//   GET  /api/health      -> { ok, slug, rev, ai }
//   POST /api/items       -> { id, link }   save a JSON creation (<= 64 KB), for share links
//   GET  /api/items/:id   -> the saved JSON
//   POST /api/ai          -> { text }       { prompt, system? } through Workers AI, rate limited
//   anything else         -> the venture's page on GitHub Pages (ORIGIN), served under this domain
//
// Bindings: DB (D1), AI (Workers AI). Vars: SLUG, ORIGIN, PAGES_ORIGIN, REV, AI_MODEL, AI_DAILY, SAVE_DAILY.

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, data TEXT NOT NULL, created TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS quota (k TEXT PRIMARY KEY, n INTEGER NOT NULL)",
];
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

async function api(req, env, url, h) {
  const path = url.pathname.replace(/\/+$/, "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (path === "/api/health") return json({ ok: true, slug: env.SLUG, rev: env.REV, ai: !!env.AI }, 200, h);
  await setup(env);
  if (path === "/api/items" && req.method === "POST") {
    const text = await req.text();
    if (text.length > MAX_ITEM) return json({ error: "too big (64 KB max)" }, 413, h);
    try { JSON.parse(text); } catch { return json({ error: "send JSON" }, 400, h); }
    if (!(await spend(env, "save", await who(req, env), 50, Number(env.SAVE_DAILY || 2000))))
      return json({ error: "over today's limit" }, 429, h);
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    await env.DB.prepare("INSERT INTO items (id, data, created) VALUES (?, ?, ?)").bind(id, text, new Date().toISOString()).run();
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
