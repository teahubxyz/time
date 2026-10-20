// node --test tests/*.test.mjs   (Node 20+; no dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../memory.js";
import * as C from "../card.js";

const ines = C.normalizeCard({ name: "Ines Corbel", tagline: "Ferry pilot with a pencil behind her ear", persona: "You are Ines Corbel." });
const chat = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ id: "m" + (from + i), role: (from + i) % 2 ? "assistant" : "user", content: "line " + (from + i), at: 1000 + i }));
const DAY = 86400e3, NOW = 1_800_000_000_000;

test("what a chat holds that the memory hasn't read: after the last message it read, without nudges or replies made without a key", () => {
  const h = [...chat(6), { id: "x", role: "user", content: "[Time passes]", hidden: true }, { id: "d", role: "assistant", content: "demo", demo: true }, ...chat(4, 6)];
  assert.equal(R.unread(h).length, 10, "everything, the first time");
  assert.deepEqual(R.unread(h, "m5").map((m) => m.id), ["m6", "m7", "m8", "m9"]);
  assert.equal(R.unread(h, "gone").length, 10, "if the message it read last is gone, all of it");
  assert.equal(R.unread(h, "m9").length, 0);
  assert.ok(!R.due(chat(R.EVERY - 1)) && R.due(chat(R.EVERY)), "a dozen messages between updates");
  assert.ok(!R.due(chat(20), "m10"), "nine since the last update isn't enough");
});

