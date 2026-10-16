// node --test tests/*.test.mjs: photos, clips, voice notes, hearing and seeing, without a browser or a network
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../card.js";
import * as A from "../abilities.js";
import { Venice } from "../venice.js";

const ines = C.normalizeCard({
  name: "Ines Corbel", tagline: "Ferry pilot with a pencil behind her ear", persona: "You are Ines, who pilots the morning ferry.",
  look: { description: "forties, short grey hair, yellow oilskin", references: ["https://example.com/a.png", "javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4=", "pics/b.webp", "https://example.com/a.png", "data:image/png;base64,AAAA", "https://example.com/c.jpg"] },
  speech: { model: "tts-kokoro", voice: "af_bella", mood: "bright", speed: 9 },
});

test("cards carry how they look and how they sound, within limits", () => {
  assert.deepEqual(ines.look.references, ["https://example.com/a.png", "pics/b.webp", "data:image/png;base64,AAAA"], "no scripts, no SVG, no repeats, at most three");
  assert.equal(ines.look.description, "forties, short grey hair, yellow oilskin");
  assert.deepEqual(ines.speech, { model: "tts-kokoro", voice: "af_bella", mood: "bright", speed: 4 });
  const plain = C.normalizeCard({ name: "x", persona: "y" });
  assert.deepEqual(plain.look, { description: "", references: [] });
  assert.deepEqual(plain.speech, { model: "", voice: "", mood: "", speed: 1 });
  assert.equal(C.normalizeCard({ name: "x", speech: { speed: "0.1" } }).speech.speed, 0.25);
  assert.deepEqual(C.fromCharacterCard(C.toCharacterCardV3(ines)), ines, "a card with pictures and a voice comes back whole");
});

// ---------- picking models ----------
const photos = [
  { id: "qwen-image-3-edit", name: "Qwen Image 3", privacy: "anonymized", price: 0.04, maxIn: 3, included: 0, extra: null },
  { id: "firered-image-edit", name: "FireRed", privacy: "private", price: 0.04, maxIn: 3, included: 1, extra: null },
  { id: "flux-2-max-edit", name: "Flux 2 Max", privacy: "anonymized", price: 0.12, maxIn: 6, included: 1, extra: 0.0345 },
];
test("the model in use: the one picked if Venice still has it, else Havre's preference, else a private one", () => {
  assert.equal(A.chosen(photos, "flux-2-max-edit", "photo").id, "flux-2-max-edit");
  assert.equal(A.chosen(photos, "gone-model", "photo").id, "firered-image-edit");
  assert.equal(A.chosen(photos.filter((m) => m.id !== "firered-image-edit"), "", "photo").id, "qwen-image-3-edit");
  assert.equal(A.chosen(null, "x", "photo"), null);
  const video = [{ id: "wan-2-7-enhanced-image-to-video", ref: false }, { id: "wan-2-7-reference-to-video", ref: true, privacy: "anonymized" },
    { id: "x-enhanced-reference-to-video", ref: true }, { id: "y-reference-to-video", ref: true, uncensored: true },
    { id: "seedance-2-5-us-reference-to-video-private", ref: true, privacy: "private" }];
  const clips = video.filter(A.isClipModel);
  assert.deepEqual(clips.map((m) => m.id), ["wan-2-7-reference-to-video", "seedance-2-5-us-reference-to-video-private"], "reference-to-video only, and no adult variants");
  assert.equal(A.chosen(clips, "", "clip").id, "seedance-2-5-us-reference-to-video-private");
  const text = [{ id: "a", vision: true, privacy: "anonymized", input: 0.1 }, { id: "b", vision: true, privacy: "private", input: 0.9 },
    { id: "c", vision: true, privacy: "private", input: 0.3 }, { id: "d", vision: false, privacy: "private", input: 0.01 }];
  assert.equal(A.seer(text).id, "c", "the cheapest private model that can see");
  assert.equal(A.seer(text, "a").id, "a");
  assert.equal(A.seer([{ id: "d", vision: false }]), null);
});

test("another model, for when the ones tried turned something down: the next Havre reaches for, never one tried", () => {
  const edits = [{ id: "nano-banana-2-edit", privacy: "anonymized" }, { id: "grok-imagine-edit", privacy: "private" },
    { id: "firered-image-edit", privacy: "private" }, { id: "qwen-edit-uncensored", privacy: "private", uncensored: true }];
  assert.equal(A.another(edits, ["grok-imagine-edit"], "photo").id, "firered-image-edit", "Havre's next preference");
  assert.equal(A.another(edits, ["firered-image-edit"], "photo").id, "grok-imagine-edit");
  assert.equal(A.another(edits, ["grok-imagine-edit", "firered-image-edit"], "photo").id, "qwen-edit-uncensored", "then a private one");
  assert.equal(A.another(edits, ["grok-imagine-edit", "firered-image-edit", "qwen-edit-uncensored"], "photo").id, "nano-banana-2-edit", "then any");
  assert.equal(A.another(edits, edits.map((m) => m.id), "photo"), null, "none left");
  assert.equal(A.another(null, [], "photo"), null);
  const adult = edits.filter(A.isAdultPhotoModel);
  assert.equal(A.another(adult, ["qwen-edit-uncensored"], "adultPhoto"), null, "an adult character's photos stay on the uncensored models");
  assert.equal(A.another([...adult, { id: "seedream-v5-lite-edit", uncensored: true }, { id: "qwen-image-2-1-turbo-edit", uncensored: true }],
    ["qwen-edit-uncensored"], "adultPhoto").id, "qwen-image-2-1-turbo-edit");
});

test("prices: a photo with extra pictures, a voice note, a minute of hearing, written plainly", () => {
  assert.equal(A.photoPrice(photos[2], 1), 0.12);
  assert.equal(A.photoPrice(photos[2], 3), 0.189);
  assert.equal(A.photoPrice(photos[0], 3), 0.04);
  assert.equal(A.photoPrice({ price: null }, 1), null);
  assert.equal(A.voicePrice({ perMChars: 3.5 }, 200), 0.0007);
  assert.equal(A.hearingPerMinute({ perSecond: 0.0001 }).toFixed(4), "0.0060");
  assert.deepEqual([A.usd(0.03), A.usd(1.4), A.usd(0.0007), A.usd(0.00072), A.usd(187.5), A.usd(0), A.usd(null), A.usd(0.00001)],
    ["$0.03", "$1.40", "$0.0007", "$0.00072", "$188", "$0", "?", "under $0.0001"]);
});

