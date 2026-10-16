// node --test tests/*.test.mjs   (Node 20+; no dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../memory.js";
import * as C from "../card.js";

const ines = C.normalizeCard({ name: "Ines Corbel", tagline: "Ferry pilot with a pencil behind her ear", persona: "You are Ines Corbel." });
const chat = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ id: "m" + (from + i), role: (from + i) % 2 ? "assistant" : "user", content: "line " + (from + i), at: 1000 + i }));

test("what a chat holds that the memory hasn't read: after the last message it read, without nudges or replies made without a key", () => {
  const h = [...chat(6), { id: "x", role: "user", content: "[Time passes]", hidden: true }, { id: "d", role: "assistant", content: "demo", demo: true }, ...chat(4, 6)];
  assert.equal(R.unread(h).length, 10, "everything, the first time");
  assert.deepEqual(R.unread(h, "m5").map((m) => m.id), ["m6", "m7", "m8", "m9"]);
  assert.equal(R.unread(h, "gone").length, 10, "if the message it read last is gone, all of it");
  assert.equal(R.unread(h, "m9").length, 0);
  assert.ok(!R.due(chat(R.EVERY - 1)) && R.due(chat(R.EVERY)), "a dozen messages between updates");
  assert.ok(!R.due(chat(20), "m10"), "nine since the last update isn't enough");
});

test("the model reads the character, what they remembered, and the messages since, as lines", () => {
  const lines = R.transcript(ines, [
    { id: "a", role: "user", content: "hi,\n\nI'm Princess" },
    { id: "b", role: "assistant", content: "", media: { kind: "photo", shot: "the ferry deck at dawn" } },
    { id: "c", role: "user", content: "nice", media: { kind: "photo-in", saw: "a red boat" } },
    { id: "d", role: "assistant", content: "Twelve minutes.\n\nNine if the gulls cooperate." },
  ]);
  assert.deepEqual(lines, ["Them: hi, I'm Princess", "Ines Corbel: (sent a photo: the ferry deck at dawn)", "Them: [a photo: a red boat] nice",
    "Ines Corbel: Twelve minutes. Nine if the gulls cooperate."]);
  const [sys, user] = R.memoryMessages(ines, ["They hate fog."], lines);
  assert.equal(sys.content, R.MEMORY_SYSTEM);
  assert.match(sys.content, /never invent/);
  assert.match(user.content, /^The character: Ines Corbel\. Ferry pilot/);
  assert.match(user.content, /What they remember so far:\n- They hate fog\./);
  assert.match(user.content, /The latest messages, oldest first:\nThem: hi, I'm Princess/);
  assert.match(R.memoryMessages(ines, [], lines)[1].content, /What they remember so far: nothing yet\./);
});

test("notes come back short, distinct and at most sixteen; a reply without a list, or one that lost everything, keeps the old", () => {
  assert.deepEqual(R.normalizeNotes({ notes: [" - They're called Princess. ", "they're called princess.", "", 7, "1. I grew up in Brest."] }),
    ["They're called Princess.", "7", "I grew up in Brest."]);
  assert.equal(R.normalizeNotes({ nope: [] }), null);
  assert.equal(R.normalizeNotes({ notes: Array.from({ length: 40 }, (_, i) => "note " + i) }).length, R.MAX_NOTES);
  assert.ok(R.normalizeNotes({ notes: ["x".repeat(900)] })[0].length <= 240);
  assert.deepEqual(R.merged(["a"], ["b"]), ["b"]);
  assert.equal(R.merged(["a"], []), null, "an empty list when there were notes is a reply gone wrong");
  assert.deepEqual(R.merged([], []), []);
  assert.equal(R.merged(["a"], null), null);
});

test("a memory as kept reads safely, and a note you add goes first, once", () => {
  assert.deepEqual(R.readMemory(null), { notes: [], upTo: {}, at: 0 });
  assert.deepEqual(R.readMemory({ notes: ["a", "a", 3], upTo: { t1: "m4", t2: 5 }, at: "12" }), { notes: ["a", "3"], upTo: { t1: "m4" }, at: 12 });
  assert.deepEqual(R.withNote(["They hate fog.", "b"], "b"), ["b", "They hate fog."]);
  assert.deepEqual(R.withNote(["a"], "   "), ["a"]);
  assert.equal(R.withNote(Array.from({ length: R.MAX_NOTES }, (_, i) => "n" + i), "new").length, R.MAX_NOTES);
});

test("what they remember rides in their system prompt", () => {
  const p = C.systemPrompt(ines, { memory: R.readMemory({ notes: ["They're called Princess."] }).notes });
  assert.match(p, /What you remember from your chats with them so far[^\n]*\n- They're called Princess\./);
});