test("the model reads the character, what they remembered, and the messages since, and is asked for what is new", () => {
  const lines = R.transcript(ines, [
    { id: "a", role: "user", content: "hi,\n\nI'm Princess" },
    { id: "b", role: "assistant", content: "", media: { kind: "photo", shot: "the ferry deck at dawn" } },
    { id: "c", role: "user", content: "nice", media: { kind: "photo-in", saw: "a red boat" } },
    { id: "d", role: "assistant", content: "Twelve minutes.\n\nNine if the gulls cooperate." },
  ]);
  assert.deepEqual(lines, ["Them: hi, I'm Princess", "Ines Corbel: (sent a photo: the ferry deck at dawn)", "Them: [a photo: a red boat] nice",
    "Ines Corbel: Twelve minutes. Nine if the gulls cooperate."]);
  const [sys, user] = R.memoryMessages(ines, [R.note("They hate fog.")], lines);
  assert.equal(sys.content, R.MEMORY_SYSTEM);
  assert.match(sys.content, /never invent/);
  assert.match(sys.content, /never repeat what they remembered before/);
  assert.match(user.content, /^The character: Ines Corbel\. Ferry pilot/);
  assert.match(user.content, /What they remember so far:\n- They hate fog\./);
  assert.match(user.content, /The latest messages, oldest first:\nThem: hi, I'm Princess/);
  assert.match(R.memoryMessages(ines, [], lines)[1].content, /What they remember so far: nothing yet\./);
});

test("new notes come back short, distinct, dated, not ones already kept, and at most sixteen", () => {
  const have = [R.note("I grew up in Brest.", { at: 5 })];
  const n = R.normalizeNotes({ notes: [" - They're called Princess. ", "they're called princess.", "", 7, "1. I grew up in Brest."] }, R.MAX_NOTES, { at: 99, have });
  assert.deepEqual(n, [{ text: "They're called Princess.", at: 99, kind: "fact" }, { text: "7", at: 99, kind: "fact" }]);
  assert.equal(R.normalizeNotes({ nope: [] }), null);
  assert.equal(R.normalizeNotes({ notes: Array.from({ length: 40 }, (_, i) => "note " + i) }).length, R.MAX_NOTES);
  assert.ok(R.normalizeNotes({ notes: ["x".repeat(900)] })[0].text.length <= 240);
});

test("notes are appended, never twice, and the store rolls the oldest ordinary notes off, never yours or a reminder", () => {
  const a = R.note("a", { at: 1 }), b = R.note("b", { at: 2 });
  assert.deepEqual(R.appended([a], [b, R.note("A", { at: 3 })]).map((n) => n.text), ["a", "b"], "the same note in other case isn't added again");
  assert.equal(R.appended([a], null), null);
  const mine = R.note("keep", { at: 0, kind: "mine" }), rem = R.note("call mum", { at: 0, until: 10 });
  const many = [mine, rem, ...Array.from({ length: 5 }, (_, i) => R.note("f" + i, { at: i }))];
  assert.deepEqual(R.appended(many, [R.note("f9", { at: 9 })], 5).map((n) => n.text), ["keep", "call mum", "f3", "f4", "f9"]);
});

test("a memory as kept reads safely, old bare strings included, and a note you add is yours", () => {
  assert.deepEqual(R.readMemory(null), { notes: [], upTo: {}, at: 0 });
  const m = R.readMemory({ notes: ["a", "a", 3, { text: "b", at: 7, kind: "remind", until: 9, from: { thread: "t", msg: "m" } }, { text: "", at: 1 }], upTo: { t1: "m4", t2: 5 }, at: "12" });
  assert.deepEqual(m, { notes: [{ text: "a", at: 12, kind: "fact" }, { text: "3", at: 12, kind: "fact" }, { text: "b", at: 7, kind: "remind", until: 9, from: { thread: "t", msg: "m" } }], upTo: { t1: "m4" }, at: 12 });
  const w = R.withNote([R.note("They hate fog.", { at: 1 })], "b", { at: 2 });
  assert.deepEqual(w.map((n) => [n.text, n.kind]), [["They hate fog.", "fact"], ["b", "mine"]]);
  assert.equal(R.withNote([R.note("a")], "   ").length, 1);
  assert.equal(R.without(w, "b").length, 1);
});

test("what rides in the prompt: the newest within the budget, a reminder as its time nears, what was just recalled", () => {
  const old = Array.from({ length: 30 }, (_, i) => R.note("fact " + i, { at: NOW - (30 - i) * DAY }));
  const s = R.select(old, { now: NOW });
  assert.equal(s.length, R.SHORT);
  assert.equal(s[0].text, "fact 29", "newest first");
  assert.ok(!s.some((n) => n.text === "fact 0"), "the oldest is out");
  const far = R.note("they're moving in three months", { at: NOW - DAY, until: NOW + 90 * DAY });
  const soon = R.note("they're going to the store", { at: NOW - DAY, until: NOW + 3 * 3600e3 });
  const over = R.note("dentist", { at: NOW - 10 * DAY, until: NOW - 5 * DAY });
  const s2 = R.select([...old, far, soon, over], { now: NOW });
  assert.equal(s2[0].text, soon.text, "a reminder whose time is near comes first");
  assert.ok(!s2.some((n) => n.text === far.text), "one three months off isn't in mind yet");
  assert.ok(!s2.some((n) => n.text === over.text), "one long past is gone");
  assert.ok(R.salience(far, NOW) > 0 && R.salience(far, NOW) < R.salience(old[0], NOW), "but it has a faint claim");
  assert.ok(R.salience(far, NOW + 90 * DAY - 3600e3) > 0.9, "and a strong one when its time comes");
  const tiny = R.select(old, { now: NOW, budget: 30 });
  assert.equal(tiny.length, 3, "the budget caps it");
  assert.match(R.lines([soon, far], NOW)[0], /^\(today\) they're going to the store$/);
  assert.match(R.lines([far], NOW)[0], /^\(in 90 days\)/);
});

test("recall searches notes and chats by words, and what it found stays in mind for a while", () => {
  const notes = [R.note("I grew up in Brest, by the sea.", { at: 1 }), R.note("They hate fog.", { at: 2 }), R.note("Their sister is called Maud.", { at: 3 })];
  assert.deepEqual(R.search(notes, "what was their sister's name?").map((n) => n.text), ["Their sister is called Maud."]);
  assert.deepEqual(R.search(notes, "brest").map((n) => n.text), ["I grew up in Brest, by the sea."]);
  assert.deepEqual(R.search(notes, "um"), []);
  const threads = [{ id: "t1" }, { id: "t2" }];
  const msgs = { t1: [{ id: "a", role: "user", content: "my sister Maud is visiting", at: 5 }, { id: "h", role: "user", content: "Maud again", hidden: true }], t2: [{ id: "b", role: "assistant", content: "Tell Maud hello from me", at: 9 }] };
  const deep = R.searchDeep(threads, (t) => msgs[t.id], "Maud");
  assert.deepEqual(deep.map((d) => d.msg), ["b", "a"]);
  const after = R.recalled(notes, { found: R.search(notes, "sister"), deep: deep.slice(0, 1) }, NOW);
  assert.equal(after.length, 4);
  assert.equal(after[2].seen, NOW);
  assert.equal(after[3].kind, "recalled");
  assert.match(after[3].text, /^I said: Tell Maud hello from me$/);
  const s = R.select(after, { now: NOW + 1000 });
  assert.deepEqual(s.slice(0, 2).map((n) => n.text).sort(), ["I said: Tell Maud hello from me", "Their sister is called Maud."].sort(), "both come to mind first");
  assert.equal(R.salience(after[3], NOW + R.RECALLED_FOR + 1), 0, "a recalled line fades back out");
  assert.ok(R.salience(after[2], NOW + R.RECALLED_FOR + 1) > 0, "a note stays a note");
});

test("a time from plain words", () => {
  const now = new Date(2026, 9, 19, 15, 0).getTime();     // a Monday, 3pm
  const at = (t) => new Date(t);
  assert.equal(R.parseWhen("tomorrow", now), new Date(2026, 9, 20, 10, 0).getTime());
  assert.equal(at(R.parseWhen("in 3 days", now)).getDate(), 22);
  assert.equal(at(R.parseWhen("2 weeks", now)).getDate(), 2);
  assert.equal(at(R.parseWhen("friday", now)).getDay(), 5);
  assert.equal(at(R.parseWhen("monday", now)).getDate(), 26, "next Monday, not today");
  assert.equal(R.parseWhen("2026-11-01", now), new Date(2026, 10, 1, 10, 0).getTime());
  assert.equal(R.parseWhen("in 2 hours", now), now + 2 * 3600e3);
  assert.equal(R.parseWhen("whenever", now), null);
});

test("what they remember rides in their system prompt", () => {
  const p = C.systemPrompt(ines, { memory: R.lines(R.select(R.readMemory({ notes: ["They're called Princess."] }).notes)) });
  assert.match(p, /What you remember from your chats with them so far[^\n]*\n- They're called Princess\./);
});