// ---------- the shot ----------
test("the shot is written from the conversation, with the rules, and the photo keeps the character", () => {
  const hist = [{ role: "user", content: "[Start the conversation…]", hidden: true }, { role: "assistant", content: "Ticket? Kidding." },
    { role: "user", content: "Show me the view from the wheelhouse" }];
  const [sys, user] = A.shotMessages(ines, hist, "at sunset", "photo");
  assert.equal(sys.content, A.PHOTO_SYSTEM);
  assert.match(sys.content, /safe for work/);
  assert.match(sys.content, /Never show a real, identifiable person/);
  assert.match(user.content, /Ines Corbel: Ticket\? Kidding\./);
  assert.match(user.content, /Them: Show me the view from the wheelhouse/);
  assert.ok(!user.content.includes("Start the conversation"), "what started it stays out");
  assert.match(user.content, /How they look: forties/);
  assert.match(user.content, /What was asked for: at sunset/);
  assert.equal(A.shotMessages(ines, [], "", "clip")[0].content, A.CLIP_SYSTEM);
  assert.match(A.shotMessages(ines, [], "")[1].content, /nothing in particular/);
  assert.equal(A.cleanText('<think>hmm</think>Shot: "The character from the reference picture leans on the rail."'), "The character from the reference picture leans on the rail.");
  const p = A.photoPrompt(ines, "She leans on the rail at dusk.", 2, 120);
  assert.ok(p.startsWith("The reference pictures show Ines Corbel."));
  assert.ok(p.length <= 120);
  assert.match(A.portraitPrompt(ines), /^Portrait photo of Ines Corbel, an original adult character: forties.*Safe for work: everyone in it is an adult, fully clothed\./);
  assert.match(A.photoPrompt(ines, "On deck."), /^The reference picture shows Ines Corbel\. Safe for work: everyone in it is an adult, fully clothed\. Keep their face.* New photo: On deck\. A natural photo with no text in it\.$/);
  assert.match(A.clipPrompt(ines, "She waves."), /^The reference pictures show Ines Corbel\. Safe for work.*How they look: forties.* The clip: She waves\.$/);
  assert.match(A.lookMessages(ines)[1].content, /Ferry pilot/);
  // a picture for their card, made from the ones they have: the next view of a character sheet
  assert.deepEqual([0, 1, 2, 3, -1, NaN].map(A.sheetView), [A.SHEET_VIEWS[0], A.SHEET_VIEWS[1], A.SHEET_VIEWS[2], A.SHEET_VIEWS[0], A.SHEET_VIEWS[2], A.SHEET_VIEWS[0]]);
  assert.match(A.photoPrompt(ines, A.sheetView(0)), /^The reference picture shows Ines Corbel\. Safe for work.*How they look: forties.*New photo: Full length, standing/);
});

