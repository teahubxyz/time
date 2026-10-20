// workflows.js: the things Havre does as named workflows, and the doors into each. Pure functions, no DOM: the page
// imports this module, and so do the tests.
//
// A workflow is one named thing the harbor can do, with what it takes, what it gives, and the doors it can be
// started from. The same workflow runs the same way whichever door opens it:
//
//   chat     a slash command typed in the chat box (/portraits, /new a lighthouse keeper who…)
//   sheet    a link on the character's card
//   harbor   the new-character form
//
// The page holds the hands that run them (app.js, runWorkflow); this file holds what they are, what the models are
// asked, and how to read what comes back. More doors (a timer, a hook) are more entries in `doors`, nothing else.

import { normalizeCard, cardFromWrite, WRITE_SCHEMA } from "./card.js";

const str = (v, max = 20000) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
const clip = (s, n) => (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)).replace(/\s+\S*$/, "") + "…");
const arr = (v) => (Array.isArray(v) ? v : []);

export const WORKFLOWS = [
  {
    id: "portraits", command: "portraits", title: "three portraits", takes: "card", gives: "portrait", doors: ["sheet", "chat"],
    about: "three ways they could look, drawn from their card; pick one as their portrait",
    usage: "/portraits",
  },
  {
    id: "new", command: "new", title: "write someone", takes: "idea", gives: "card", doors: ["harbor", "chat"],
    about: "a new character from an idea in a line or two, written as a card of your own",
    usage: "/new <who they are, in a line>",
  },
  {
    id: "photoshoot", command: "photoshoot", title: "a photoshoot", takes: "card pictures", gives: "photos", doors: ["chat"],
    about: "a few photos of them from the pictures on their card, one shoot, each a different moment (3 unless you say)",
    usage: "/photoshoot [how many] [what the shoot is about]",
  },
  {
    id: "recall", command: "recall", title: "recall", takes: "words", gives: "memory", doors: ["chat"],
    about: "what they remember about something (their notes, then the chats themselves), brought to mind for a while",
    usage: "/recall <what to look for>",
  },
  {
    id: "remember", command: "", title: "remember this", takes: "message", gives: "memory", doors: ["message"],
    about: "a message into their long-term memory, in its own words",
    usage: "remember, under a message",
  },
  {
    id: "remind", command: "", title: "remind", takes: "message", gives: "memory", doors: ["message"],
    about: "a message back to mind at a time you pick",
    usage: "remind, under a message",
  },
];

export const byId = (id) => WORKFLOWS.find((w) => w.id === id) || null;
export const byCommand = (cmd) => (cmd && WORKFLOWS.find((w) => w.command === cmd)) || null;

/**
 * A slash command typed in the chat: { id, arg } for a workflow, { id: "help" } for /help or a bare "/", null for
 * anything else (so "/" in the middle of a sentence, or a path, is just words).
 */
export function parseCommand(text) {
  const m = /^\/([a-z]*)(?:\s+([\s\S]*))?$/i.exec(str(text, 4000).trim());
  if (!m) return null;
  const cmd = m[1].toLowerCase(), arg = str(m[2] || "", 2000).trim();
  if (!cmd || cmd === "help" || cmd === "?") return { id: "help", arg: "" };
  const w = byCommand(cmd);
  return w ? { id: w.id, arg } : { id: "unknown", arg: cmd };
}

/** what /help says: one line per workflow that has a chat door */
export function helpLines() {
  return WORKFLOWS.filter((w) => w.doors.includes("chat")).map((w) => `${w.usage} — ${w.about}`);
}

// ---------- portraits: three ways they could look ----------

export const DIRECTIONS_SYSTEM = "You describe how an original character looks, for portraits of them. Give three " +
  "different directions, each one paragraph of at most 45 words: their apparent age (an adult), face, hair, build and " +
  "clothes, and one detail people remember. The three differ in mood, setting or style, not in who they are. Invent " +
  "what isn't given. Never describe a real person. Return one JSON object: directions, an array of three objects with " +
  "title (at most 4 words) and look (the paragraph).";

export const DIRECTIONS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["directions"],
  properties: { directions: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "look"],
    properties: { title: { type: "string" }, look: { type: "string" } } } } },
};

export function directionsMessages(card) {
  const about = [card.tagline, card.look && card.look.description && "How they look so far: " + clip(card.look.description.replace(/\s+/g, " "), 400),
    card.persona && clip(card.persona.replace(/\s+/g, " "), 700)].filter(Boolean).join("\n");
  return [{ role: "system", content: DIRECTIONS_SYSTEM },
    { role: "user", content: `The character: ${card.name}\n${about || "Nothing else is known: invent them."}` }];
}

