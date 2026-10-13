// AICharts demo Worker: the page, the library, a sample dataset in D1, the spec endpoint (Workers AI) and saved charts.
//
//   GET  /                         the demo page (Chart.js + <ai-chart>)
//   GET  /aicharts.js              the library, as served to any page that embeds it
//   GET  /api/schema?dataset=orders  columns, a few sample rows and aggregates: all the model ever sees
//   GET  /api/data?dataset=orders    the rows, for the browser to chart
//   POST /api/spec  { dataset, prompt, prior? }  -> { spec }   a validated chart spec, never code
//   POST /api/charts { dataset, prompt, spec }    -> { id, link } save a chart
//   GET  /api/charts, /api/charts/:id             the saved charts
//
// Read-only except saved_charts and quota. Bindings: DB (D1), AI (Workers AI). Vars: AI_MODEL, AI_DAILY, SAVE_DAILY, REV.
// deploy.py uploads main.js, which hands this module the library source: export default make(src).
import { validateSpec, MARKS, AGGS, OPS } from "./aicharts.js";

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, date TEXT, month TEXT, region TEXT, product TEXT, channel TEXT, units INTEGER, amount REAL)",
  "CREATE TABLE IF NOT EXISTS quota (k TEXT PRIMARY KEY, n INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS saved_charts (id TEXT PRIMARY KEY, created TEXT NOT NULL, dataset TEXT NOT NULL, prompt TEXT, title TEXT, spec TEXT NOT NULL)",
];
const COLUMNS = [
  { name: "id", type: "number" }, { name: "date", type: "date" }, { name: "month", type: "month" },
  { name: "region", type: "string" }, { name: "product", type: "string" }, { name: "channel", type: "string" },
  { name: "units", type: "number" }, { name: "amount", type: "number" },
];
const DATASETS = { orders: { title: "Orders (sample shop, 24 months)", columns: COLUMNS } };
const MAX_PROMPT = 400;

// The sample shop: deterministic, so every deploy seeds the same rows and tests can count on them.
export function seedOrders() {
  let s = 42;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const regions = ["North", "South", "East", "West"], channels = ["web", "store"];
  const products = [["Matcha", 24], ["Sencha", 14], ["Hojicha", 12], ["Teapot", 48], ["Whisk", 18]];
  const rows = [];
  for (let m = 0; m < 24; m++) {
    const y = 2024 + Math.floor((m + 9) / 12), mo = ((m + 9) % 12) + 1, month = `${y}-${String(mo).padStart(2, "0")}`;
    const season = 1 + 0.25 * Math.sin((mo / 12) * 2 * Math.PI) + m * 0.015;
    for (const region of regions) for (const [product, price] of products) {
      const units = Math.max(1, Math.round((8 + rnd() * 30) * season * (region === "West" ? 1.3 : 1)));
      const channel = rnd() < (product === "Teapot" ? 0.4 : 0.65) ? "web" : "store";
      const day = String(1 + Math.floor(rnd() * 28)).padStart(2, "0");
      rows.push({ id: rows.length + 1, date: `${month}-${day}`, month, region, product, channel, units,
                  amount: Math.round(units * price * (0.9 + rnd() * 0.2) * 100) / 100 });
    }
  }
  return rows;
}