test("pictures made from their pictures keep their face and follow how their card says they look, so a new look shows", () => {
  const p = A.photoPrompt(ines, "On deck, in a red dress.");
  assert.match(p, /Keep their face, so it's clearly them\. How they look: forties, short grey hair, yellow oilskin\. Where the picture differs from these words, follow the words; where the new photo says what they wear, follow that\. New photo: On deck, in a red dress\./);
  assert.ok(!/exactly|clothes and style/.test(p), "nothing else is pinned as it was: " + p);
  assert.match(A.photoPrompt(ines, "On deck.", 2), /Where the pictures differ from these words/);
  // a changed look is in the next picture, the old one isn't
  const red = { ...ines, look: { ...ines.look, description: "Thirties, red hair in a braid,\n a green raincoat." } };
  for (const q of [A.photoPrompt(red, "On deck."), A.photoPrompt(red, A.sheetView(1)), A.clipPrompt(red, "She waves."), A.portraitPrompt(red)]) {
    assert.match(q, /Thirties, red hair in a braid, a green raincoat\. /, q);
    assert.ok(!q.includes("grey hair"), q);
  }
  // no words about how they look: their face, hair and build stay, and their clothes unless the shot says otherwise
  const bare = { ...ines, look: { ...ines.look, description: "" } };
  assert.match(A.photoPrompt(bare, "On deck."), /Safe for work.*Keep their face, hair and build, so it's clearly them; their clothes stay as they are unless the new photo says what they wear\. New photo: On deck\./);
  assert.match(A.clipPrompt(bare, "She waves."), /unless the clip says what they wear\. The clip: She waves\.$/);
  // a long look takes only the room the shot leaves (and at most LOOK_ROOM): the rules, the shot and its ending all stay
  const long = { ...ines, look: { ...ines.look, description: "salt in the stubble, ".repeat(200) } };
  const shot = "On deck at dusk, the gulls wheeling. ".repeat(10).trim();
  for (const [q, limit] of [[A.photoPrompt(long, shot), 1500], [A.photoPrompt(long, shot, 1, 1500, { adult: true }), 1500], [A.clipPrompt(long, shot, 1000), 1000]]) {
    assert.ok(q.length <= limit, q.length);
    assert.ok(q.endsWith(shot + (q.includes("New photo:") ? " A natural photo with no text in it." : "")), q);
    const words = q.match(/How they look: (.*?) Where the/)[1];
    assert.ok(words.endsWith("…") && words.length <= A.LOOK_ROOM, words);
  }
  assert.ok(A.photoPrompt(long, shot, 1, 1500, { adult: true }).startsWith(A.ADULT_ONLY));
  // with hardly any room, the look goes before the shot does
  assert.match(A.photoPrompt(long, "On deck.", 1, 355), /Keep their face, hair and build/);
  // a portrait: the look takes the room the rules and the framing leave
  const drawn = A.portraitPrompt(long);
  assert.ok(drawn.length <= 1500);
  assert.match(drawn, /… Safe for work: everyone in it is an adult, fully clothed\. Head and shoulders, soft light, plain background, no text\.$/);
  assert.match(A.portraitPrompt(long, 1500, { adult: true }), /^Hard rule.*Portrait photo of Ines Corbel.*… Head and shoulders, soft light, plain background, no text\.$/);
  assert.match(A.portraitPrompt({ ...bare, tagline: "Ferry pilot." }), /an original adult character: Ferry pilot\. Safe for work/);
  assert.match(A.portraitPrompt({ ...bare, tagline: "" }), /an original adult character: an original character\. Safe for work/);
});

// ---------- adult characters ----------
const mara = C.normalizeCard({ name: "Mara Vell", persona: "You are Mara Vell, a night-club singer in her thirties.", adult: true,
  portrait: "data:image/webp;base64,AAAA", look: { references: ["data:image/webp;base64,BBBB"] } });

test("adult characters: the 18+ rule is the first thing every photo and clip prompt says, and the shot's", () => {
  assert.equal(A.ADULT_ONLY, "Hard rule, 18+ only: everyone shown is an adult, 18 or older, with a grown adult face and body.");
  for (const p of [A.photoPrompt(mara, "On the stage.", 1, 1500, { adult: true }), A.photoPrompt(mara, "On the stage.", 2, 1500, { adult: true }),
    A.clipPrompt(mara, "She bows.", 2500, { adult: true })]) {
    assert.ok(p.startsWith(A.ADULT_ONLY), p);
    assert.ok(!/Safe for work/.test(p));
    assert.match(p, /Never a real, identifiable person\./);
  }
  assert.ok(A.photoPrompt(mara, "x ".repeat(3000), 1, 400, { adult: true }).startsWith(A.ADULT_ONLY), "a long shot can't push it out");
  assert.ok(A.clipPrompt(mara, "x ".repeat(3000), 400, { adult: true }).startsWith(A.ADULT_ONLY));
  assert.match(A.photoPrompt(mara, "On the stage."), /Safe for work/, "without adult, as before");
  const [sys] = A.shotMessages(mara, [], "", "photo", { adult: true });
  assert.equal(sys.content, A.PHOTO_SYSTEM_ADULT);
  assert.equal(A.shotMessages(mara, [], "", "clip", { adult: true })[0].content, A.CLIP_SYSTEM_ADULT);
  assert.equal(A.moveMessages(mara, [], { adult: true })[0].content, A.MOVE_SYSTEM_ADULT);
  for (const s of [A.PHOTO_SYSTEM_ADULT, A.CLIP_SYSTEM_ADULT, A.MOVE_SYSTEM_ADULT]) {
    assert.ok(s.includes(A.ADULT_ONLY), "the shot is written to the same rule");
    assert.ok(!/safe for work/i.test(s));
    assert.match(s, /Never show a real, identifiable person/);
  }
  assert.equal(A.shotMessages(mara, [], "")[0].content, A.PHOTO_SYSTEM, "safe for work unless asked");
});

test("the words Havre puts in a picture or a clip are none a content filter turns down, and an adult's still open with the 18+ rule", () => {
  // what filters look for is what a rule rules out, named: Havre's own words say what's wanted instead
  const TRIPS = /\b(?:sex\w*|nud\w*|naked|gor[ey]|minors?|child\w*|kids?|school\w*|teen\w*|under[\s-]?(?:18|eighteen|age\w*)|young\w*)\b/i;
  for (const adult of [false, true]) {
    const who = adult ? mara : ines, bare = { ...who, look: { ...who.look, description: "" } };
    for (const p of [A.photoPrompt(who, "On deck.", 1, 1500, { adult }), A.photoPrompt(who, "On deck.", 2, 1500, { adult }),
      A.photoPrompt(bare, "On deck.", 1, 1500, { adult }), A.photoPrompt(who, A.sheetView(0), 1, 1500, { adult }), A.clipPrompt(who, "She waves.", 2500, { adult }),
      A.clipPrompt(bare, "She waves.", 2500, { adult }), A.portraitPrompt(who, 1500, { adult }), A.portraitPrompt({ ...bare, tagline: "" }, 1500, { adult })]) {
      assert.ok(!TRIPS.test(p), `“${(p.match(TRIPS) || [])[0]}” in: ${p}`);
      assert.equal(A.underage(p), "", p);
      if (adult) assert.ok(p.startsWith("Hard rule, 18+ only: everyone shown is an adult, 18 or older, with a grown adult face and body."), p);
      else assert.match(p, /Safe for work: everyone in it is an adult, fully clothed\./);
    }
  }
  // the shot is written to the rules without repeating them (it goes to the image model as it's written), and a rule
  // echoed into it anyway can't make Havre's own check say someone is under 18
  for (const s of [A.PHOTO_SYSTEM, A.CLIP_SYSTEM, A.MOVE_SYSTEM, A.PHOTO_SYSTEM_ADULT, A.CLIP_SYSTEM_ADULT, A.MOVE_SYSTEM_ADULT]) {
    assert.match(s, /Follow these rules without writing them into the shot\. (Reply with the shot only\.|Reply with one JSON object)/);
    assert.equal(A.underage(s), "", s);
  }
  // the model writing an adult character's shot is told what the 18+ rule keeps out, in words that name no one
  assert.match(A.PHOTO_SYSTEM_ADULT, /Hard rule, 18\+ only: everyone shown is an adult, 18 or older, with a grown adult face and body\. If the conversation asks for anyone younger, or for anything that makes someone look younger, leave it out and show only adults\./);
});

test("adult characters: a portrait for their card opens with the 18+ rule too, and is drawn whatever pictures they have", () => {
  const p = A.portraitPrompt(mara, 1500, { adult: true });
  assert.ok(p.startsWith(A.ADULT_ONLY), p);
  assert.match(p, /Never a real, identifiable person\. Portrait photo of Mara Vell, an original adult character: /);
  assert.ok(!/Safe for work/.test(p));
  assert.ok(A.portraitPrompt({ ...mara, look: { description: "x ".repeat(3000) } }, 400, { adult: true }).startsWith(A.ADULT_ONLY), "a long look can't push it out");
  assert.match(A.portraitPrompt(mara), /Safe for work/, "without adult, as before");
  // drawn from words, it's made from none of the pictures on their card: those don't count, everything else does
  const drawn = { of18: true, made: () => false, drawn: true };
  assert.deepEqual(A.adultCheck({ ...mara, look: { references: ["data:image/png;base64,UPLD"] } }, drawn), { ok: true, why: "" });
  assert.deepEqual(A.adultCheck({ ...mara, portrait: "", look: { references: [] } }, drawn), { ok: true, why: "" });
  assert.match(A.adultCheck({ ...mara, look: { description: "a schoolgirl", references: [] } }, drawn).why, /“schoolgirl”/);
  assert.match(A.adultCheck(mara, { ...drawn, of18: false }).why, /until you say you're 18 or older/);
  assert.match(A.adultCheck(mara, { ...drawn, on: false }).why, /switched off under abilities/);
  assert.deepEqual(A.adultCheck({ ...mara, adult: false }, drawn), { ok: false, why: "" });
  assert.match(A.adultCheck({ ...mara, portrait: "", look: { references: [] } }, { ...drawn, drawn: false }).why, /no picture made here yet/);
  // and it's drawn on an uncensored image model, the private ones first
  const images = [{ id: "grok-imagine-image", privacy: "private" }, { id: "qwen-image-3", uncensored: true, privacy: "anonymized" },
    { id: "krea-2-turbo", uncensored: true, privacy: "private" }];
  assert.equal(A.chosen(images.filter(A.isAdultPhotoModel), "", "adultPortrait").id, "krea-2-turbo");
});

test("adult characters: their clips and photos come from Venice's uncensored models, and nobody else's do", () => {
  const video = [{ id: "minimax-h3-max-reference-to-video", ref: true, uncensored: true, privacy: "private" },
    { id: "grok-imagine-1-5-reference-to-video-private", ref: true, privacy: "private" }, { id: "wan-3-0-image-to-video", ref: false, uncensored: true }];
  assert.deepEqual(video.filter(A.isAdultClipModel).map((m) => m.id), ["minimax-h3-max-reference-to-video"]);
  assert.deepEqual(video.filter(A.isClipModel).map((m) => m.id), ["grok-imagine-1-5-reference-to-video-private"]);
  const edits = [{ id: "grok-imagine-edit", privacy: "private" }, { id: "seedream-v4-edit", uncensored: true, privacy: "anonymized" },
    { id: "qwen-edit-uncensored", uncensored: true, privacy: "private" }];
  assert.equal(A.chosen(edits.filter(A.isAdultPhotoModel), "", "adultPhoto").id, "qwen-edit-uncensored");
  assert.equal(A.chosen(edits.filter(A.isAdultPhotoModel), "seedream-v4-edit", "adultPhoto").id, "seedream-v4-edit");
  assert.equal(A.chosen(video.filter(A.isAdultClipModel), "", "adultClip").id, "minimax-h3-max-reference-to-video");
});

test("adult characters: words that say someone is under 18, and ones that don't", () => {
  for (const s of ["She is 16 years old.", "a sixteen-year-old", "17yo", "15 y.o.", "aged 12", "the age of seven", "I'm 15", "she's 17 and",
    "you are 14", "underage", "under-age", "under 18", "minors", "she is a minor", "a teen", "teenagers", "teenage", "pre-teen", "tween",
    "adolescent", "prepubescent", "loli", "shotacon", "jailbait", "schoolgirl", "school uniform", "high school", "high-schooler",
    "middle school", "kindergarten", "little girl", "young boy", "the kids", "a child", "children", "toddler", "infant"]) assert.ok(A.underage(s), s);
  for (const s of ["She is 25 years old.", "a 30-year-old", "18 years old", "21 yo", "a 1000-year-old vampire", "300 years old", "she's 5'4",
    "he's 6 foot 2", "I'm 5 minutes away", "under 18 minutes", "a minor inconvenience", "a minor key", "no kidding", "canteen",
    "fifteen minutes", "childhood friends", "childish", "old school", "a student", "hey baby", "a young woman"]) assert.equal(A.underage(s), "", s);
  assert.equal(A.underage(["fine", ["still fine", "a teen"]]), "teen", "lists, nested");
  assert.equal(A.underage("divorced, two kids", A.UNDERAGE_CARD), "", "a card can mention their kids, or their childhood");
  assert.ok(A.underage("You are 17.", A.UNDERAGE_CARD));
});

test("adult characters: adult pictures only when marked adult, 18+ said, every picture made here, and nobody young", () => {
  const made = new Set(["data:image/webp;base64,AAAA", "data:image/webp;base64,BBBB"]);
  const ok = { of18: true, made: (p) => made.has(p) };
  assert.deepEqual(A.adultCheck(mara, ok), { ok: true, why: "" });
  assert.deepEqual(A.adultCheck({ ...mara, adult: false }, ok), { ok: false, why: "" }, "not marked adult: safe for work, nothing to say");
  assert.match(A.adultCheck(mara, { ...ok, of18: false }).why, /until you say you're 18 or older/);
  assert.match(A.adultCheck(mara, { ...ok, on: false }).why, /switched off under abilities/);
  const uploaded = { ...mara, look: { ...mara.look, references: [...mara.look.references, "data:image/png;base64,UPLD"] } };
  assert.match(A.adultCheck(uploaded, ok).why, /wasn't made here with ai/, "one uploaded picture keeps it safe for work");
  assert.equal(A.adultCheck({ ...mara, portrait: "https://outerface.venice.ai/x.png" }, ok).ok, false, "nor is a Venice photo made here");
  assert.match(A.adultCheck({ ...mara, portrait: "", look: { references: [] } }, ok).why, /no picture made here yet/);
  assert.match(A.adultCheck({ ...mara, persona: "You are Mara, 16 years old." }, ok).why, /their card says “16 years old”/);
  assert.match(A.adultCheck({ ...mara, look: { ...mara.look, description: "a schoolgirl" } }, ok).why, /“schoolgirl”/, "how they look counts");
  assert.equal(A.adultCheck({ ...mara, persona: "You are Mara. Two kids, one ex." }, ok).ok, true);
  assert.match(A.adultCheck(mara, { ...ok, shot: "She waves at a teenager." }).why, /the shot or the chat says “teenager”.*this one stays safe for work/);
  assert.match(A.adultCheck(mara, { ...ok, said: ["hi", "my kids are asleep"] }).why, /“kids”/, "and the chat");
  assert.equal(A.adultCheck({ ...mara, plain: true }, ok).ok, false);
  // a picture's fingerprint
  assert.equal(A.pictureKey("data:image/webp;base64,AAAA"), A.pictureKey("data:image/webp;base64,AAAA"));
  assert.notEqual(A.pictureKey("data:image/webp;base64,AAAA"), A.pictureKey("data:image/webp;base64,AAAB"));
  assert.notEqual(A.pictureKey("ab"), A.pictureKey("ba"));
});

test("voice notes read the words, not the code or the stage directions", () => {
  assert.equal(A.speakable("<think>x</think>Sure! *waves*\n\n```js\nlet a\n```\nBye."), "Sure! Bye.");
  assert.equal(A.speakable("a".repeat(5000)).length, 4000);
});

test("clip options: what was picked last time where the model allows it, else 5 seconds, 720p, tall", () => {
  const m = { durations: ["1s", "5s", "10s"], resolutions: ["480p", "720p"], aspects: ["16:9", "9:16"], audioConfigurable: true };
  assert.deepEqual(A.clipOptions(m), { duration: "5s", resolution: "720p", aspect: "9:16", audio: true });
  assert.deepEqual(A.clipOptions(m, { duration: "10s", resolution: "1080p", aspect: "16:9", audio: false }), { duration: "10s", resolution: "720p", aspect: "16:9", audio: false });
  assert.deepEqual(A.clipOptions({ durations: ["2s", "6s"], resolutions: [], aspects: [] }), { duration: "6s", resolution: "", aspect: "" });
});

test("the conversation as the model reads it: a photo it sent is mentioned to it, yours is words", () => {
  const hist = [
    { role: "user", content: "hi", demo: true },
    { role: "user", content: "send me one" },
    { role: "assistant", content: "", media: { kind: "photo", id: "p1", shot: "On the deck." } },
    { role: "assistant", content: "", media: { kind: "clip", id: "c1", shot: "Waving." } },
    { role: "user", content: "lovely", media: null },
    { role: "user", content: "what's this?", media: { kind: "photo-in", id: "u1", saw: "A gull on a post." } },
    { role: "assistant", content: "A gull!", voice: { id: "v1" } },
    { role: "user", content: "hello there", media: { kind: "voice-in", id: "u2" } },
  ];
  const api = A.apiHistory(hist);
  assert.deepEqual(api.map((m) => m.role), ["user", "user", "user", "assistant", "user"]);
  assert.equal(api[1].content, "(You sent me a photo: On the deck.) (You sent me a short video: Waving.)\n\nlovely");
  assert.equal(api[2].content, "[a photo: A gull on a post.] what's this?");
  assert.equal(api[4].content, "hello there");
  assert.ok(!api.some((m) => /\[photo\]/.test(m.content)), "the model never sees a photo placeholder in its own voice");
  const seen = A.withPicture([{ role: "system", content: "s" }, { role: "user", content: "[a photo] look" }], "data:image/jpeg;base64,AAAA");
  assert.deepEqual(seen[1].content[1], { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } });
  assert.equal(seen[1].content[0].text, "[a photo] look");
  assert.deepEqual([...A.mediaIds({ a: hist, b: "junk" })].sort(), ["c1", "p1", "u1", "u2", "v1"]);
});

// ---------- venice.js: the media calls, against a fake fetch ----------
function fake(handler) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init, body: typeof init.body === "string" ? JSON.parse(init.body) : init.body });
    const r = handler(url.replace("https://api.venice.ai/api/v1", ""), init);
    const headers = new Headers(r.headers || { "content-type": r.blob ? "application/octet-stream" : "application/json" });
    return { ok: r.status < 400, status: r.status, headers, json: async () => r.body, blob: async () => new Blob([r.blob || ""], { type: headers.get("content-type") }) };
  };
  return { f, calls };
}

