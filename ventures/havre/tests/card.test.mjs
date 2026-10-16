// node --test tests/*.test.mjs   (Node 20+; no dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import * as C from "../card.js";
import { Venice } from "../venice.js";

const site = new URL("../", import.meta.url);

function tinyPng() {
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    dv.setUint32(8 + data.length, C.crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, 1); dv.setUint32(4, 1); ihdr.set([8, 2, 0, 0, 0], 8);
  const idat = deflateSync(Buffer.from([0, 255, 234, 210]));
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(idat)), chunk("IEND", new Uint8Array())];
  const n = parts.reduce((a, p) => a + p.length, 0), b = new Uint8Array(n);
  let o = 0; for (const p of parts) { b.set(p, o); o += p.length; }
  return b;
}

const lone = C.normalizeCard({
  name: "Juniper Vale", tagline: "Quiet botanist with a sharp tongue",
  persona: "You are Juniper Vale, a botanist who keeps a greenhouse at the edge of a rainy northern town. You speak in short dry sentences, tease people you like, and hate being rushed. You collect seeds from every place you visit and label them in tiny handwriting.",
  greeting: "Oh. You found the greenhouse.\n\nMind the ferns, they bite.",
  examples: [{ user: "What are you growing?", character: "Patience, mostly.\n\nAnd a moonflower that refuses to bloom." }],
  tags: ["Botanist", "slow burn", "botanist"],
});

test("crc32 matches the PNG reference value", () => {
  assert.equal(C.crc32(new TextEncoder().encode("IEND")), 0xAE426082);
});

test("normalizeCard fills defaults, dedupes tags, and keeps the format", () => {
  assert.equal(lone.havre, 1);
  assert.equal(lone.id, "juniper-vale");
  assert.deepEqual(lone.tags, ["botanist", "slow burn"]);
  assert.equal(lone.voice.short_form, true);
  assert.equal(lone.license, "remix-with-credit");
  assert.deepEqual(C.validateCard(lone), []);
  assert.equal(C.normalizeCard({ name: "x", portrait: "javascript:alert(1)" }).portrait, "");
  assert.ok(C.validateCard({ havre: 1, name: "x" }).length > 0, "a card without a persona is flagged");
});

test("system prompt carries persona, voice, flow and the house rules", () => {
  const card = C.normalizeCard({ ...lone, flow: [{ stage: "assess", goal: "Ask what they are working on.", next: "you know the blocker." }] });
  const p = C.systemPrompt(card);
  assert.match(p, /^You are Juniper Vale\./);
  assert.match(p, /Text the way people text/);
  assert.match(p, /1\. ASSESS: Ask what they are working on\. Move on when you know the blocker\./);
  assert.match(p, /Never invent links, prices, payments/);
  const msgs = C.chatMessages(card, [{ role: "user", content: "hi" }]);
  assert.equal(msgs[0].role, "system");
  assert.equal(msgs[1].role, "assistant");
  assert.equal(msgs.at(-1).content, "hi");
  const linked = C.normalizeCard({ name: "Sable", engine: { venice_character: "sable-penrose" } });
  assert.equal(C.chatMessages(linked, [{ role: "user", content: "hi" }]).length, 1, "a Venice character brings its own prompt");
});

test("splitBubbles: blank lines split, long text splits at sentences, code stays whole, thinking is dropped", () => {
  assert.deepEqual(C.splitBubbles("<think>hmm</think>Hey.\n\nWhat's up?"), ["Hey.", "What's up?"]);
  const long = "This is a sentence that goes on for a while. ".repeat(10).trim();
  const b = C.splitBubbles(long);
  assert.ok(b.length > 1 && b.every((x) => x.length <= 220));
  const code = "Try this:\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nReport back.";
  assert.deepEqual(C.splitBubbles(code), ["Try this:", "```js\nconst a = 1;\n\nconst b = 2;\n```", "Report back."]);
  assert.equal(C.splitBubbles("").length, 0);
});

test("character card V2 and V3 round-trip through Havre without loss", () => {
  const v3 = C.toCharacterCardV3(lone);
  assert.equal(v3.spec, "chara_card_v3");
  assert.equal(v3.data.name, "Juniper Vale");
  assert.ok(v3.data.source.includes(C.SITE));
  assert.ok(Number.isInteger(v3.data.creation_date));
  assert.deepEqual(v3.data.group_only_greetings, []);
  assert.deepEqual(C.fromCharacterCard(v3), lone, "a card that left Havre comes back whole");
  const v2 = C.toCharacterCardV2(lone);
  assert.equal(v2.spec, "chara_card_v2");
  assert.match(v2.data.mes_example, /^<START>\n\{\{user\}\}: What are you growing\?\n\{\{char\}\}: Patience/);
});

