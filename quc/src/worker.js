// quc: page + API in one Worker (no build step; the same module runs on Cloudflare and under dev.mjs).
//   GET  /, /run/:id               the page (start screen, or the chair / replay)
//   GET  /chair.svg                the chair-in-the-corner motif
//   GET  /api/health               {ok, rev, live}   live: false when no model key is bound (offline demo answers)
//   POST /api/runs                 {repo, task} -> {id}            sets the visitor cookie
//   GET  /api/runs/:id?after=N     {run, events, owner}             anyone with the link
//   POST /api/runs/:id/step        advance one step                  owner only
//   POST /api/runs/:id/safeword    stop, throw the work away         owner only
//   POST /api/runs/:id/say         {text}: talk from the chair       owner only
//   GET  /api/runs/:id/patch       the run's changes as a unified diff
// Bindings: KV (a KV namespace), VENICE_API_KEY (secret; without it the agent answers offline), REV, CODER_MODEL, PERSONA_MODEL,
// RUNS_PER_DAY (per visitor, default 5), RUNS_PER_DAY_ALL (default 300).
import { PAGE, CHAIR } from "./page.js";
import { createRun, getRun, getEvents, publicRun, memoryStore } from "./runs.js";
import { step, safeword, say, patch } from "./engine.js";

export { validate } from "./validate.js";
export { PAGE, CHAIR };

const COOKIE = "quc_v";
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
const fallback = memoryStore();   // dev and tests only: a deployed Worker always has KV bound

function visitorOf(req) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{16,64})`));
  return m ? m[1] : null;
}

async function underCap(store, visitor, env) {
  const day = new Date().toISOString().slice(0, 10);
  const mine = `cap:${day}:${visitor}`, all = `cap:${day}:*`;
  const [a, b] = [Number(await store.get(mine)) || 0, Number(await store.get(all)) || 0];
  if (a >= Number(env.RUNS_PER_DAY || 5) || b >= Number(env.RUNS_PER_DAY_ALL || 300)) return false;
  await store.put(mine, String(a + 1), { expirationTtl: 172800 });
  await store.put(all, String(b + 1), { expirationTtl: 172800 });
  return true;
}

async function api(req, env, url) {
  const store = env.KV || fallback;
  const path = url.pathname;
  if (path === "/api/health") return json({ ok: true, rev: env.REV || "", live: !!env.VENICE_API_KEY });
  if (req.method === "POST") {
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin) return json({ error: "cross-site request" }, 403);
  }
  let visitor = visitorOf(req);
  const setCookie = {};
  if (!visitor) {
    visitor = crypto.randomUUID().replace(/-/g, "");
    setCookie["set-cookie"] = `${COOKIE}=${visitor}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${url.protocol === "https:" ? "; Secure" : ""}`;
  }
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  if (path === "/api/runs" && req.method === "POST") {
    try {
      const repo = String(body.repo || "").trim(), task = String(body.task || "").trim();
      const active = await store.get(`active:${visitor}`);
      if (!active && !(await underCap(store, visitor, env))) return json({ error: "That's enough for today. The chair needs a rest; come back tomorrow." }, 429, setCookie);
      const run = await createRun(store, { repo, task, visitor });
      return json({ id: run.id }, 201, setCookie);
    } catch (e) {
      if (e.code === "active") return json({ error: e.message, id: e.id }, 409, setCookie);
      if (e.code === "invalid") return json({ error: Object.values(e.errors)[0], errors: e.errors }, 400, setCookie);
      throw e;
    }
  }

  const m = path.match(/^\/api\/runs\/([a-z0-9]{6,16})(?:\/(step|safeword|say|patch))?$/);
  if (!m) return json({ error: "not found" }, 404);
  const [, id, action] = m;
  const run = await getRun(store, id);
  if (!run) return json({ error: "no such run" }, 404, setCookie);
  const owner = run.visitor === visitor;

  if (!action && req.method === "GET") {
    const after = Number(url.searchParams.get("after")) || 0;
    const events = (await getEvents(store, id)).filter((e) => e.seq > after);
    return json({ run: publicRun(run), events, owner }, 200, setCookie);
  }
  if (action === "patch" && req.method === "GET") {
    const text = await patch(store, id);
    return new Response(text, { headers: { "content-type": "text/x-diff; charset=utf-8", "content-disposition": `attachment; filename="quc-${id}.patch"` } });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!owner) return json({ error: "Only the one in the chair can do that." }, 403, setCookie);
  try {
    if (action === "step") return json({ run: publicRun(await step(store, id, env)) });
    if (action === "safeword") return json({ run: publicRun(await safeword(store, id)) });
    if (action === "say") return json({ reply: await say(store, id, body.text) });
  } catch (e) {
    if (e.code) return json({ error: e.message }, 400);
    throw e;
  }
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(req, env = {}) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/api/")) return await api(req, env, url);
    } catch (e) {
      return json({ error: "Something broke in the corner: " + String(e.message || e).slice(0, 200) }, 500);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
    if (url.pathname === "/chair.svg") return new Response(CHAIR, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" } });
    if (url.pathname === "/" || url.pathname === "/index.html" || /^\/run\/[\w-]+$/.test(url.pathname))
      return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY", "referrer-policy": "same-origin" } });
    return new Response("not found", { status: 404 });
  },
};