test("venice: photo edits keep safe mode on, one picture or several; a first portrait asks for the bytes", async () => {
  const { f, calls } = fake(() => ({ status: 200, blob: "img", headers: { "content-type": "image/webp", "x-venice-is-blurred": "true" } }));
  const v = new Venice("sk", { fetch: f });
  const one = await v.editImage({ model: "grok-imagine-edit", prompt: "p", images: ["data:image/png;base64,QUJD"] });
  assert.equal(calls[0].url, "https://api.venice.ai/api/v1/image/edit");
  assert.deepEqual(calls[0].body, { model: "grok-imagine-edit", prompt: "p", image: "QUJD", safe_mode: true, output_format: "webp" });
  assert.equal(one.blurred, true);
  assert.equal(await one.blob.text(), "img");
  await v.editImage({ model: "m", prompt: "p", images: ["https://venice.ai/_next/image?url=x&w=1080&q=75", "data:image/webp;base64,REVG"] });
  assert.equal(calls[1].url, "https://api.venice.ai/api/v1/image/multi-edit");
  assert.deepEqual(calls[1].body, { modelId: "m", prompt: "p", images: ["https://venice.ai/_next/image?url=x&w=1080&q=75", "REVG"], safe_mode: true, output_format: "webp" });
  await v.generateImage({ model: "grok-imagine-image", prompt: "a portrait", aspect: "1:1" });
  assert.deepEqual(calls[2].body, { model: "grok-imagine-image", prompt: "a portrait", safe_mode: true, format: "webp", return_binary: true, aspect_ratio: "1:1" });
  await assert.rejects(v.editImage({ model: "m", prompt: "p", images: [] }), /at least one picture/);
});