test("a foreign V2 card imports with its examples, and is credited", () => {
  const foreign = { spec: "chara_card_v2", spec_version: "2.0", data: {
    name: "Captain Ro", description: "{{char}} is a retired sea captain who runs a bait shop.", personality: "gruff, kind",
    scenario: "{{user}} walks in out of the rain.", first_mes: "*looks up* We're closed. Mostly.",
    mes_example: "<START>\n{{user}}: Got any worms?\n{{char}}: Got any manners?\n<START>\n{{user}}: Nice boat.\n{{char}}: She's older than you.\nAnd faster.",
    creator: "someone", tags: ["sea"], extensions: {} } };
  const { card, kind } = C.fromAny(JSON.stringify(foreign));
  assert.equal(kind, "character card V2");
  assert.equal(card.name, "Captain Ro");
  assert.match(card.persona, /retired sea captain/);
  assert.match(card.persona, /Scenario: \{\{user\}\} walks in/);
  assert.equal(card.examples.length, 2);
  assert.equal(card.examples[1].character, "She's older than you.\nAnd faster.");
  assert.equal(card.license, "all-rights-reserved", "someone else's card is not assumed remixable");
  assert.equal(card.lineage[0].relation, "ported-from");
  assert.equal(card.lineage[0].creator, "someone");
  assert.match(C.fill(card.persona, card), /Captain Ro is a retired/);
});

