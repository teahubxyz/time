import { test } from "node:test";
import assert from "node:assert/strict";
import * as W from "../workflows.js";
import { validateCard } from "../card.js";

test("every workflow has a command, doors and a usage line", () => {
  for (const w of W.WORKFLOWS) {
    assert.ok(w.id && w.title && w.about && w.usage, w.id);
    assert.ok(w.doors.length >= 1, w.id);
    assert.ok(w.command || !w.doors.includes("chat"), w.id + ": a chat door needs a command");
    assert.equal(W.byId(w.id), w);
    if (w.command) assert.equal(W.byCommand(w.command), w);
  }
  assert.equal(W.byCommand(""), null);
  for (const w of []) {
  }
});

test("a slash command at the start of the chat box is a workflow; anything else is words", () => {
  assert.deepEqual(W.parseCommand("/portraits"), { id: "portraits", arg: "" });
  assert.deepEqual(W.parseCommand("  /Portraits  "), { id: "portraits", arg: "" });
  assert.deepEqual(W.parseCommand("/new a lighthouse keeper who\nwrites letters"), { id: "new", arg: "a lighthouse keeper who\nwrites letters" });
  assert.deepEqual(W.parseCommand("/"), { id: "help", arg: "" });
  assert.deepEqual(W.parseCommand("/help"), { id: "help", arg: "" });
  assert.deepEqual(W.parseCommand("/dance"), { id: "unknown", arg: "dance" });
  assert.equal(W.parseCommand("tell me about /new"), null);
  assert.equal(W.parseCommand("http://x/y"), null);
  assert.equal(W.parseCommand(""), null);
});

test("/help lists the workflows with a chat door, one line each", () => {
  const lines = W.helpLines();
  assert.equal(lines.length, W.WORKFLOWS.filter((w) => w.doors.includes("chat")).length);
  assert.ok(lines.every((l) => l.startsWith("/") && l.includes(" — ")));
});

test("three directions come back cleaned, titled, and no more than three", () => {
  const d = W.normalizeDirections({ directions: [
    { title: "  Harbor   dawn ", look: "  Thirty, salt-grey hair,\n a coat too big. " },
    { title: "", look: "Forty, sharp bob, a red scarf." },
    { title: "x", look: "" },
    { title: "Four", look: "ok" }, { title: "Five", look: "ok" },
  ] });
  assert.equal(d.length, 3);
  assert.deepEqual(d[0], { title: "Harbor dawn", look: "Thirty, salt-grey hair, a coat too big." });
  assert.equal(d[1].title, "look 2");
  assert.equal(d[2].title, "Four");
  assert.deepEqual(W.normalizeDirections({}), []);
  assert.deepEqual(W.normalizeDirections(null), []);
});

test("the directions ask carries the card and what's known of how they look", () => {
  const m = W.directionsMessages({ name: "Odile", tagline: "keeps the light", persona: "You are Odile.", look: { description: "tall, grey coat" } });
  assert.equal(m[0].role, "system");
  assert.match(m[1].content, /Odile/);
  assert.match(m[1].content, /How they look so far: tall, grey coat/);
  assert.match(W.directionsMessages({ name: "X", look: {} })[1].content, /invent them/);
});

test("a card from an idea is a valid Havre card with how they look on it", () => {
  const o = { name: "Marguerite Vale", tagline: "the harbor's last cartographer", greeting: "Oh. You again.\n\nSit.", persona: "You are Marguerite, a cartographer who maps what the sea takes back.",
    examples: [{ user: "hi", character: "hm." }], tags: ["maps", "sea"], look: "Fifties, ink-stained fingers, a coat with too many pockets." };
  const c = W.cardFromIdea(o, { model: "zai-org-glm-5-2" });
  assert.deepEqual(validateCard(c), []);
  assert.equal(c.name, "Marguerite Vale");
  assert.equal(c.look.description, "Fifties, ink-stained fingers, a coat with too many pockets.");
  assert.equal(c.model, "zai-org-glm-5-2");
  assert.equal(c.lineage.length, 0);
  assert.equal(c.voice.short_form, true);
});

test("the idea schema is the writer's schema plus a look", () => {
  assert.ok(W.IDEA_SCHEMA.required.includes("look"));
  assert.ok(W.IDEA_SCHEMA.required.includes("persona"));
  const m = W.ideaMessages("a shy rapper", "Lone");
  assert.match(m[1].content, /"idea": "a shy rapper"/);
  assert.match(m[1].content, /"name": "Lone"/);
  assert.doesNotMatch(W.ideaMessages("x")[1].content, /"name"/);
});

test("/photoshoot takes a count first, then a brief; the count stays between 1 and 6", () => {
  assert.deepEqual(W.parseShoot(""), { count: 3, brief: "" });
  assert.deepEqual(W.parseShoot("5 at the harbor at dusk"), { count: 5, brief: "at the harbor at dusk" });
  assert.deepEqual(W.parseShoot("at the harbor"), { count: 3, brief: "at the harbor" });
  assert.deepEqual(W.parseShoot("12"), { count: 6, brief: "" });
  assert.deepEqual(W.parseShoot("0 rain"), { count: 3, brief: "rain" });
  assert.deepEqual(W.parseShoot("2024 vibes"), { count: 3, brief: "2024 vibes" });
});

test("a shoot is asked with the single photo's rules, for several shots as JSON", () => {
  const sys = "You write the shot for a photo. Rules here. Reply with the shot only.";
  const m = W.shootMessages({ name: "Ines", tagline: "ferry pilot", look: { description: "red braid" } }, sys, { count: 4, brief: "fog", lines: ["Them: hi", "Ines: hey"] });
  assert.match(m[0].content, /^You write the shot for a photo\. Rules here\. Write 4 different shots/);
  assert.doesNotMatch(m[0].content, /Reply with the shot only/);
  assert.match(m[1].content, /How they look: red braid/);
  assert.match(m[1].content, /Ines: hey/);
  assert.match(m[1].content, /The shoot: fog/);
  assert.match(W.shootMessages({ name: "X" }, sys, { count: 99 })[0].content, /Write 6 different shots/);
});

test("shots come back cleaned and no more than asked", () => {
  const s = W.normalizeShots({ shots: [{ title: " Dawn  deck ", shot: " She leans\n on the rail. " }, { title: "", shot: "Rain." }, { title: "x", shot: "" }, { title: "y", shot: "z" }] }, 2);
  assert.deepEqual(s, [{ title: "Dawn deck", shot: "She leans on the rail." }, { title: "shot 2", shot: "Rain." }]);
  assert.deepEqual(W.normalizeShots(null), []);
});
