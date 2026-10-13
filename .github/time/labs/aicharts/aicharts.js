// AICharts: natural-language charts for the Chart.js you already have, without sending your rows to a model.
//
// The model sees a dataset's schema, a few sample rows and aggregates, never the data itself. It answers with a small
// JSON chart spec. The spec is validated, then a fixed set of operations (filter, group, sort, bin, limit) computes the
// chart's data in the browser. No model-written code runs anywhere.
//
//   attach(chart, { data, schema, endpoint })      -> { ask(prompt) }  drive an existing Chart.js chart
//   <ai-chart endpoint="..." dataset="...">          a framework-free element: prompt box, chart, save
//   validateSpec(spec, schema) -> { ok, errors, fields }
//   applySpec(rows, spec) -> rows                    the fixed operations
//   chartConfig(rows, spec) -> a Chart.js config
//
// A spec:
//   { "title": "...", "mark": "bar" | "line" | "pie" | "doughnut" | "scatter",
//     "transform": [ { "op": "filter", "field": "region", "in": ["West", "East"] },
//                    { "op": "group", "by": ["month"], "agg": "sum", "field": "amount", "as": "value" },
//                    { "op": "sort", "field": "month", "order": "asc" }, { "op": "limit", "n": 12 } ],
//     "x": "month", "y": "value", "series": "region" (optional) }

export const MARKS = ["bar", "line", "pie", "doughnut", "scatter"];
export const AGGS = ["sum", "avg", "count", "min", "max"];
export const OPS = ["filter", "group", "sort", "bin", "limit"];
const MAX_STEPS = 8;
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