test("V1 cards, Havre JSON and pasted text all import", () => {
  assert.equal(C.fromAny(JSON.stringify({ name: "Old", description: "An old card.", first_mes: "Hello" })).kind, "character card V1");
  assert.equal(C.fromAny(JSON.stringify(lone)).card.name, "Juniper Vale");
  const t = C.fromAny("Marlo\nYou are Marlo, a night-shift radio host.");
  assert.equal(t.kind, "text");
  assert.equal(t.card.name, "Marlo");
  assert.match(t.card.persona, /night-shift radio host/);
  assert.throws(() => C.fromAny("{not json"), /doesn't parse/);
  assert.throws(() => C.fromAny(JSON.stringify({ hello: 1 })), /isn't a Havre card/);
});

test("PNG cards: write ccv3 + chara, read them back, replace on rewrite", () => {
  const png = tinyPng();
  const withCard = C.toPngCard(png, lone);
  assert.ok(C.isPng(withCard));
  const text = C.readPngText(withCard);
  assert.ok(text.ccv3 && text.chara);
  assert.equal(JSON.parse(C.b64decodeUtf8(text.chara)).spec, "chara_card_v2");
  assert.deepEqual(C.fromPng(withCard), lone);
  assert.deepEqual(C.fromAny(withCard).card, lone);
  const again = C.toPngCard(withCard, C.normalizeCard({ ...lone, name: "Renamed" }));
  const t2 = C.readPngText(again);
  assert.equal(Object.keys(t2).length, 2, "old card chunks are replaced, not stacked");
  assert.equal(C.fromPng(again).name, "Renamed");
  assert.throws(() => C.fromPng(png), /no character card/);
  // unicode survives the base64 round trip
  const fancy = C.normalizeCard({ ...lone, name: "Zoë “Ψ” 鳥", persona: "Émigré. Speaks softly — 🌊." });
  assert.equal(C.fromPng(C.toPngCard(png, fancy)).name, "Zoë “Ψ” 鳥");
});

test("similarity: a copy is too close, a light paraphrase is close, a clean-room rewrite is fresh", () => {
  const src = C.cardText(lone);
  assert.equal(C.similarity(src, src, { names: [lone.name], newName: lone.name }).verdict, "too-close");
  const para = "You are Fern, a gardener. You keep a greenhouse at the edge of a rainy northern town. You speak in short dry sentences, tease people you like, and you hate being rushed by anyone.";
  const p = C.similarity(para, src, { names: [lone.name], newName: "Fern" });
  assert.notEqual(p.verdict, "fresh");
  assert.ok(p.run.len >= 8, "the shared run is found: " + p.run.text);
  const fresh = "You are Ottoline Marsh, a tide-pool surveyor on a windy southern coast. You talk in quick bright bursts, ask too many questions, and count crabs when you're nervous. You map every rock pool and give each one a secret number.";
  const f = C.similarity(fresh, src, { names: [lone.name], newName: "Ottoline Marsh" });
  assert.equal(f.verdict, "fresh", JSON.stringify(f.reasons));
  assert.ok(f.share < 0.03);
  // filler runs don't count as copying
  assert.equal(C.longestRun(C.tokens("and then it was in the"), C.tokens("and then it was in the")).len, 0);
});

test("names: the whole name, a surname, a first name mid-sentence; a near-identical new name is too close", () => {
  assert.ok(C.usesName("She met Juniper at noon.", "Juniper Vale"));
  assert.ok(C.usesName("old vale family", "Juniper Vale"));
  assert.ok(!C.usesName("A lone wolf sings.", "Lone Tayim") || false);
  assert.ok(C.usesName("I saw tayim yesterday", "Lone Tayim"));
  assert.ok(C.nameSimilarity("Juniper Vale", "Juniper Vail") > 0.75);
  const s = C.similarity("You are Juniper Vail, a tide-pool surveyor.", "Juniper Vale grows ferns.", { names: ["Juniper Vale"], newName: "Juniper Vail" });
  assert.equal(s.verdict, "too-close");
});

test("lineage only grows, and credit reads well", () => {
  let c = C.addLineage(lone, { relation: "inspired-by", name: "Lone Tayim", creator: "1obm4", ref: "venice:lone-tayim" });
  c = C.addLineage(c, { relation: "inspired-by", name: "Lone Tayim", creator: "1obm4", ref: "venice:lone-tayim" });
  assert.equal(c.lineage.length, 1);
  assert.equal(C.creditLine(c.lineage[0]), "Inspired by Lone Tayim by 1obm4 on Venice");
  assert.equal(C.refUrl("venice:lone-tayim"), "https://venice.ai/c/lone-tayim");
  assert.equal(C.refUrl("card:abc"), "");
});

test("remix: the writer never sees the source, and a rewrite is told what to avoid", () => {
  const src = C.cardText(lone);
  const d = C.distillMessages(src);
  assert.equal(d[0].content, C.DISTILL_SYSTEM);
  assert.ok(d[1].content.includes("greenhouse"));
  const distillate = C.normalizeDistillate({ archetype: "dry-witted plant keeper", premise: "tends rare plants alone", drives: ["finish the collection"], voice: ["dry", "teasing", 7], extra: "x" });
  assert.deepEqual(Object.keys(distillate), C.DISTILL_KEYS);
  assert.deepEqual(distillate.voice, ["dry", "teasing", "7"]);
  const check = C.similarity("keeps a greenhouse at the edge of a rainy northern town", src, { names: [lone.name] });
  const avoid = C.avoidList(check, [lone.name]);
  assert.ok(avoid.includes("Juniper Vale"));
  const w = C.writeMessages(distillate, "make them a sailor", avoid);
  assert.ok(!w.map((m) => m.content).join(" ").includes("moonflower"), "no source text reaches the writer");
  assert.ok(w[1].content.includes("make them a sailor"));
  const made = C.cardFromWrite({ name: "Ottoline Marsh", tagline: "Tide-pool surveyor", greeting: "Hi!", persona: "You are Ottoline.", examples: [{ user: "hi", character: "hey" }], tags: ["coast"] },
    { source: { name: lone.name, creator: "", ref: "card:1234" }, check: { share: 0.004, run: { len: 3 } }, model: "x" });
  assert.equal(made.lineage[0].relation, "inspired-by");
  assert.match(made.lineage[0].note, /0\.4% shared phrasing, longest shared run 3 words/);
  assert.equal(made.license, "remix-with-credit");
});

test("parseJsonLoose finds the object inside chatter and fences", () => {
  assert.deepEqual(C.parseJsonLoose('Sure!\n```json\n{"a": 1, "b": "}"}\n```'), { a: 1, b: "}" });
  assert.deepEqual(C.parseJsonLoose('<think>{"no":1}</think>Here: {"ok": true} done'), { ok: true });
  assert.throws(() => C.parseJsonLoose("no json here"), /didn't return JSON/);
});

test("demo replies come from the card's own examples, answering the closest question", () => {
  assert.match(C.demoReply(lone, 0), /Patience/);
  const two = C.normalizeCard({ ...lone, examples: [{ user: "What are you growing?", character: "Patience." }, { user: "Do you have a cat?", character: "Two. Both rude." }] });
  assert.match(C.demoReply(two, 0, "do you have a cat"), /Both rude/);
  assert.match(C.demoReply(two, 1, "hello there"), /Both rude/, "nothing close: the next one in turn");
  assert.deepEqual(C.suggestions(two), ["What are you growing?", "Do you have a cat?"]);
  assert.match(C.demoReply(C.normalizeCard({ name: "x", persona: "y" }), 0), /Venice key/);
});

test("the schema lists every field a card has", () => {
  const schema = JSON.parse(readFileSync(new URL("card.schema.json", site), "utf8"));
  assert.deepEqual(Object.keys(schema.properties).sort(), Object.keys(lone).sort());
  assert.deepEqual(schema.properties.license.enum.sort(), Object.keys(C.LICENSES).sort());
  assert.deepEqual(schema.properties.lineage.items.properties.relation.enum, C.RELATIONS);
});

// ---------- venice.js against a fake fetch ----------

function fakeFetch(routes, log) {
  return async (url, init = {}) => {
    log.push({ url, init });
    const path = url.replace("https://api.venice.ai/api/v1", "");
    const r = routes(path, init);
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
}

test("venice: models need no key; characters hide adult ones; errors are explained", async () => {
  const log = [];
  const v = new Venice("", { fetch: fakeFetch((p) => p.startsWith("/models")
    ? { status: 200, body: { data: [{ id: "m1", model_spec: { pricing: { input: { usd: 0.1 }, output: { usd: 0.5 } }, capabilities: { supportsResponseSchema: true } } }, { id: "gone", model_spec: { offline: true } }] } }
    : { status: 200, body: {} }, log) });
  const ms = await v.models();
  assert.deepEqual(ms.map((m) => m.id), ["m1"]);
  assert.equal(ms[0].input, 0.1);
  assert.ok(!("Authorization" in log[0].init.headers));
  await assert.rejects(v.characters(), /Add your Venice API key/);

  const log2 = [];
  const k = new Venice("sk-test", { fetch: fakeFetch((p) => p.startsWith("/characters?")
    ? { status: 200, body: { data: [{ slug: "a", name: "A", adult: false, photoUrl: "https://outerface.venice.ai/x", stats: { imports: 3 } }, { slug: "b", adult: true }] } }
    : { status: 401, body: { error: "bad key" } }, log2) });
  const cs = await k.characters({ search: "sea" });
  assert.deepEqual(cs.map((c) => c.slug), ["a"]);
  assert.equal(cs[0].url, "https://venice.ai/c/a");
  assert.match(log2[0].url, /search=sea/);
  assert.equal(log2[0].init.headers.Authorization, "Bearer sk-test");
  await assert.rejects(k.chat({ model: "m", messages: [] }), /didn't accept that key/);
});

test("venice: chat sends Havre's prompt alone, or speaks through a Venice character; JSON falls back", async () => {
  const bodies = [];
  let first = true;
  const v = new Venice("sk", { fetch: async (url, init) => {
    const b = JSON.parse(init.body); bodies.push(b);
    if (b.response_format && first) { first = false; return { ok: false, status: 400, json: async () => ({ error: "no schema" }) }; }
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "hey\n\nthere" } }], usage: { total_tokens: 5 } }) };
  } });
  const r = await v.chat({ model: "m", messages: [{ role: "user", content: "hi" }] });
  assert.equal(r.text, "hey\n\nthere");
  assert.equal(bodies[0].venice_parameters.include_venice_system_prompt, false);
  assert.equal(bodies[0].venice_parameters.strip_thinking_response, true);
  assert.equal(bodies[0].venice_parameters.disable_thinking, true);
  await v.chat({ model: "m", messages: [], characterSlug: "taskmaster" });
  assert.equal(bodies[1].venice_parameters.character_slug, "taskmaster");
  assert.ok(!("include_venice_system_prompt" in bodies[1].venice_parameters));
  await v.chat({ model: "m", messages: [], schema: C.DISTILL_SCHEMA });
  assert.ok(bodies[2].response_format && !bodies[3].response_format, "retried without response_format after a 400");
});

