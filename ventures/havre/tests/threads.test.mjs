// node --test tests/*.test.mjs: your chats, as data. Several threads at once, kept in step between tabs.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../threads.js";

const H = 3600e3, now = Date.parse("2026-10-16T20:00:00Z");
const u = (content, at, extra = {}) => ({ id: "u" + at, role: "user", content, at, ...extra });
const a = (content, at, extra = {}) => ({ id: "a" + at, role: "assistant", content, at, ...extra });

test("the list: the latest first, a name or the first thing you said, the last line, what's new", () => {
  const ts = [{ id: "x", card: "sable", at: 5, created: 1 }, { id: "y", card: "wren", at: 9, created: 2 }, { id: "z", card: "sable", at: 5, created: 3 }];
  assert.deepEqual(T.byLatest(ts).map((t) => t.id), ["y", "z", "x"]);
  assert.equal(T.latestOf([{ id: "x", card: "sable", at: 9, read: 1 }, { id: "z", card: "sable", at: 5, read: 7 }], "sable").id, "z", "the one you looked at last");
  assert.equal(T.latestOf(ts, "nobody"), null);
  const msgs = [u("[Start the conversation]", 1, { hidden: true }), a("Hi.", 2), u("Do you   have\na boat?", 3), a("Ask me again after the tide.", 4)];
  assert.equal(T.titleOf({ title: "" }, msgs), "Do you have a boat?");
  assert.equal(T.titleOf({ title: " Harbor talk " }, msgs), "Harbor talk");
  assert.equal(T.titleOf({}, [a("Hi.", 2)]), "", "nothing said yet, no title");
  assert.equal(T.titleOf({}, [u("", 2, { media: { kind: "voice-in" } })]), "a voice note");
  assert.equal(T.snippet(msgs), "Ask me again after the tide.");
  assert.equal(T.snippet([...msgs, u("ok", 5)]), "you: ok");
  assert.equal(T.snippet([a("", 6, { media: { kind: "photo" } })]), "a photo");
  assert.equal(T.snippet([a("x ".repeat(100), 6)], 20).length <= 20, true);
  assert.equal(T.unread({ read: 2 }, msgs), 1);
  assert.equal(T.unread({ read: 0 }, msgs), 2, "a hidden opener isn't something they said");
  assert.deepEqual([T.ago(now - 20e3, now), T.ago(now - 5 * 60e3, now), T.ago(now - 3 * H, now), T.ago(now - 50 * H, now), T.ago(0, now)],
    ["now", "5m", "3h", "2d", ""]);
  assert.equal(T.anyShown(msgs), true);
  assert.equal(T.anyShown([u("[Start the conversation]", 1, { hidden: true })]), false, "a hello still on its way isn't anything said");
  assert.equal(T.anyShown([a("", 2, { media: { kind: "photo" } })]), true);
  assert.deepEqual(T.fromMessages("t9", "wren", msgs, now), { id: "t9", card: "wren", title: "", titled: 0, created: 1, at: 4, read: 4 },
    "a thread the list lost comes back from its messages, with nothing new in it");
  assert.deepEqual(T.fromMessages("t9", "wren", [], now), { id: "t9", card: "wren", title: "", titled: 0, created: now, at: now, read: now });
});

test("two tabs: messages merge by id in time order, a voice note comes along, what was taken back stays out", () => {
  const mine = [u("hi", 1), a("Hey.", 2)];
  const theirs = [u("hi", 1), a("Hey.", 2, { voice: { id: "v" } }), u("you there?", 3), a("Here.", 4), u("[hello]", 5, { hidden: true, id: "gone" })];
  assert.equal(T.mergeMessages(mine, theirs, new Set(["gone"])), true);
  assert.deepEqual(mine.map((m) => m.id), ["u1", "a2", "u3", "a4"]);
  assert.deepEqual(mine[1].voice, { id: "v" });
  assert.equal(T.mergeMessages(mine, theirs, new Set(["gone"])), false, "nothing new the second time");
  const index = { t1: { id: "t1", card: "sable", at: 5, read: 5, title: "", titled: 0 }, t2: { id: "t2", card: "wren", at: 1, read: 1 } };
  const r = T.mergeIndex(index, {
    t1: { id: "t1", card: "sable", at: 9, read: 3, title: "Boats", titled: 7 },
    t3: { id: "t3", card: "_plain", at: 4, read: 4, msgs: ["not here"] },
    t4: { id: "t4", card: "x", at: 1 }, bad: { id: "other", card: "x" },
  }, { t2: 10, t4: 10 });
  assert.deepEqual(r, { added: ["t3"], changed: ["t1"], removed: ["t2"] });
  assert.deepEqual([index.t1.at, index.t1.read, index.t1.title], [9, 5, "Boats"], "the latest activity, the latest look, the later name");
  assert.ok(!("msgs" in index.t3), "only what goes in the list");
  assert.deepEqual(Object.keys(index).sort(), ["t1", "t3"]);
  assert.deepEqual(T.pruneGone({ old: now - 40 * 24 * H, new: now - H, bad: "x" }, now), { new: now - H });
});

