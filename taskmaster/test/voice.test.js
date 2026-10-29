// The voice: no uncensored default, one tool, short replies, no asterisk narration, a limit per member.
import { test } from "node:test";
import assert from "node:assert/strict";
import { voice, model, strip, limiter, QUOTE_TOOL, DEFAULT_MODEL, HAGGLE_MAX_TOKENS, PER_MEMBER } from "../src/voice.js";
import { armFor, localArm, openingFor, EXPERIMENTS, arms } from "../src/experiments.js";
import { tier } from "../src/tiers.js";

test("the old app's uncensored default is refused outright", () => {
  assert.throws(() => model("venice-uncensored"), /refusing an uncensored model/);
  assert.throws(() => model("Dolphin-Uncensored-70B"), /refusing an uncensored model/);
  assert.equal(model(undefined), DEFAULT_MODEL);
  assert.ok(!/uncensored/i.test(DEFAULT_MODEL));
  assert.equal(model("anthropic/claude-sonnet"), "anthropic/claude-sonnet", "the sheet is portable: any model id goes");
});

test("the asterisk narration goes", () => {
  assert.equal(strip("*leans back*\nTwo hundred.\n*waits*"), "Two hundred.");
  assert.equal(strip("Eighty. *final* Take it or leave it."), "Eighty. Take it or leave it.");
  assert.equal(strip("  spaced   out  "), "spaced out");
  assert.equal(strip("a\n\n\n\nb"), "a\n\nb");
  assert.equal(strip("3 * 4 is 12"), "3 * 4 is 12", "a lone asterisk is not narration");
  assert.equal(strip(null), "");
});

test("the model gets one tool, and the reason tags are the desk's four", () => {
  assert.equal(QUOTE_TOOL.function.name, "quote");
  assert.deepEqual(QUOTE_TOOL.function.parameters.properties.reason.enum, ["scope", "urgency", "commitment", "pay_now"]);
  assert.deepEqual(QUOTE_TOOL.function.parameters.required, ["tier", "price"]);
  assert.match(QUOTE_TOOL.function.parameters.properties.note.description, /never about who they are/);
});

test("a haggle turn is short, because the owner pays for it", async () => {
  const sent = [];
  const f = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization });
    return Response.json({ choices: [{ message: { content: "*grins* Two hundred.",
      tool_calls: [{ id: "c1", function: { name: "quote", arguments: '{"tier":"sprint","price":100}' } }] } }], usage: { total_tokens: 40 } });
  };
  const v = voice({ apiKey: "vk", fetch: f });
  const out = await v.say({ system: "sys", messages: [{ role: "user", content: "hi" }], tools: [QUOTE_TOOL] });
  assert.equal(sent[0].url, "https://api.venice.ai/api/v1/chat/completions");
  assert.equal(sent[0].auth, "Bearer vk");
  assert.equal(sent[0].body.max_tokens, HAGGLE_MAX_TOKENS);
  assert.ok(HAGGLE_MAX_TOKENS <= 200, "a couple of lines");
  assert.equal(sent[0].body.messages[0].role, "system");
  assert.equal(out.text, "Two hundred.", "narration stripped on the way out");
  assert.deepEqual(out.calls, [{ id: "c1", name: "quote", args: { tier: "sprint", price: 100 } }]);
  assert.equal(out.usage.total_tokens, 40);
});

test("malformed tool arguments are an empty object, not a crash", async () => {
  const f = async () => Response.json({ choices: [{ message: { content: "", tool_calls: [{ id: "c", function: { name: "quote", arguments: "{oops" } }] } }] });
  const out = await voice({ apiKey: "vk", fetch: f }).say({ system: "s", messages: [] });
  assert.deepEqual(out.calls[0].args, {});
});

test("a missing key fails loudly rather than answering as nobody", async () => {
  await assert.rejects(() => voice({ fetch: async () => Response.json({}) }).say({ system: "s", messages: [] }),
    /no Venice API key/);
  const bad = async () => new Response("rate limited", { status: 429 });
  await assert.rejects(() => voice({ apiKey: "k", fetch: bad }).say({ system: "s", messages: [] }), /venice answered 429/);
});

test("one member cannot spend the owner's tokens on their own", () => {
  let t = 0;
  const gate = limiter({ per: 3, windowMs: 1000, clock: () => t });
  assert.deepEqual([gate.take("ann").ok, gate.take("ann").ok, gate.take("ann").ok], [true, true, true]);
  const over = gate.take("ann");
  assert.equal(over.ok, false);
  assert.ok(over.retry_after_ms > 0);
  assert.equal(gate.take("bob").ok, true, "and does not spend anyone else's share");
  t = 1001;
  assert.equal(gate.take("ann").ok, true, "the window rolls");
  assert.ok(PER_MEMBER > 0 && PER_MEMBER <= 100);
});

test("experiments are bucketed by user, the same way every time", async () => {
  assert.deepEqual(Object.keys(EXPERIMENTS).sort(), ["anchor_height", "free_push", "haggle_vs_fixed"]);
  assert.deepEqual(arms("haggle_vs_fixed"), ["haggle", "fixed"]);
  assert.throws(() => arms("nope"), /no such experiment/);

  const first = await localArm("haggle_vs_fixed", "user_ann");
  assert.equal(await localArm("haggle_vs_fixed", "user_ann"), first, "the same person meets the same arm");
  const spread = new Set();
  for (let i = 0; i < 40; i++) spread.add(await localArm("haggle_vs_fixed", `user_${i}`));
  assert.equal(spread.size, 2, "and the arms are both used");
});

test("Whop's answer wins, and a client that is down does not stop the experiment", async () => {
  const ok = await armFor("anchor_height", "user_ann", { client: { arm: async () => "modest" } });
  assert.deepEqual(ok, { arm: "modest", via: "whop" });
  const down = await armFor("anchor_height", "user_ann", { client: { arm: async () => { throw new Error("502"); } } });
  assert.equal(down.via, "local");
  assert.ok(arms("anchor_height").includes(down.arm));
  const nonsense = await armFor("anchor_height", "user_ann", { client: { arm: async () => "whatever" } });
  assert.equal(nonsense.via, "local");
});

test("an arm chooses the opening, never the floor", () => {
  const t = tier("sprint");
  assert.equal(openingFor(t, "list"), 100);
  assert.equal(openingFor(t, "modest"), 90);
  assert.ok(openingFor(t, "modest") >= t.floor);
  assert.equal(openingFor(tier("checkins"), "modest"), 5, "a $5 tier has nowhere modest to go, so it opens at the list");
});