/** the three directions, cleaned: each a title and a look; fewer if the model sent fewer, none if it sent none */
export function normalizeDirections(o, n = 3) {
  const list = arr(o && o.directions).map((d) => ({ title: clip(str(d && d.title, 200).replace(/\s+/g, " ").trim(), 40),
    look: str(d && d.look, 2000).replace(/\s+/g, " ").trim() })).filter((d) => d.look);
  return list.slice(0, n).map((d, i) => ({ ...d, title: d.title || `look ${i + 1}` }));
}

// ---------- new: someone from an idea ----------

export const IDEA_SYSTEM = "You are a character writer. From an idea in a line or two you write a brand-new, original " +
  "character for a chat app, in your own words. The character is an adult, 18 or older. If the idea names them, keep " +
  "that name; otherwise invent one. Return one JSON object: name, tagline (at most 8 words), greeting (one to three " +
  "short texts separated by a blank line), persona (a system prompt in the second person, 120 to 250 words: who they " +
  "are, how they talk, what they want, what they won't do), examples (three objects with user and character, the " +
  "character's replies short, like texts), tags (at most five lowercase words), look (how they look, one paragraph of " +
  "at most 45 words: apparent age, face, hair, build, clothes, one detail people remember; never a real person).";

export const IDEA_SCHEMA = {
  ...WRITE_SCHEMA,
  required: [...WRITE_SCHEMA.required, "look"],
  properties: { ...WRITE_SCHEMA.properties, look: { type: "string" } },
};

export function ideaMessages(idea, name = "") {
  const ask = { idea: str(idea, 2000).trim(), ...(str(name, 80).trim() ? { name: str(name, 80).trim() } : {}) };
  return [{ role: "system", content: IDEA_SYSTEM },
    { role: "user", content: "Write a character from this idea.\n\n" + JSON.stringify(ask, null, 1) }];
}

/** the new card from what the writer sent back: a remix-shaped card (card.js cardFromWrite), plus how they look */
export function cardFromIdea(o, { model } = {}) {
  const base = cardFromWrite(o || {}, { model });
  const look = str(o && o.look, 2000).replace(/\s+/g, " ").trim();
  return normalizeCard({ ...base, look: { ...base.look, description: look } });
}

// ---------- photoshoot: a few photos of them, from the pictures on their card ----------

export const SHOOT_MIN = 1, SHOOT_MAX = 6, SHOOT_DEFAULT = 3;

/** the words after /photoshoot: a count first if there is one (1 to 6), the rest a brief for the shoot */
export function parseShoot(arg = "") {
  const m = /^\s*(\d{1,2})(?:\s+|$)([\s\S]*)$/.exec(str(arg, 2000));
  const n = m ? Number(m[1]) : SHOOT_DEFAULT;
  return { count: Math.min(SHOOT_MAX, Math.max(SHOOT_MIN, n || SHOOT_DEFAULT)), brief: (m ? m[2] : str(arg, 2000)).replace(/\s+/g, " ").trim() };
}

export const SHOOT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["shots"],
  properties: { shots: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "shot"],
    properties: { title: { type: "string" }, shot: { type: "string" } } } } },
};

/**
 * The messages for a text model to write a shoot: the photo rules the single-photo ask uses (abilities.js, safe or
 * adult), asked for several shots at once, as JSON. brief: what the shoot is about; nothing means a set that fits them.
 */
export function shootMessages(card, photoSystem, { count = SHOOT_DEFAULT, brief = "", lines = [] } = {}) {
  const n = Math.min(SHOOT_MAX, Math.max(SHOOT_MIN, count));
  const system = str(photoSystem).replace(/\s*Reply with the shot only\.?\s*$/, "") +
    ` Write ${n} different shots for one photoshoot: the same place or theme, a different moment, framing or mood in each. ` +
    `Return one JSON object: shots, an array of ${n} objects with title (at most 4 words) and shot (the paragraph).`;
  const look = card.look && card.look.description;
  const user = [
    `The character: ${card.name}${card.tagline ? ". " + card.tagline : ""}`,
    look ? `How they look: ${look}` : "",
    lines.length ? "The conversation so far, latest last:\n" + lines.join("\n") : "The conversation hasn't started yet.",
    "The shoot: " + (str(brief, 500).trim() || "nothing in particular. Pick a place and a mood that fit them."),
    `Write the ${n} shots.`,
  ].filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

/** the shots, cleaned: each a title and a shot; no more than n, none if the model sent none */
export function normalizeShots(o, n = SHOOT_DEFAULT) {
  const list = arr(o && o.shots).map((d) => ({ title: clip(str(d && d.title, 200).replace(/\s+/g, " ").trim(), 40),
    shot: str(d && d.shot, 2000).replace(/\s+/g, " ").trim() })).filter((d) => d.shot);
  return list.slice(0, n).map((d, i) => ({ ...d, title: d.title || `shot ${i + 1}` }));
}
