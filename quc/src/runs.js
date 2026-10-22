// Run model: queued -> running -> ended(finished|safeworded|unlocked), an append-only event log per run, one active run per visitor.
// `store` is anything with async get(key) / put(key, string, opts?) / delete(key): a Workers KV namespace, or memoryStore() in tests.
// Keys: run:<id> (record), events:<id> (array), work:<id> (repo text + edits), active:<visitor> (that visitor's queued/running run).
// shortcut: KV has no compare-and-set and is eventually consistent across locations, so two simultaneous starts by one visitor can
// both pass the check, and a reader far from the writer can lag a few seconds; move runs to a Durable Object when that matters.
import { validate } from "./validate.js";

export const KINDS = ["diff", "commit", "commentary", "unlock", "note", "system"];
export const OUTCOMES = ["finished", "safeworded", "unlocked"];
const NEXT = { queued: ["running", "ended"], running: ["ended"] };

const fail = (code, message, extra) => Object.assign(new Error(message), { code }, extra);
const load = async (s, k, empty = null) => JSON.parse((await s.get(k)) ?? "null") ?? empty;
const save = (s, k, v) => s.put(k, JSON.stringify(v));

export const getRun = (store, id) => load(store, `run:${id}`);
export const putRun = (store, run) => save(store, `run:${run.id}`, run);
export const getEvents = (store, id) => load(store, `events:${id}`, []);
export const getWork = (store, id) => load(store, `work:${id}`, null);
export const putWork = (store, id, work) => save(store, `work:${id}`, work);
export const dropWork = (store, id) => store.delete(`work:${id}`);

export function memoryStore() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) };
}

export async function createRun(store, { repo, task, visitor }) {
  if (typeof visitor !== "string" || !visitor) throw fail("visitor", "visitor token required");
  const errors = validate(repo, task);
  if (Object.keys(errors).length) throw fail("invalid", "invalid run", { errors });
  const active = await store.get(`active:${visitor}`);
  if (active) {
    const r = await getRun(store, active);
    if (r && r.status !== "ended") throw fail("active", "you already have a run going", { id: active });
  }
  const run = { id: crypto.randomUUID().replace(/-/g, "").slice(0, 10), repo: repo.replace(/\.git\/?$|\/$/g, ""), task, status: "queued",
    visitor, createdAt: new Date().toISOString(), level: 0, notes: [], vetoed: [], plan: null, queue: [], done: [], stats: { files: 0, added: 0, removed: 0 } };
  await putRun(store, run);
  await store.put(`active:${visitor}`, run.id);
  return run;
}

export async function setStatus(store, run, status, outcome) {
  if (!NEXT[run.status]?.includes(status)) throw fail("transition", `cannot go ${run.status} -> ${status}`);
  if (status === "ended" && !OUTCOMES.includes(outcome)) throw fail("outcome", "ended needs an outcome: " + OUTCOMES.join("|"));
  const at = new Date().toISOString();
  run.status = status;
  if (status === "running") run.startedAt = at;
  else Object.assign(run, { endedAt: at, outcome });
  await putRun(store, run);
  if (status === "ended") await store.delete(`active:${run.visitor}`);
  return run;
}

export async function addEvent(store, id, kind, data) {
  if (!KINDS.includes(kind)) throw fail("kind", "event kind must be " + KINDS.join("|"));
  const events = await getEvents(store, id);
  const event = { seq: events.length + 1, at: new Date().toISOString(), kind, data };
  events.push(event);
  await save(store, `events:${id}`, events);
  return event;
}

// The run as anyone may see it: no visitor token.
export const publicRun = ({ visitor, ...rest }) => rest;
