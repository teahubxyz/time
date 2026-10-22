import test from "node:test";
import assert from "node:assert/strict";
import worker, { validate } from "../src/worker.js";

const get = (path, env = {}, method = "GET") => worker.fetch(new Request("http://x" + path, { method }), env);

test("health reports ok, the revision, and whether real models are bound", async () => {
  const r = await get("/api/health", { REV: "abc" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, rev: "abc", live: false });
  assert.equal((await (await get("/api/health", { VENICE_API_KEY: "k" })).json()).live, true);
});

test("the page is responsive html, the motif is an svg, unknown paths 404", async () => {
  const r = await get("/");
  assert.match(r.headers.get("content-type"), /text\/html/);
  const html = await r.text();
  assert.match(html, /name="viewport" content="width=device-width/);
  assert.match(html, /<form id="form"/);
  assert.match(html, /Replays are public/);
  const svg = await get("/chair.svg");
  assert.equal(svg.headers.get("content-type"), "image/svg+xml");
  assert.match(await svg.text(), /^<svg/);
  assert.equal((await get("/nope")).status, 404);
  assert.equal((await get("/run/a/b")).status, 404);
  assert.equal((await get("/", {}, "POST")).status, 405);
});

test("validate accepts a repo + task and rejects bad shapes", () => {
  const task = "Fix the flaky date test";
  assert.deepEqual(validate("https://github.com/a/b", task), {});
  assert.deepEqual(validate("https://github.com/a/b.git/", task), {});
  for (const bad of ["", "github.com/a/b", "http://github.com/a/b", "https://gitlab.com/a/b", "https://github.com/a", "https://github.com/a/b/tree/x"])
    assert.ok(validate(bad, task).repo, bad);
  assert.ok(validate("https://github.com/a/b", "short").task);
  assert.ok(validate("https://github.com/a/b", "x".repeat(201)).task);
});

test("the shipped script parses", async () => {
  const html = await (await get("/run/abc123def0")).text();
  new Function(html.match(/<script type="module">([\s\S]*)<\/script>/)[1]);
});