test("the first store, one conversation per character, becomes threads, and coming back again merges", () => {
  const old = {
    sable: [{ role: "user", content: "[Start]", hidden: true }, { role: "assistant", content: "Hi." }, { role: "user", content: "hi" }, { role: "user", content: "hi" }],
    wren: [{ id: "w1", role: "user", content: "Ahoy", at: 100 }, { id: "w2", role: "assistant", content: "Ahoy yourself.", at: 200 }],
    empty: [], quiet: [{ role: "user", content: "[Start]", hidden: true }], broken: "junk",
  };
  let n = 0;
  const first = T.migrate(old, { newId: () => "t" + ++n, now });
  assert.deepEqual(first.threads.map((t) => [t.card, t.id]), [["sable", "t1"], ["wren", "t2"]], "a thread for each conversation with something said in it");
  assert.deepEqual(first.into, { sable: "t1", wren: "t2" });
  const w = first.threads[1];
  assert.deepEqual([w.created, w.at, w.read], [100, 200, now]);
  const ids = first.messages.t1.map((m) => m.id);
  assert.equal(new Set(ids).size, 4, "every message has its own id, even two that say the same thing");
  assert.ok(ids.every((id) => /^v1/.test(id)));
  assert.deepEqual(first.messages.t2.map((m) => m.id), ["w1", "w2"], "ids they had stay");
  // a tab on the old page writes the same conversations again, with one more message
  const again = T.migrate({ ...old, sable: [...old.sable, { role: "assistant", content: "Twice?" }] }, { newId: () => "t" + ++n, now, into: first.into });
  assert.deepEqual(again.threads.map((t) => t.id), ["t1", "t2"], "the same threads");
  const merged = first.messages.t1.slice();
  assert.equal(T.mergeMessages(merged, again.messages.t1), true);
  assert.deepEqual(merged.map((m) => m.content), ["[Start]", "Hi.", "hi", "hi", "Twice?"], "nothing doubled, the new one in");
});

test("texting first: after a quiet spell, when you said the last real thing, once, one chat per character", () => {
  const msgs = [u("hi", now - 9 * H), a("Hey.", now - 8 * H)];
  assert.equal(T.readyToTextFirst(msgs, { now }), true);
  assert.equal(T.readyToTextFirst(msgs, { now: now - 3 * H }), false, "not quiet long enough");
  assert.equal(T.readyToTextFirst(msgs, { now, tried: now - H }), false, "once a quiet spell");
  assert.equal(T.readyToTextFirst([...msgs, u("[Time passes]", now - 7 * H, { hidden: true }), a("You're back!", now - 7 * H)], { now }), false,
    "they texted first and you haven't answered: they wait");
  assert.equal(T.readyToTextFirst([u("[Start]", now - 9 * H, { hidden: true }), a("Hi!", now - 9 * H)], { now }), false, "nor after a hello you never answered");
  assert.equal(T.readyToTextFirst([...msgs, u("[Start]", now - H, { hidden: true })], { now }), false, "something of theirs on its way");
  assert.equal(T.readyToTextFirst([u("hi", 0, { demo: true }), a("Hey.", 0, { demo: true })], { now }), false, "nothing real said");
  assert.equal(T.readyToTextFirst([{ role: "user", content: "old" }, { role: "assistant", content: "no times" }], { now }), false);
  const threads = [
    { id: "s1", card: "sable", at: now - 8 * H }, { id: "s0", card: "sable", at: now - 20 * H },
    { id: "w1", card: "wren", at: now - 10 * H }, { id: "p1", card: "_plain", at: now - 7 * H },
    { id: "r1", card: "ro", at: now - 30 * H }, { id: "q1", card: "quiet", at: now - H },
  ];
  const quiet = { s1: msgs, s0: msgs, w1: msgs, p1: msgs, r1: msgs, q1: [u("hi", now - H)] };
  const pick = (opts) => T.textFirst(threads, (t) => quiet[t.id], { now, ...opts }).map((t) => t.id);
  assert.deepEqual(pick(), ["s1", "w1", "r1"], "the latest chat with each character; not the plain chat; not one that's still lively");
  assert.deepEqual(pick({ skip: "s1" }), ["w1", "r1"], "the open chat is taken care of apart, and not by an older one of theirs");
  assert.deepEqual(pick({ max: 1, tried: { s1: now - H } }), ["w1"]);
});
