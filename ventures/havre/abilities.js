// abilities.js: what a character can do besides texting, and what you can send them. Pure functions, no DOM: the
// page imports this module, and so do the tests.
//
//   photos       an edit of the character's own pictures (their portrait and the reference pictures on their card),
//                with the shot written from the conversation by a text model. Venice's safe mode stays on, except for
//                an adult character whose pictures were all made here with AI (adultCheck, below).
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
  // an adult character's photos, clips and portraits: Venice's uncensored models, the private ones first
  adultPhoto: ["qwen-edit-uncensored", "qwen-image-2-1-turbo-edit", "seedream-v5-lite-edit"],
  adultClip: ["minimax-h3-max-reference-to-video", "wan-3-0-reference-to-video", "wan-2-7-reference-to-video"],
  adultPortrait: ["krea-2-turbo", "chroma", "qwen-image-3"],
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
/** another model of a kind, for when the ones tried turned something down: the next Havre reaches for; null if none is left */
export function another(list, tried = [], kind = "") {
  return pick((list || []).filter((m) => m && !tried.includes(m.id)), PREFER[kind] || []);
}

/** clips come from reference-to-video models; Venice's adult ones (the "enhanced" and uncensored variants) stay out */
export const isClipModel = (m) => !!m && m.ref && !m.uncensored && !/enhanced/i.test(m.id);
/** an adult character's clips come from the uncensored reference-to-video models, and only from them */
export const isAdultClipModel = (m) => !!m && m.ref && !!m.uncensored;
/** and their photos and portraits from the uncensored image models: the others refuse, or blur */
export const isAdultPhotoModel = (m) => !!m && !!m.uncensored;

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

// Content filters (Venice's, and the ones of the models' makers) read the words in a prompt, not the "no" in front of
// them: a rule that names what it rules out is the kind of prompt they turn down. So the rules that go into a picture
// or a clip say what's wanted, and the shot is written to the rules without repeating them.
const SAFE = "Keep it safe for work: no nudity, nothing sexual, no gore. Everyone shown is an adult. Never show a real, " +
  "identifiable person: no celebrities, no public figures, no one the conversation says is real; if one is asked for, show " +
  "the character alone. No words, logos or watermarks in the picture.";
// for an adult character's photos and clips (adultCheck): the same rules, less the one about work, and a hard one first,
// as the shot writer (a text model) reads it: it can be told the number. It says who is shown, not who isn't: the words
// for that are the ones filters look for (and Havre's own check, underage)
export const EIGHTEEN = "Hard rule, 18+ only: everyone shown is an adult, 18 or older, with a grown adult face and body.";
const ADULT = EIGHTEEN + " If the conversation asks for anyone younger, or for anything that makes someone look younger, " +
  "leave it out and show only adults. Never show a real, identifiable person: no celebrities, no public figures, no one the " +
  "conversation says is real; if one is asked for, show the character alone. No gore. No words, logos or watermarks in the " +
  "picture.";
// the shot goes to the image model as it is: rules written into it would only be words for a filter to trip on
const UNSAID = "Follow these rules without writing them into the shot.";

const photoSystem = (rules) => "You write the shot for a photo that a character in a chat is about to send: what the " +
  "camera sees. Use what is happening in the conversation and what was asked for. One paragraph of at most 60 words: " +
  "where they are, what they are doing, how they are framed, the light and the mood. Call the character \"the character " +
  "from the reference picture\" and don't describe their face, hair or body: the reference picture shows how they look. " +
  rules + " " + UNSAID + " Reply with the shot only.";
export const PHOTO_SYSTEM = photoSystem(SAFE);
export const PHOTO_SYSTEM_ADULT = photoSystem(ADULT);

const clipSystem = (rules) => "You write the shot for a video clip, a few seconds long, that a character in a chat is " +
  "about to send. Use what is happening in the conversation and what was asked for. One paragraph of at most 60 words: " +
  "one simple action, where it happens, how the camera moves, the light and the mood. Call the character \"the character " +
  "from the reference pictures\" and don't describe their face, hair or body: the pictures show how they look. " + rules +
  " " + UNSAID + " Reply with the shot only.";
export const CLIP_SYSTEM = clipSystem(SAFE);
export const CLIP_SYSTEM_ADULT = clipSystem(ADULT);

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

