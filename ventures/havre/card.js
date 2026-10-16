// card.js: the Havre character card and everything that reads or writes one.
// Pure functions, no DOM: the page imports this module, and so do the tests (node --test) and agents.
//
//   a Havre card   { havre: 1, id, name, tagline, greeting, persona, voice, flow, examples, tags, model,
//                    engine, portrait, look, speech, creator, license, lineage, created, updated }
//   in             Havre JSON, Character Card V1 / V2 / V3 (JSON or PNG), or plain text
//   out            Havre JSON, Character Card V3 + V2 (JSON, or a PNG card), a plain system prompt
//   remix          two passes, like a clean room: one reads the source and writes down only ideas, the other
//                  never sees the source and writes someone new from those ideas; then a local check that the
//                  new character isn't a copy, and a lineage line that keeps the credit.

export const HAVRE = 1;
export const SITE = "https://havre.yolopreneur.lol/";
export const DEFAULT_MODEL = "zai-org-glm-5-2";
export const RECOMMENDED_MODELS = [
  ["zai-org-glm-5-2", "GLM 5.2 (Venice's default)"],
  ["z-ai-glm-5-3-flash", "GLM 5.3 Flash (fast, cheap)"],
  ["venice-uncensored-role-play", "Venice Role-Play"],
  ["deepseek-v4-flash", "DeepSeek V4 Flash (cheap)"],
  ["qwen3-235b-a22b-instruct-2507", "Qwen3 235B Instruct"],
  ["kimi-k2-6", "Kimi K2.6"],
  ["claude-haiku-5-5", "Claude Haiku 5.5"],
];
export const LICENSES = {
  "remix-with-credit": "Remix with credit",
  "all-rights-reserved": "All rights reserved",
  "cc-by-4.0": "CC BY 4.0",
  "cc0": "CC0 (public domain)",
};
export const RELATIONS = ["ported-from", "inspired-by", "forked-from"];

const str = (v, max = 20000) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const nowIso = () => new Date().toISOString();
/** a picture a card can carry: a data: URI of a raster image, an https URL, or a path next to the card */
const isPicture = (s) => /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s) || /^https:\/\//i.test(s) || (!!s && !/^[a-z][a-z0-9+.-]*:/i.test(s) && !s.startsWith("//"));
export const MAX_REFERENCES = 3;

export function slugify(s) {
  const out = str(s, 200).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return out || "character";
}

// ---------- the card ----------

export function newCard(partial = {}) {
  return normalizeCard({ havre: HAVRE, name: "New character", ...partial });
}

export function normalizeCard(o = {}) {
  const name = str(o.name, 120).trim() || "Unnamed";
  const voice = obj(o.voice), engine = obj(o.engine), look = obj(o.look), speech = obj(o.speech);
  const speed = Number(speech.speed);
  const card = {
    havre: HAVRE,
    id: slugify(o.id || name),
    name,
    tagline: str(o.tagline, 200).trim(),
    greeting: str(o.greeting, 4000).trim(),
    persona: str(o.persona, 20000).trim(),
    voice: { short_form: voice.short_form !== false, notes: str(voice.notes, 2000).trim() },
    flow: arr(o.flow).slice(0, 8).map((s) => ({
      stage: str(s && s.stage, 40).trim(), goal: str(s && s.goal, 600).trim(), next: str(s && s.next, 400).trim(),
    })).filter((s) => s.stage || s.goal),
    examples: arr(o.examples).slice(0, 12).map((e) => ({
      user: str(e && e.user, 2000).trim(), character: str(e && e.character, 4000).trim(),
    })).filter((e) => e.character),
    tags: [...new Set(arr(o.tags).map((t) => str(t, 40).trim().toLowerCase()).filter(Boolean))].slice(0, 12),
    model: str(o.model, 120).trim() || DEFAULT_MODEL,
    engine: engine.venice_character ? { venice_character: slugify(engine.venice_character) } : {},
    portrait: str(o.portrait, 2_000_000).trim(),
    // how they look (photos and clips are made from the portrait and these pictures) and how they sound in a voice note
    look: {
      description: str(look.description, 1500).trim(),
      references: [...new Set(arr(look.references).map((r) => str(r, 3_000_000).trim()).filter(isPicture))].slice(0, MAX_REFERENCES),
    },
    speech: {
      model: str(speech.model, 120).trim(), voice: str(speech.voice, 120).trim(), mood: str(speech.mood, 500).trim(),
      speed: Number.isFinite(speed) && speed > 0 ? Math.min(4, Math.max(0.25, Math.round(speed * 100) / 100)) : 1,
    },
    creator: str(o.creator, 120).trim(),
    license: LICENSES[o.license] ? o.license : "remix-with-credit",
    lineage: arr(o.lineage).slice(0, 50).map(normalizeLineage).filter(Boolean),
    created: str(o.created, 40) || nowIso(),
    updated: str(o.updated, 40) || str(o.created, 40) || nowIso(),
  };
  if (/^\s*(javascript|vbscript):/i.test(card.portrait)) card.portrait = "";
  return card;
}

