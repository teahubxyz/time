// memory.js: what a character remembers of your chats with them. Pure functions, no DOM: the page imports this
// module, and so do the tests (node --test).
//
// Three tiers, one ladder:
//
//   deep    every message of every chat with them, as they are (threads.js): never read whole, searched
//   long    notes: { text, at, kind, from?, until? }. Every note ever written, dated, never pruned. A character's
//           model writes them every dozen messages (notes from the messages since: facts); "remember this" adds
//           one by hand, verbatim; "remind" adds one with an `until`, a time it should come back to mind
//   short   what rides in the prompt: a few hundred tokens' worth of long, chosen each turn by select() below:
//           the newest notes, a reminder as its time nears, what was recalled. That is the one seam a memory
//           strategy plugs into: everything else is a store and a writer.
//
//   a memory   { notes: [note], upTo: { <chat id>: <message id> }, at }
//
// One per character, kept in the browser with your chats and never in their card: a card you export or share
// carries none of it. Notes older than the store keeps (KEEP) roll off the end, oldest ordinary first; a note with a
// time (a reminder) or one you added yourself stays as long as it can.

const str = (v, max = 20000) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
const clip = (s, n) => (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)).replace(/\s+\S*$/, "") + "…");
const arr = (v) => (Array.isArray(v) ? v : []);

/** notes the store keeps, at most: well past what one person says to one character in a year */
export const KEEP = 600;
/** the most notes a model is asked to write from one batch of messages */
export const MAX_NOTES = 16;
/** notes in the prompt, at most, within the token budget */
export const SHORT = 16;
/** the budget for notes in the prompt, in characters (a few hundred tokens) */
export const BUDGET = 2400;
/** messages in a chat (yours and theirs) between one writing of notes and the next */
export const EVERY = 12;
/** a chat you leave with at least this many messages it hasn't read is read then, so a new chat picks up from it */
export const LEAVING = 4;
/** how long a recalled note stays in mind */
export const RECALLED_FOR = 3 * 3600e3;
/** a reminder comes to mind this long before its time */
export const AHEAD = 36 * 3600e3;
/** and stays this long after */
export const AFTER = 48 * 3600e3;

export const KINDS = ["fact", "mine", "remind", "recalled", "dream"];

export const MEMORY_SYSTEM = "You keep the memory of a character in a chat app: what they remember of their chats with one " +
  "person. From what they remembered before and the latest messages, write down what is new to remember, as short " +
  "notes: what the person has told them about themselves (their name, their life, what they like and don't), what has " +
  "happened between them, plans and promises, running jokes, and what the character has said about themselves (their " +
  "past, their home, their likes), so they keep to it. Write about the person as \"they\" and the character as \"I\". " +
  "Only what the latest messages add or change: never repeat what they remembered before, never invent anything, " +
  "and leave out small talk. At most " + MAX_NOTES + " notes, the most important first, each under 25 words; none " +
  "if nothing new was said. Reply with one JSON object: {\"notes\": [\"...\"]}.";

export const MEMORY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["notes"],
  properties: { notes: { type: "array", items: { type: "string" } } },
};

// ---------- notes ----------

const noteText = (v) => clip(str(v, 2000).replace(/\s+/g, " ").trim().replace(/^(?:[-•*]|\d+[.)])\s*/, ""), 240);

/** a note as kept, from whatever was stored (a bare string from before notes had dates reads as an undated fact) */
export function readNote(n, at = 0) {
  if (typeof n === "string" || typeof n === "number") { const text = noteText(n); return text ? { text, at, kind: "fact" } : null; }
  if (!n || typeof n !== "object") return null;
  const text = noteText(n.text);
  if (!text) return null;
  const note = { text, at: Number(n.at) || at, kind: KINDS.includes(n.kind) ? n.kind : "fact" };
  if (n.from && typeof n.from === "object" && n.from.thread && n.from.msg) note.from = { thread: str(n.from.thread, 80), msg: str(n.from.msg, 80) };
  if (Number(n.until) > 0) note.until = Number(n.until);
  if (Number(n.seen) > 0) note.seen = Number(n.seen);
  return note;
}

/** a new note: what the model wrote (a fact), what you added ("mine"), or a reminder with its time */
export function note(text, { at = Date.now(), kind = "fact", from, until } = {}) {
  return readNote({ text, at, kind: until ? "remind" : kind, from, until });
}

/**
 * The model's reply, as new notes: short, distinct, at most `max`, none already in `have`; null when there is no
 * list at all (a reply that went wrong). at: when they were written.
 */
export function normalizeNotes(o, max = MAX_NOTES, { at = Date.now(), have = [] } = {}) {
  const list = Array.isArray(o) ? o : o && Array.isArray(o.notes) ? o.notes : null;
  if (!list) return null;
  const seen = new Set(have.map((n) => (typeof n === "string" ? n : n.text).toLowerCase())), out = [];
  for (const n of list) {
    const t = noteText(n), k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push({ text: t, at, kind: "fact" });
    if (out.length >= max) break;
  }
  return out;
}

