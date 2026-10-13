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
assert.deepEqual(W.normalizeSpec({ mark: "Bar", x: "region", y: "value",
  transform: [{ type: "groupBy", groupBy: "region", aggregate: "SUM", field: "amount", as: "value" }, { op: "sort", field: "value", order: "DESC" }] }),
  { mark: "bar", x: "region", y: "value", transform: [{ op: "group", by: ["region"], agg: "sum", field: "amount", as: "value" }, { op: "sort", field: "value", order: "desc" }] });
assert.equal(W.normalizeSpec({ mark: "bar", transform: [{ op: "group", agg: "mean" }] }).transform[0].agg, "avg");

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
  AI: { async run(model, input) {
    if (input.questions) { decisions.push({ model, input }); const d = decided.shift(); if (d instanceof Error) throw d; return d; }
    calls.push(input); const a = answers.shift(); if (a instanceof Error) throw a; return a; } } };
const decisions = [], decided = [];
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

// a spec: plain prompt; the system prompt carries schema + sample, never all rows
const good = { title: "Revenue by region", mark: "bar", x: "region", y: "value",
  transform: [{ op: "group", by: ["region"], agg: "sum", field: "amount", as: "value" }] };
answers.push({ response: good });
r = await post("/api/spec", { dataset: "orders", prompt: "revenue by region" });
assert.equal(r.status, 200);
assert.deepEqual((await r.json()).spec, good);
assert.equal(calls.length, 1);
assert.equal(calls[0].response_format, undefined, "plain prompt first");
const sys = calls[0].messages[0].content;
assert.ok(sys.includes("region (string)") && sys.includes('"North"'));
assert.ok(sys.length < 4000 && !sys.includes(`"id":${data.length}`), "the prompt has a sample, not the table");

// no JSON at all -> JSON mode; prose around JSON is fine; a bad answer gets one repair round with the errors
answers.push({ response: "I think a line chart would be nice." },
             { response: '{"mark": "bar", "x": "month", "y": "amount", "transform": [{"op": "group", "by": ["region"], "agg": "sum", "field": "amount"}]}' },
             { choices: [{ message: { content: "Fixed: " + JSON.stringify({ ...good, mark: "line", x: "region" }) } }] });
calls.length = 0;
r = await post("/api/spec", { dataset: "orders", prompt: "trend", prior: good });
assert.equal(r.status, 200);
assert.equal((await r.json()).spec.mark, "line");
assert.deepEqual(calls.map((c) => c.response_format?.type ?? null), [null, "json_object", null]);
assert.ok(calls[0].messages.some((m) => m.content.includes("Current chart spec")), "the prior chart is context");
assert.ok(calls.at(-1).messages.at(-1).content.includes("fails these checks"), "one repair round with the errors");

// two bad answers: a 422 with the reasons, nothing drawn
answers.push({ response: "{}" }, { response: '{"mark": "pie"}' });
r = await post("/api/spec", { dataset: "orders", prompt: "nonsense" });
assert.equal(r.status, 422);
const failed = await r.json();
assert.match(failed.error, /valid chart/);
assert.equal(failed.model_said, '{"mark": "pie"}', "the model's answer is shown on failure");

// limits: AI_DAILY=5 overall; we've used 3
answers.push({ response: good }, { response: good });
assert.equal((await post("/api/spec", { prompt: "a" }, "2.2.2.2")).status, 200);
assert.equal((await post("/api/spec", { prompt: "b" }, "2.2.2.2")).status, 200);
assert.equal((await post("/api/spec", { prompt: "c" }, "3.3.3.3")).status, 429);
assert.equal((await post("/api/spec", { prompt: "" })).status, 400);

// ---------- decision brains (Jev / Clef): choice answers -> spec, LLM only as the door ----------
const D = await import(join(here, "decide.js"));
const ans = (choice, confidence = 0.9, probabilities) => ({ type: "choice", choice, confidence, probabilities: probabilities || { [choice]: confidence } });
const westTop3 = { mark: ans("bar", 0.8, { bar: 0.8, pie: 0.17, line: 0.03 }), x: ans("product"), measure: ans("amount"), agg: ans("sum"), series: ans("none"),
  order: ans("value_desc"), top: ans("3"), "only.region": ans("West", 0.95), "only.product": ans("any"), "only.channel": ans("any") };