function normalizeLineage(l) {
  if (!l || typeof l !== "object") return null;
  const relation = RELATIONS.includes(l.relation) ? l.relation : "inspired-by";
  const entry = {
    relation, name: str(l.name, 120).trim(), creator: str(l.creator, 120).trim(), ref: str(l.ref, 500).trim(),
    at: str(l.at, 40).trim(), note: str(l.note, 500).trim(),
  };
  return entry.name || entry.ref ? entry : null;
}

/** problems with a card, as plain sentences; [] means it is a valid Havre card */
export function validateCard(c) {
  const p = [];
  if (!c || typeof c !== "object") return ["not an object"];
  if (c.havre !== HAVRE) p.push("havre must be 1");
  if (!c.name) p.push("a card needs a name");
  if (!c.persona && !(c.engine && c.engine.venice_character)) p.push("a card needs a persona (or a Venice character to speak through)");
  if (c.id && !/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(c.id)) p.push("id must be a lowercase slug");
  if (c.license && !LICENSES[c.license]) p.push("unknown license");
  for (const l of arr(c.lineage)) if (!RELATIONS.includes(l.relation)) p.push(`unknown lineage relation: ${l.relation}`);
  return p;
}

export function touch(card) { return { ...card, updated: nowIso() }; }

/** lineage only grows: an entry with the same relation and ref (or name) is not added twice */
export function addLineage(card, entry) {
  const e = normalizeLineage({ at: nowIso().slice(0, 10), ...entry });
  if (!e) return card;
  const same = (l) => l.relation === e.relation && (e.ref ? l.ref === e.ref : l.name === e.name);
  if (card.lineage.some(same)) return card;
  return { ...card, lineage: [...card.lineage, e] };
}

export function creditLine(l) {
  const verb = { "ported-from": "Ported from", "inspired-by": "Inspired by", "forked-from": "Forked from" }[l.relation];
  const who = l.creator ? ` by ${l.creator}` : "";
  const where = l.ref.startsWith("venice:") ? " on Venice" : "";
  return `${verb} ${l.name || l.ref}${who}${where}`;
}

export function refUrl(ref) {
  if (!ref) return "";
  if (ref.startsWith("venice:")) return "https://venice.ai/c/" + encodeURIComponent(ref.slice(7));
  return /^https?:\/\//.test(ref) ? ref : "";
}

// ---------- prompts ----------

export function fill(text, card, user = "the user") {
  return str(text).replace(/\{\{\s*char\s*\}\}|<BOT>/gi, card.name).replace(/\{\{\s*user\s*\}\}|<USER>/gi, user);
}

export const HOUSE_RULES = "Stay in character. You live in Havre, a harbor for characters. Never invent links, " +
  "prices, payments or actions outside this conversation; if someone asks for one, say plainly what you can do here instead.";

export const SHORT_FORM = "Text the way people text: one to three short messages per reply, each under about 160 " +
  "characters, with a blank line between messages. No paragraphs and no lists unless asked. No narration in asterisks.";

/** their name is theirs, whatever the conversation does: a model drifts from a prompt far above, and a game can lead it off */
export function identityRule(card) {
  return `Your name is ${card.name}. Never introduce yourself by another name. If they ask you to play a part in a game ` +
    `or a story, play it as ${card.name}, and be yourself again after. Keep to what you've already told them about yourself.`;
}

/** a reminder of who is answering, on the last thing said: by a dozen messages in, the system prompt is far above */
export const reminder = (card) => `[You are ${card.name}. Stay in character.]`;

const quoted = (s, max = 600) => `"${str(s).replace(/\s+/g, " ").trim().slice(0, max)}"`;

/**
 * The system prompt: who they are, how they talk (with their examples, which teach the voice), their flow, what they
 * remember of your chats (memory: notes from memory.js, never part of the card), their name, and the house rules.
 */
export function systemPrompt(card, { memory = [] } = {}) {
  const parts = [`You are ${card.name}.${card.tagline ? " " + card.tagline : ""}`];
  if (card.persona) parts.push(fill(card.persona, card));
  const voice = [card.voice.notes && fill(card.voice.notes, card), card.voice.short_form && SHORT_FORM].filter(Boolean);
  if (voice.length) parts.push("How you talk:\n" + voice.map((v) => "- " + v).join("\n"));
  const examples = card.examples.filter((e) => e.character).slice(0, 4);
  if (examples.length) {
    parts.push("How you sound, in a few examples (for your voice only; never repeat them word for word):\n" + examples.map((e) =>
      `- ${e.user ? `When they say ${quoted(fill(e.user, card))}, you text` : "You text"}: ` +
      splitBubbles(fill(e.character, card)).slice(0, 4).map((b) => quoted(b, 400)).join(" ")).join("\n"));
  }
  if (card.flow.length) {
    parts.push("Your flow with someone new. Take one stage at a time, in order:\n" + card.flow.map((s, i) =>
      `${i + 1}. ${s.stage.toUpperCase()}: ${fill(s.goal, card)}${s.next ? ` Move on when ${fill(s.next, card)}` : ""}`).join("\n"));
  }
  const notes = arr(memory).map((n) => str(n, 300).trim()).filter(Boolean).slice(0, 24);
  if (notes.length) {
    parts.push("What you remember from your chats with them so far (keep to it, and bring it up only when it fits):\n" +
      notes.map((n) => "- " + n).join("\n"));
  }
  parts.push(identityRule(card), HOUSE_RULES);
  return parts.join("\n\n");
}

