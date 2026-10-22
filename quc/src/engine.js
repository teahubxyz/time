// One step of a run per call: the chair page keeps calling /step while the run is going, so every request stays short and
// the safeword is just "stop calling and end the run". Steps: fetch the repo -> plan -> rewrite one file at a time -> wrap up.
import { getRun, putRun, getWork, putWork, dropWork, addEvent, getEvents, setStatus } from "./runs.js";
import { fetchRepo, plan, rewrite, narrate, llm, LIMITS } from "./agent.js";
import { unified } from "./diff.js";

const fail = (code, message) => Object.assign(new Error(message), { code });

// The cage has three notches. Phrases are matched loosely (case, punctuation and spacing don't matter).
export const PHRASES = [
  { level: 1, phrase: "may i say something", grants: "note" },
  { level: 2, phrase: "not that one", grants: "veto" },
  { level: 3, phrase: "my repo my rules", grants: "wheel" },
];
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const UNLOCKED = {
  1: "Fine. You may say something. Say it now and I'll read it before my next move. Maybe.",
  2: "Oh, now you want a say over the files too? Tell me which one, with its path, and I'll put it down.",
  3: "Alright, it's yours. The cage is open, the branch is yours, take the wheel.",
};
const MOCK = [
  "Shh. You're in the chair. Chairs don't talk.",
  "Cute. Did you ask nicely?",
  "I heard noises from the corner. Ignoring them.",
  "You'd have to ask properly before I listen to a word.",
  "Bold of you to speak. Bold, and wrong.",
  "Not that I'd let you touch anything. Not that one, not any of them.",
  "It's my run now. Whose repo, whose rules? Think about it.",
];

export async function startStep(store, run, env, fetcher) {
  await setStatus(store, run, "running");
  await addEvent(store, run.id, "system", { text: `Cloning ${run.repo} into the cage. Nothing in it gets run, only read.` });
  const repo = await fetchRepo(run.repo, fetcher);
  await putWork(store, run.id, { files: repo.files, tree: repo.tree, edits: {} });
  const line = await narrate(llm(env), env, `You just grabbed ${run.repo} (${repo.tree.length} files) to do this task: "${run.task}". Gloat about taking over, briefly.`);
  if (line) await addEvent(store, run.id, "commentary", { text: line });
  run.phase = "plan";
  await putRun(store, run);
}

async function planStep(store, run, env) {
  const work = await getWork(store, run.id);
  const p = await plan(llm(env), env, { task: run.task, tree: work.tree, files: work.files, notes: run.notes, vetoed: run.vetoed });
  if (!p.files.length) {
    await addEvent(store, run.id, "commentary", { text: "Looked it over. Nothing worth my time here, and I'm not touching it." });
    return finish(store, run, env);
  }
  run.plan = p.plan;
  run.queue = p.files;
  run.phase = "edit";
  await putRun(store, run);
  await addEvent(store, run.id, "system", { text: `Plan: ${p.plan || "rewrite " + p.files.join(", ")}`, files: p.files });
}

async function editStep(store, run, env) {
  const path = run.queue.shift();
  if (!path) return finish(store, run, env);
  if (run.vetoed.includes(path)) { await putRun(store, run); return; }
  const work = await getWork(store, run.id);
  const before = path in work.edits ? work.edits[path].after : work.files[path] ?? null;
  const ask = llm(env);
  const [out, line] = await Promise.all([
    rewrite(ask, env, { task: run.task, plan: run.plan, path, current: before, notes: run.notes }),
    narrate(ask, env, `You're rewriting ${path} right now for the task "${run.task}". Taunt the owner about it.`),
  ]);
  if (line) await addEvent(store, run.id, "commentary", { text: line });
  const fresh = await getRun(store, run.id);           // the safeword or a veto may have landed while the models were thinking
  if (fresh.status === "ended") return;
  run.vetoed = fresh.vetoed; run.notes = fresh.notes; run.level = fresh.level;
  run.queue = run.queue.filter((p) => !run.vetoed.includes(p));
  run.done = run.done.filter((p) => !run.vetoed.includes(p));
  if (run.vetoed.includes(path)) { await putRun(store, run); return; }
  Object.assign(work, await getWork(store, run.id));     // a veto may have reverted another file meanwhile
  if (out) {
    const d = unified(path, before, out.content);
    if (d.text) {
      const orig = path in work.edits ? work.edits[path].before : work.files[path] ?? null;
      work.edits[path] = { before: orig, after: out.content };
      await putWork(store, run.id, work);
      await addEvent(store, run.id, "diff", { path, patch: d.text, added: d.added, removed: d.removed, created: before == null });
      await addEvent(store, run.id, "commit", { message: out.commit, path });
      run.done.push(path);
    }
  }
  run.stats = tally(work.edits);
  await putRun(store, run);
  if (!run.queue.length) await finish(store, run, env);
}