let ready = null;
async function setup(env) {
  ready ??= (async () => {
    await env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q)));
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first();
    if (!n?.n) {
      const ins = env.DB.prepare("INSERT OR IGNORE INTO orders (id, date, month, region, product, channel, units, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      const rows = seedOrders();
      for (let i = 0; i < rows.length; i += 100)
        await env.DB.batch(rows.slice(i, i + 100).map((r) => ins.bind(r.id, r.date, r.month, r.region, r.product, r.channel, r.units, r.amount)));
    }
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS",
               "access-control-allow-headers": "content-type" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

async function who(req) {
  const ip = req.headers.get("cf-connecting-ip") || "?";
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`aicharts:${ip}`));
  return [...new Uint8Array(raw).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// One counter per (day, kind, person) and one per (day, kind): over either limit means no.
async function spend(env, kind, person, perPerson, total) {
  const day = new Date().toISOString().slice(0, 10);
  const bump = (k) => env.DB.prepare("INSERT INTO quota (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n").bind(k);
  const [mine, all] = await env.DB.batch([bump(`${day}:${kind}:${person}`), bump(`${day}:${kind}:*`)]);
  return mine.results[0].n <= perPerson && all.results[0].n <= total;
}

async function rows(env) {
  return (await env.DB.prepare("SELECT id, date, month, region, product, channel, units, amount FROM orders ORDER BY id").all()).results;
}

// What the model sees: columns, five rows, distinct values of text columns, ranges of number columns.
export function describe(data, columns) {
  const aggregates = {};
  for (const c of columns) {
    const vals = data.map((r) => r[c.name]);
    if (c.type === "number") aggregates[c.name] = { min: Math.min(...vals), max: Math.max(...vals) };
    else {
      const d = [...new Set(vals)].sort();
      aggregates[c.name] = d.length <= 20 ? { values: d } : { first: d[0], last: d.at(-1), distinct: d.length };
    }
  }
  return { columns, sample: data.slice(0, 5), aggregates, rows: data.length };
}

const SPEC_SCHEMA = {
  type: "object", required: ["mark", "x", "y"],
  properties: {
    title: { type: "string" }, mark: { type: "string", enum: MARKS }, x: { type: "string" }, y: { type: "string" },
    series: { type: "string" },
    transform: { type: "array", maxItems: 8, items: { type: "object", required: ["op"], properties: {
      op: { type: "string", enum: OPS }, field: { type: "string" }, by: { type: "array", items: { type: "string" } },
      agg: { type: "string", enum: AGGS }, as: { type: "string" }, order: { type: "string", enum: ["asc", "desc"] },
      eq: {}, in: { type: "array" }, gte: {}, lte: {}, step: { type: "number" }, n: { type: "integer" } } } },
  },
};

export function systemPrompt(dataset, info) {
  return `You turn a question about a table into a chart spec. Answer with ONE JSON object and nothing else.
Table "${dataset}" (${info.rows} rows). Columns: ${info.columns.map((c) => `${c.name} (${c.type})`).join(", ")}.
Values: ${JSON.stringify(info.aggregates)}
Sample rows: ${JSON.stringify(info.sample)}

Spec: {"title": text, "mark": ${MARKS.map((m) => `"${m}"`).join(" | ")}, "transform": [steps, applied in order, at most 8],
       "x": field, "y": number field, "series": optional field (one line/bar colour per value)}
Steps:
  {"op": "filter", "field": f, "eq": v} or "in": [v, ...] or "gte": v and/or "lte": v
  {"op": "group", "by": [up to 2 fields], "agg": ${AGGS.map((a) => `"${a}"`).join(" | ")}, "field": number field (not for count), "as": "value"}
     after a group, only the "by" fields and "as" remain
  {"op": "sort", "field": f, "order": "asc" | "desc"}
  {"op": "bin", "field": number field, "step": n, "as": name}
  {"op": "limit", "n": 1..500}
Use "month" for time on x and sort it asc. Use "series" with group by [x, series] to compare. Pie only for shares of a whole.
Example: {"title": "Revenue by region", "mark": "bar", "transform": [{"op": "group", "by": ["region"], "agg": "sum", "field": "amount", "as": "value"}, {"op": "sort", "field": "value", "order": "desc"}], "x": "region", "y": "value"}`;
}

// The first balanced {...} in a model's answer (models wrap JSON in prose or fences when they feel like it).
export function firstObject(text) {
  if (text && typeof text === "object") return text;
  const s = String(text ?? "");
  for (let i = s.indexOf("{"); i >= 0; i = s.indexOf("{", i + 1)) {
    let depth = 0, str = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (str) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') str = false; continue; }
      if (ch === '"') str = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try { return JSON.parse(s.slice(i, j + 1)); } catch { break; }
      }
    }
  }
  return null;
}

async function model(env, messages) {
  const input = { messages, max_tokens: 700, temperature: 0.1 };
  let out;
  try {
    out = await env.AI.run(env.AI_MODEL, { ...input, response_format: { type: "json_schema", json_schema: SPEC_SCHEMA } });
  } catch {
    out = await env.AI.run(env.AI_MODEL, input); // not every model takes response_format
  }
  return firstObject(out?.response ?? out?.choices?.[0]?.message?.content ?? "");
}

