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
    id: "snap", command: "snap", title: "a picture to send", takes: "words", gives: "photo", doors: ["chat"],
    about: "make a picture with ai and send it as yours (say what's in it: the pizza you made)",
    usage: "/snap [what's in the picture]",
  },
  {
    id: "whisper", command: "whisper", title: "a whisper", takes: "card", gives: "voice note", doors: ["chat"],
    about: "a short ASMR voice note from them, whispered over soft rain (luna or eve; add what it's about)",
    usage: "/whisper [luna|eve] [what it's about]",
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

// ---------- whisper: a short ASMR voice note, over soft rain ----------

// The voices that whisper well and cheaply (picked in the asmr.gandora.lol bake-off): Venice model, voice, how the
// words are wrapped so the model whispers, and the pace (0.9 of their usual reading speed sounded best).
export const WHISPER_PRESETS = {
  luna: { model: "tts-inworld-1-5-max", voice: "Luna", lead: "[whispering] ", tail: "", speed: 0.77, format: "wav" },
  eve: { model: "tts-xai-v1", voice: "eve", lead: "<whisper>", tail: "</whisper>", speed: 0.77, format: "mp3" },
};
export const WHISPER_DEFAULT = "luna";

/** the words after /whisper: a preset name first if there is one, the rest what it's about */
export function parseWhisper(arg = "") {
  const m = /^\s*(\w+)(?:\s+|$)([\s\S]*)$/.exec(str(arg, 2000));
  const first = m ? m[1].toLowerCase() : "";
  if (WHISPER_PRESETS[first]) return { preset: first, brief: m[2].replace(/\s+/g, " ").trim() };
  return { preset: "", brief: str(arg, 2000).replace(/\s+/g, " ").trim() };
}

export const WHISPER_SCHEMA = {
  type: "object", additionalProperties: false, required: ["script"],
  properties: { script: { type: "string" } },
};

export function whisperMessages(card, { brief = "", lines = [] } = {}) {
  const system = `You are ${card.name}. Write a short ASMR voice note you whisper to the person you're talking with: ` +
    "60 to 110 words, in your own voice and manner, intimate and calming, present tense, short phrases with pauses " +
    "written as \"...\". Gentle sensory detail (breath, rain, a soft sound nearby) is welcome. No stage directions, no " +
    "emoji, no markup, nothing in brackets: only the words to be whispered. Return one JSON object: script.";
  const persona = card.persona ? clip(card.persona.replace(/\s+/g, " "), 900) : "";
  const user = [
    persona ? `Who you are: ${persona}` : "",
    lines.length ? "The conversation so far, latest last:\n" + lines.join("\n") : "You haven't talked yet.",
    "What it's about: " + (str(brief, 500).trim() || "winding down together; help them relax."),
  ].filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

/** the script, cleaned of anything the model shouldn't have added (brackets, asterisks, emoji-ish markup) */
export function cleanWhisper(o) {
  return str(o && o.script, 1500).replace(/\[[^\]]*\]|\([^)]*\)|<[^>]*>|\*[^*]*\*/g, "").replace(/\s+/g, " ").trim();
}

/** what the voice model is sent: the script inside the preset's whisper markup */
export const whisperInput = (script, preset) => (preset.lead || "") + script + (preset.tail || "");

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