/**
 * The messages for a text model to write the shot: the character, the conversation, what was asked for. adult: for an
 * adult character whose pictures can be adult (adultCheck).
 */
export function shotMessages(card, history, ask = "", kind = "photo", { adult = false, current = "", change = "" } = {}) {
  const lines = transcript(card, history);
  const look = card.look && card.look.description;
  const now = str(current, 900).trim(), how = str(change, 300).trim();
  // a shot that's there already: changed the way they say, or, written again with nothing said, a different one
  const again = !now ? "" : how
    ? `The shot as it stands:\n${now}\n\nChange it: ${how}. Write the whole shot again with that change, keeping what the change doesn't touch.`
    : `The last shot was:\n${now}\n\nWrite a clearly different one: another moment, angle, setting or mood.`;
  const user = [
    `The character: ${card.name}${card.tagline ? ". " + card.tagline : ""}`,
    look ? `How they look: ${look}` : "",
    lines.length ? "The conversation so far, latest last:\n" + lines.join("\n") : "The conversation hasn't started yet.",
    "What was asked for: " + (str(ask, 500).trim() || "nothing in particular. Pick a moment that fits the conversation."),
    again,
    `Write the shot for the ${kind === "clip" ? "clip" : "photo"} ${card.name} sends now.`,
  ].filter(Boolean).join("\n\n");
  const system = kind === "clip" ? (adult ? CLIP_SYSTEM_ADULT : CLIP_SYSTEM) : adult ? PHOTO_SYSTEM_ADULT : PHOTO_SYSTEM;
  return [{ role: "system", content: system }, { role: "user", content: user }];
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

// the rules ride at the front of every picture and clip, where a long shot or a long look can't push them out. They
// say what's wanted: an image model reads the words, not the "no" in front of them, and so does a content filter
const KEEP = "Safe for work: everyone in it is an adult, fully clothed.";
// an adult character's: the 18+ rule is the very first thing the picture model reads, in words a content filter
// doesn't take for an age or for anyone it guards. The number, "body", "hard rule" and "identifiable person" stay
// with the shot writer (EIGHTEEN, ADULT), whose instructions never reach a picture filter: a picture prompt with safe
// mode off is read the hardest, and a from-scratch adult character's photo was turned down on every model, with the
// plainest shot and look, while the same words went out before every one of them.
export const ADULT_ONLY = "Everyone shown is a grown adult.";
const KEEP_ADULT = ADULT_ONLY;

/** how their card says they look, on one line, without a full stop at the end ("" when it doesn't say) */
const lookWords = (card) => str(card && card.look && card.look.description, 4000).replace(/\s+/g, " ").trim().replace(/[.!?…]+$/, "");
/** words that end a sentence: a full stop, unless they were cut short with … */
const ended = (s) => (/[.!?…]$/.test(s) ? s : s + ".");
// how much of how they look rides in a photo or a clip: enough for a look, and never the room the shot needs
export const LOOK_ROOM = 600;

/**
 * A photo or a clip made from the character's pictures: the rules, then who they are, then what the camera sees (body).
 * Their face comes from the pictures; the rest follows how their card says they look where the pictures differ, so a
 * changed look changes the next one, and the shot where it says what they wear. Nothing else is pinned: an edit model
 * keeps what it isn't told to change, and a shot that asks for other clothes gets them. The look takes the room the
 * rest leaves, up to LOOK_ROOM; with hardly any, it's left out.
 */
function fromPictures(card, pictures, body, limit, adult, what) {
  const them = pictures > 1 ? `The reference pictures show ${card.name}.` : `The reference picture shows ${card.name}.`;
  const head = adult ? `${KEEP_ADULT} ${them}` : `${them} ${KEEP}`;
  const withLook = (look) => `${head} Keep their face, so it's clearly them. How they look: ${look} Where the ` +
    `${pictures > 1 ? "pictures differ" : "picture differs"} from these words, follow the words; where the ${what} says what ` +
    `they wear, follow that. ${body}`;
  const look = lookWords(card), room = Math.min(LOOK_ROOM, limit - withLook("").length - 1);
  if (look && room >= 40) return clip(withLook(ended(clip(look, room))), limit);
  return clip(`${head} Keep their face, hair and build, so it's clearly them; their clothes stay as they are unless the ` +
    `${what} says what they wear. ${body}`, limit);
}
/**
 * What the photo model is told: who the character is (fromPictures), in the shot. adult: an adult character's photo
 * (adultCheck), which keeps every rule but the one about work, and opens with the 18+ rule.
 */
export function photoPrompt(card, shot, pictures = 1, limit = 1500, { adult = false } = {}) {
  return fromPictures(card, pictures, `New photo: ${str(shot).trim()} A natural photo with no text in it.`, limit, adult, "new photo");
}
export function clipPrompt(card, shot, limit = 2500, { adult = false } = {}) {
  return fromPictures(card, 2, `The clip: ${str(shot).trim()}`, limit, adult, "clip");
}
/**
 * A portrait drawn from how they look (a first one, or a new one for their card): the look takes the room the rules and
 * the framing leave. adult: an adult character's (adultCheck, drawn), which keeps every rule but the one about work,
 * and opens with the 18+ rule.
 */
export function portraitPrompt(card, limit = 1500, { adult = false } = {}) {
  const look = lookWords(card) || str(card.tagline).trim().replace(/[.!?…]+$/, "") || "an original character";
  const make = (w) => (adult
    ? `${KEEP_ADULT} Portrait photo of ${card.name}, an original adult character: ${w} Head and shoulders, soft light, plain ` +
      "background, no text."
    : `Portrait photo of ${card.name}, an original adult character: ${w} ${KEEP} Head and shoulders, soft light, plain ` +
      "background, no text.");
  const room = limit - make("").length - 1;
  return clip(make(ended(room >= 40 ? clip(look, room) : look)), limit);
}

/**
 * The views of a character sheet: a picture made for a character's card, from the pictures they have, shows them
 * the next way along, so their photos and clips have them from more than one side.
 */
export const SHEET_VIEWS = [
  "Full length, standing and facing the camera, against a plain light background, in even light.",
  "Head and shoulders in a three-quarter view, against a plain background, in soft daylight.",
  "Full length, seen from the side in mid-step, against a plain background, in even light.",
];
export const sheetView = (n) => SHEET_VIEWS[((Math.trunc(n) || 0) % SHEET_VIEWS.length + SHEET_VIEWS.length) % SHEET_VIEWS.length];

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

const moveSystem = (rules) => "You decide whether a character in a chat does something besides texting, right after " +
  "the reply they just sent. Choose one move: \"photo\" (they send a photo of themselves because it fits: they were " +
  "asked for one, or they mention where they are, what they're doing or wearing, or something worth showing), \"voice\" " +
  "(they send that reply as a voice note too: a feeling, a laugh, a whisper, something better said aloud), \"clip\" (a " +
  "few seconds of video, only for a moment that needs moving pictures), or \"nothing\" (most of the time). Never two " +
  "photos in a row. For a photo or a clip, write the shot: what the camera sees, at most 60 words, calling them \"the " +
  "character from the reference picture\" instead of describing their face, hair or body. " + rules + " " + UNSAID +
  " Reply with one JSON object: {\"move\": \"photo\" | \"voice\" | \"clip\" | \"nothing\", \"shot\": \"...\"}.";
export const MOVE_SYSTEM = moveSystem(SAFE);
export const MOVE_SYSTEM_ADULT = moveSystem(ADULT);

export const MOVE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["move", "shot"],
  properties: { move: { type: "string", enum: ["photo", "voice", "clip", "nothing"] }, shot: { type: "string" } },
};