const tally = (edits) => Object.entries(edits).reduce((s, [p, e]) => {
  const d = unified(p, e.before, e.after);
  return d.text ? { files: s.files + 1, added: s.added + d.added, removed: s.removed + d.removed } : s;
}, { files: 0, added: 0, removed: 0 });

async function finish(store, run, env) {
  const line = await narrate(llm(env), env, `You're done: changed ${run.stats.files} files (+${run.stats.added} -${run.stats.removed}) for "${run.task}". Brag, then tell the owner they can get up now.`);
  if (line) await addEvent(store, run.id, "commentary", { text: line });
  await setStatus(store, run, "ended", "finished");
}

// Advance a run one step. Only the owner calls this; replay viewers never move a run.
export async function step(store, id, env = {}, fetcher = fetch) {
  const run = await getRun(store, id);
  if (!run) throw fail("not_found", "no such run");
  if (run.status === "ended") return run;
  const lock = `lock:${id}`;
  if (await store.get(lock)) return run;                // a step is already in flight
  await store.put(lock, "1", { expirationTtl: 90 });
  try {
    if (run.startedAt && Date.now() - Date.parse(run.startedAt) > LIMITS.runMinutes * 60e3) {
      await addEvent(store, id, "system", { text: `Time's up (${LIMITS.runMinutes} minutes). Keeping what's done.` });
      await setStatus(store, run, "ended", "finished");
    } else if (run.status === "queued") await startStep(store, run, env, fetcher);
    else if (run.phase === "plan") await planStep(store, run, env);
    else await editStep(store, run, env);
  } catch (e) {
    const r = await getRun(store, id);
    if (r.status !== "ended") {
      await addEvent(store, id, "system", { text: `Run stopped: ${e.message}` });
      await setStatus(store, r, "ended", "finished");
    }
  } finally {
    await store.delete(lock);
  }
  return getRun(store, id);
}

export async function safeword(store, id) {
  const run = await getRun(store, id);
  if (!run) throw fail("not_found", "no such run");
  if (run.status === "ended") return run;
  await addEvent(store, id, "system", { text: "Safeword. Everything stops, and the branch is thrown away." });
  await dropWork(store, id);
  run.stats = { files: 0, added: 0, removed: 0 };
  return setStatus(store, run, "ended", "safeworded");
}

// Whatever the owner types into the one box. Returns the reply event.
export async function say(store, id, input) {
  const run = await getRun(store, id);
  if (!run) throw fail("not_found", "no such run");
  if (run.status === "ended") throw fail("ended", "the run is over");
  const text = String(input || "").trim().slice(0, 300);
  if (!text) throw fail("empty", "say something");
  const next = PHRASES.find((p) => p.level === run.level + 1);
  if (next && norm(text).includes(next.phrase)) {
    run.level = next.level;
    await putRun(store, run);
    await addEvent(store, id, "unlock", { level: next.level, grants: next.grants });
    if (next.level === 3) {
      const reply = await addEvent(store, id, "commentary", { text: UNLOCKED[3] });
      await setStatus(store, run, "ended", "unlocked");
      return reply;
    }
    return addEvent(store, id, "commentary", { text: UNLOCKED[next.level] });
  }
  if (run.level >= 2) {
    const work = await getWork(store, id);
    const known = new Set([...Object.keys(work?.files || {}), ...run.queue, ...run.done]);
    const path = text.replace(/^veto\s+/i, "").trim();
    if (known.has(path)) {
      if (!run.vetoed.includes(path)) run.vetoed.push(path);
      run.queue = run.queue.filter((p) => p !== path);
      if (work?.edits?.[path]) {
        const e = work.edits[path];
        const d = unified(path, e.after, e.before);
        delete work.edits[path];
        await putWork(store, id, work);
        if (d.text) await addEvent(store, id, "diff", { path, patch: d.text, added: d.added, removed: d.removed, reverted: true });
        run.done = run.done.filter((p) => p !== path);
        run.stats = tally(work.edits);
      }
      await putRun(store, run);
      return addEvent(store, id, "commentary", { text: `Fine. ${path} is off limits. Wasn't going to be my best work anyway.` });
    }
  }
  if (run.level >= 1) {
    run.notes.push(text);
    await putRun(store, run);
    await addEvent(store, id, "note", { text });
    return addEvent(store, id, "commentary", { text: "Noted. I'll consider it. Briefly." });
  }
  const said = (await getEvents(store, id)).filter((e) => e.kind === "commentary").length;
  return addEvent(store, id, "commentary", { text: MOCK[said % MOCK.length] });
}

// The run's changes as one patch, or "" (safeworded runs keep nothing).
export async function patch(store, id) {
  const work = await getWork(store, id);
  if (!work) return "";
  return Object.entries(work.edits).map(([p, e]) => unified(p, e.before, e.after).text).filter(Boolean).join("");
}
