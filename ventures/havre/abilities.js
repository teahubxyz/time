// abilities.js: what a character can do besides texting, and what you can send them. Pure functions, no DOM: the
// page imports this module, and so do the tests.
//
//   photos       an edit of the character's own pictures (their portrait and the reference pictures on their card),
//                with the shot written from the conversation by a text model. Venice's safe mode stays on.
//   clips        a few seconds of video from the same pictures (Venice's reference-to-video models), priced by
//                Venice before anything is made
//   voice notes  a reply read out in the character's voice, with a mood
//   hearing      your voice note, transcribed (only if you switch it on)
//   seeing       your photo, shown to a model that can see, or described to one that can't (only if you switch it on)

const str = (v, max = 20000) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
const clip = (s, n) => (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)).replace(/\s+\S*$/, "") + "…");

// ---------- the models, and which one to use when nobody picked ----------

/** the ones Havre reaches for first, if Venice still has them; otherwise a private one, otherwise the first */
export const PREFER = {
  photo: ["grok-imagine-edit", "firered-image-edit", "qwen-image-2-1-turbo-edit"],
  portrait: ["grok-imagine-image", "z-image-turbo"],
  clip: ["grok-imagine-1-5-reference-to-video-private", "grok-imagine-reference-to-video-private"],
  voice: ["tts-kokoro"],
  hearing: ["nvidia/parakeet-tdt-0.6b-v3", "openai/whisper-large-v3"],
};
export const DEFAULT_VOICE = "af_sky";

export function pick(list, prefer = []) {
  if (!list || !list.length) return null;
  for (const id of prefer) { const m = list.find((x) => x.id === id); if (m) return m; }
  return list.find((m) => m.privacy === "private") || list[0];
}
/** the model that was picked, if Venice still has it, else the default for that kind */
export function chosen(list, id, kind) {
  return (list && id && list.find((m) => m.id === id)) || pick(list, PREFER[kind] || []);
}

/** clips come from reference-to-video models; Venice's adult ones (the "enhanced" and uncensored variants) stay out */
export const isClipModel = (m) => !!m && m.ref && !m.uncensored && !/enhanced/i.test(m.id);

/** a model that describes your photo when the character's own model can't see: the cheapest private one that can */
export function seer(textModels, id = "") {
  const can = (textModels || []).filter((m) => m.vision);
  const mine = id && can.find((m) => m.id === id);
  if (mine) return mine;
  const pool = can.filter((m) => m.privacy === "private");
  return [...(pool.length ? pool : can)].sort((a, b) => (a.input ?? 1e9) - (b.input ?? 1e9))[0] || null;
}

// ---------- prices ----------

/** "$0.03", "$0.0007", "$12": enough digits to see the price, no more */
export function usd(n) {
  if (n == null || !Number.isFinite(n)) return "?";
  if (n === 0) return "$0";
  if (n >= 100) return "$" + n.toFixed(0);
  if (n >= 0.01) return "$" + n.toFixed(2);
  if (n < 0.0001) return "under $0.0001";
  return "$" + String(Number(n.toPrecision(2)));
}
/** a photo: the model's price, plus what it charges for each picture past the ones included */
export function photoPrice(model, pictures = 1) {
  if (!model || model.price == null) return null;
  const extra = model.extra ? Math.max(0, pictures - (model.included ?? 1)) * model.extra : 0;
  return Math.round((model.price + extra) * 10000) / 10000;
}
/** a voice note of this many characters */
export const voicePrice = (model, chars) => (model && model.perMChars != null ? (model.perMChars * chars) / 1e6 : null);
/** a minute of your voice, heard */
export const hearingPerMinute = (model) => (model && model.perSecond != null ? model.perSecond * 60 : null);

// ---------- what goes into a photo or a clip ----------

const SAFE = "Keep it safe for work: no nudity, nothing sexual, no gore. Everyone shown is an adult. Never show a real, " +
  "identifiable person: no celebrities, no public figures, no one the conversation says is real; if one is asked for, show " +
  "the character alone. No words, logos or watermarks in the picture.";

export const PHOTO_SYSTEM = "You write the shot for a photo that a character in a chat is about to send: what the camera " +
  "sees. Use what is happening in the conversation and what was asked for. One paragraph of at most 60 words: where they " +
  "are, what they are doing, how they are framed, the light and the mood. Call the character \"the character from the " +
  "reference picture\" and don't describe their face, hair or body: the reference picture shows how they look. " + SAFE +
  " Reply with the shot only.";

