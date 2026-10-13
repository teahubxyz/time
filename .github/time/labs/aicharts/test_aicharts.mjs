// Offline test for the AICharts library and demo Worker: a real SQLite behind a D1-shaped shim, and a fake Workers AI.
// Run: node .github/time/labs/aicharts/test_aicharts.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const lib = await import(join(here, "aicharts.js"));
const W = await import(join(here, "worker.js"));
const src = readFileSync(join(here, "aicharts.js"), "utf8");

// ---------- library ----------
const schema = { columns: [{ name: "month", type: "month" }, { name: "region", type: "string" }, { name: "amount", type: "number" }] };
const rows = [
  { month: "2026-01", region: "West", amount: 10 }, { month: "2026-01", region: "East", amount: 5 },
  { month: "2026-02", region: "West", amount: 7 }, { month: "2026-02", region: "East", amount: 9 },
];
const bySum = { mark: "bar", x: "region", y: "value",
  transform: [{ op: "group", by: ["region"], agg: "sum", field: "amount", as: "value" }, { op: "sort", field: "value", order: "desc" }] };
assert.ok(lib.validateSpec(bySum, schema).ok);
assert.deepEqual(lib.applySpec(rows, bySum), [{ region: "West", value: 17 }, { region: "East", value: 14 }]);

const bad = lib.validateSpec({ mark: "radar", x: "month", y: "amount",
  transform: [{ op: "group", by: ["region"], agg: "sum", field: "amount" }, { op: "eval", code: "alert(1)" }] }, schema);
assert.equal(bad.ok, false);
assert.ok(bad.errors.some((e) => e.includes("mark")));
assert.ok(bad.errors.some((e) => e.includes("step 2")));
assert.ok(bad.errors.some((e) => e.startsWith("x must be a field the transform leaves")), "month is gone after the group");
assert.equal(lib.validateSpec({ mark: "bar", x: "region", y: "region" }, schema).ok, false, "y must be a number");
assert.equal(lib.validateSpec({ mark: "bar", x: "region", y: "amount", transform: Array(9).fill({ op: "limit", n: 1 }) }, schema).ok, false);
assert.equal(lib.validateSpec("[1]", schema).ok, false);

const lines = { mark: "line", x: "month", y: "value", series: "region",
  transform: [{ op: "group", by: ["month", "region"], agg: "sum", field: "amount", as: "value" }, { op: "sort", field: "month" }] };
const cfg = lib.chartConfig(lib.applySpec(rows, lines), lines);
assert.deepEqual(cfg.data.labels, ["2026-01", "2026-02"]);
assert.deepEqual(cfg.data.datasets.map((d) => [d.label, d.data]), [["West", [10, 7]], ["East", [5, 9]]]);
const pie = lib.chartConfig(lib.applySpec(rows, { ...bySum, mark: "pie" }), { ...bySum, mark: "pie" });
assert.equal(pie.data.datasets[0].backgroundColor.length, 2);
const binned = lib.applySpec(rows, { transform: [{ op: "bin", field: "amount", step: 5 }, { op: "filter", field: "amount_bin", gte: 5, lte: 5 }] });
assert.deepEqual(binned.map((r) => r.amount), [5, 7, 9]);

// attach() drives an existing chart and keeps the rows in the browser
const sent = [];
globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return Response.json({ spec: bySum }); };
const chart = { config: { type: "line", data: {}, options: { responsive: true } }, updates: 0, update() { this.updates++; } };
await lib.attach(chart, { data: rows, schema, endpoint: "https://x.example/", dataset: "orders" }).ask("sales by region");
assert.equal(sent[0].url, "https://x.example/api/spec");
assert.deepEqual(Object.keys(sent[0].body).sort(), ["dataset", "prompt"], "no rows go to the server");
assert.equal(chart.config.type, "bar");
assert.equal(chart.config.options.responsive, true);
assert.equal(chart.updates, 1);
await lib.attach(chart, { data: rows, schema, endpoint: "https://x.example", dataset: "orders" }).ask("now as a pie");
const a = lib.attach(chart, { data: rows, schema, endpoint: "https://x.example", dataset: "orders" });
await a.ask("one"); await a.ask("two");
assert.deepEqual(sent.at(-1).body.prior, bySum, "follow-ups carry the last chart");

// ---------- worker ----------
assert.deepEqual(W.firstObject('Sure!\n```json\n{"a": {"b": "}"}}\n```'), { a: { b: "}" } });
assert.deepEqual(W.firstObject('Sure! {"mark": "bar", "x": "a"} trailing {'), { mark: "bar", x: "a" });
assert.equal(W.firstObject("no json"), null);

class D1 {
  constructor() { this.db = new DatabaseSync(":memory:"); this.writes = []; }
  prepare(sql) {
    const db = this;
    const make = (args) => ({
      bind: (...a) => make(a),
      async all() { db.log(sql); return { results: db.db.prepare(sql).all(...args) }; },
      async first() { db.log(sql); return db.db.prepare(sql).get(...args) ?? null; },
      async run() { db.log(sql); const s = db.db.prepare(sql); return /RETURNING|^\s*SELECT/i.test(sql) ? { results: s.all(...args) } : (s.run(...args), { results: [] }); },
    });
    return make([]);
  }
  log(sql) { if (/^\s*(INSERT|UPDATE|DELETE|CREATE)/i.test(sql)) this.writes.push(sql.split("(")[0].trim()); }
  async batch(stmts) { return Promise.all(stmts.map((s) => s.run())); }
}

