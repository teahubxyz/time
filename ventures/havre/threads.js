// threads.js: your chats, as data. A chat (a thread) is a conversation with one character, or with a model and no
// character, and you keep as many as you like: with different characters, or several with the same one. Pure
// functions, no DOM: the page imports this module, and so do the tests.
//
// A thread is { id, card, title, titled, created, at, read }:
//   card     the character's card id, or "_plain" for a chat with no character
//   title    the name you gave it ("" until you do; the page shows the first thing you said instead)
//   titled   when it was named: between two tabs, the later name wins
//   at       when its last message came
//   read     when you last saw it: what came after that is new
// Its messages are kept apart from it, under a storage key of their own, as { card, msgs: [{ id, role, content, at,
// ... }] }: with the card alongside, a thread the list lost can be found again from its messages.

export const PLAIN = "_plain";
/** messages kept per thread */
export const KEEP = 100;
/** a deleted thread is remembered this long, so a tab that still has it doesn't bring it back */
export const GONE_FOR = 30 * 86400e3;

const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const clip = (s, n) => (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)).replace(/\s+\S*$/, "") + "…");

/** the parts of a thread that go in the list of threads (its messages are kept apart) */
export const meta = (t) => ({ id: t.id, card: t.card, title: str(t.title).slice(0, 80), titled: t.titled || 0, created: t.created || 0,
  at: t.at || 0, read: t.read || 0 });

/** threads, the latest first */
export const byLatest = (threads) => [...threads].sort((a, b) => (b.at || 0) - (a.at || 0) || (b.created || 0) - (a.created || 0));

/** the thread with this character you looked at last (else their latest), or null */
export function latestOf(threads, card) {
  return [...threads].filter((t) => t.card === card)
    .sort((a, b) => (b.read || 0) - (a.read || 0) || (b.at || 0) - (a.at || 0))[0] || null;
}

// ---------- what the list of threads shows ----------

const mediaWord = (md) => (!md ? "" : md.kind === "clip" ? "a clip" : md.kind === "voice-in" ? "a voice note" : md.kind ? "a photo" : "");
const shown = (m) => m && !m.hidden && (str(m.content).trim() || m.media);
/** whether anything was said in a thread that you'd see (a hello still on its way doesn't count) */
export const anyShown = (msgs) => (msgs || []).some(shown);

/** a thread's place in the list, made again from its messages (for one the list lost): nothing in it counts as new */
export function fromMessages(id, card, msgs, now = Date.now()) {
  const times = (msgs || []).map((m) => m && m.at).filter((x) => typeof x === "number");
  const at = times.length ? Math.max(...times) : now;
  return { id, card, title: "", titled: 0, created: times.length ? Math.min(...times) : now, at, read: at };
}

/** what a thread is called: the name you gave it, else the first thing you said in it ("" if you haven't yet) */
export function titleOf(t, msgs, max = 60) {
  if (t && str(t.title).trim()) return str(t.title).trim();
  const first = (msgs || []).find((m) => m && m.role === "user" && shown(m));
  return first ? clip(str(first.content).replace(/\s+/g, " ").trim() || mediaWord(first.media), max) : "";
}

/** the last thing said in a thread, as one line: "you: ..." when it was you */
export function snippet(msgs, max = 90) {
  const m = [...(msgs || [])].reverse().find(shown);
  if (!m) return "";
  const what = str(m.content).replace(/\s+/g, " ").trim() || mediaWord(m.media);
  return clip((m.role === "user" ? "you: " : "") + what, max);
}

/** how many messages from them came after you last saw the thread */
export function unread(t, msgs) {
  const since = (t && t.read) || 0;
  return (msgs || []).filter((m) => m && m.role === "assistant" && !m.hidden && (m.at || 0) > since).length;
}

/** when, the short way: "now", "5m", "3h", "2d", then the date */
export function ago(at, now = Date.now()) {
  if (!at) return "";
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 7 * 86400) return Math.floor(s / 86400) + "d";
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toLowerCase();
}

// ---------- keeping two tabs in step ----------

/**
 * Messages from another copy of the same thread (another tab's) added to these, in time order; a voice note that came
 * to one of them over there comes along. `gone` holds ids taken back here, which stay out. `mine` is changed in place,
 * since a reply on its way holds it. Returns whether anything changed.
 */
export function mergeMessages(mine, theirs, gone = new Set()) {
  if (!Array.isArray(mine) || !Array.isArray(theirs)) return false;
  const have = new Map(mine.filter((m) => m && m.id).map((m) => [m.id, m]));
  let added = false, changed = false;
  for (const m of theirs) {
    if (!m || !m.id || gone.has(m.id)) continue;
    const mineToo = have.get(m.id);
    if (!mineToo) { mine.push(m); have.set(m.id, m); added = true; }
    else if (m.voice && !mineToo.voice) { mineToo.voice = m.voice; changed = true; }
  }
  if (added) mine.sort((a, b) => (a.at || 0) - (b.at || 0));
  return added || changed;
}