export const CLIP_SYSTEM = "You write the shot for a video clip, a few seconds long, that a character in a chat is about to " +
  "send. Use what is happening in the conversation and what was asked for. One paragraph of at most 60 words: one simple " +
  "action, where it happens, how the camera moves, the light and the mood. Call the character \"the character from the " +
  "reference pictures\" and don't describe their face, hair or body: the pictures show how they look. " + SAFE +
  " Reply with the shot only.";

export const LOOK_SYSTEM = "You describe how an original character looks, for a portrait of them. One paragraph of at most " +
  "45 words: their apparent age (an adult), face, hair, build and clothes, and one detail people remember. Invent what " +
  "isn't given. Never describe a real person. Reply with the description only.";

export const SEE_PROMPT = "Describe this photo in two or three plain sentences for someone who can't see it: what is in " +
  "it, what is happening, and where. Don't guess who anyone is. Reply with the description only.";

/** the last few lines of the conversation, as a model would read them */
function transcript(card, history, n = 10) {
  return history.filter((m) => !m.hidden && (m.role === "user" || m.role === "assistant")).slice(-n)
    .map((m) => `${m.role === "user" ? "Them" : card.name}: ${clip(str(m.content).replace(/\s+/g, " ").trim(), 300)}`);
}

/** the messages for a text model to write the shot: the character, the conversation, what was asked for */
export function shotMessages(card, history, ask = "", kind = "photo") {
  const lines = transcript(card, history);
  const look = card.look && card.look.description;
  const user = [
    `The character: ${card.name}${card.tagline ? ". " + card.tagline : ""}`,
    look ? `How they look: ${look}` : "",
    lines.length ? "The conversation so far, latest last:\n" + lines.join("\n") : "The conversation hasn't started yet.",
    "What was asked for: " + (str(ask, 500).trim() || "nothing in particular. Pick a moment that fits the conversation."),
    `Write the shot for the ${kind === "clip" ? "clip" : "photo"} ${card.name} sends now.`,
  ].filter(Boolean).join("\n\n");
  return [{ role: "system", content: kind === "clip" ? CLIP_SYSTEM : PHOTO_SYSTEM }, { role: "user", content: user }];
}

/** the messages for a text model to describe how a character looks, when their card doesn't say */
export function lookMessages(card) {
  const about = [card.tagline, card.persona && clip(card.persona.replace(/\s+/g, " "), 700)].filter(Boolean).join("\n");
  return [{ role: "system", content: LOOK_SYSTEM },
    { role: "user", content: `The character: ${card.name}\n${about || "Nothing else is known: invent them."}` }];
}