// Ask, check, and give the model one chance to fix what the validator found.
async function specFor(env, dataset, prompt, prior) {
  const info = describe(await rows(env), DATASETS[dataset].columns);
  const schema = { columns: info.columns };
  const messages = [{ role: "system", content: systemPrompt(dataset, info) }];
  if (prior && validateSpec(prior, schema).ok)
    messages.push({ role: "user", content: "Current chart spec (change it if the question builds on it): " + JSON.stringify(prior) });
  messages.push({ role: "user", content: prompt });
  let spec = await model(env, messages), v = validateSpec(spec, schema);
  if (!v.ok) {
    messages.push({ role: "assistant", content: JSON.stringify(spec) },
                  { role: "user", content: `That spec fails these checks: ${v.errors.join("; ")}. Answer with the corrected JSON object only.` });
    spec = await model(env, messages);
    v = validateSpec(spec, schema);
  }
  return v.ok ? { spec } : { error: "couldn't turn that into a valid chart: " + v.errors.slice(0, 3).join("; ") };
}

const newId = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);

async function api(req, env, url) {
  const path = url.pathname;
  if (path === "/api/health") return json({ ok: true, rev: env.REV || "", ai: !!env.AI });
  await setup(env);
  const dataset = url.searchParams.get("dataset") || "orders";
  if (req.method === "GET" && (path === "/api/schema" || path === "/api/data")) {
    if (!DATASETS[dataset]) return json({ error: "no such dataset" }, 404);
    const data = await rows(env);
    if (path === "/api/data") return json({ dataset, rows: data });
    const { columns, sample, aggregates } = describe(data, DATASETS[dataset].columns);
    return json({ dataset, title: DATASETS[dataset].title, schema: { columns }, sample, aggregates });
  }
  if (req.method === "POST" && (path === "/api/spec" || path === "/api/charts")) {
    let body;
    try { body = await req.json(); } catch { return json({ error: "send JSON" }, 400); }
    const ds = body?.dataset || "orders";
    if (!DATASETS[ds]) return json({ error: "no such dataset" }, 404);
    const prompt = String(body.prompt || "").trim().slice(0, MAX_PROMPT);
    if (path === "/api/spec") {
      if (!env.AI) return json({ error: "no AI here" }, 501);
      if (!prompt) return json({ error: "ask a question" }, 400);
      if (!(await spend(env, "ai", await who(req), 30, Number(env.AI_DAILY || 300)))) return json({ error: "over today's limit, try tomorrow" }, 429);
      const out = await specFor(env, ds, prompt, body.prior);
      return json(out, out.spec ? 200 : 422);
    }
    const v = validateSpec(body.spec, { columns: DATASETS[ds].columns });
    if (!v.ok) return json({ error: "that spec doesn't validate: " + v.errors.join("; ") }, 400);
    if (!(await spend(env, "save", await who(req), 50, Number(env.SAVE_DAILY || 1000)))) return json({ error: "over today's limit" }, 429);
    const id = newId(), title = String(body.spec.title || prompt || "Chart").slice(0, 120);
    await env.DB.prepare("INSERT INTO saved_charts (id, created, dataset, prompt, title, spec) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, new Date().toISOString(), ds, prompt, title, JSON.stringify(body.spec)).run();
    return json({ id, link: `${url.origin}/?c=${id}` }, 201);
  }
  if (req.method === "GET" && path === "/api/charts") {
    const list = (await env.DB.prepare("SELECT id, created, dataset, prompt, title FROM saved_charts ORDER BY created DESC LIMIT 20").all()).results;
    return json({ charts: list });
  }
  const one = path.match(/^\/api\/charts\/([a-z0-9]{4,16})$/);
  if (one && req.method === "GET") {
    const r = await env.DB.prepare("SELECT id, created, dataset, prompt, title, spec FROM saved_charts WHERE id = ?").bind(one[1]).first();
    return r ? json({ ...r, spec: JSON.parse(r.spec) }) : json({ error: "not found" }, 404);
  }
  return json({ error: "no such endpoint" }, 404);
}

export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AICharts</title>
<meta name="description" content="Ask for a chart in plain words. The model writes a small checked spec, never code, and never sees your rows.">
<style>
:root{--bg:#faf9f6;--fg:#1d1d1b;--mute:#6b6a65;--line:#e3e1da;--card:#fff;--accent:#2f6fdf}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe6;--mute:#9b9a94;--line:#2c2b28;--card:#1f1f1c;--accent:#7aa5ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:32px 16px 64px}h1{margin:0 0 4px;font-size:28px}p.lede{margin:0 0 20px;color:var(--mute)}
.aic-ask{display:flex;gap:8px}.aic-ask input{flex:1;min-width:0;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font:inherit}
button{padding:10px 14px;border:0;border-radius:8px;background:var(--accent);color:#fff;font:inherit;cursor:pointer}
.aic-msg{min-height:24px;margin:10px 0;color:var(--mute)}.aic-canvas{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.aic-save{margin-top:10px}.chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.chips button{background:var(--card);color:var(--fg);border:1px solid var(--line);padding:6px 10px;font-size:14px}
details{margin-top:16px}pre{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;font-size:13px}
h2{font-size:18px;margin:28px 0 8px}ul{padding-left:18px}a{color:var(--accent)}
</style></head><body><main>
<h1>AICharts</h1>
<p class="lede">Ask for a chart in plain words. The model writes a small spec that is checked before anything draws, and never sees the rows: only column names, five sample rows and value ranges. Data: a sample tea shop, 24 months of orders.</p>
<div class="chips" id="chips"></div>
<ai-chart dataset="orders"></ai-chart>
<details><summary>Spec</summary><pre id="spec">Ask something first.</pre></details>
<h2>Saved charts</h2><ul id="saved"><li>None yet.</li></ul>
<h2>Use it on your page</h2>
<pre>&lt;script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"&gt;&lt;/script&gt;
&lt;script type="module" src="__ORIGIN__/aicharts.js"&gt;&lt;/script&gt;
&lt;ai-chart endpoint="__ORIGIN__" dataset="orders"&gt;&lt;/ai-chart&gt;</pre>
</main>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script type="module">
import "/aicharts.js";
const el = document.querySelector("ai-chart"), list = document.getElementById("saved");
for (const q of ["Revenue by region", "Monthly revenue, web vs store", "Share of units by product", "Top 3 products in the West by revenue"]) {
  const b = document.createElement("button"); b.textContent = q; b.onclick = () => { el.querySelector("input").value = q; el.ask(q); };
  document.getElementById("chips").append(b);
}
el.addEventListener("spec", (e) => { document.getElementById("spec").textContent = JSON.stringify(e.detail.spec, null, 2); });
el.onSave = async (d) => {
  const r = await fetch("/api/charts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(d) });
  const out = await r.json(); if (!r.ok) throw new Error(out.error); history.replaceState(null, "", "?c=" + out.id); await refresh();
};
async function show(id) {
  const r = await fetch("/api/charts/" + id); if (!r.ok) return;
  const c = await r.json(); await el.render(c.spec, c.prompt); document.getElementById("spec").textContent = JSON.stringify(c.spec, null, 2);
  el.querySelector("input").value = c.prompt || "";
}
async function refresh() {
  const { charts } = await (await fetch("/api/charts")).json();
  list.replaceChildren(...(charts.length ? charts.map((c) => { const li = document.createElement("li"), a = document.createElement("a");
    a.href = "?c=" + c.id; a.textContent = c.title; a.onclick = (e) => { e.preventDefault(); history.replaceState(null, "", "?c=" + c.id); show(c.id); };
    li.append(a); return li; }) : [Object.assign(document.createElement("li"), { textContent: "None yet." })]));
}
const id = new URLSearchParams(location.search).get("c");
customElements.whenDefined("ai-chart").then(() => { refresh(); if (id) show(id); });
</script></body></html>`;

export function make(librarySource) {
  return {
    async fetch(req, env) {
      const url = new URL(req.url);
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      try {
        if (url.pathname.startsWith("/api/")) return await api(req, env, url);
      } catch (e) {
        return json({ error: "something broke: " + String(e.message || e).slice(0, 160) }, 500);
      }
      if (url.pathname === "/aicharts.js")
        return new Response(librarySource, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300", ...CORS } });
      if (url.pathname === "/" || url.pathname === "/index.html")
        return new Response(PAGE.replaceAll("__ORIGIN__", url.origin), { headers: { "content-type": "text/html; charset=utf-8" } });
      return new Response("not found", { status: 404 });
    },
  };
}