/**
 * The messages for one chat turn; history is [{role: "user"|"assistant", content}], the last 40 of it. For a character
 * of Havre's own (not a Venice character, who brings their own prompt), the last thing said ends with a reminder of
 * who is answering. memory: what they remember, for the system prompt.
 */
export function chatMessages(card, history, { memory = [] } = {}) {
  const own = !card.engine.venice_character;
  const msgs = own ? [{ role: "system", content: systemPrompt(card, { memory }) }] : [];
  // the greeting starts the conversation, so it goes once the conversation's start is out of the window
  if (card.greeting && own && history.length <= 40) msgs.push({ role: "assistant", content: fill(card.greeting, card) });
  for (const m of history.slice(-40)) if (m.role === "user" || m.role === "assistant") msgs.push({ role: m.role, content: str(m.content, 8000) });
  const out = alternate(msgs), last = out.at(-1);
  if (own && last && last.role === "user") out[out.length - 1] = { role: "user", content: `${last.content}\n\n${reminder(card)}` };
  return out;
}

/**
 * A conversation as models expect it: never two messages in a row from the same side. A reply that never came leaves
 * two of yours together, and some models answer that by going round in circles; they're joined into one.
 */
export function alternate(msgs) {
  const out = [];
  for (const m of msgs) {
    const prev = out.at(-1);
    if (prev && prev.role === m.role && m.role !== "system" && typeof prev.content === "string" && typeof m.content === "string") {
      out[out.length - 1] = { ...prev, content: `${prev.content}\n\n${m.content}` };
    } else out.push(m);
  }
  return out;
}

/**
 * A reply caught in a loop ("I'm not sure. I'm not sure. I'm not sure. …") says it once: a stretch said four or more
 * times in a row is kept once, before it's shown, and before it's kept for the next reply to copy. Code is left alone.
 */
