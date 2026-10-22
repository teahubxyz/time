import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker, { validate } from "../src/worker.js";
import { memoryStore, createRun, getRun, getEvents } from "../src/runs.js";
import { step, say, safeword, patch } from "../src/engine.js";
import { untar, parseRepo } from "../src/agent.js";
import { unified } from "../src/diff.js";

// ---------- a fake GitHub: a gzipped tarball built in memory ----------

function tar(files) {
  const enc = new TextEncoder(), blocks = [];
  for (const [path, body] of Object.entries(files)) {
    const data = enc.encode(body), h = new Uint8Array(512);
    h.set(enc.encode("repo-abc123/" + path).subarray(0, 100), 0);
    h.set(enc.encode("0000644\0"), 100);
    h.set(enc.encode(data.length.toString(8).padStart(11, "0") + "\0"), 124);
    h[156] = 48;
    h.set(enc.encode("ustar\0"), 257);
    blocks.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  let i = 0; for (const b of blocks) { out.set(b, i); i += b.length; }
  return out;
}
const gzip = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
const REPO = { "README.md": "# demo\n\nA tiny repo.\n", "src/index.js": "export const x = 1;\n", "logo.png": "\0\0binary" };
let tgz;
const github = async (url) => url.startsWith("https://codeload.github.com/") ? new Response(tgz, { headers: { "content-length": String(tgz.length) } }) : new Response("no", { status: 404 });
beforeEach(async () => { tgz = await gzip(tar(REPO)); });

async function drive(store, id, n = 20) {
  for (let i = 0; i < n; i++) { const r = await step(store, id, {}, github); if (r.status === "ended") return r; }
  return getRun(store, id);
}

// ---------- unit ----------

test("validate accepts a GitHub URL and a one-line task", () => {
  assert.deepEqual(validate("https://github.com/a/b", "make it better please"), {});
  assert.ok(validate("https://gitlab.com/a/b", "make it better please").repo);
  assert.ok(validate("https://github.com/a/b", "short").task);
});

test("parseRepo and untar read GitHub's tarball shape", async () => {
  assert.deepEqual(parseRepo("https://github.com/o/n.git"), { owner: "o", name: "n" });
  const files = untar(tar({ "a.txt": "hi", "d/b.txt": "yo" })).map((f) => f.path);
  assert.deepEqual(files, ["a.txt", "d/b.txt"]);
});

test("unified diff counts and marks lines", () => {
  const d = unified("f", "a\nb\nc\n", "a\nB\nc\nd\n");
  assert.equal(d.added, 2); assert.equal(d.removed, 1);
  assert.match(d.text, /^--- a\/f\n\+\+\+ b\/f\n@@ -1,3 \+1,4 @@/);
  assert.equal(unified("f", "same\n", "same\n").text, "");
});

// ---------- the run ----------

test("a run clones, plans, rewrites and finishes, and the patch has the change", async () => {
  const store = memoryStore();
  const run = await createRun(store, { repo: "https://github.com/o/demo", task: "make the readme nicer", visitor: "v1" });
  const done = await drive(store, run.id);
  assert.equal(done.status, "ended"); assert.equal(done.outcome, "finished");
  const kinds = (await getEvents(store, run.id)).map((e) => e.kind);
  assert.ok(kinds.includes("diff") && kinds.includes("commit") && kinds.includes("commentary"));
  assert.equal(done.stats.files, 1);
  assert.match(await patch(store, run.id), /\+quc was here\./);
  assert.equal(await store.get("active:v1"), null, "the visitor's slot is free again");
});

test("one active run per visitor", async () => {
  const store = memoryStore();
  await createRun(store, { repo: "https://github.com/o/demo", task: "make the readme nicer", visitor: "v1" });
  await assert.rejects(createRun(store, { repo: "https://github.com/o/demo", task: "another one please", visitor: "v1" }), { code: "active" });
});

test("the safeword stops the run and throws the work away", async () => {
  const store = memoryStore();
  const run = await createRun(store, { repo: "https://github.com/o/demo", task: "make the readme nicer", visitor: "v1" });
  await step(store, run.id, {}, github);
  const r = await safeword(store, run.id);
  assert.equal(r.outcome, "safeworded");
  assert.equal(await patch(store, run.id), "");
  assert.equal((await step(store, run.id, {}, github)).status, "ended", "a stopped run never moves again");
});

test("talking from the chair: mocked until the phrases unlock notes, a veto, then the wheel", async () => {
  const store = memoryStore();
  const run = await createRun(store, { repo: "https://github.com/o/demo", task: "make the readme nicer", visitor: "v1" });
  await step(store, run.id, {}, github);   // cloned
  await step(store, run.id, {}, github);   // planned: README.md
  await step(store, run.id, {}, github);   // README.md rewritten (and finished, one file planned)
  const r1 = await getRun(store, run.id);
  assert.equal(r1.status, "ended");

  const store2 = memoryStore();
  const run2 = await createRun(store2, { repo: "https://github.com/o/demo", task: "make the readme nicer", visitor: "v2" });
  await step(store2, run2.id, {}, github); await step(store2, run2.id, {}, github);
  assert.equal((await say(store2, run2.id, "hey stop")).kind, "commentary");
  assert.equal((await getRun(store2, run2.id)).level, 0);
  await say(store2, run2.id, "May I say something?");
  assert.equal((await getRun(store2, run2.id)).level, 1);
  await say(store2, run2.id, "please keep it short");
  assert.deepEqual((await getRun(store2, run2.id)).notes, ["please keep it short"]);
  await say(store2, run2.id, "not that one!");
  await say(store2, run2.id, "README.md");
  const vetoed = await getRun(store2, run2.id);
  assert.deepEqual(vetoed.vetoed, ["README.md"]); assert.deepEqual(vetoed.queue, []);
  await say(store2, run2.id, "My repo, my rules.");
  const end = await getRun(store2, run2.id);
  assert.equal(end.status, "ended"); assert.equal(end.outcome, "unlocked");
});

test("a veto after the edit reverts it", async () => {
  const store = memoryStore();
  const run = await createRun(store, { repo: "https://github.com/o/demo", task: "make the readme nicer", visitor: "v1" });
  const r = await getRun(store, run.id);
  await step(store, run.id, {}, github); await step(store, run.id, {}, github);
  const live = await getRun(store, run.id); live.queue.push("src/index.js"); await store.put(`run:${run.id}`, JSON.stringify(live));
  await step(store, run.id, {}, github);                       // README.md edited, src/index.js still queued
  assert.match(await patch(store, run.id), /README/);
  await say(store, run.id, "may i say something"); await say(store, run.id, "not that one"); await say(store, run.id, "README.md");
  assert.equal(await patch(store, run.id), "");
  const ev = (await getEvents(store, run.id)).filter((e) => e.kind === "diff");
  assert.ok(ev.at(-1).data.reverted);
  assert.ok(r);
});

// ---------- the Worker ----------

const call = (path, { method = "GET", body, cookie, origin } = {}) => worker.fetch(new Request("https://quc.test" + path, {
  method, body: body ? JSON.stringify(body) : undefined,
  headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) } }), env);