test("venice: a page of characters asks for safe-for-work ones, sorted, and says whether there are more", async () => {
  const urls = [];
  const page = (n) => Array.from({ length: n }, (_, i) => ({ slug: "c" + i, name: "C" + i, adult: false, photoUrl: "http://elsewhere.example/x.png" }));
  const v = new Venice("sk", { fetch: fakeFetch((p) => ({ status: 200, body: { data: p.includes("offset=24") ? page(3) : [...page(23), { slug: "x", adult: true }] } }), urls) });
  const first = await v.characterPage({ sort: "imports", search: "#pirate", limit: 24 });
  const q = new URL(urls[0].url).searchParams;
  assert.equal(q.get("isAdult"), "false");
  assert.equal(q.get("sortBy"), "imports");
  assert.equal(q.get("search"), "#pirate");
  assert.equal(first.list.length, 23, "the adult one is never listed");
  assert.equal(first.more, true, "a full page means there may be more");
  assert.equal(first.list[0].photo, "", "photos only from outerface.venice.ai");
  const last = await v.characterPage({ limit: 24, offset: 24 });
  assert.equal(last.more, false);
  assert.equal(new URL(urls[1].url).searchParams.get("sortBy"), null);

  const tries = [];
  const old = new Venice("sk", { fetch: fakeFetch((p) => (p.includes("sortBy") ? { status: 400, body: { error: "unknown parameter" } } : { status: 200, body: { data: page(2) } }), tries) });
  const plain = await old.characterPage({ sort: "featured" });
  assert.equal(plain.list.length, 2);
  assert.equal(tries.length, 2, "asked again without the sort");
  assert.ok(!tries[1].url.includes("sortBy") && !tries[1].url.includes("isAdult"));
});

