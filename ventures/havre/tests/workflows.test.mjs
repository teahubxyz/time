import { test } from "node:test";
import assert from "node:assert/strict";
import * as W from "../workflows.js";
import { validateCard } from "../card.js";

test("every workflow has a command, doors and a usage line", () => {
  for (const w of W.WORKFLOWS) {
    assert.ok(w.id && w.command && w.title && w.about && w.usage, w.id);
    assert.ok(w.doors.length >= 1, w.id);
    assert.equal(W.byId(w.id), w);
    assert.equal(W.byCommand(w.command), w);
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