// schema: { columns: [{ name, type: "string" | "number" | "month" | "date" }] }
export function validateSpec(spec, schema) {
  const errors = [];
  const err = (m) => { errors.push(m); return { ok: false, errors }; };
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return err("the spec must be a JSON object");
  if (!MARKS.includes(spec.mark)) err(`mark must be one of ${MARKS.join(", ")}`);
  const types = new Map((schema?.columns || []).map((c) => [c.name, c.type]));
  const steps = spec.transform ?? [];
  if (!Array.isArray(steps)) return err("transform must be a list of steps");
  if (steps.length > MAX_STEPS) err(`at most ${MAX_STEPS} transform steps`);
  const has = (f) => types.has(f);
  steps.forEach((s, i) => {
    const at = `step ${i + 1}`;
    if (!s || typeof s !== "object" || !OPS.includes(s.op)) { err(`${at}: op must be one of ${OPS.join(", ")}`); return; }
    if (s.op === "filter") {
      if (!has(s.field)) { err(`${at}: unknown field ${JSON.stringify(s.field)}`); return; }
      const keys = ["eq", "in", "gte", "lte"].filter((k) => k in s);
      if (!keys.length) err(`${at}: a filter needs eq, in, gte or lte`);
      if ("in" in s && (!Array.isArray(s.in) || s.in.length > 50)) err(`${at}: in must be a list of at most 50 values`);
    } else if (s.op === "group") {
      const by = s.by ?? [];
      if (!Array.isArray(by) || by.length > 2 || !by.every(has)) { err(`${at}: by must list up to 2 known fields`); return; }
      if (!AGGS.includes(s.agg)) { err(`${at}: agg must be one of ${AGGS.join(", ")}`); return; }
      if (s.agg !== "count" && types.get(s.field) !== "number") { err(`${at}: ${s.agg} needs a number field`); return; }
      const as = s.as ?? "value";
      if (!NAME.test(as)) { err(`${at}: bad output name ${JSON.stringify(as)}`); return; }
      const next = new Map(by.map((f) => [f, types.get(f)]));
      next.set(as, "number");
      types.clear();
      next.forEach((t, f) => types.set(f, t));
    } else if (s.op === "sort") {
      if (!has(s.field)) err(`${at}: unknown field ${JSON.stringify(s.field)}`);
      if (s.order && !["asc", "desc"].includes(s.order)) err(`${at}: order must be asc or desc`);
    } else if (s.op === "bin") {
      if (types.get(s.field) !== "number") { err(`${at}: bin needs a number field`); return; }
      if (!(Number(s.step) > 0)) err(`${at}: step must be a positive number`);
      const as = s.as ?? `${s.field}_bin`;
      if (!NAME.test(as)) { err(`${at}: bad output name`); return; }
      types.set(as, "number");
    } else if (s.op === "limit") {
      if (!Number.isInteger(s.n) || s.n < 1 || s.n > 500) err(`${at}: n must be a whole number from 1 to 500`);
    }
  });
  for (const k of ["x", "y"]) if (!has(spec[k])) err(`${k} must be a field the transform leaves (got ${JSON.stringify(spec[k])})`);
  if (has(spec.y) && types.get(spec.y) !== "number") err("y must be a number field");
  if (spec.series != null && !has(spec.series)) err(`series must be a field the transform leaves`);
  if (spec.mark === "scatter" && types.get(spec.x) !== "number") err("a scatter needs a number on x");
  if (spec.title != null && typeof spec.title !== "string") err("title must be text");
  return { ok: errors.length === 0, errors, fields: Object.fromEntries(types) };
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function applySpec(rows, spec) {
  let out = rows.map((r) => ({ ...r }));
  for (const s of spec.transform ?? []) {
    if (s.op === "filter") {
      out = out.filter((r) => {
        const v = r[s.field];
        if ("eq" in s && v != s.eq) return false; // loose on purpose: "2026" matches 2026
        if ("in" in s && !s.in.some((x) => x == v)) return false;
        if ("gte" in s && !(v >= s.gte)) return false;
        if ("lte" in s && !(v <= s.lte)) return false;
        return true;
      });
    } else if (s.op === "group") {
      const by = s.by ?? [], as = s.as ?? "value", groups = new Map();
      for (const r of out) {
        const key = JSON.stringify(by.map((f) => r[f]));
        if (!groups.has(key)) groups.set(key, { row: Object.fromEntries(by.map((f) => [f, r[f]])), vals: [] });
        groups.get(key).vals.push(s.agg === "count" ? 1 : Number(r[s.field]));
      }
      out = [...groups.values()].map(({ row, vals }) => {
        const sum = vals.reduce((a, b) => a + b, 0);
        const v = { sum, count: vals.length, avg: sum / (vals.length || 1), min: Math.min(...vals), max: Math.max(...vals) }[s.agg];
        return { ...row, [as]: Math.round(v * 100) / 100 };
      });
    } else if (s.op === "sort") {
      const dir = s.order === "desc" ? -1 : 1;
      out = [...out].sort((a, b) => dir * cmp(a[s.field], b[s.field]));
    } else if (s.op === "bin") {
      const as = s.as ?? `${s.field}_bin`, step = Number(s.step);
      out = out.map((r) => ({ ...r, [as]: Math.floor(Number(r[s.field]) / step) * step }));
    } else if (s.op === "limit") {
      out = out.slice(0, s.n);
    }
  }
  return out;
}

const PALETTE = ["#2f6fdf", "#e0752d", "#2f9e6e", "#c2417a", "#7a5bd6", "#9a8a2a", "#3aa0b8", "#b8573a"];

export function chartConfig(rows, spec) {
  const title = spec.title ? { display: true, text: spec.title } : { display: false };
  if (spec.mark === "scatter") {
    return { type: "scatter", data: { datasets: [{ label: spec.y, data: rows.map((r) => ({ x: Number(r[spec.x]), y: Number(r[spec.y]) })),
      backgroundColor: PALETTE[0] }] }, options: { plugins: { title }, animation: false } };
  }
  const labels = [...new Set(rows.map((r) => r[spec.x]))];
  let datasets;
  if (spec.series && !["pie", "doughnut"].includes(spec.mark)) {
    const names = [...new Set(rows.map((r) => r[spec.series]))];
    datasets = names.map((name, i) => ({
      label: String(name),
      data: labels.map((l) => rows.find((r) => r[spec.x] === l && r[spec.series] === name)?.[spec.y] ?? null),
      backgroundColor: PALETTE[i % PALETTE.length], borderColor: PALETTE[i % PALETTE.length],
    }));
  } else {
    const round = ["pie", "doughnut"].includes(spec.mark);
    datasets = [{ label: spec.y, data: labels.map((l) => rows.find((r) => r[spec.x] === l)?.[spec.y] ?? null),
      backgroundColor: round ? labels.map((_, i) => PALETTE[i % PALETTE.length]) : PALETTE[0], borderColor: PALETTE[0] }];
  }
  return { type: spec.mark, data: { labels: labels.map(String), datasets },
    options: { plugins: { title, legend: { display: datasets.length > 1 || ["pie", "doughnut"].includes(spec.mark) } }, animation: false } };
}

async function fetchSpec(endpoint, body) {
  const r = await fetch(endpoint.replace(/\/$/, "") + "/api/spec", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || `the chart service answered ${r.status}`);
  return out.spec;
}

// Drive an existing Chart.js chart. `data` stays in the browser; only `schema` (plus a sample and aggregates the server
// computes for its own datasets) shapes the prompt.
export function attach(chart, { data, schema, endpoint, dataset }) {
  let last;
  return {
    async ask(prompt, prior = last) {
      const spec = await fetchSpec(endpoint, { dataset, prompt, prior });
      const v = validateSpec(spec, schema);
      if (!v.ok) throw new Error("the spec failed validation: " + v.errors.join("; "));
      const cfg = chartConfig(applySpec(data, spec), spec);
      chart.config.type = cfg.type;
      chart.config.data = cfg.data;
      chart.config.options = { ...chart.config.options, ...cfg.options };
      chart.update();
      last = spec;
      return spec;
    },
  };
}

const Base = globalThis.HTMLElement ?? class {};

// <ai-chart endpoint="https://..." dataset="orders"></ai-chart>
// Needs Chart.js on the page (window.Chart). Fires "spec" after each answer and "save" when Save is pressed; set
// element.onSave = async ({ spec, prompt, dataset }) => ... to store charts yourself (the demo stores them in D1).
export class AiChart extends Base {
  connectedCallback() {
    if (this._ready) return;
    this._ready = true;
    this.innerHTML = `<form class="aic-ask"><input name="q" placeholder="Ask for a chart, e.g. sales by region" aria-label="Chart question"
      autocomplete="off"><button>Chart it</button></form><div class="aic-msg" role="status"></div>
      <div class="aic-canvas"><canvas></canvas></div><button class="aic-save" hidden>Save chart</button>`;
    this._msg = this.querySelector(".aic-msg");
    this.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); this.ask(e.target.q.value); });
    this.querySelector(".aic-save").addEventListener("click", () => this.save());
  }

  get endpoint() { return this.getAttribute("endpoint") || location.origin; }
  get dataset() { return this.getAttribute("dataset") || "orders"; }

  async load() {
    if (this._data) return;
    const base = this.endpoint.replace(/\/$/, "");
    const [schema, data] = await Promise.all([fetch(`${base}/api/schema?dataset=${this.dataset}`).then((r) => r.json()),
      fetch(`${base}/api/data?dataset=${this.dataset}`).then((r) => r.json())]);
    this._schema = schema.schema;
    this._data = data.rows;
  }

  async ask(prompt) {
    if (!prompt?.trim()) return;
    this._msg.textContent = "Thinking…";
    try {
      await this.load();
      const spec = await fetchSpec(this.endpoint, { dataset: this.dataset, prompt, prior: this._spec });
      this.render(spec, prompt);
      this.dispatchEvent(new CustomEvent("spec", { detail: { spec, prompt } }));
    } catch (e) {
      this._msg.textContent = String(e.message || e);
    }
  }

  async render(spec, prompt) {
    await this.load();
    const v = validateSpec(spec, this._schema);
    if (!v.ok) throw new Error("That chart didn't pass the checks: " + v.errors.join("; "));
    const cfg = chartConfig(applySpec(this._data, spec), spec);
    this._chart?.destroy();
    this._chart = new globalThis.Chart(this.querySelector("canvas"), cfg);
    this._spec = spec;
    this._prompt = prompt;
    this._msg.textContent = spec.title || "";
    this.querySelector(".aic-save").hidden = false;
  }

  async save() {
    const detail = { spec: this._spec, prompt: this._prompt, dataset: this.dataset };
    this.dispatchEvent(new CustomEvent("save", { detail }));
    if (this.onSave) {
      try { await this.onSave(detail); this._msg.textContent = "Saved."; } catch (e) { this._msg.textContent = String(e.message || e); }
    }
  }
}

if (globalThis.customElements && !customElements.get("ai-chart")) customElements.define("ai-chart", AiChart);