const answers = [];
const calls = [];
const env = { DB: new D1(), REV: "r1", AI_MODEL: "@cf/test/m", AI_DAILY: "5", SAVE_DAILY: "100",
  AI: { async run(model, input) { calls.push(input); const a = answers.shift(); if (a instanceof Error) throw a; return a; } } };
const worker = W.make(src);
const call = (path, init = {}, ip = "1.1.1.1") =>
  worker.fetch(new Request("https://aicharts.t.workers.dev" + path, { ...init, headers: { "cf-connecting-ip": ip, ...(init.headers || {}) } }), env);
const post = (path, body, ip) => call(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }, ip);

let r = await call("/");
let html = await r.text();
assert.ok(html.includes("<ai-chart") && html.includes("https://aicharts.t.workers.dev/aicharts.js"));
r = await call("/aicharts.js");
assert.equal(await r.text(), src);
assert.equal(r.headers.get("access-control-allow-origin"), "*");

// the schema: what the model sees. Seeded once, deterministic.
r = await call("/api/schema?dataset=orders");
const sch = await r.json();
assert.equal(sch.sample.length, 5);
assert.deepEqual(sch.aggregates.region.values, ["East", "North", "South", "West"]);
assert.equal(sch.schema.columns.find((c) => c.name === "amount").type, "number");
const data = (await (await call("/api/data?dataset=orders")).json()).rows;
assert.equal(data.length, 24 * 4 * 5);
assert.deepEqual(data, W.seedOrders());
assert.equal((await call("/api/schema?dataset=users")).status, 404);
const seeded = env.DB.writes.filter((w) => w.startsWith("INSERT OR IGNORE INTO orders")).length;
await call("/api/data");
assert.equal(env.DB.writes.filter((w) => w.startsWith("INSERT OR IGNORE INTO orders")).length, seeded, "seeding happens once");

// a spec: structured output first; the system prompt carries schema + sample, never all rows
const good = { title: "Revenue by region", mark: "bar", x: "region", y: "value",
  transform: [{ op: "group", by: ["region"], agg: "sum", field: "amount", as: "value" }] };
answers.push({ response: good });
r = await post("/api/spec", { dataset: "orders", prompt: "revenue by region" });
assert.equal(r.status, 200);
assert.deepEqual((await r.json()).spec, good);
assert.ok(calls[0].response_format, "asks for structured output");
const sys = calls[0].messages[0].content;
assert.ok(sys.includes("region (string)") && sys.includes('"North"'));
assert.ok(sys.length < 4000 && !sys.includes(`"id":${data.length}`), "the prompt has a sample, not the table");

// a model without response_format, prose around the JSON, a bad first answer, then the fix
answers.push(new Error("response_format unsupported"), { response: 'Here: {"mark": "bar", "x": "month", "y": "amount", "transform": [{"op": "group", "by": ["region"], "agg": "sum", "field": "amount"}]}' },
             { choices: [{ message: { content: JSON.stringify({ ...good, mark: "line", x: "region" }) } }] });
calls.length = 0;
r = await post("/api/spec", { dataset: "orders", prompt: "trend", prior: good });
assert.equal(r.status, 200);
assert.equal((await r.json()).spec.mark, "line");
assert.ok(calls[1].messages.some((m) => m.content.includes("Current chart spec")), "the prior chart is context");
assert.ok(calls.at(-1).messages.at(-1).content.includes("fails these checks"), "one repair round with the errors");

// two bad answers: a 422 with the reasons, nothing drawn
answers.push({ response: "{}" }, { response: '{"mark": "pie"}' });
r = await post("/api/spec", { dataset: "orders", prompt: "nonsense" });
assert.equal(r.status, 422);
assert.match((await r.json()).error, /valid chart/);

// limits: AI_DAILY=5 overall; we've used 3
answers.push({ response: good }, { response: good });
assert.equal((await post("/api/spec", { prompt: "a" }, "2.2.2.2")).status, 200);
assert.equal((await post("/api/spec", { prompt: "b" }, "2.2.2.2")).status, 200);
assert.equal((await post("/api/spec", { prompt: "c" }, "3.3.3.3")).status, 429);
assert.equal((await post("/api/spec", { prompt: "" })).status, 400);

// save, list, load; only valid specs are stored
r = await post("/api/charts", { dataset: "orders", prompt: "revenue by region", spec: good });
assert.equal(r.status, 201);
const { id, link } = await r.json();
assert.equal(link, `https://aicharts.t.workers.dev/?c=${id}`);
assert.equal((await post("/api/charts", { dataset: "orders", spec: { mark: "bar", x: "nope", y: "amount" } })).status, 400);
const list = (await (await call("/api/charts")).json()).charts;
assert.deepEqual(list.map((c) => [c.id, c.title]), [[id, "Revenue by region"]]);
const back = await (await call("/api/charts/" + id)).json();
assert.deepEqual(back.spec, good);
assert.equal((await call("/api/charts/zzzzzz")).status, 404);

// read-only: the only tables written after seeding are quota and saved_charts
const after = env.DB.writes.slice(env.DB.writes.lastIndexOf("INSERT OR IGNORE INTO orders") + 1);
assert.ok(after.every((w) => /^(CREATE TABLE IF NOT EXISTS|INSERT INTO quota|INSERT INTO saved_charts)/.test(w)), after.join(", "));

// the saved spec renders with the library against the real rows
const out = lib.applySpec(data, back.spec);
assert.deepEqual(out.map((x) => x.region).sort(), ["East", "North", "South", "West"]);
assert.equal(Math.round(out.reduce((a, x) => a + x.value, 0)), Math.round(data.reduce((a, x) => a + x.amount, 0)));

console.log("aicharts: all good");