export function unloop(text) {
  const t = str(text, 100000);
  if (t.includes("```")) return t.trim();
  return t.replace(/(\S[\s\S]{5,160}?)(?:\s*\1){3,}/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- their name, kept the same everywhere ----------

// a word of a name: capitalized ("Mara", "O'Neill"), or a title or an initial with its full stop ("Dr.", "J.")
const NAME_WORD = "(?:(?:Dr|Mr|Mrs|Ms|Mx|St|Sgt|Capt|Prof|Rev|Jr|Sr|\\p{Lu})\\.|\\p{Lu}[\\p{L}\\p{M}'’-]*)";
const NAME_GLUE = "de|da|di|du|van|von|der|del|la|le|of|the";
/** the name a persona gives them in its first words ("You are Mara Vell, …"); "" if it starts some other way */
export function personaName(persona) {
  const m = str(persona).match(new RegExp(`^\\s*[Yy]ou(?:\\s+are|['’]re)\\s+(?:called\\s+|named\\s+)?(${NAME_WORD}(?:\\s+(?:${NAME_WORD}|${NAME_GLUE}))*)`, "u"));
  if (!m) return "";
  const words = m[1].split(/\s+/);
  while (words.length && new RegExp(`^(?:${NAME_GLUE})$`).test(words.at(-1))) words.pop();
  return words.join(" ").replace(/['’-]+$/, "");
}
/** two names for the same someone: they share a word ("Captain Ro" and "Ro", "Ines Corbel" and "Ines") */
export function sameName(a, b) {
  const w = (s) => new Set(tokens(s).filter((t) => t.length > 1 && !["the", "of", "de", "la", "le", "von", "van"].includes(t)));
  const x = w(a), y = w(b);
  return !x.size || !y.size || [...x].some((t) => y.has(t));
}
/**
 * The card with every mention of them by `from` changed to `to`, in what they say and how they're described: the
 * whole name, and the first and last names on their own ("Mara" becomes "June", "Ms Vell" becomes "Ms Hart").
 */
export function renamed(card, from, to) {
  const a = str(from).trim(), b = str(to).trim();
  if (!a || !b || a === b) return card;
  const aw = a.split(/\s+/), bw = b.split(/\s+/), map = new Map([[a, b]]);
  if (aw.length > 1 && aw[0].length > 1 && !map.has(aw[0])) map.set(aw[0], bw[0]);
  if (aw.length > 1 && bw.length > 1 && aw.at(-1).length > 1 && !map.has(aw.at(-1))) map.set(aw.at(-1), bw.at(-1));
  for (const [k, v] of [...map]) if (k === v) map.delete(k);
  if (!map.size) return card;
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${[...map.keys()].sort((x, y) => y.length - x.length).map(escapeRe).join("|")})(?![\\p{L}\\p{N}_])`, "gu");
  const swap = (s) => str(s).replace(re, (m) => map.get(m));
  return {
    ...card, tagline: swap(card.tagline), greeting: swap(card.greeting), persona: swap(card.persona),
    voice: { ...card.voice, notes: swap(card.voice.notes) },
    flow: card.flow.map((s) => ({ stage: s.stage, goal: swap(s.goal), next: swap(s.next) })),
    examples: card.examples.map((e) => ({ user: swap(e.user), character: swap(e.character) })),
    look: { ...card.look, description: swap(card.look.description) },
  };
}
/** a persona that calls them by another name than the card's: that name, else "" */
export function nameClash(card) {
  const p = personaName(card.persona);
  return p && !sameName(p, card.name) ? p : "";
}

// ---------- short-form bubbles ----------

export function stripThinking(t) {
  return str(t, 100000).replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

/** a reply as text bubbles: blank lines split it; a long block splits at sentence ends; code stays whole */
export function splitBubbles(text, max = 220) {
  const t = stripThinking(text);
  if (!t) return [];
  const blocks = [];
  let code = null;
  for (const raw of t.split(/\n{2,}/)) {
    if (code !== null) { code += "\n\n" + raw; if ((raw.match(/```/g) || []).length % 2) { blocks.push(code); code = null; } continue; }
    if ((raw.match(/```/g) || []).length % 2) { code = raw; continue; }
    blocks.push(raw);
  }
  if (code !== null) blocks.push(code);
  const out = [];
  for (const b0 of blocks) {
    const b = b0.trim();
    if (!b) continue;
    if (b.includes("```") || b.length <= max) { out.push(b); continue; }
    let cur = "";
    for (const s of b.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*\s*|$)/g) || [b]) {
      if (cur && (cur + s).length > max * 0.75) { out.push(cur.trim()); cur = ""; }
      cur += s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out.slice(0, 12);
}

/** how long the typing dots show before a bubble, in ms */
export function typingDelay(bubble) { return Math.min(1600, 380 + 22 * bubble.length); }

/** without a key: the example whose question is closest to what was said, else the next one in turn */
export function demoReply(card, turn, said = "") {
  const ex = card.examples.filter((e) => e.character);
  if (!ex.length) return "I'm only a sketch until you add a Venice key. Then I can really talk.";
  const words = new Set(tokens(said).filter((w) => !STOP.has(w)));
  let best = -1, score = 0;
  ex.forEach((e, i) => {
    const t = new Set(tokens(e.user).filter((w) => !STOP.has(w)));
    const both = [...t].filter((w) => words.has(w)).length;
    const s = t.size ? both / Math.max(t.size, words.size) : 0;
    if (s > score) { score = s; best = i; }
  });
  return fill(ex[score >= 0.3 ? best : turn % ex.length].character, card, "you");
}

/** what a visitor might say first: the example questions */
export function suggestions(card, n = 3) {
  return card.examples.map((e) => e.user).filter((u) => u && u.length <= 60).slice(0, n);
}

// ---------- Character Card V1 / V2 / V3 ----------

function parseExamples(mes) {
  const out = [];
  for (const block of str(mes, 20000).split(/<START>/i)) {
    let cur = null, pending = null;
    for (const line of block.split(/\r?\n/)) {
      const u = line.match(/^\s*(?:\{\{\s*user\s*\}\}|<USER>)\s*:\s?(.*)$/i);
      const c = line.match(/^\s*(?:\{\{\s*char\s*\}\}|<BOT>)\s*:\s?(.*)$/i);
      if (u) { if (cur && cur.character) out.push(cur); cur = { user: u[1], character: "" }; pending = "user"; }
      else if (c) { if (!cur) cur = { user: "", character: "" }; else if (cur.character) { out.push(cur); cur = { user: "", character: "" }; } cur.character = c[1]; pending = "character"; }
      else if (cur && pending && line.trim()) cur[pending] += "\n" + line;
    }
    if (cur && cur.character) out.push(cur);
  }
  return out.map((e) => ({ user: e.user.trim(), character: e.character.trim() })).slice(0, 12);
}

function formatExamples(examples) {
  return examples.map((e) => `<START>\n{{user}}: ${e.user || "Hi."}\n{{char}}: ${e.character}`).join("\n");
}

/** a Character Card (V1 flat, V2 or V3) as a Havre card. A card that went out from Havre comes back whole. */
export function fromCharacterCard(cc) {
  const d = cc && cc.data && typeof cc.data === "object" ? cc.data : cc || {};
  const back = d.extensions && d.extensions.havre;
  if (back && typeof back === "object" && back.havre === HAVRE) return normalizeCard(back);
  const persona = [str(d.description), d.personality ? "Personality: " + str(d.personality) : "",
    d.scenario ? "Scenario: " + str(d.scenario) : "", d.system_prompt ? str(d.system_prompt) : ""]
    .map((s) => s.trim()).filter(Boolean).join("\n\n");
  let card = normalizeCard({
    name: d.name, tagline: str(d.personality).length <= 120 ? d.personality : "", greeting: d.first_mes,
    persona, examples: parseExamples(d.mes_example), tags: d.tags, creator: d.creator, license: "all-rights-reserved",
    voice: { short_form: false },
  });
  const src = arr(d.source).find((s) => typeof s === "string" && s);
  card = addLineage(card, { relation: "ported-from", name: card.name, creator: str(d.creator, 120), ref: src || "",
    note: `imported from a ${cc && cc.spec ? cc.spec.replace("chara_card_", "character card ") : "character card"}` });
  return card;
}

function cardData(card) {
  const notes = [card.voice.notes, card.voice.short_form ? SHORT_FORM : ""].filter(Boolean);
  const flow = card.flow.map((s, i) => `${i + 1}. ${s.stage.toUpperCase()}: ${s.goal}${s.next ? " Move on when " + s.next : ""}`);
  const description = [card.persona, notes.length ? "How {{char}} talks:\n" + notes.map((n) => "- " + n).join("\n") : "",
    flow.length ? "{{char}}'s flow with someone new:\n" + flow.join("\n") : ""].filter(Boolean).join("\n\n");
  const credits = card.lineage.map(creditLine);
  return {
    name: card.name, description, personality: card.tagline, scenario: "", first_mes: card.greeting,
    mes_example: formatExamples(card.examples),
    creator_notes: ["Made in Havre (" + SITE + ").", ...credits].join("\n"),
    system_prompt: "", post_history_instructions: "", alternate_greetings: [], tags: card.tags,
    creator: card.creator, character_version: "havre-" + HAVRE, extensions: { havre: card },
  };
}

export function toCharacterCardV2(card) {
  return { spec: "chara_card_v2", spec_version: "2.0", data: cardData(card) };
}

export function toCharacterCardV3(card) {
  const sec = (iso) => Math.floor((Date.parse(iso) || Date.now()) / 1000);
  const source = [...card.lineage.map((l) => refUrl(l.ref) || l.ref).filter(Boolean), SITE];
  return {
    spec: "chara_card_v3", spec_version: "3.0",
    data: { ...cardData(card), group_only_greetings: [], source: [...new Set(source)],
      creation_date: sec(card.created), modification_date: sec(card.updated) },
  };
}

// ---------- reading anything ----------

/** whatever someone dropped or pasted, as { card, kind, warnings } */
export function fromAny(input) {
  if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (isPng(bytes)) return { card: fromPng(bytes), kind: "png card", warnings: [] };
    input = new TextDecoder().decode(bytes);
  }
  const text = str(input, 4_000_000).trim();
  if (!text) throw new Error("There's nothing to import.");
  let o = null;
  if (text.startsWith("{")) {
    try { o = JSON.parse(text); } catch { throw new Error("That looks like JSON, but it doesn't parse."); }
  }
  if (o && o.havre === HAVRE) return { card: normalizeCard(o), kind: "havre card", warnings: validateCard(normalizeCard(o)) };
  if (o && (o.spec === "chara_card_v3" || o.spec === "chara_card_v2" || (o.name && (o.description || o.first_mes)))) {
    const kind = o.spec === "chara_card_v3" ? "character card V3" : o.spec === "chara_card_v2" ? "character card V2" : "character card V1";
    return { card: fromCharacterCard(o), kind, warnings: [] };
  }
  if (o) throw new Error("That JSON isn't a Havre card or a character card.");
  const first = text.split(/\n/)[0].replace(/^#+\s*/, "").trim();
  const named = first.length <= 40 && !/[.!?]$/.test(first) ? first : "";
  const card = normalizeCard({ name: named || "Pasted character", persona: named ? text.slice(first.length).trim() : text,
    license: "all-rights-reserved", voice: { short_form: true } });
  return { card, kind: "text", warnings: named ? [] : ["Give the character a name."] };
}

// ---------- PNG cards ----------

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
export function isPng(b) { return b.length > 8 && PNG_SIG.every((v, i) => b[i] === v); }

let CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunks(b) {
  if (!isPng(b)) throw new Error("not a PNG");
  const out = [], dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 8;
  while (p + 12 <= b.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(...b.subarray(p + 4, p + 8));
    if (p + 12 + len > b.length) throw new Error("truncated PNG");
    out.push({ type, start: p, end: p + 12 + len, data: b.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
    if (type === "IEND") break;
  }
  return out;
}

const latin1 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return s; };

/** the uncompressed text chunks of a PNG, as { keyword: text } (tEXt, and iTXt without compression) */
export function readPngText(b) {
  const out = {};
  for (const c of chunks(b)) {
    if (c.type === "tEXt") {
      const z = c.data.indexOf(0);
      if (z > 0) out[latin1(c.data.subarray(0, z))] = latin1(c.data.subarray(z + 1));
    } else if (c.type === "iTXt") {
      const z = c.data.indexOf(0);
      if (z <= 0 || c.data[z + 1] !== 0) continue;           // compressed iTXt: skipped
      let p = c.data.indexOf(0, z + 3); p = c.data.indexOf(0, p + 1);
      out[latin1(c.data.subarray(0, z))] = new TextDecoder().decode(c.data.subarray(p + 1));
    }
  }
  return out;
}

/** a copy of the PNG with these tEXt entries (replacing any with the same keyword), just before IEND */
export function writePngText(b, entries) {
  const keys = new Set(Object.keys(entries));
  const keep = [];
  let iend = null;
  for (const c of chunks(b)) {
    if (c.type === "IEND") { iend = c; break; }
    if ((c.type === "tEXt" || c.type === "iTXt") && keys.has(latin1(c.data.subarray(0, Math.max(0, c.data.indexOf(0)))))) continue;
    keep.push(b.subarray(c.start, c.end));
  }
  if (!iend) throw new Error("PNG has no IEND");
  const add = Object.entries(entries).map(([k, v]) => {
    const data = new Uint8Array(k.length + 1 + v.length);
    for (let i = 0; i < k.length; i++) data[i] = k.charCodeAt(i) & 0xFF;
    for (let i = 0; i < v.length; i++) data[k.length + 1 + i] = v.charCodeAt(i) & 0xFF;
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out.set([116, 69, 88, 116], 4);                           // "tEXt"
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  });
  const parts = [new Uint8Array(PNG_SIG), ...keep, ...add, b.subarray(iend.start, iend.end)];
  const total = parts.reduce((n, p) => n + p.length, 0), res = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { res.set(p, o); o += p.length; }
  return res;
}

export function b64encodeUtf8(s) {
  const bytes = new TextEncoder().encode(s);
  return btoa(latin1(bytes));
}
export function b64decodeUtf8(b64) {
  const bin = atob(str(b64, 8_000_000).replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function fromPng(bytes) {
  const t = readPngText(bytes);
  const raw = t.ccv3 || t.chara;
  if (!raw) throw new Error("That PNG has no character card inside it.");
  let o;
  try { o = JSON.parse(b64decodeUtf8(raw)); } catch { o = JSON.parse(raw); }
  return fromCharacterCard(o);
}

/** a PNG card: the portrait PNG with the card inside (ccv3 for V3 readers, chara for V2 ones) */
export function toPngCard(pngBytes, card) {
  return writePngText(pngBytes, {
    ccv3: b64encodeUtf8(JSON.stringify(toCharacterCardV3(card))),
    chara: b64encodeUtf8(JSON.stringify(toCharacterCardV2(card))),
  });
}

// ---------- remix with credit ----------

export const INTERVIEW = [
  "Hi! Introduce yourself to me like we just met, in two or three short texts.",
  "What do you want most, and what's in your way?",
  "What's something you would never do?",
  "How do you talk when you're excited, and how when you're annoyed?",
];

export const DISTILL_SYSTEM = "You read a character and write down only the ideas behind it, never its words. " +
  "Return one JSON object with these keys: archetype (string, at most 8 words), premise (string, at most 20 words), " +
  "drives, fears, voice, quirks, relationships, boundaries, themes (arrays of short phrases, at most 5 each), and " +
  "setting (string, at most 12 words). voice lists traits of how they talk (clipped, teasing, formal), never phrases " +
  "they say. quirks are behaviours, never catchphrases. relationships are roles (mentor to the user), never names. " +
  "Rules: no proper names anywhere, no quotations, nothing copied from the source, every item under 10 words.";

export const WRITE_SYSTEM = "You are a character writer. From a set of ideas and the creator's twist you write a " +
  "brand-new, original character. You have not seen any source text, so invent everything concrete: a new name, a new " +
  "backstory, new details, your own wording. Return one JSON object: name (a new name), tagline (at most 8 words), " +
  "greeting (one to three short texts separated by a blank line), persona (a system prompt in the second person, 120 " +
  "to 250 words: who they are, how they talk, what they want, what they won't do), examples (three objects with user " +
  "and character, the character's replies short, like texts), tags (at most five lowercase words).";

// no length limits in the schemas: strict structured output rejects them on some models; the prompts ask for brevity
const strings = () => ({ type: "array", items: { type: "string" } });
export const DISTILL_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["archetype", "premise", "drives", "fears", "voice", "quirks", "relationships", "boundaries", "themes", "setting"],
  properties: { archetype: { type: "string" }, premise: { type: "string" }, setting: { type: "string" },
    drives: strings(5), fears: strings(5), voice: strings(5), quirks: strings(5), relationships: strings(5),
    boundaries: strings(5), themes: strings(5) },
};
export const WRITE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["name", "tagline", "greeting", "persona", "examples", "tags"],
  properties: { name: { type: "string" }, tagline: { type: "string" }, greeting: { type: "string" }, persona: { type: "string" },
    examples: { type: "array", items: { type: "object", additionalProperties: false, required: ["user", "character"],
      properties: { user: { type: "string" }, character: { type: "string" } } } }, tags: strings(5) },
};
export const DISTILL_KEYS = ["archetype", "premise", "setting", "drives", "fears", "voice", "quirks", "relationships", "boundaries", "themes"];

export function distillMessages(sourceText) {
  return [{ role: "system", content: DISTILL_SYSTEM }, { role: "user", content: "The character:\n\n" + str(sourceText, 30000) }];
}

/** the writer gets the ideas, the twist and what to stay away from: never the source itself */
export function writeMessages(distillate, twist = "", avoid = []) {
  const ask = { ideas: distillate, twist: str(twist, 1000).trim() || "none", avoid: avoid.slice(0, 20) };
  return [{ role: "system", content: WRITE_SYSTEM },
    { role: "user", content: "Write a new character from these ideas. Do not use anything listed under avoid.\n\n" + JSON.stringify(ask, null, 1) }];
}

export function normalizeDistillate(o = {}) {
  const out = {};
  for (const k of DISTILL_KEYS) {
    const v = o[k];
    out[k] = ["archetype", "premise", "setting"].includes(k) ? str(Array.isArray(v) ? v.join(", ") : v, 200).trim()
      : arr(v).map((x) => str(x, 120).trim()).filter(Boolean).slice(0, 6);
  }
  return out;
}

/** the first JSON object in a model's reply, tolerating fences and chatter around it */
export function parseJsonLoose(text) {
  const t = stripThinking(text).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const read = (s) => {
    for (const x of [s, repairJson(s)]) { try { const o = JSON.parse(x); if (o && typeof o === "object") return o; } catch { /* the next way */ } }
    return null;
  };
  const whole = read(t);
  if (whole) return whole;
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") { if (depth++ === 0) start = i; }
    else if (ch === "}" && depth > 0 && --depth === 0) {
      const o = read(t.slice(start, i + 1));
      if (o) return o;
      start = -1;
    }
  }
  throw new Error("The model didn't return JSON.");
}

/**
 * JSON the way a model writes it without a schema to keep to, made readable: line breaks and tabs left raw inside a
 * string are escaped (a greeting of two texts usually has one), other control characters become spaces, and a comma
 * left before a closing bracket goes.
 */
export function repairJson(t) {
  let out = "", inStr = false, esc = false;
  const raw = { "\n": "n", "\r": "r", "\t": "t" };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) { esc = false; out += raw[ch] || ch; continue; }
      if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      else if (raw[ch]) { out += "\\" + raw[ch]; continue; }
      else if (ch < " ") { out += " "; continue; }
      out += ch;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === ",") {
      let j = i + 1;
      while (j < t.length && /\s/.test(t[j])) j++;
      if (t[j] === "}" || t[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}

/**
 * The model for a call that has to come back as JSON (a remix's two passes, a character's memory): the one given if it
 * keeps to a schema, else one like it that does (an uncensored one for an uncensored model), else Havre's default.
 * models: Venice's text models as venice.js lists them ({ id, json, uncensored, traits }); unknown, the one given.
 */
export function schemaModel(models, id) {
  const ms = arr(models), m = ms.find((x) => x.id === id);
  if (!ms.length || (m && m.json)) return id;
  const first = (f) => (ms.find((x) => x.json && f(x)) || {}).id;
  return (m && m.uncensored && (first((x) => x.id === "venice-uncensored-role-play") || first((x) => x.uncensored)))
    || first((x) => x.id === DEFAULT_MODEL) || first((x) => (x.traits || []).includes("default")) || id;
}

export function cardFromWrite(o, { source, check, model } = {}) {
  let card = normalizeCard({
    name: o.name, tagline: o.tagline, greeting: o.greeting, persona: o.persona, examples: o.examples, tags: o.tags,
    model, voice: { short_form: true }, license: "remix-with-credit",
  });
  // a writer that changed its mind about the name halfway through: the name it gave them wins, everywhere
  const other = nameClash(card);
  if (other) card = renamed(card, other, card.name);
  if (source) {
    const note = check ? `remixed in Havre; ${Math.round(check.share * 1000) / 10}% shared phrasing, longest shared run ${check.run.len} words` : "remixed in Havre";
    card = addLineage(card, { relation: "inspired-by", name: source.name, creator: source.creator || "", ref: source.ref || "", note });
  }
  return card;
}

// ---------- the similarity check ----------

const STOP = new Set(("a an and are as at be but by for from has have he her him his i i'm in is it it's its me my " +
  "of on or our she so that the their them they this to us was we were what when who will with you your you're " +
  "not no do don't can just like all one up out if about then than too very").split(" "));

export function tokens(s) {
  return (str(s, 200000).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’‘]/g, "'")
    .match(/[a-z0-9]+(?:'[a-z]+)?/g) || []);
}

function shingleSet(toks, n) {
  const s = new Set();
  for (let i = 0; i + n <= toks.length; i++) {
    const g = toks.slice(i, i + n);
    if (g.every((w) => STOP.has(w))) continue;                 // "and i want to be" says nothing about copying
    s.add(g.join(" "));
  }
  return s;
}

/** the longest run of words the two texts share, ignoring runs that are only filler words */
export function longestRun(a, b) {
  if (!a.length || !b.length) return { len: 0, text: "" };
  let best = 0, end = 0;
  let prev = new Uint16Array(b.length + 1), cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? Math.min(prev[j - 1] + 1, 65000) : 0;
      if (cur[j] > best) {
        const run = a.slice(i - cur[j], i);
        if (!run.every((w) => STOP.has(w))) { best = cur[j]; end = i; }
      }
    }
    [prev, cur] = [cur, prev];
    cur.fill(0);
  }
  return { len: best, text: a.slice(end - best, end).join(" ") };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** does the text use this name: the whole name, a surname anywhere, or a first name mid-sentence */
export function usesName(text, name) {
  const t = tokens(name).filter((w) => w.length > 2);
  if (!t.length) return false;
  const low = " " + tokens(text).join(" ") + " ";
  if (low.includes(" " + t.join(" ") + " ")) return true;
  if (t.length === 1) return low.includes(" " + t[0] + " ");
  const last = t[t.length - 1];
  if (!STOP.has(last) && low.includes(" " + last + " ")) return true;
  const first = str(name).trim().split(/\s+/)[0];
  return new RegExp("[^.!?\\n\\s]\\s+" + escapeRe(first) + "\\b").test(str(text));
}

export function nameSimilarity(x, y) {
  const a = str(x).toLowerCase().replace(/[^a-z0-9]/g, ""), b = str(y).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!a || !b) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

/** everything a reader sees of a card, as one text */
export function cardText(c) {
  return [c.name, c.tagline, c.greeting, c.persona, c.voice && c.voice.notes,
    ...(c.examples || []).map((e) => e.user + "\n" + e.character)].filter(Boolean).join("\n\n");
}

/**
 * How much of `newText` is phrasing from `srcText`. Fresh: under 3% of its five-word phrases are shared and no run
 * of 8 or more words. Close: under 12% and no run of 14. Too close: anything more, or the source's name reused.
 */
export function similarity(newText, srcText, { names = [], newName = "" } = {}) {
  const a = tokens(newText), b = tokens(srcText);
  const A = shingleSet(a, 5), B = shingleSet(b, 5);
  let shared = 0;
  const sharedList = [];
  for (const g of A) if (B.has(g)) { shared++; if (sharedList.length < 12) sharedList.push(g); }
  const share = A.size ? shared / A.size : 0;
  const run = longestRun(a, b);
  const nameHits = names.filter(Boolean).filter((n) => usesName(newText, n));
  const close = names.filter(Boolean).map((n) => [n, nameSimilarity(n, newName)]).filter(([, s]) => s >= 0.75).map(([n]) => n);
  const reasons = [];
  if (close.length) reasons.push(`its name is very like ${close.join(", ")}`);
  if (nameHits.length) reasons.push(`it mentions the source's name (${nameHits.join(", ")})`);
  if (run.len >= 8) reasons.push(`it shares a ${run.len}-word run: "${run.text}"`);
  if (share >= 0.03) reasons.push(`${Math.round(share * 1000) / 10}% of its five-word phrases come from the source`);
  let verdict = "fresh";
  if (close.length || share >= 0.12 || run.len >= 14) verdict = "too-close";
  else if (nameHits.length || share >= 0.03 || run.len >= 8) verdict = "close";
  return { verdict, share, shared, total: A.size, run, names: [...new Set([...nameHits, ...close])], sharedPhrases: sharedList, reasons };
}

/** phrases and names the writer should stay away from on a rewrite */
export function avoidList(check, sourceNames = []) {
  return [...new Set([...sourceNames.filter(Boolean), check.run.len >= 5 ? check.run.text : "", ...check.sharedPhrases])].filter(Boolean).slice(0, 20);
}

export async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ---------- for agents ----------

export function agentPrompt(who = "<describe your character in a sentence or two>") {
  return `Make me a character for Havre.
Who: ${who}

First read ${SITE}skill.md and follow it. Write the character as a Havre card (a .havre.json file that passes ${SITE}card.schema.json), and also give me the same character as a Character Card V3 JSON. Keep their replies short-form: texts, not paragraphs.`;
}

export function fileName(card, ext) { return `${card.id || slugify(card.name)}.${ext}`; }