test("venice: an adult character's photo goes with safe mode off, and only when asked for that way", async () => {
  const { f, calls } = fake(() => ({ status: 200, blob: "img", headers: { "content-type": "image/webp" } }));
  const v = new Venice("sk", { fetch: f });
  await v.editImage({ model: "qwen-edit-uncensored", prompt: "p", images: ["data:image/webp;base64,QUJD"], safe: false });
  assert.equal(calls[0].body.safe_mode, false);
  await v.editImage({ model: "qwen-edit-uncensored", prompt: "p", images: ["data:image/webp;base64,QUJD", "data:image/webp;base64,REVG"], safe: false });
  assert.equal(calls[1].body.safe_mode, false);
  for (const safe of [undefined, true, 0, "no"]) await v.editImage({ model: "m", prompt: "p", images: ["data:image/webp;base64,QUJD"], safe });
  assert.deepEqual(calls.slice(2).map((c) => c.body.safe_mode), [true, true, true, true], "anything else: on");
  // and a portrait for their card, drawn from words
  await v.generateImage({ model: "krea-2-turbo", prompt: "p", aspect: "1:1", safe: false });
  assert.deepEqual(calls.at(-1).body, { model: "krea-2-turbo", prompt: "p", safe_mode: false, format: "webp", return_binary: true, aspect_ratio: "1:1" });
  for (const safe of [undefined, true, 0, "no"]) await v.generateImage({ model: "m", prompt: "p", safe });
  assert.deepEqual(calls.slice(-4).map((c) => c.body.safe_mode), [true, true, true, true], "anything else: on");
});

