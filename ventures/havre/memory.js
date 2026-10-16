// memory.js: what a character remembers of your chats with them. Pure functions, no DOM: the page imports this
// module, and so do the tests (node --test).
//
//   a memory   { notes: ["They're called Princess.", "I told them I grew up in Brest."], upTo: { <chat id>: <message id> }, at }
//
// One per character, kept in the browser with your chats and never in their card: a card you export or share carries
// none of it. Every dozen messages in a chat, and when you leave a chat with a few new ones, a model (theirs, if it keeps
// to JSON) reads what they remembered and the messages since, and writes down what they remember now. The notes ride in
// the system prompt of every chat with them
// (card.js systemPrompt), so a new chat with someone picks up where the last one left off, and a long chat keeps what
// has scrolled out of the forty messages the model reads.

const str = (v, max = 20000) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
const clip = (s, n) => (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)).replace(/\s+\S*$/, "") + "…");

export const MAX_NOTES = 16;
/** messages in a chat (yours and theirs) between one update of the memory and the next */
export const EVERY = 12;
/** a chat you leave with at least this many messages it hasn't read is read then, so a new chat picks up from it */
export const LEAVING = 4;

export const MEMORY_SYSTEM = "You keep the memory of a character in a chat app: what they remember of their chats with one " +
  "person. From what they remembered before and the latest messages, write down what they remember now, as short notes: " +
  "what the person has told them about themselves (their name, their life, what they like and don't), what has happened " +
  "between them, plans and promises, running jokes, and what the character has said about themselves (their past, their " +
  "home, their likes), so they keep to it. Write about the person as \"they\" and the character as \"I\". At most " +
  MAX_NOTES + " notes, the most important first, each under 25 words. Keep what still matters, merge what repeats, update " +
  "what changed, and leave out small talk. Only what the messages say: never invent anything. Reply with one JSON " +
  "object: {\"notes\": [\"...\"]}.";

export const MEMORY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["notes"],
  properties: { notes: { type: "array", items: { type: "string" } } },
};

/** notes as a list: short, distinct, at most `max`; null when there is no list at all (a reply that went wrong) */
export function normalizeNotes(o, max = MAX_NOTES) {
  const list = Array.isArray(o) ? o : o && Array.isArray(o.notes) ? o.notes : null;
  if (!list) return null;
  const seen = new Set(), out = [];
  for (const n of list) {
    const t = clip(str(n, 2000).replace(/\s+/g, " ").trim().replace(/^(?:[-•*]|\d+[.)])\s*/, ""), 240);
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** a memory as kept, made safe to use: an empty one if there is none */
export function readMemory(m) {
  const o = m && typeof m === "object" ? m : {};
  const upTo = {};
  for (const [k, v] of Object.entries(o.upTo && typeof o.upTo === "object" ? o.upTo : {})) if (typeof v === "string" && v) upTo[k] = v;
  return { notes: normalizeNotes(o.notes || []) || [], upTo, at: Number(o.at) || 0 };
}

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

/** the messages for the character's model to write what they remember now */
export function memoryMessages(card, notes, lines) {
  const user = [
    `The character: ${card.name}${card.tagline ? ". " + card.tagline : ""}`,
    notes.length ? "What they remember so far:\n" + notes.map((n) => "- " + n).join("\n") : "What they remember so far: nothing yet.",
    "The latest messages, oldest first:\n" + lines.join("\n"),
    `Write what ${card.name} remembers now.`,
  ].join("\n\n");
  return [{ role: "system", content: MEMORY_SYSTEM }, { role: "user", content: user }];
}

/**
 * What they remember after an update: the model's notes, unless it lost everything they knew (an empty list when
 * there were notes is a reply gone wrong, so the old notes stay). null: keep what was there.
 */
export function merged(before, after) {
  if (!after) return null;
  return !after.length && before.length ? null : after;
}

/** a note you give them yourself: first in the list, not twice, and the oldest goes if there's no room */
export function withNote(notes, text, max = MAX_NOTES) {
  const t = clip(str(text, 2000).replace(/\s+/g, " ").trim(), 240);
  if (!t) return notes;
  return [t, ...notes.filter((n) => n.toLowerCase() !== t.toLowerCase())].slice(0, max);
}