/** a memory as kept, made safe to use: an empty one if there is none */
export function readMemory(m) {
  const o = m && typeof m === "object" ? m : {};
  const upTo = {};
  for (const [k, v] of Object.entries(o.upTo && typeof o.upTo === "object" ? o.upTo : {})) if (typeof v === "string" && v) upTo[k] = v;
  const at = Number(o.at) || 0, seen = new Set(), notes = [];
  for (const raw of arr(o.notes)) {
    const n = readNote(raw, at);
    if (!n || seen.has(n.text.toLowerCase())) continue;
    seen.add(n.text.toLowerCase());
    notes.push(n);
  }
  return { notes, upTo, at };
}

/**
 * Notes added to the store: new ones on the end (the store reads oldest first), none twice, and when it's past what
 * it keeps, the oldest ordinary notes go, never a reminder or one you added. null: nothing to add.
 */
export function appended(notes, added, keep = KEEP) {
  if (!added) return null;
  const have = new Set(notes.map((n) => n.text.toLowerCase()));
  const fresh = added.filter((n) => n && n.text && !have.has(n.text.toLowerCase()));
  let all = [...notes, ...fresh];
  while (all.length > keep) {
    const i = all.findIndex((n) => !n.until && n.kind !== "mine" && n.kind !== "remind");
    if (i < 0) break;
    all = [...all.slice(0, i), ...all.slice(i + 1)];
  }
  return all;
}

/** a note you give them yourself: added as yours, once */
export function withNote(notes, text, opts = {}) {
  const n = note(text, { ...opts, kind: opts.kind || "mine" });
  return n ? appended(notes, [n]) : notes;
}

/** the notes without one (by text) */
export const without = (notes, text) => notes.filter((n) => n.text !== text);

// ---------- short: what rides in the prompt ----------

/**
 * How much a note wants to be in mind right now, 0 to 1. The one function a memory strategy changes: today it is
 * recency for notes, how near its time for a reminder, and a stretch after being recalled; nothing is learned yet.
 */
export function salience(n, now = Date.now()) {
  if (n.seen && now - n.seen < RECALLED_FOR && !n.until) return Math.max(0.5, 0.95 * (1 - (now - n.seen) / RECALLED_FOR));   // recalled just now: in mind
  if (n.until) {
    const dt = n.until - now;
    if (dt > AHEAD) return 0.05 + 0.15 * Math.max(0, 1 - dt / (30 * 86400e3));   // far off: faint, a little nearer each day
    if (dt >= 0) return 0.6 + 0.4 * (1 - dt / AHEAD);                             // coming up: climbs to 1
    if (-dt <= AFTER) return 0.7;                                                   // just passed: still in mind
    return 0;                                                                        // over
  }
  if (n.kind === "recalled") return 0;                                                 // a recalled line, once it's faded: back to deep
  const age = Math.max(0, now - (n.at || 0));
  const days = age / 86400e3;
  return n.kind === "mine" ? 0.5 + 0.4 / (1 + days / 30) : 0.3 + 0.6 / (1 + days / 7);
}

/**
 * The notes for the prompt now: the most salient, newest first among equals, as many as fit the budget. With no
 * reminders and nothing recalled this comes down to the newest notes, which is what it was before.
 */
export function select(notes, { now = Date.now(), budget = BUDGET, max = SHORT } = {}) {
  const scored = notes.map((n, i) => ({ n, i, s: salience(n, now) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.i - a.i);
  const out = [];
  let used = 0;
  for (const { n } of scored) {
    if (out.length >= max) break;
    const cost = n.text.length + 3;
    if (used + cost > budget) continue;
    out.push(n);
    used += cost;
  }
  return out;
}

/** the selected notes as the lines a prompt carries, a reminder with its day */
export function lines(selected, now = Date.now()) {
  return selected.map((n) => {
    if (!n.until) return n.text;
    const d = Math.round((n.until - now) / 86400e3);
    const when = d > 1 ? `in ${d} days` : d === 1 ? "tomorrow" : d === 0 ? "today" : d === -1 ? "yesterday" : `${-d} days ago`;
    return `(${when}) ${n.text}`;
  });
}

// ---------- recall: search long, and deep ----------

const WORDS = (s) => str(s, 4000).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];

/** notes that share words with the query, best first; at most n */
export function search(notes, query, n = 5) {
  const q = [...new Set(WORDS(query))];
  if (!q.length) return [];
  return notes.map((note) => {
    const w = new Set(WORDS(note.text));
    const hits = q.filter((x) => w.has(x)).length;
    return { note, hits };
  }).filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits || (b.note.at || 0) - (a.note.at || 0)).slice(0, n).map((x) => x.note);
}

/** lines of chats (deep) that share words with the query, best first: { thread, msg, text, at }, at most n */
export function searchDeep(threads, msgsOf, query, n = 5) {
  const q = [...new Set(WORDS(query))];
  if (!q.length) return [];
  const out = [];
  for (const t of threads) {
    for (const m of msgsOf(t)) {
      if (!m || m.hidden || m.demo || (m.role !== "user" && m.role !== "assistant")) continue;
      const text = str(m.content).replace(/\s+/g, " ").trim();
      if (!text) continue;
      const w = new Set(WORDS(text));
      const hits = q.filter((x) => w.has(x)).length;
      if (hits) out.push({ thread: t.id, msg: m.id, role: m.role, text: clip(text, 240), at: m.at || 0, hits });
    }
  }
  return out.sort((a, b) => b.hits - a.hits || b.at - a.at).slice(0, n).map(({ hits, ...r }) => r);
}

