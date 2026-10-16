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
  assert.match(A.portraitPrompt(ines), /^Portrait photo of Ines Corbel, an original adult character: forties.*Safe for work: fully clothed, nothing sexual, no gore; everyone shown is an adult\./);
  assert.match(A.photoPrompt(ines, "On deck."), /Keep how they look exactly.*Safe for work.*everyone shown is an adult\. New photo: On deck\./);
  assert.match(A.clipPrompt(ines, "She waves."), /everyone shown is an adult\. She waves\.$/);
  assert.match(A.lookMessages(ines)[1].content, /Ferry pilot/);
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

test("venice: what Venice says when it turns something down", async () => {
  const v = new Venice("sk", { fetch: fake((p) => (p === "/video/queue" ? { status: 422, body: { error: "Prompt violates content policy" } } : { status: 503, body: {} })).f });
  await assert.rejects(v.queueVideo({ model: "m", prompt: "p", duration: "5s" }), /content rules: Prompt violates content policy/);
  await assert.rejects(v.speak({ model: "m", input: "x" }), /busy at Venice/);
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
  assert.match(A.comeBack(30 * 3600e3), /about a day/);
  assert.match(A.comeBack(80 * 3600e3), /about 3 days/);
});
