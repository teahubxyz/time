// The deal log: every deal, closed or walked away from, with no chat text in it.
//
// This log is the price discovery. The opening price, each counter, the final price, the rounds, the reasons that
// earned the steps, and the outcome — enough to set fixed tiers from later, as Poke did, and nothing a member said.
//
// Where it goes: a closed deal is already recorded in Whop, through the checkout's metadata and the payment, so
// Whop stays the receipt. A walkaway is recorded nowhere by Whop, so both halves are written here too, as one JSON
// line per deal through an injected sink. The default sink appends to a JSONL file, which is how Time keeps its own
// ledger (`time/ledger/*.jsonl`) — no database to run, and the file is the thing the operator reads when it is time
// to replace the haggle with fixed tiers.
//
// `line()` builds from a fixed key list and `validate()` checks every value is a number, an enum member, an id or
// an ISO date. Prose cannot get in by accident: the desk's `note` never leaves dealdesk.js, and anything that did
// leak would fail validation rather than be written.

import { fee, net, cents } from "./tiers.js";
import { REASONS, MAX_ROUNDS } from "./dealdesk.js";

export const OUTCOMES = ["open", "agreed", "paid", "walkaway"];
export const VERDICTS = ["accept", "counter", "refuse"];

const ID = /^[A-Za-z0-9_:.-]{1,64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function line(deal, { now } = {}) {
  return {
    ts: new Date(now ?? Date.now()).toISOString(),
    deal: deal.id,
    member: deal.member ?? null,
    thread: deal.thread ?? null,
    tier: deal.tier,
    seats: deal.seats ?? null,
    list: deal.list ?? deal.anchor,
    anchor: deal.anchor,
    floor: deal.floor,
    opening: deal.opening ?? null,
    counters: deal.quotes.map((q) => q.price),
    reasons: deal.quotes.map((q) => q.reason).filter(Boolean),
    final: deal.price ?? null,
    rounds: deal.round,
    outcome: deal.outcome,
    fee: deal.price == null ? null : fee(deal.price),
    net: deal.price == null ? null : net(deal.price),
    opened: deal.opened,
    closed: deal.closed ?? null,
  };
}

export const KEYS = Object.keys(line({ id: "d", tier: "sprint", seats: null, anchor: 0, floor: 0, quotes: [], round: 0,
                                       outcome: "open", opened: "1970-01-01T00:00:00.000Z" }));

// Throws with the offending key. Called on every write, so a field that is not a number, an id, a date or one of
// the known enums never reaches the file.
export function validate(row) {
  const bad = (k, why) => { throw new Error(`deal log: ${k} ${why}`); };
  const num = (k) => { const v = row[k]; if (v !== null && !(Number.isFinite(v) && v >= 0)) bad(k, "must be a number or null"); };
  const id = (k) => { const v = row[k]; if (v !== null && !(typeof v === "string" && ID.test(v))) bad(k, "must be an id or null"); };
  const date = (k) => { const v = row[k]; if (v !== null && !(typeof v === "string" && ISO.test(v))) bad(k, "must be an ISO date or null"); };

  for (const k of Object.keys(row)) {
    if (!KEYS.includes(k)) bad(k, "is not a deal-log field");
  }
  for (const k of ["list", "anchor", "floor", "opening", "final", "fee", "net", "seats"]) num(k);
  if (!Number.isInteger(row.rounds) || row.rounds < 0 || row.rounds > MAX_ROUNDS) bad("rounds", `must be 0..${MAX_ROUNDS}`);
  for (const k of ["deal", "member", "thread", "tier"]) id(k);
  for (const k of ["ts", "opened", "closed"]) date(k);
  if (!OUTCOMES.includes(row.outcome)) bad("outcome", `must be one of ${OUTCOMES.join(", ")}`);
  if (!Array.isArray(row.counters) || row.counters.some((p) => !(Number.isFinite(p) && p > 0))) bad("counters", "must be prices");
  if (!Array.isArray(row.reasons) || row.reasons.some((r) => !Object.hasOwn(REASONS, r))) bad("reasons", "must be earned-reason tags");
  return row;
}

// sink(row) -> void | Promise. `fileSink` is the default: one JSON line appended per deal.
export async function record(deal, { sink, now } = {}) {
  const row = validate(line(deal, { now }));
  await sink(row);
  return row;
}

export function fileSink(path, { fs } = {}) {
  return async (row) => {
    const mod = fs ?? (await import("node:fs/promises"));
    await mod.appendFile(path, JSON.stringify(row) + "\n", "utf8");
  };
}

export function memorySink() {
  const rows = [];
  const sink = async (row) => { rows.push(row); };
  sink.rows = rows;
  return sink;
}

// What the operator reads to replace the haggle with fixed tiers: per tier, how many deals closed, at what prices
// and how often a haggle ended in a walkaway.
export function summary(rows) {
  const out = {};
  for (const row of rows) {
    const t = (out[row.tier] ??= { tier: row.tier, deals: 0, paid: 0, walkaways: 0, prices: [], rounds: [], net: 0 });
    t.deals += 1;
    if (row.outcome === "paid") { t.paid += 1; t.prices.push(row.final); t.net = cents(t.net + (row.net ?? 0)); }
    if (row.outcome === "walkaway") t.walkaways += 1;
    t.rounds.push(row.rounds);
  }
  const mid = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : null);
  return Object.values(out).map((t) => ({
    tier: t.tier, deals: t.deals, paid: t.paid, walkaways: t.walkaways,
    median_price: mid(t.prices), low: t.prices.length ? Math.min(...t.prices) : null,
    high: t.prices.length ? Math.max(...t.prices) : null,
    median_rounds: mid(t.rounds), net: t.net,
  }));
}