/**
 * What was recalled, brought to mind: notes found in long get `seen` now (and stay in mind for RECALLED_FOR); lines
 * found in deep become notes of their own, kind "recalled", that fade back out after. Returns the notes to keep.
 */
export function recalled(notes, { found = [], deep = [] } = {}, now = Date.now()) {
  const hit = new Set(found.map((n) => n.text));
  const marked = notes.map((n) => (hit.has(n.text) ? { ...n, seen: now } : n));
  const fresh = deep.map((f) => readNote({ text: `${f.role === "user" ? "They said" : "I said"}: ${f.text}`, at: f.at || now, kind: "recalled",
    from: f.thread ? { thread: f.thread, msg: f.msg } : undefined, seen: now })).filter(Boolean);
  return appended(marked, fresh) || marked;
}

// ---------- the writer: every dozen messages ----------

/** the things said in a chat that count: not the hidden nudges, not the replies made up without a key */
const said = (history) => (history || []).filter((m) => m && !m.demo && !m.hidden && (m.role === "user" || m.role === "assistant"));

/** what a chat holds that the memory hasn't read yet: everything after the message it read last (all of it if that one's gone) */
export function unread(history, upTo = "") {
  const real = said(history);
  return real.slice(upTo ? real.findIndex((m) => m.id === upTo) + 1 : 0);
}

/** whether a chat has said enough since the last update for the memory to read it */
export const due = (history, upTo, every = EVERY) => unread(history, upTo).length >= every;

/** messages as lines a model reads ("Them: …", "<name>: …"), with photos and clips as words */
export function transcript(card, messages, max = 400) {
  return said(messages).map((m) => {
    const md = m.media || {};
    let text = str(m.content).replace(/\s+/g, " ").trim();
    if (m.role === "assistant" && (md.kind === "photo" || md.kind === "clip")) text = `(sent ${md.kind === "clip" ? "a short video" : "a photo"}${md.shot ? ": " + str(md.shot).trim() : ""})`;
    else if (md.kind === "photo-in") text = `[a photo${md.saw ? ": " + str(md.saw).trim() : ""}]${text ? " " + text : ""}`;
    return text ? `${m.role === "user" ? "Them" : card.name}: ${clip(text, max)}` : "";
  }).filter(Boolean);
}

/** the messages for the character's model to write what is new to remember (notes: what it's shown of before) */
export function memoryMessages(card, notes, lines) {
  const texts = notes.map((n) => (typeof n === "string" ? n : n.text));
  const user = [
    `The character: ${card.name}${card.tagline ? ". " + card.tagline : ""}`,
    texts.length ? "What they remember so far:\n" + texts.map((n) => "- " + n).join("\n") : "What they remember so far: nothing yet.",
    "The latest messages, oldest first:\n" + lines.join("\n"),
    `Write what is new for ${card.name} to remember.`,
  ].join("\n\n");
  return [{ role: "system", content: MEMORY_SYSTEM }, { role: "user", content: user }];
}

/** @deprecated the old whole-list rewrite; kept for a reply with no list (null: keep what was there) */
export function merged(before, after) {
  if (!after) return null;
  return !after.length && before.length ? null : after;
}

// ---------- reminders: when ----------

/** a time from plain words: "tomorrow", "in 3 days", "in 2 weeks", "next month", "friday", "2026-11-01"; null if none */
export function parseWhen(text, now = Date.now()) {
  const s = str(text, 200).toLowerCase().trim();
  const day = 86400e3, at = new Date(now);
  const morning = (d) => { const x = new Date(d); x.setHours(10, 0, 0, 0); return x.getTime(); };
  if (!s) return null;
  if (/^(today|tonight)$/.test(s)) return now + 6 * 3600e3;
  if (s === "tomorrow") return morning(now + day);
  let m = /^in\s+(\d+)\s*(hour|day|week|month)s?$/.exec(s) || /^(\d+)\s*(hour|day|week|month)s?$/.exec(s);
  if (m) { const n = Number(m[1]); const unit = { hour: 3600e3, day, week: 7 * day, month: 30 * day }[m[2]]; return unit === 3600e3 ? now + n * unit : morning(now + n * unit); }
  m = /^next\s+(week|month)$/.exec(s);
  if (m) return morning(now + (m[1] === "week" ? 7 : 30) * day);
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const di = days.findIndex((d) => d === s || d.slice(0, 3) === s || ("next " + d) === s);
  if (di >= 0) { let ahead = (di - at.getDay() + 7) % 7; if (!ahead) ahead = 7; return morning(now + ahead * day); }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) { const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 10, 0, 0, 0).getTime(); return Number.isFinite(t) ? t : null; }
  return null;
}