test("venice: adult characters only when asked for, and then only them; tags narrow the list", async () => {
  const urls = [];
  const data = [{ slug: "a", name: "A", adult: false, tags: ["sea"] }, { slug: "b", name: "B", adult: true, tags: [] }];
  const v = new Venice("sk", { fetch: fakeFetch(() => ({ status: 200, body: { data } }), urls) });
  const adult = await v.characterPage({ adult: true, tags: "sea" });
  const q = new URL(urls[0].url).searchParams;
  assert.equal(q.get("isAdult"), "true", "asked for as such: left out, Venice mixes them in with the rest");
  assert.equal(q.get("tags"), "sea");
  assert.deepEqual(adult.list.map((c) => [c.slug, c.adult]), [["b", true]], "only the adult ones, whatever comes back");
  assert.deepEqual((await v.characters()).map((c) => c.slug), ["a"], "and none when they aren't");
});

test("venice: models say what they can do and how private they are; beta-only ones are left out; the balance reads", async () => {
  const v = new Venice("sk", { fetch: fakeFetch((p) => (p.startsWith("/models") ? { status: 200, body: { data: [
    { id: "m1", model_spec: { name: "M One", privacy: "private", uncensored: true, availableContextTokens: 65536, traits: ["default"],
      capabilities: { supportsVision: true, supportsFunctionCalling: true, supportsReasoning: false, supportsWebSearch: true },
      pricing: { input: { usd: 0.5 }, output: { usd: 2 } }, deprecation: { removesAt: "2026-12-01T00:00:00Z" } } },
    { id: "m2", model_spec: { name: "Beta", beta: true } }] } }
    : { status: 200, body: { canConsume: true, consumptionCurrency: "DIEM", balances: { diem: 42.25, usd: 3, bundledCredits: null, earnedCredits: null }, diemEpochAllocation: 100 } }), []) });
  const [m] = await v.models();
  assert.equal((await v.models()).length, 1);
  assert.deepEqual([m.name, m.privacy, m.uncensored, m.vision, m.tools, m.reasoning, m.web, m.ctx, m.input, m.output, m.retiring],
    ["M One", "private", true, true, true, false, true, 65536, 0.5, 2, "2026-12-01"]);
  assert.deepEqual(await v.balance(), { amount: 42.25, currency: "DIEM", canConsume: true });
});

test("venice: a plain chat keeps Venice's own system prompt; a character's chat doesn't", async () => {
  const bodies = [];
  const v = new Venice("sk", { fetch: async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "hi" } }] }) }; } });
  await v.chat({ model: "m", messages: [{ role: "user", content: "hi" }], veniceSystemPrompt: true, maxTokens: 2000 });
  assert.equal(bodies[0].venice_parameters.include_venice_system_prompt, true);
  assert.equal(bodies[0].max_tokens, 2000);
  await v.chat({ model: "m", messages: [] });
  assert.equal(bodies[1].venice_parameters.include_venice_system_prompt, false);
});
