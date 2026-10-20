import { test } from "node:test";
import assert from "node:assert/strict";
import * as B from "../backup.js";
import * as R from "../memory.js";
import { normalizeCard } from "../card.js";

const ines = normalizeCard({ name: "Ines Corbel", persona: "You are Ines." });
const wren = normalizeCard({ name: "Wren", persona: "You are Wren." });
const threads = [
  { id: "t1", card: "ines-corbel", msgs: [{ id: "a", role: "user", content: "hi" }, { id: "b", role: "assistant", content: "", media: { kind: "photo", id: "p1" } }] },
  { id: "t2", card: "wren", msgs: [{ id: "c", role: "assistant", content: "", media: { kind: "photo", id: "p2" } }] },
];
const media = { p1: "data:image/webp;base64,AAAA", p2: "data:image/webp;base64,BBBB", p9: "data:image/webp;base64,CCCC" };

test("one character's bundle holds their card, memory, chats and only those chats' pictures", () => {
  const mem = { notes: [R.note("They hate fog.", { at: 5 })], upTo: { t1: "b" }, at: 5 };
  const b = B.bundleOne(ines, { memory: mem, threads, media, at: 9 });
  assert.equal(b.havre_backup, 1);
  assert.deepEqual(b.cards.map((c) => c.id), ["ines-corbel"]);
  assert.deepEqual(Object.keys(b.memory), ["ines-corbel"]);
  assert.deepEqual(b.threads.map((t) => t.id), ["t1"]);
  assert.deepEqual(Object.keys(b.media), ["p1"]);
  assert.equal(B.bundleName(ines), "ines-corbel.havre-full.json");
  assert.match(B.bundleName(null, Date.UTC(2026, 9, 20)), /^havre-backup-2026-10-20\.json$/);
});

test("the whole harbor: everything, and the settings, never a key", () => {
  const b = B.bundleAll({ cards: [ines, wren], memory: {}, threads, media, settings: { abilities: { own: true } } });
  assert.equal(b.cards.length, 2);
  assert.equal(b.threads.length, 2);
  assert.deepEqual(Object.keys(b.media).sort(), ["p1", "p2", "p9"]);
  assert.deepEqual(b.settings, { abilities: { own: true } });
  assert.ok(!JSON.stringify(b).includes("key"));
});

test("a bundle reads back safely, and anything else is not one", () => {
  assert.equal(B.readBundle({ cards: [] }), null);
  assert.equal(B.readBundle("x"), null);
  const b = B.readBundle(JSON.parse(JSON.stringify(B.bundleOne(ines, { memory: { notes: ["old"], upTo: {}, at: 1 }, threads, media }))));
  assert.equal(b.cards[0].name, "Ines Corbel");
  assert.deepEqual(b.memory["ines-corbel"].notes.map((n) => n.text), ["old"]);
  assert.equal(b.threads.length, 1);
  assert.deepEqual(Object.keys(b.media), ["p1"]);
  assert.equal(b.settings, null);
  const junk = B.readBundle({ havre_backup: 1, cards: [{ name: "X" }, null, 3], threads: [{ id: "t", card: "x", msgs: [{ role: "system" }, { role: "user", content: "k" }] }, {}], media: { ok: "data:image/png;base64,AA", bad: "javascript:x" } });
  assert.equal(junk.cards.length, 1);
  assert.equal(junk.threads.length, 1);
  assert.equal(junk.threads[0].msgs.length, 1);
  assert.deepEqual(Object.keys(junk.media), ["ok"]);
});

test("restoring merges: cards already there stay, notes are appended, chats by id are added if missing", () => {
  const b = B.readBundle(B.bundleAll({ cards: [ines, wren], memory: { "ines-corbel": { notes: [R.note("new", { at: 3 })], upTo: { t1: "b" }, at: 3 } }, threads, media }));
  const m = B.merge(b, { cards: [ines], memory: { "ines-corbel": { notes: [R.note("old", { at: 1 })], upTo: { t5: "z" }, at: 1 } }, threads: { t1: {} } });
  assert.deepEqual(m.addCards.map((c) => c.id), ["wren"]);
  assert.equal(m.skippedCards, 1);
  assert.deepEqual(m.memory["ines-corbel"].notes.map((n) => n.text), ["old", "new"]);
  assert.deepEqual(m.memory["ines-corbel"].upTo, { t1: "b", t5: "z" });
  assert.deepEqual(m.addThreads.map((t) => t.id), ["t2"]);
  assert.equal(m.skippedThreads, 1);
});