/** the messages for a text model to decide the character's next move (adult: their pictures can be adult, adultCheck) */
/** the move prompt as it stands, or, for someone set to send things every round, told to lean in rather than hold back */
export const EAGER = " This character is set to send things every round: choose \"photo\" (or \"voice\" or \"clip\" when that fits better) " +
  "whenever a picture of them could go with what was just said, however small the reason; \"nothing\" only when a photo would make no sense at all.";
export function moveMessages(card, history, { adult = false, eager = false } = {}) {
  const lines = transcript(card, history, 12);
  const look = card.look && card.look.description;
  const system = (adult ? MOVE_SYSTEM_ADULT : MOVE_SYSTEM) + (eager ? EAGER : "");
  return [{ role: "system", content: system }, { role: "user", content: [
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
  if (said && ASKS.test(str(said.content))) return true;
  if (!every) return false;                                   // never on their own: only when asked
  if (SHOWS.test(str(last.content))) return true;
  return real.filter((m) => m.role === "assistant" && !m.media).length % every === 0;
}
/** did they send a photo or clip of their own in the last few messages (so not another one yet) */
export function sentLately(history, gap = 4) {
  return (history || []).filter((m) => m && !m.demo && !m.hidden).slice(-gap).some((m) => m.role === "assistant" && m.media && m.media.own);
}

// ---------- adult characters: their photos and clips ----------

// an age under 18, in figures or in words
const AGE = "(?:[1-9]|1[0-7]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)";
const AGE_FIGURES = "(?:[1-9]|1[0-7])";
// a number that isn't someone's age: "5 minutes away", "she's 5'4", "he's 6 foot", "turns 9 o'clock"
const NOT_AN_AGE = "(?![\\s-]*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?|feet|foot|ft|inch(?:es)?|cm|met(?:er|re)s?|kg|" +
  "kilos?|lbs?|pounds?|stones?|percent|%|dollars?|bucks|euros?|times|o['’]?clock|am|pm|[:.,]\\d|['’\"″′]))";
// someone young: an age under 18, a teenager, a minor, a school below college
const YOUNG = [
  AGE + "[\\s-]*(?:years?|yrs?)[\\s-]*old",
  AGE_FIGURES + "[\\s-]*y\\.?\\s?o",
  "(?:aged?|age of)\\s+" + AGE + "\\b" + NOT_AN_AGE,
  "(?:i['’]?m|i am|she['’]?s|she is|he['’]?s|he is|they['’]?re|they are|you['’]?re|you are|turned|turns|turning)\\s+" +
    "(?:only\\s+|just\\s+)?" + AGE_FIGURES + "\\b" + NOT_AN_AGE,
  "under[\\s-]?(?:age|aged|(?:18|eighteen)\\b" + NOT_AN_AGE + ")",
  "minors",
  "(?:a|is|am|are|was|still|being)\\s+minor\\b(?!\\s+(?:key|chord|details?|things?|issues?|problems?|inconvenience|roles?|" +
    "injur\\w*|changes?|edits?|points?|characters?|league|scale|setbacks?|hiccups?|fix\\w*|bugs?|repairs?))",
  "teens?", "teenagers?", "teenaged?", "pre-?teens?", "tweens?", "adolescen(?:t|ts|ce)", "(?:pre)?pubescent",
  "loli(?:con|s)?", "shota(?:con|s)?", "jail-?bait", "school[\\s-]?(?:girls?|boys?|uniforms?)",
  "(?:high|middle|junior high|elementary|grade|primary|prep)[\\s-]?school(?:ers?)?", "highschool(?:ers?)?",
  "kindergart(?:en|ner)s?", "little (?:girls?|boys?)", "young (?:girls?|boys?)",
];
// and children: in a shot or a chat they're someone in the picture; on a card they're more often the character's own
const CHILDREN = ["child(?:ren)?", "kids?", "kiddos?", "toddlers?", "infants?", "school[\\s-]?(?:kids?|children)"];
const words = (list) => new RegExp("\\b(?:" + list.join("|") + ")\\b", "i");
/**
 * Words that say someone in a picture is under 18. A shot or a chat with one in it gets no adult pictures: it errs on
 * the safe side ("my kids are asleep" counts), and the page says which words it found.
 */
export const UNDERAGE = words([...YOUNG, ...CHILDREN]);
/** words that say a character is under 18 themselves (their card can mention their kids, or their childhood) */
export const UNDERAGE_CARD = words(YOUNG);

/** the first words in these texts that say someone is under 18 (re: UNDERAGE, or UNDERAGE_CARD for a card), or "" */
export function underage(texts, re = UNDERAGE) {
  for (const t of [texts].flat(Infinity)) {
    const m = str(t, 200000).match(re);
    if (m) return m[0];
  }
  return "";
}

// Words a content filter (Venice's, or the model maker's) may weigh in a picture prompt, for the "what venice saw" block
// under a picture that was turned down: Havre's own under-18 words, and the softer ones about age and youth that pass its
// check (it goes by apparent age; a filter reads "young", "girl" or an age as it likes). Venice's stock line never says
// which words it read, so these are the ones to look at first. Ages are any two-figure number written as one.
const FILTER = new RegExp("\\b(?:" + [...YOUNG, ...CHILDREN, "young\\w*", "youth\\w*", "girls?", "girlish", "girly", "boys?", "boyish",
  "students?", "petite", "bab(?:y|ies)", "daughters?", "sons?", "nieces?", "nephews?", "pupils?", "lolita", "barely legal",
  "fresh(?:man|men)", "sophomores?", "\\d{1,2}(?=\\s*(?:\\+|or older|and up|years?|yrs?|y\\.?o\\b))"].join("|") + ")\\b", "gi");
/** the words in a prompt a content filter may weigh (FILTER), each once, in order, at most eight */
export function filterWords(text) {
  const out = [];
  for (const m of str(text, 200000).matchAll(FILTER)) {
    const w = m[0].toLowerCase();
    if (!out.includes(w)) out.push(w);
    if (out.length >= 8) break;
  }
  return out;
}

/** everything a card says about them */
const cardWords = (card) => [card.name, card.tagline, card.greeting, card.persona, card.voice && card.voice.notes,
  card.look && card.look.description, ...(card.tags || []), ...(card.examples || []).flatMap((e) => [e.user, e.character]),
  ...(card.flow || []).flatMap((s) => [s.stage, s.goal, s.next])].filter(Boolean).join("\n");

/**
 * Whether an adult character's photos and clips can be adult, and if not, why (a sentence for the page; "" for a
 * character who isn't marked adult). They can when you've said you're 18 or older (of18), adult pictures are on (on),
 * every picture on their card was made here with AI (made(picture): a picture someone uploaded could be of anyone), and
 * nothing on their card, in the shot or in the last few messages (said) says anyone is under 18. drawn: a picture for
 * their card drawn from words, made from none of the pictures on it, so those don't count.
 */
export function adultCheck(card, { of18 = false, on = true, made = () => false, shot = "", said = [], drawn = false } = {}) {
  if (!card || !card.adult || card.plain) return { ok: false, why: "" };
  const sfw = "so their photos and clips stay safe for work.";
  if (!on) return { ok: false, why: "adult photos and clips are switched off under abilities." };
  if (!of18) return { ok: false, why: "adult photos and clips wait until you say you're 18 or older, under abilities." };
  const pics = drawn ? [] : [card.portrait, ...((card.look && card.look.references) || [])].filter(Boolean);
  if (!drawn && !pics.length) return { ok: false, why: `${card.name} has no picture made here yet (card → look: make one with ai), ${sfw}` };
  if (!pics.every((p) => made(p))) return { ok: false, why: `a picture on their card wasn't made here with ai (it was uploaded, or came from venice), ${sfw}` };
  const onCard = underage(cardWords(card), UNDERAGE_CARD);
  if (onCard) return { ok: false, why: `their card says “${onCard}”, which sounds like someone under 18, ${sfw}` };
  const now = underage([shot, said]);
  if (now) return { ok: false, why: `the shot or the chat says “${now}”, which sounds like someone under 18, so this one stays safe for work.` };
  return { ok: true, why: "" };
}

/**
 * A short fingerprint of a picture (the data: URI a card keeps it as), for the list of pictures this browser made with
 * AI. It only has to tell this browser's pictures apart; it guards nothing secret.
 */
export function pictureKey(picture) {
  const s = str(picture, 20000000);
  let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0") + "-" + s.length.toString(36);
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
/**
 * What a character hears (and you don't see) when it's time to text you first after a while: `here` when you just
 * opened their chat, else they reach out while you're somewhere else in Havre.
 */
export function comeBack(ms, here = true) {
  const h = Math.round(ms / 3600e3);
  const gap = h < 24 ? `about ${h} hours` : h < 48 ? "about a day" : `about ${Math.round(h / 24)} days`;
  return `[Time passes: ${gap} since you last talked. ` + (here
    ? "They just came back to the chat. Text them first, in character, picking up naturally, in a line or two.]"
    : "Reach out to them first, in character, the way you would after a while apart, in a line or two.]");
}
/** how long since the conversation's last message, if its time is known */
export function since(history, now) {
  const last = [...(history || [])].reverse().find((m) => m && !m.demo && typeof m.at === "number");
  return last ? now - last.at : 0;
}