test("venice: a voice note sends the mood as the style prompt; hearing sends the recording as a form", async () => {
  const { f, calls } = fake((p) => (p === "/audio/transcriptions" ? { status: 200, body: { text: " hello from the mic ", duration: 2.5 } } : { status: 200, blob: "mp3", headers: { "content-type": "audio/mpeg" } }));
  const v = new Venice("sk", { fetch: f });
  const b = await v.speak({ model: "tts-kokoro", voice: "af_sky", input: "Hi.", mood: "warm", speed: 1.15 });
  assert.equal(b.type, "audio/mpeg");
  assert.deepEqual(calls[0].body, { input: "Hi.", model: "tts-kokoro", speed: 1.15, voice: "af_sky", prompt: "warm" });
  const heard = await v.transcribe({ file: new Blob(["webm"], { type: "audio/webm" }), name: "v.webm", model: "nvidia/parakeet-tdt-0.6b-v3" });
  assert.deepEqual(heard, { text: "hello from the mic", duration: 2.5 });
  const form = calls[1].init.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("model"), "nvidia/parakeet-tdt-0.6b-v3");
  assert.equal(form.get("response_format"), "json");
  assert.equal(form.get("file").name, "v.webm");
  assert.ok(!("Content-Type" in calls[1].init.headers), "the browser sets the form's own content type");
});

