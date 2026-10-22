import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

const get = (path, env, method = "GET") => worker.fetch(new Request("http://x" + path, { method }), env);

test("health reports ok and the revision", async () => {
  const r = await get("/api/health", { REV: "abc" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, rev: "abc" });
});

test("shell is responsive html that loads the motif", async () => {
  const r = await get("/");
  const html = await r.text();
  assert.match(r.headers.get("content-type"), /text\/html/);
  assert.match(html, /name="viewport" content="width=device-width/);
  assert.match(html, /chair\.svg/);
});

test("motif is an svg, unknown paths 404, writes are refused", async () => {
  const svg = await get("/chair.svg");
  assert.equal(svg.headers.get("content-type"), "image/svg+xml");
  assert.match(await svg.text(), /^<svg/);
  assert.equal((await get("/nope")).status, 404);
  assert.equal((await get("/api/health", {}, "POST")).status, 405);
});

test("validate accepts a repo + task and rejects bad shapes", async () => {
  const { validate } = await import("../src/worker.js");
  const task = "Fix the flaky date test";
  assert.deepEqual(validate("https://github.com/a/b", task), {});
  assert.deepEqual(validate("https://github.com/a/b.git/", task), {});
  for (const bad of ["", "github.com/a/b", "http://github.com/a/b", "https://gitlab.com/a/b", "https://github.com/a", "https://github.com/a/b/tree/x"])
    assert.ok(validate(bad, task).repo, bad);
  assert.ok(validate("https://github.com/a/b", "short").task);
  assert.ok(validate("https://github.com/a/b", "x".repeat(201)).task);
});

test("start form, public-replay notice and run page are served; the inlined validator parses", async () => {
  const html = await (await get("/")).text();
  assert.match(html, /<form id="form"/);
  assert.match(html, /Replays are public/);
  const run = await get("/run/abc123");
  assert.equal(run.status, 200);
  assert.match(await run.text(), /id="run-id"/);
  assert.equal((await get("/run/a/b")).status, 404);
  new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]); // syntax check of the shipped script
});
