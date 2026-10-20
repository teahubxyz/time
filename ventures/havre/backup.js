// backup.js: a character with everything this browser keeps about them, or the whole harbor, as one file, and back.
// Pure functions, no DOM: the page imports this module, and so do the tests.
//
//   a bundle   { havre_backup: 1, at, cards: [card], memory: { <card id>: memory }, threads: [thread + msgs],
//                media: { <id>: data: URL }, settings?: { abilities, model, voiceOn } }
//
// A card file (.havre.json) carries the character and nothing else, by design: it's the thing you share. A bundle
// is the thing you keep: the card, what they remember, your chats with them and the pictures in those chats. "Full"
// is every character, every chat, every picture, and your settings (never your key). Restoring merges: a card already
// in the harbor is left as it is, notes are appended, chats by id are added if missing, pictures by id are put back.

import { normalizeCard } from "./card.js";
import { readMemory, appended } from "./memory.js";

export const BACKUP = 1;

const str = (v, max = 20000) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** the media ids a thread's messages point at */
export function mediaIds(threads) {
  const ids = new Set();
  for (const t of arr(threads)) for (const m of arr(t.msgs)) if (m && m.media && typeof m.media.id === "string" && m.media.id) ids.add(m.media.id);
  return [...ids];
}

/** one character's bundle: the card, their memory, the chats with them (with messages), the pictures those chats hold */
export function bundleOne(card, { memory = null, threads = [], media = {}, at = Date.now() } = {}) {
  const mine = arr(threads).filter((t) => t && t.card === card.id);
  const ids = new Set(mediaIds(mine));
  return { havre_backup: BACKUP, at, cards: [card], memory: memory ? { [card.id]: memory } : {}, threads: mine,
    media: Object.fromEntries(Object.entries(obj(media)).filter(([id]) => ids.has(id))) };
}

/** the whole harbor: every card, memory, chat and picture, and the settings worth carrying (never the key) */
export function bundleAll({ cards = [], memory = {}, threads = [], media = {}, settings = null, at = Date.now() } = {}) {
  return { havre_backup: BACKUP, at, cards: arr(cards), memory: obj(memory), threads: arr(threads), media: obj(media),
    ...(settings ? { settings } : {}) };
}

/** a bundle as read from a file, made safe; null if the text isn't one */
export function readBundle(o) {
  if (!o || typeof o !== "object" || Number(o.havre_backup) !== BACKUP) return null;
  const cards = arr(o.cards).filter((c) => c && typeof c === "object" && c.name).map((c) => normalizeCard(c));
  const memory = {};
  for (const [id, m] of Object.entries(obj(o.memory))) { const r = readMemory(m); if (r.notes.length || Object.keys(r.upTo).length) memory[str(id, 80)] = r; }
  const threads = arr(o.threads).filter((t) => t && typeof t === "object" && typeof t.id === "string" && typeof t.card === "string")
    .map((t) => ({ ...t, id: str(t.id, 80), card: str(t.card, 80), msgs: arr(t.msgs).filter((m) => m && typeof m === "object" && (m.role === "user" || m.role === "assistant")) }));
  const media = {};
  for (const [id, d] of Object.entries(obj(o.media))) if (typeof d === "string" && /^data:(image|audio|video)\//.test(d) && d.length < 20_000_000) media[str(id, 80)] = d;
  const settings = obj(o.settings);
  return { at: Number(o.at) || 0, cards, memory, threads, media, settings: Object.keys(settings).length ? settings : null };
}

/**
 * What restoring a bundle into a harbor comes to, without touching anything: cards to add (not already there, by
 * id), memories merged (notes appended to what's there), threads to add (by id, not already there). Pictures are
 * put back as they are. The counts say what happened.
 */
export function merge(bundle, { cards = [], memory = {}, threads = {} } = {}) {
  const have = new Set(arr(cards).map((c) => c.id));
  const addCards = bundle.cards.filter((c) => !have.has(c.id));
  const mergedMemory = {};
  for (const [id, m] of Object.entries(bundle.memory)) {
    const now = readMemory(obj(memory)[id]);
    mergedMemory[id] = { notes: appended(now.notes, m.notes) || now.notes, upTo: { ...m.upTo, ...now.upTo }, at: Math.max(now.at, m.at) };
  }
  const addThreads = bundle.threads.filter((t) => !obj(threads)[t.id]);
  return { addCards, memory: mergedMemory, addThreads, skippedCards: bundle.cards.length - addCards.length, skippedThreads: bundle.threads.length - addThreads.length };
}

/** a file name for a bundle: one character's, or the harbor's, with the day */
export function bundleName(card, at = Date.now()) {
  const day = new Date(at).toISOString().slice(0, 10);
  return card ? `${card.id}.havre-full.json` : `havre-backup-${day}.json`;
}