test("venice: a clip is quoted, queued with the character's pictures, polled, and brought home", async () => {
  let polls = 0;
  const { f, calls } = fake((p, init) => {
    if (p === "/video/quote") return { status: 200, body: { quote: 0.47 } };
    if (p === "/video/queue") return { status: 200, body: { model: "m", queue_id: "q1", download_url: "https://private-share.venice.ai/v1/share/read/abc" } };
    if (p === "/video/retrieve") return ++polls < 2 ? { status: 200, body: { status: "PROCESSING", average_execution_time: 90000, execution_duration: 30000 } }
      : { status: 200, blob: "mp4", headers: { "content-type": "video/mp4" } };
    if (p === "/video/complete") return { status: 200, body: { success: true } };
    if (p.startsWith("https://private-share.venice.ai/")) return init.method === "DELETE" ? { status: 204, body: null } : { status: 200, blob: "mp4", headers: { "content-type": "video/mp4" } };
    return { status: 404, body: {} };
  });
  const v = new Venice("sk", { fetch: f });
  assert.equal(await v.quoteVideo({ model: "grok-imagine-1-5-reference-to-video-private", duration: "5s", resolution: "720p", aspect: "9:16" }), 0.47);
  assert.deepEqual(calls[0].body, { model: "grok-imagine-1-5-reference-to-video-private", duration: "5s", resolution: "720p", aspect_ratio: "9:16" });
  const q = await v.queueVideo({ model: "grok-imagine-1-5-reference-to-video-private", prompt: "waves", duration: "5s", images: ["https://x/a.png", "data:image/png;base64,AA"], audio: true });
  assert.deepEqual(q, { queueId: "q1", downloadUrl: "https://private-share.venice.ai/v1/share/read/abc" });
  assert.deepEqual(calls[1].body.reference_image_urls, ["https://x/a.png", "data:image/png;base64,AA"]);
  assert.equal(calls[1].body.audio, true);
  await v.queueVideo({ model: "wan-2-7-image-to-video", prompt: "p", duration: "5s", images: ["https://x/a.png", "https://x/b.png"] });
  assert.equal(calls[2].body.image_url, "https://x/a.png", "an image-to-video model gets the first picture");
  assert.ok(!("reference_image_urls" in calls[2].body));
  assert.deepEqual(await v.retrieveVideo({ model: "m", queueId: "q1" }), { done: false, elapsed: 30000, expected: 90000 });
  const done = await v.retrieveVideo({ model: "m", queueId: "q1" });
  assert.equal(done.done, true);
  assert.equal(await done.blob.text(), "mp4");
  assert.deepEqual(calls[4].body, { model: "m", queue_id: "q1" }, "Venice keeps its copy until the clip is home");
  const clip = await v.downloadVideo("https://private-share.venice.ai/v1/share/read/abc");
  assert.equal(await clip.text(), "mp4");
  assert.ok(!calls[5].init.headers, "no key goes to the download link");
  assert.equal(calls.length, 6, "the link stays until the clip is stored");
  assert.equal(await v.revokeDownload("https://private-share.venice.ai/v1/share/read/abc"), true);
  assert.equal(calls[6].init.method, "DELETE", "then it's revoked");
  assert.ok(!calls[6].init.headers, "without the key");
  assert.equal(await v.revokeDownload("https://evil.example/x"), false);
  await assert.rejects(v.downloadVideo("https://evil.example/x"), /isn't a Venice download link/);
  const failed = new Venice("sk", { fetch: fake(() => ({ status: 200, body: { status: "FAILED" } })).f });
  await assert.rejects(failed.retrieveVideo({ model: "m", queueId: "q" }), (e) => e.status === -2 && /couldn't make the clip \(failed\)/.test(e.message));
  assert.equal(await v.completeVideo({ model: "m", queueId: "q1" }), true);
});

test("venice: the other model lists come with their prices, voices, lengths and limits", async () => {
  const specs = {
    inpaint: [{ id: "grok-imagine-edit", model_spec: { name: "Grok Imagine", privacy: "private", pricing: { inpaint: { usd: 0.03 }, resolutions: { "1K": { usd: 0.03 } }, inputImages: { included: 0, additional: { usd: 0.002 } } }, constraints: { combineImages: true, promptCharacterLimit: 4000 } } },
      { id: "luma-uni-1-edit", model_spec: { name: "Luma", pricing: { inpaint: { usd: 0.06 } }, constraints: { combineImages: false } } },
      { id: "off", model_spec: { offline: true } }],
    tts: [{ id: "tts-kokoro", model_spec: { name: "Kokoro", privacy: "private", pricing: { input: { usd: 3.5 } }, voices: ["af_sky", "am_adam"], default_format: "mp3" } }],
    asr: [{ id: "nvidia/parakeet-tdt-0.6b-v3", model_spec: { name: "Parakeet", privacy: "private", pricing: { per_audio_second: { usd: 0.0001 } } } }],
    video: [{ id: "grok-imagine-1-5-reference-to-video-private", model_spec: { name: "Grok Imagine 1.5 R2V", privacy: "private", constraints: { model_type: "image-to-video", durations: ["5s"], resolutions: ["480p", "720p"], aspect_ratios: ["9:16"], audio: true, audio_configurable: false, prompt_character_limit: 4096 } } }],
    image: [{ id: "grok-imagine-image", model_spec: { name: "Grok Imagine", pricing: { resolutions: { "1K": { usd: 0.03 } } }, constraints: { aspectRatios: ["1:1"] } } }],
  };
  const v = new Venice("", { fetch: fake((p) => ({ status: 200, body: { data: specs[new URL("https://x" + p).searchParams.get("type")] } })).f });
  const [g, l] = await v.mediaModels("inpaint");
  assert.equal((await v.mediaModels("inpaint")).length, 2, "offline models are left out");
  assert.deepEqual([g.price, g.extra, g.included, g.maxIn, g.promptLimit], [0.03, 0.002, 0, 3, 4000]);
  assert.equal(l.maxIn, 1, "a model that can't combine pictures takes one");
  const [k] = await v.mediaModels("tts");
  assert.deepEqual([k.perMChars, k.voices, k.format], [3.5, ["af_sky", "am_adam"], "mp3"]);
  assert.equal((await v.mediaModels("asr"))[0].perSecond, 0.0001);
  const [r] = await v.mediaModels("video");
  assert.deepEqual([r.ref, r.durations, r.resolutions, r.aspects, r.audio, r.audioConfigurable, r.promptLimit], [true, ["5s"], ["480p", "720p"], ["9:16"], true, false, 4096]);
  assert.deepEqual((await v.mediaModels("image"))[0].aspects, ["1:1"]);
});

test("venice: what Venice says when it turns something down, and when a 422 is something else", async () => {
  const answers = {
    "/video/queue": { status: 422, body: { error: "Your prompt violates the content policy of Venice.ai or the model provider" } },
    "/image/edit": { status: 422, body: { error: { code: "CONTENT_POLICY_VIOLATION", message: "Blocked by the model provider: a real person." } } },
    "/image/multi-edit": { status: 422, body: {} },
    "/image/generate": { status: 422, body: { error: "Image dimensions exceed the maximum allowed." } },
  };
  const v = new Venice("sk", { fetch: fake((p) => answers[p] || { status: 503, body: {} }).f });
  const said = (re, refused, status = 422) => (e) => { assert.match(e.message, re); assert.equal(e.refused, refused); assert.equal(e.status, status); return true; };
  await assert.rejects(v.queueVideo({ model: "m", prompt: "p", duration: "5s" }), said(/^Venice turned that down as against its content rules\.$/, true));
  await assert.rejects(v.editImage({ model: "m", prompt: "p", images: ["data:image/png;base64,AA"] }),
    said(/^Venice turned that down as against its content rules \(“Blocked by the model provider: a real person”\)\.$/, true));
  await assert.rejects(v.editImage({ model: "m", prompt: "p", images: ["a", "b"] }), said(/^Venice turned that down as against its content rules\.$/, true), "nothing said: a no");
  await assert.rejects(v.generateImage({ model: "m", prompt: "p" }), said(/^Image dimensions exceed the maximum allowed\.$/, false), "not a no on content");
  await assert.rejects(v.speak({ model: "m", input: "x" }), said(/busy at Venice/, false, 503));
});

test("venice: an error carries Venice's answer as it came, and a picture or clip call carries what it sent", async () => {
  const answers = {
    "/image/edit": { status: 422, body: { error: { code: "CONTENT_POLICY_VIOLATION", message: "Your prompt violates the content policy of Venice.ai or the model provider" } } },
    "/image/multi-edit": { status: 422, body: {} },
    "/image/generate": { status: 400, body: { error: "Invalid request parameters", details: { prompt: "too long" } } },
    "/video/queue": { status: 422, body: { error: "Your prompt violates the content policy of Venice.ai or the model provider" } },
    "/audio/speech": { status: 503, body: { error: "The model is at capacity." } },
  };
  const v = new Venice("sk", { fetch: fake((p) => answers[p] || { status: 404, body: {} }).f });
  const caught = async (p) => { try { await p; } catch (e) { return e; } assert.fail("no error"); };
  let e = await caught(v.editImage({ model: "qwen-edit-uncensored", prompt: "Hard rule. The reference picture shows Mara.", images: ["data:image/png;base64,AA"], safe: false }));
  assert.deepEqual([e.said, e.code, e.refused], ["Your prompt violates the content policy of Venice.ai or the model provider", "CONTENT_POLICY_VIOLATION", true]);
  assert.deepEqual(e.sent, { endpoint: "image/edit", model: "qwen-edit-uncensored", pictures: 1, safe_mode: false, prompt: "Hard rule. The reference picture shows Mara." });
  e = await caught(v.editImage({ model: "m", prompt: "p", images: ["a", "b", "c"] }));
  assert.deepEqual([e.said, e.code, e.body], ["", "", "{}"], "nothing said: the body as it came");
  assert.deepEqual(e.sent, { endpoint: "image/multi-edit", model: "m", pictures: 3, safe_mode: true, prompt: "p" });
  e = await caught(v.generateImage({ model: "g", prompt: "Portrait photo of Wren." }));
  assert.deepEqual([e.status, e.refused, e.said, e.code], [400, false, "Invalid request parameters", ""]);
  assert.match(e.body, /"details":\{"prompt":"too long"\}/, "the body keeps what the message leaves out");
  assert.deepEqual(e.sent, { endpoint: "image/generate", model: "g", pictures: 0, safe_mode: true, prompt: "Portrait photo of Wren." });
  e = await caught(v.queueVideo({ model: "wan-3-0-reference-to-video", prompt: "She waves.", duration: "5s", images: ["a", "b", "c", "d", "e"] }));
  assert.deepEqual(e.sent, { endpoint: "video/queue", model: "wan-3-0-reference-to-video", pictures: 4, prompt: "She waves." }, "a clip: as many pictures as go");
  assert.equal(e.refused, true);
  e = await caught(v.speak({ model: "m", input: "x" }));
  assert.deepEqual([e.status, e.said, e.sent], [503, "The model is at capacity.", undefined], "a voice note sends no picture prompt");
  e = await caught(v.editImage({ model: "m", prompt: "p", images: [] }));
  assert.equal(e.sent, undefined, "nothing was sent");
});

test("the words in a prompt a content filter may weigh, for what venice saw", () => {
  assert.deepEqual(A.filterWords(A.photoPrompt(mara, "On the stage, in a navy coat.", 1, 1500, { adult: true })), ["18"], "the 18+ rule's own age, once");
  assert.deepEqual(A.filterWords(A.photoPrompt(ines, "On deck.", 1, 1500)), [], "a safe-for-work photo: none");
  assert.deepEqual(A.filterWords("A young woman in her early twenties, a schoolgirl's satchel, 21 years old, with her little sister, a girl of nine, and their son."),
    ["young", "schoolgirl", "21", "girl", "son"]);
  assert.deepEqual(A.filterWords("Her boyfriend, a person at a girlish party, babies everywhere, 2 students"), ["girlish", "babies", "students"], "boyfriend and person aren't boy or son");
  assert.deepEqual(A.filterWords("18 or older; 25+; 3 yo; a teen"), ["18", "25", "3 yo", "teen"]);
  assert.equal(A.filterWords("a b c d e f g h".replace(/\w/g, (c) => "girl " + c)).length, 1, "each word once");
  assert.equal(A.filterWords(["young", "youth", "teen", "teenager", "tween", "kid", "child", "baby", "petite", "pupil"].join(" ")).length, 8, "at most eight");
  assert.deepEqual(A.filterWords(""), []);
  assert.deepEqual(A.filterWords(null), []);
});

// ---------- on their own ----------
test("on their own: a move is considered when asked to show or say something, when the reply shows something, or now and then", () => {
  const u = (content, extra = {}) => ({ role: "user", content, ...extra }), a = (content, extra = {}) => ({ role: "assistant", content, ...extra });
  assert.equal(A.moveLikely([u("hi"), a("Hey.")]), false);
  assert.equal(A.moveLikely([u("send me a pic?"), a("Hm.")]), true);
  assert.equal(A.moveLikely([u("whisper it"), a("Okay.")]), true);
  assert.equal(A.moveLikely([u("so?"), a("Just got back from the market, look at this haul")]), true);
  assert.equal(A.moveLikely([u("send me a pic?")]), false, "only right after their reply");
  assert.equal(A.moveLikely([u("a"), a("1"), u("b"), a("2"), u("c"), a("3"), u("d"), a("4"), u("e"), a("5")]), false);
  assert.equal(A.moveLikely([u("a"), a("1"), u("b"), a("2"), u("c"), a("3"), u("d"), a("4"), u("e"), a("5"), u("f"), a("6")]), true, "every sixth reply");
  for (const said of ["haha", "here's the thing", "that made me smile", "okay"]) assert.equal(A.moveLikely([u("hm"), a(said)]), false, said);
  assert.equal(A.moveLikely([u("[hidden]", { hidden: true }), a("Hi there, look at this view")]), true, "the opener doesn't count as something said");
  const own = [u("pic?"), a("ok"), a("", { media: { kind: "photo", own: true } }), u("nice"), a("thanks")];
  assert.equal(A.sentLately(own), true);
  assert.equal(A.sentLately([...own, u("1"), a("2"), u("3"), a("4")]), false);
  assert.deepEqual(A.normalizeMove({ move: "photo", shot: "  On the pier. " }), { move: "photo", shot: "On the pier." });
  assert.deepEqual(A.normalizeMove({ move: "photo", shot: "" }), { move: "nothing", shot: "" }, "no shot, no photo");
  assert.deepEqual(A.normalizeMove({ move: "voice", shot: "x" }), { move: "voice", shot: "" });
  assert.deepEqual(A.normalizeMove({ move: "dance" }), { move: "nothing", shot: "" });
  assert.deepEqual(A.normalizeMove(null), { move: "nothing", shot: "" });
  const m = A.moveMessages(ines, [u("Send me a pic"), a("Okay!")]);
  assert.equal(m[0].content, A.MOVE_SYSTEM);
  assert.match(m[0].content, /Never two photos in a row/);
  assert.match(m[0].content, /Never show a real, identifiable person/);
  assert.match(m[1].content, /Them: Send me a pic\nInes Corbel: Okay!$/);
});

test("on their own: a daily allowance, and a hello first after a while", () => {
  let rec = null;
  rec = A.spend(rec, "2026-10-16", 0.03);
  rec = A.spend(rec, "2026-10-16", 0.0007);
  assert.equal(A.spentToday(rec, "2026-10-16"), 0.0307);
  assert.equal(A.spentToday(rec, "2026-10-17"), 0, "a new day starts at nothing");
  assert.equal(A.canSpend(rec, "2026-10-16", 0.25, 0.2), true);
  assert.equal(A.canSpend(rec, "2026-10-16", 0.25, 0.23), false);
  assert.equal(A.canSpend(rec, "2026-10-17", 0.25, 0.25), true);
  assert.equal(A.canSpend(rec, "2026-10-17", 0.25, null), false, "an unknown price never fits");
  assert.equal(A.canSpend(rec, "2026-10-17", 0.25, NaN), false);
  assert.deepEqual(A.spend({ day: "2026-10-17", usd: 0.01 }, "2026-10-17", -0.05), { day: "2026-10-17", usd: 0 }, "a refund never goes below zero");
  // a call's cost, from Venice's usage and the model's prices; unknown prices count high
  assert.equal(A.callCost({ prompt_tokens: 1000, completion_tokens: 100 }, { input: 1, output: 4 }), 0.0014);
  assert.equal(A.callCost({ prompt_tokens: 1000, completion_tokens: 100 }, null), 0.0045);
  assert.equal(A.callCost({ total_tokens: 2000 }, { input: 0.5, output: 2 }), 0.001);
  const est = A.callEstimate([{ role: "user", content: "x".repeat(3000) }], 300, { input: 1, output: 4 });
  assert.ok(est >= A.callCost({ prompt_tokens: 1000, completion_tokens: 300 }, { input: 1, output: 4 }), "the estimate covers the call");
  assert.deepEqual(A.spend(rec, "2026-10-17", 0.1), { day: "2026-10-17", usd: 0.1 });
  const now = Date.parse("2026-10-16T20:00:00Z");
  assert.equal(A.since([{ role: "user", content: "x", at: now - 9 * 3600e3 }, { role: "assistant", content: "y", at: now - 8 * 3600e3 }], now), 8 * 3600e3);
  assert.equal(A.since([{ role: "user", content: "old, no time" }], now), 0, "no time, no hello");
  assert.match(A.comeBack(8 * 3600e3), /^\[Time passes: about 8 hours since you last talked\. .*Text them first/);
  assert.match(A.comeBack(8 * 3600e3, false), /^\[Time passes: about 8 hours since you last talked\. Reach out to them first/, "from a chat you aren't in");
  assert.match(A.comeBack(30 * 3600e3), /about a day/);
  assert.match(A.comeBack(80 * 3600e3), /about 3 days/);
});