/** a model's reply as one clean paragraph: no thinking, no labels, no quotes around it */
export function cleanText(text, max = 900) {
  const t = str(text, 20000).replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "")
    .replace(/^\s*(?:\*\*)?(?:the )?(?:shot|description|look|photo|clip)(?:\*\*)?\s*:\s*/i, "")
    .replace(/\s+/g, " ").trim().replace(/^["“'](.*)["”']$/, "$1").trim();
  return clip(t, max);
}

// the rules ride at the front of every picture and clip, where a long shot can't push them out
const KEEP = "Safe for work: fully clothed, nothing sexual, no gore; everyone shown is an adult.";

/** what the photo model is told: keep the character as the pictures show them, in the shot */
export function photoPrompt(card, shot, pictures = 1, limit = 1500) {
  const lead = pictures > 1
    ? `The reference pictures show ${card.name}. Keep how they look exactly: face, hair, build, clothes and style.`
    : `The reference picture shows ${card.name}. Keep how they look exactly: face, hair, build, clothes and style.`;
  return clip(`${lead} ${KEEP} New photo: ${str(shot).trim()} A natural photo with no text in it.`, limit);
}
export function clipPrompt(card, shot, limit = 2500) {
  return clip(`The reference pictures show ${card.name}. Keep how they look exactly. ${KEEP} ${str(shot).trim()}`, limit);
}
/** a first portrait, when a character has no picture at all */
export function portraitPrompt(card, limit = 1500) {
  const look = ((card.look && card.look.description) || card.tagline || "an original character").trim().replace(/[.!?…]+$/, "");
  return clip(`Portrait photo of ${card.name}, an original adult character: ${look}. ${KEEP} Head and shoulders, soft light, ` +
    "plain background, no text.", limit);
}

/** the words of a reply, ready to be read out: no thinking, no code, no stage directions */
export function speakable(text, max = 4000) {
  const t = str(text, 100000).replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/\*[^*\n]{1,200}\*/g, " ").replace(/[_#>`]/g, " ").replace(/\s+/g, " ").trim();
  return clip(t, max);
}

// ---------- clips: length, size, shape ----------

/** the options a clip model takes, starting from what was picked last time where the model allows it */
export function clipOptions(model, last = {}) {
  if (!model) return null;
  const has = (list, v) => !!v && list.includes(v);
  const secs = (d) => parseInt(d, 10) || 0;
  const durations = model.durations || [], resolutions = model.resolutions || [], aspects = model.aspects || [];
  const duration = has(durations, last.duration) ? last.duration : durations.includes("5s") ? "5s"
    : durations.find((d) => secs(d) >= 4) || durations[0] || "5s";
  const resolution = has(resolutions, last.resolution) ? last.resolution
    : resolutions.find((r) => /^720p$/i.test(r)) || resolutions[0] || "";
  const aspect = has(aspects, last.aspect) ? last.aspect : aspects.includes("9:16") ? "9:16" : aspects[0] || "";
  const out = { duration, resolution, aspect };
  if (model.audioConfigurable) out.audio = last.audio !== false;
  return out;
}

// ---------- the conversation as the model reads it ----------

/**
 * A conversation with pictures and voice notes in it, as plain messages for a text model. A photo or clip the
 * character sent is mentioned in the next thing the person says ("(You sent me a photo: …)"), so the model knows
 * about it without learning to write "[photo]" itself. Your photo is "[a photo: what it shows]", your voice note is
 * the words you said.
 */
export function apiHistory(history) {
  const out = [];
  let notes = [];
  for (const m of history || []) {
    if (!m || m.demo) continue;
    const media = m.media || null;
    if (m.role === "assistant") {
      if (media && (media.kind === "photo" || media.kind === "clip")) {
        const shot = clip(str(media.shot).trim(), 300).replace(/[.!?…\s]+$/, "");
        notes.push(`(You sent me ${media.kind === "clip" ? "a short video" : "a photo"}${shot ? ": " + shot : ""}.)`);
      } else if (str(m.content).trim()) out.push({ role: "assistant", content: str(m.content) });
    } else if (m.role === "user") {
      let content = str(m.content);
      if (media && media.kind === "photo-in") content = `[a photo${media.saw ? ": " + media.saw : ""}]` + (content ? " " + content : "");
      if (notes.length) { content = notes.join(" ") + (content ? "\n\n" + content : ""); notes = []; }
      out.push({ role: "user", content, ...(m.hidden ? { hidden: true } : {}) });
    }
  }
  return out;
}

/** the last thing the person said, with their photo attached for a model that can see */
export function withPicture(messages, dataUrl) {
  if (!dataUrl) return messages;
  const i = messages.map((m) => m.role).lastIndexOf("user");
  if (i < 0) return messages;
  const copy = messages.slice();
  copy[i] = { role: "user", content: [{ type: "text", text: str(copy[i].content) || "[a photo]" }, { type: "image_url", image_url: { url: dataUrl } }] };
  return copy;
}

/** every picture, voice note and clip a set of conversations still points at */
export function mediaIds(chats) {
  const ids = new Set();
  for (const hist of Object.values(chats || {})) for (const m of Array.isArray(hist) ? hist : []) {
    if (m && m.media && m.media.id) ids.add(m.media.id);
    if (m && m.voice && m.voice.id) ids.add(m.voice.id);
  }
  return ids;
}

// ---------- on their own: a character sends a photo or a voice note when it fits, and offers a clip ----------

export const MOVE_SYSTEM = "You decide whether a character in a chat does something besides texting, right after the " +
  "reply they just sent. Choose one move: \"photo\" (they send a photo of themselves because it fits: they were asked " +
  "for one, or they mention where they are, what they're doing or wearing, or something worth showing), \"voice\" (they " +
  "send that reply as a voice note too: a feeling, a laugh, a whisper, something better said aloud), \"clip\" (a few " +
  "seconds of video, only for a moment that needs moving pictures), or \"nothing\" (most of the time). Never two photos " +
  "in a row. For a photo or a clip, write the shot: what the camera sees, at most 60 words, calling them \"the character " +
  "from the reference picture\" instead of describing their face, hair or body. " + SAFE +
  " Reply with one JSON object: {\"move\": \"photo\" | \"voice\" | \"clip\" | \"nothing\", \"shot\": \"...\"}.";

export const MOVE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["move", "shot"],
  properties: { move: { type: "string", enum: ["photo", "voice", "clip", "nothing"] }, shot: { type: "string" } },
};

/** the messages for a text model to decide the character's next move */
export function moveMessages(card, history) {
  const lines = transcript(card, history, 12);
  const look = card.look && card.look.description;
  return [{ role: "system", content: MOVE_SYSTEM }, { role: "user", content: [
    `The character: ${card.name}${card.tagline ? ". " + card.tagline : ""}`,
    look ? `How they look: ${look}` : "",
    "The conversation, latest last (their reply just now is the last line):\n" + lines.join("\n"),
  ].filter(Boolean).join("\n\n") }];
}

/** a decision as { move, shot }; anything unclear is "nothing" */
export function normalizeMove(o) {
  const move = ["photo", "voice", "clip", "nothing"].includes(o && o.move) ? o.move : "nothing";
  const shot = cleanText(o && o.shot, 900);
  return (move === "photo" || move === "clip") && !shot ? { move: "nothing", shot: "" } : { move, shot: move === "voice" || move === "nothing" ? "" : shot };
}

// words that make a move likely: asking to see or hear them, or a reply about where they are and what they're doing
const ASKS = /\b(pics?|picture|photo|selfie|snap|show me|see you|see it|what (?:do )?you look like|look like|wearing|outfit|send (?:me )?(?:a|one|it)|video|clip|film|hear you|your voice|say it|sing|whisper|out loud|aloud)\b/i;
const SHOWS = /\b(look at (?:this|my|the)|wearing|outfit|dress|view from|sunset|sunrise|my (?:room|place|desk|garden|kitchen|car|boat|bed|window)|just got (?:back|a|my)|i'?m (?:at|in|on) the|picture|photo|selfie|whisper)\b/i;

/**
 * Whether to think about a move after this reply: when the person asked to see or hear them, when the reply talks
 * about something worth showing, or now and then (every sixth reply).
 */
export function moveLikely(history, { every = 6 } = {}) {
  const real = (history || []).filter((m) => m && !m.demo && !m.hidden);
  const last = real.at(-1), said = [...real].reverse().find((m) => m.role === "user");
  if (!last || last.role !== "assistant" || last.media) return false;
  if ((said && ASKS.test(str(said.content))) || SHOWS.test(str(last.content))) return true;
  return real.filter((m) => m.role === "assistant" && !m.media).length % every === 0;
}
/** did they send a photo or clip of their own in the last few messages (so not another one yet) */
export function sentLately(history, gap = 4) {
  return (history || []).filter((m) => m && !m.demo && !m.hidden).slice(-gap).some((m) => m.role === "assistant" && m.media && m.media.own);
}

// ---------- the daily allowance for what they do on their own ----------

/** what was spent today, from a { day, usd } record; a new day starts at zero */
export function spentToday(rec, day) { return rec && rec.day === day ? Number(rec.usd) || 0 : 0; }
/** a record with usd more spent (or less, for a refund), never below zero */
export function spend(rec, day, usd) { return { day, usd: Math.max(0, Math.round((spentToday(rec, day) + (usd || 0)) * 100000) / 100000) }; }
/** a price that is known, and fits in what's left today */
export const canSpend = (rec, day, allowance, usd) => usd != null && Number.isFinite(usd) && usd >= 0 && spentToday(rec, day) + usd <= allowance + 1e-9;

/** what a text call costs, from Venice's usage and the model's prices per million tokens (unknown prices count high) */
export function callCost(usage, model) {
  const inP = model && model.input != null ? model.input : 3, outP = model && model.output != null ? model.output : 15;
  const u = usage || {}, inT = u.prompt_tokens ?? (u.total_tokens || 0), outT = u.completion_tokens ?? 0;
  return (inT * inP + outT * outP) / 1e6;
}
/** what a text call will cost at most, before it's made: the messages' length, and the most it may write */
export function callEstimate(messages, maxTokens, model) {
  const chars = (messages || []).reduce((n, m) => n + str(typeof m.content === "string" ? m.content : JSON.stringify(m.content)).length, 0);
  return callCost({ prompt_tokens: Math.ceil(chars / 3) + 50, completion_tokens: maxTokens }, model);
}

// ---------- texting first when you come back ----------

export const BACK_AFTER = 6 * 3600e3;
/** what a character hears (and you don't see) when you come back after a while: text them first */
export function comeBack(ms) {
  const h = Math.round(ms / 3600e3);
  const gap = h < 24 ? `about ${h} hours` : h < 48 ? "about a day" : `about ${Math.round(h / 24)} days`;
  return `[Time passes: ${gap} since you last talked. They just came back to the chat. Text them first, in character, ` +
    "picking up naturally, in a line or two.]";
}
/** how long since the conversation's last message, if its time is known */
export function since(history, now) {
  const last = [...(history || [])].reverse().find((m) => m && !m.demo && typeof m.at === "number");
  return last ? now - last.at : 0;
}
