// A decision-model brain for AICharts: Jev (TypeSafe) or Clef (Cloudflare) answers a handful of choice questions in
// one pass, and this module assembles the chart spec from the answers. The model never writes JSON, so a spec can't
// be malformed; the validator still checks it, and weak confidence hands the question to the LLM path.
//
//   questions(info)                 -> System One questions for one dataset (info = describe(rows, columns))
//   assemble(answers, info)         -> { spec, confidence, weakest, alternatives }
//   decide(env, model, info, prompt, prior) -> the above plus { model, ms }   (throws if the model call fails)

const MARK_MENU = {
  bar: "Comparing amounts across categories or a handful of periods.",
  line: "A value over time (months, dates) or another ordered sequence; the trend matters.",
  pie: "Shares of one whole across a few categories (6 or fewer).",
  doughnut: "Shares of one whole, shown as a ring; same use as a pie.",
  scatter: "Two numeric measures plotted against each other across many points.",
};
const AGG_MENU = {
  sum: "The total (revenue, units sold): add the values up.",
  avg: "The typical or average value per order.",
  count: "How many orders or rows, regardless of their values.",
  min: "The smallest value.",
  max: "The largest value.",
};
const ORDER_MENU = {
  natural: "No particular order asked for (time stays in time order).",
  value_desc: "Biggest first: top, best, most, highest, ranking.",
  value_asc: "Smallest first: bottom, worst, least, lowest.",
};
const TOP_MENU = { all: "Show every group.", 3: "Only the top or bottom 3.", 5: "Only the top or bottom 5.", 10: "Only the top or bottom 10." };

function shuffled(menu) {
  const e = Object.entries(menu);
  for (let i = e.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [e[i], e[j]] = [e[j], e[i]]; }
  return Object.fromEntries(e);
}
const choice = (instructions, menu) => ({ type: "choice", instructions, criteria: shuffled(menu) });

const describeCol = (c, agg) => {
  const a = agg[c.name] || {};
  if (a.values) return `${c.type} column; values: ${a.values.join(", ")}`;
  if ("min" in a) return `${c.type} column from ${a.min} to ${a.max}`;
  return `${c.type} column`;
};

export function questions(info) {
  const cols = info.columns.filter((c) => c.name !== "id");
  const text = cols.filter((c) => c.type === "string");
  const nums = cols.filter((c) => c.type === "number");
  const axis = Object.fromEntries(cols.map((c) => [c.name, describeCol(c, info.aggregates)]));
  const measure = { ...Object.fromEntries(nums.map((c) => [c.name, describeCol(c, info.aggregates)])), rows: "The number of orders (no column)." };
  const q = {
    mark: choice("Which chart type answers the request best?", MARK_MENU),
    x: choice("Which column goes on the x axis (the categories or time the chart is broken down by)?", axis),
    measure: choice("Which quantity does the chart measure?", measure),
    agg: choice("How should that quantity be combined within each group?", AGG_MENU),
    series: choice("Should the chart split into one coloured series per value of another column? Pick none unless the request compares groups against each other (\"web vs store\", \"by region over time\").",
      { none: "One series only.", ...Object.fromEntries(text.map((c) => [c.name, `one series per ${c.name}`])) }),
    order: choice("How should the groups be ordered?", ORDER_MENU),
    top: choice("Does the request limit how many groups to show?", TOP_MENU),
  };
  for (const c of text) {
    const vals = info.aggregates[c.name]?.values;
    if (vals?.length && vals.length <= 30)
      q[`only.${c.name}`] = choice(`Does the request restrict the data to one ${c.name}? Pick any unless it names one.`,
        { any: `No restriction on ${c.name}.`, ...Object.fromEntries(vals.map((v) => [v, `Only ${c.name} = ${v}.`])) });
  }
  return q;
}

export function assemble(answers, info) {
  const pick = (k) => answers[k]?.choice;
  const conf = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, Number(v?.confidence ?? 0)]));
  const types = Object.fromEntries(info.columns.map((c) => [c.name, c.type]));
  const mark = pick("mark"), x = pick("x"), measure = pick("measure");
  let agg = pick("agg");
  let series = pick("series");
  if (series === "none" || series === x || ["pie", "doughnut", "scatter"].includes(mark)) series = undefined;
  const gating = ["mark", "x", "measure", "order", "top"];
  if (measure === "rows") agg = "count"; else gating.push("agg");
  if (series) gating.push("series");

  const transform = [];
  for (const k of Object.keys(answers).filter((k) => k.startsWith("only."))) {
    const v = pick(k);
    if (v && v !== "any") { transform.push({ op: "filter", field: k.slice(5), eq: v }); gating.push(k); }
  }
  let spec;
  if (mark === "scatter") {
    // a scatter plots rows, not groups: x and the measure are both raw number columns
    spec = { mark, x, y: measure === "rows" ? "amount" : measure, transform };
  } else {
    transform.push({ op: "group", by: series ? [x, series] : [x], agg, ...(agg === "count" ? {} : { field: measure }), as: "value" });
    const order = pick("order");
    if (order === "value_desc" || order === "value_asc") transform.push({ op: "sort", field: "value", order: order === "value_desc" ? "desc" : "asc" });
    else if (["month", "date", "number"].includes(types[x])) transform.push({ op: "sort", field: x, order: "asc" });
    const top = pick("top");
    if (top && top !== "all") transform.push({ op: "limit", n: Number(top) });
    spec = { mark, x, y: "value", ...(series ? { series } : {}), transform };
  }
  const what = measure === "rows" ? "Orders" : `${{ sum: "Total", avg: "Average", count: "Count of", min: "Lowest", max: "Highest" }[agg]} ${measure}`;
  const only = transform.filter((s) => s.op === "filter").map((s) => s.eq);
  spec.title = mark === "scatter" ? `${spec.y} vs ${x}` : `${what} by ${x}${series ? ` and ${series}` : ""}${only.length ? ` (${only.join(", ")})` : ""}`;

  const weakestOn = gating.reduce((lo, k) => ((conf[k] ?? 0) < (conf[lo] ?? 0) ? k : lo), gating[0]);
  const weakest = conf[weakestOn] ?? 0;
  // other chart types the model rated close behind: cheap to offer, already the same data
  const probs = answers.mark?.probabilities || {};
  const alternatives = Object.entries(probs).filter(([m, p]) => m !== mark && p >= 0.15).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([m, p]) => ({ mark: m, p: Math.round(p * 100) / 100 }));
  return { spec, confidence: conf, weakest: Math.round(weakest * 100) / 100, weakestOn, alternatives };
}

export async function decide(env, model, info, prompt, prior) {
  const state = { user_request: prompt, table: { columns: info.columns.map((c) => c.name), rows: info.rows },
                  ...(prior ? { current_chart: prior } : {}) };
  const input = { state, questions: questions(info) };
  if (model.startsWith("@cf/cloudflare/clef")) input.model = model.endsWith("flash") ? "clef-flash" : "clef";
  const t0 = Date.now();
  const res = await env.AI.run(model, input);
  if (!res?.answers) throw new Error("the decision model returned no answers");
  return { ...assemble(res.answers, info), model: res.model || model, ms: Date.now() - t0 };
}