const infoNow = W.describe(data, sch.schema.columns);
const qs = D.questions(infoNow);
assert.deepEqual(Object.keys(qs).sort(), ["agg", "mark", "measure", "only.channel", "only.product", "only.region", "order", "series", "top", "x"]);
assert.ok(!("id" in qs.x.criteria), "id is never an axis");
assert.ok("rows" in qs.measure.criteria && "amount" in qs.measure.criteria && !("region" in qs.measure.criteria));
assert.deepEqual(Object.keys(qs["only.region"].criteria).sort(), ["East", "North", "South", "West", "any"]);
const asm = D.assemble(westTop3, infoNow);
assert.deepEqual(asm.spec.transform, [{ op: "filter", field: "region", eq: "West" },
  { op: "group", by: ["product"], agg: "sum", field: "amount", as: "value" }, { op: "sort", field: "value", order: "desc" }, { op: "limit", n: 3 }]);
assert.equal(asm.spec.title, "Total amount by product (West)");
assert.ok(lib.validateSpec(asm.spec, sch.schema).ok);
assert.equal(lib.applySpec(data, asm.spec).length, 3);
assert.deepEqual(asm.alternatives, [{ mark: "pie", p: 0.17 }]);
assert.equal(asm.weakest, 0.8);
// time on x sorts by time; a series only when asked; count needs no field
const monthly = D.assemble({ ...westTop3, mark: ans("line"), x: ans("month"), measure: ans("rows"), agg: ans("avg", 0.1), series: ans("channel"),
  order: ans("natural"), top: ans("all"), "only.region": ans("any") }, infoNow);
assert.deepEqual(monthly.spec.transform, [{ op: "group", by: ["month", "channel"], agg: "count", as: "value" }, { op: "sort", field: "month", order: "asc" }]);
assert.equal(monthly.spec.series, "channel");
assert.equal(monthly.weakest, 0.9, "agg doesn't gate when counting rows");
assert.ok(lib.validateSpec(monthly.spec, sch.schema).ok);
assert.equal(D.assemble({ ...westTop3, mark: ans("pie"), series: ans("channel") }, infoNow).spec.series, undefined, "no series on a pie");

// through the worker: a confident Jev answer is the spec, no LLM call
const resetQuota = () => env.DB.db.exec("DELETE FROM quota");
resetQuota(); calls.length = 0;
decided.push({ model: "jev-1", answers: westTop3, usage: {} });
r = await post("/api/spec", { dataset: "orders", prompt: "top 3 products in the West by revenue", brain: "jev" });
let body = await r.json();
assert.equal(r.status, 200, JSON.stringify(body));
assert.equal(body.brain, "jev");
assert.equal(decisions.at(-1).model, "typesafe/jev");
assert.equal(decisions.at(-1).input.state.user_request, "top 3 products in the West by revenue");
const toJev = JSON.stringify(decisions.at(-1).input), mid = data[200];
assert.ok(!toJev.includes(mid.date) && !toJev.includes(String(mid.amount)) && !("sample" in decisions.at(-1).input.state),
          "rows never reach the decision model");
assert.equal(calls.length, 0);
assert.deepEqual(body.spec, asm.spec);
// Clef names its variant in the input
decided.push({ answers: westTop3 });
await post("/api/spec", { dataset: "orders", prompt: "x", brain: "clef" });
assert.equal(decisions.at(-1).model, "@cf/cloudflare/clef-flash");
assert.equal(decisions.at(-1).input.model, "clef-flash");
// unsure -> the door: the LLM answers, and the response says why
decided.push({ answers: { ...westTop3, x: ans("product", 0.31) } });
answers.push({ response: good });
body = await (await post("/api/spec", { dataset: "orders", prompt: "hmm", brain: "jev" })).json();
assert.equal(body.brain, "llm");
assert.match(body.handoff.reason, /low confidence \(0.31\)/);
assert.deepEqual(body.spec, good);
// decision model down -> the door too
decided.push(new Error("no such model"));
answers.push({ response: good });
body = await (await post("/api/spec", { dataset: "orders", prompt: "hmm", brain: "jev" })).json();
assert.match(body.handoff.reason, /decision model error: no such model/);
// the server default brain, and an unknown brain falls back to it
env.BRAIN = "jev"; decided.push({ answers: westTop3 });
assert.equal((await (await post("/api/spec", { prompt: "q", brain: "gpt" })).json()).brain, "jev");
delete env.BRAIN; resetQuota();

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
