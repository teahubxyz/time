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