/**
 * Another tab's list of threads, merged into this one (`mine`, changed in place): threads that are new here come in
 * (without their messages, which the page reads from their own key), the latest activity, the latest look and the
 * later name win, and threads deleted anywhere (`gone`) go. Returns the ids added, changed and removed.
 */
export function mergeIndex(mine, theirs, gone = {}) {
  const added = [], changed = [], removed = [];
  for (const id of Object.keys(mine)) if (gone[id]) { delete mine[id]; removed.push(id); }
  for (const [id, t] of Object.entries(theirs || {})) {
    if (!t || t.id !== id || !t.card || gone[id]) continue;
    const m = mine[id];
    if (!m) { mine[id] = meta(t); added.push(id); continue; }
    let ch = false;
    if ((t.at || 0) > (m.at || 0)) { m.at = t.at; ch = true; }
    if ((t.read || 0) > (m.read || 0)) { m.read = t.read; ch = true; }
    if ((t.titled || 0) > (m.titled || 0)) { m.title = str(t.title).slice(0, 80); m.titled = t.titled; ch = true; }
    if (ch) changed.push(id);
  }
  return { added, changed, removed };
}

/** deleted threads to remember: the last month's, at most 300 */
export function pruneGone(gone, now = Date.now()) {
  return Object.fromEntries(Object.entries(gone || {}).filter(([, at]) => typeof at === "number" && now - at < GONE_FOR)
    .sort((a, b) => b[1] - a[1]).slice(0, 300));
}

// ---------- the first way conversations were kept: one per character ----------

/** an id for a message that came without one, from what it says, so the same message gets the same id every time */
function stableId(card, sig, n) {
  let a = 0x811c9dc5, b = 5381;
  const s = `${card}|${n}|${sig}`;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = (Math.imul(b, 33) + c) >>> 0;
  }
  return "v1" + a.toString(36) + b.toString(36);
}

/**
 * Conversations from the store that kept one per character ({ [card]: [messages] }), as threads. `into` maps each
 * character to the thread made for them before, so a conversation that comes back (a tab still on the old page wrote
 * it again) lands in the same thread, where its messages merge, instead of starting a second one. Returns
 * { threads, messages: { [thread id]: [...] }, into }.
 */
export function migrate(old, { newId, now = Date.now(), into = {} } = {}) {
  const threads = [], messages = {}, map = { ...into };
  for (const [card, list] of Object.entries(old || {})) {
    if (!card || !Array.isArray(list)) continue;
    const seen = new Map(), msgs = [];
    for (const m of list) {
      if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
      if (m.id) { msgs.push(m); continue; }
      const sig = `${m.role}|${typeof m.at === "number" ? m.at : ""}|${str(m.content)}`;
      const n = (seen.get(sig) || 0) + 1;
      seen.set(sig, n);
      msgs.push({ ...m, id: stableId(card, sig, n) });
    }
    if (!msgs.some(shown)) continue;                       // nothing anyone said: no thread
    const id = map[card] || newId();
    map[card] = id;
    const times = msgs.map((m) => m.at).filter((x) => typeof x === "number");
    threads.push({ id, card, title: "", titled: 0, created: times.length ? Math.min(...times) : now,
      at: times.length ? Math.max(...times) : now, read: now });
    messages[id] = msgs;
  }
  return { threads, messages, into: map };
}

// ---------- texting first ----------

/**
 * Whether a character would text first in this thread now: it has been quiet for `after` ms, you were the last one of
 * you two to say something real (a hello or a nudge of theirs that you haven't answered yet means they wait for you),
 * and it wasn't tried already in this quiet spell (`tried`: when it last was).
 */
export function readyToTextFirst(msgs, { now = Date.now(), after = 6 * 3600e3, tried = 0 } = {}) {
  const real = (msgs || []).filter((m) => m && !m.demo);
  if (!real.length || real.at(-1).hidden) return false;
  const timed = [...real].reverse().find((m) => typeof m.at === "number");
  if (!timed || now - timed.at < after || now - (tried || 0) < after) return false;
  const you = [...real].reverse().find((m) => m.role === "user");
  return !!you && !you.hidden;
}

/**
 * The threads where characters text you first when you come back: each character's latest thread with you (never a
 * chat without a character, never the one in `skip`), ready to text first, the most recent first, at most `max`.
 */
export function textFirst(threads, msgsOf, { now = Date.now(), after = 6 * 3600e3, tried = {}, max = 3, skip = "" } = {}) {
  const seen = new Set(), out = [];
  for (const t of byLatest(threads)) {
    if (t.card === PLAIN || seen.has(t.card)) continue;
    seen.add(t.card);
    if (t.id === skip || !readyToTextFirst(msgsOf(t), { now, after, tried: tried[t.id] })) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