let env;
beforeEach(() => { env = { KV: memoryStore(), REV: "t" }; globalThis.fetch = github; });

test("health, page and chair render", async () => {
  assert.deepEqual(await (await call("/api/health")).json(), { ok: true, rev: "t", live: false });
  const page = await (await call("/")).text();
  assert.match(page, /Hand over your repo/); assert.match(page, /function validate/);
  assert.equal((await call("/run/abc123def0")).status, 200);
  assert.match(await (await call("/chair.svg")).text(), /<svg/);
});

test("API: owner drives the run, others can only watch, the patch downloads", async () => {
  const res = await call("/api/runs", { method: "POST", body: { repo: "https://github.com/o/demo", task: "make the readme nicer" } });
  assert.equal(res.status, 201);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  const { id } = await res.json();
  assert.equal((await call(`/api/runs/${id}/step`, { method: "POST", body: {} })).status, 403, "a stranger can't drive");
  assert.equal((await call(`/api/runs/${id}/step`, { method: "POST", body: {}, cookie, origin: "https://evil.test" })).status, 403, "no cross-site");
  for (let i = 0; i < 6; i++) await call(`/api/runs/${id}/step`, { method: "POST", body: {}, cookie });
  const view = await (await call(`/api/runs/${id}`)).json();
  assert.equal(view.owner, false); assert.equal(view.run.status, "ended"); assert.equal(view.run.visitor, undefined);
  assert.ok(view.events.length >= 4);
  const p = await call(`/api/runs/${id}/patch`);
  assert.match(await p.text(), /quc was here/);
  const again = await (await call(`/api/runs/${id}?after=${view.events.length}`)).json();
  assert.equal(again.events.length, 0);
});

test("API: daily cap per visitor", async () => {
  env.RUNS_PER_DAY = 1;
  const first = await call("/api/runs", { method: "POST", body: { repo: "https://github.com/o/demo", task: "make the readme nicer" } });
  const cookie = first.headers.get("set-cookie").split(";")[0];
  const { id } = await first.json();
  await call(`/api/runs/${id}/safeword`, { method: "POST", body: {}, cookie });
  const second = await call("/api/runs", { method: "POST", body: { repo: "https://github.com/o/demo", task: "make the readme nicer" }, cookie });
  assert.equal(second.status, 429);
});
