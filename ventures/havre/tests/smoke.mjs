// node tests/smoke.mjs [--shots DIR]: Havre in a real browser, against a fake Venice (no network, no key).
//
// Serves this folder on localhost and drives Chromium through the page on a desktop and a phone: the first visit,
// a card import and a chat without a key, the key and the balance, Venice's characters (photos through Venice's
// image service that stay put between searches, pages seen lately not asked for again, tags, adult ones only once
// asked for) and one who says hello first, the model picker, a plain chat, several chats at once (and in two tabs),
// the abilities (a photo, and one Venice turns down, voice notes, a clip priced first, your voice note through a fake
// microphone, your photo seen or described, a first portrait), a remix end to end, the exports, the retirement of the
// first version's cast and its conversations, the harbor's own met without a key, and the page's security policy.
// Fails on any console error. With --shots, it also takes the screenshots: desktop.png and og.png are the ones the
// site serves (tools/build.sh copies them to shots/).
//
// Playwright: PW_MODULE (a path to playwright-core's index.mjs, or a package name), else playwright-core, else
// playwright. Chrome: CHROME, with CHROME_FLAGS (e.g. --no-sandbox as root); else Playwright's own Chromium.
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const argv = process.argv.slice(2);
const SHOTS = argv.includes("--shots") ? argv[argv.indexOf("--shots") + 1] || "" : "";

async function playwright() {
  const tries = [process.env.PW_MODULE, "playwright-core", "playwright"].filter(Boolean);
  for (const m of tries) {
    try {
      const mod = await import(m.startsWith("/") ? pathToFileURL(m).href : m);
      const pw = mod.chromium ? mod : mod.default;
      if (pw && pw.chromium) return pw;
    } catch { /* the next one */ }
  }
  throw new Error("no Playwright found: set PW_MODULE to playwright-core's index.mjs (tried " + tries.join(", ") + ")");
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8" };
function serve() {
  const srv = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); }
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, base: `http://127.0.0.1:${srv.address().port}/` })));
}

// ---------- a stand-in for api.venice.ai that answers like it does ----------
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
let CRC = null;
function crc32(bytes) {
  if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } }
  let c = -1;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
/** a 2x2 PNG in one colour of its own: every picture the fake Venice makes is a different one, as a real one's would be */
function picture(n) {
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]), out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); td.copy(out, 4); out.writeUInt32BE(crc32(td), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const px = [(n * 37) % 256, (n * 91 + 40) % 256, (n * 53 + 90) % 256], row = Buffer.from([0, ...px, ...px]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat([row, row]))), chunk("IEND", Buffer.alloc(0))]);
}
let pictures = 0;
const newPicture = () => picture(++pictures);
// Venice's safe mode judges the picture, not the prompt: set, the next one drawn with safe mode on comes back blurred
let blurNext = false;
// the photo models that turn every photo down, as Venice does when a prompt trips its content filter (or the model maker's)
const refusing = new Set();
// set, the voice models are busy at Venice
let speechDown = false;
const seen = { characters: [], chats: [], memories: [], photos: [], edits: [], refused: [], generated: [], speech: [], heard: [], quotes: [], queued: [], retrieved: [],
  shares: [], completed: [] };
/** a short WAV of silence: something an audio element can load */
function wav(ms = 300) {
  const n = Math.round(8000 * ms / 1000), b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  return b;
}
const CLIP = Buffer.from("not really an mp4, but a video element won't complain");
const MEDIA_MODELS = {
  inpaint: [
    { id: "grok-imagine-edit", model_spec: { name: "Grok Imagine", privacy: "private", pricing: { inpaint: { usd: 0.03 }, resolutions: { "1K": { usd: 0.03 }, "2K": { usd: 0.04 } } },
      constraints: { combineImages: true, promptCharacterLimit: 1500 } } },
    { id: "firered-image-edit", model_spec: { name: "FireRed", privacy: "private", pricing: { inpaint: { usd: 0.04 } }, constraints: { promptCharacterLimit: 1500 } } },
    { id: "nano-banana-2-edit", model_spec: { name: "Nano Banana 2", privacy: "anonymized", pricing: { inpaint: { usd: 0.1 } }, constraints: { combineImages: true, maxInputImages: 6 } } },
    { id: "qwen-edit-uncensored", model_spec: { name: "Qwen Edit Uncensored", privacy: "private", uncensored: true, pricing: { inpaint: { usd: 0.04 } },
      constraints: { combineImages: true, promptCharacterLimit: 1500 } } }],
  image: [{ id: "grok-imagine-image", model_spec: { name: "Grok Imagine", privacy: "private", pricing: { resolutions: { "1K": { usd: 0.03 } } }, constraints: { aspectRatios: ["1:1", "9:16"] } } },
    { id: "krea-2-turbo", model_spec: { name: "Krea 2 Turbo", privacy: "private", uncensored: true, pricing: { resolutions: { "1K": { usd: 0.04 } } },
      constraints: { aspectRatios: ["1:1", "9:16"], promptCharacterLimit: 5000 } } }],
  tts: [{ id: "tts-kokoro", model_spec: { name: "Kokoro", privacy: "private", pricing: { input: { usd: 3.5 } }, voices: ["af_bella", "af_sky", "am_adam"], default_format: "mp3" } },
    { id: "tts-qwen3-1-7b", model_spec: { name: "Qwen 3 TTS 1.7B", privacy: "private", pricing: { input: { usd: 112.5 } }, voices: ["Serena", "Dylan"], default_format: "mp3" } }],
  asr: [{ id: "nvidia/parakeet-tdt-0.6b-v3", model_spec: { name: "Parakeet", privacy: "private", pricing: { per_audio_second: { usd: 0.0001 } } } }],
  video: [
    { id: "grok-imagine-1-5-reference-to-video-private", model_spec: { name: "Grok Imagine 1.5 R2V", privacy: "private", constraints: { model_type: "image-to-video",
      durations: ["3s", "5s", "10s"], resolutions: ["480p", "720p"], aspect_ratios: ["16:9", "9:16"], audio: true, audio_configurable: false, prompt_character_limit: 4096 } } },
    { id: "wan-2-7-enhanced-image-to-video", model_spec: { name: "Wan 2.7 Enhanced", privacy: "anonymized", constraints: { model_type: "image-to-video", durations: ["5s"] } } },
    { id: "seedance-2-0-reference-to-video-basic", model_spec: { name: "Seedance 2.0 R2V", privacy: "anonymized", constraints: { model_type: "image-to-video",
      durations: ["4s", "5s"], resolutions: ["480p", "720p"], aspect_ratios: [], audio: true, audio_configurable: true } } },
    { id: "wan-3-0-reference-to-video", model_spec: { name: "Wan 3.0 Reference", privacy: "anonymized", uncensored: true, constraints: { model_type: "image-to-video",
      durations: ["5s", "10s"], resolutions: ["720p"], aspect_ratios: ["9:16"], audio: true, audio_configurable: true } } }],
};
/** a reply as a model without a schema to keep to writes it: chatter around it, a raw line break in a string, a trailing comma */
const handWritten = (o) => "Sure! Here it is:\n```json\n" + JSON.stringify(o, null, 1).replace(/\\n/g, "\n").replace(/\n}$/, ",\n}") + "\n```";
/** the chat calls where someone talks: not the ones deciding what a character does on their own, or writing down what they remember */
const talks = () => seen.chats.filter((b) => !/^You (decide whether|keep the memory)/.test(String((b.messages[0] || {}).content || "")));
/** words a content filter turns a prompt down for: none of them are Havre's own (abilities.test.mjs has the rest) */
const TRIPS = /\b(?:sex\w*|nud\w*|naked|gor[ey]|minors?|child\w*|kids?|school\w*|teen\w*|under[\s-]?(?:18|eighteen|age\w*)|young\w*)\b/i;
// and in a picture prompt sent with safe mode off, which a filter reads the hardest: no age, nothing it guards
const ADULT_TRIPS = /\d|identifiable|hard rule|\bbody\b/i;
const multipart = (req) => (req.headers()["content-type"] || "").startsWith("multipart/form-data");
const CHARACTERS = [
  { slug: "sable-penrose", name: "Sable Penrose", description: "Your new neighbor needs help moving in.", author: "btrzm",
    photoUrl: "https://outerface.venice.ai/sable.png", adult: false, webEnabled: false, modelId: "zai-org-glm-5-2", tags: ["neighbor"], stats: { imports: 25752 } },
  { slug: "after-dark", name: "After Dark", description: "Only for grown-ups.", author: "x", photoUrl: null, adult: true, modelId: "m", tags: [], stats: {} },
  { slug: "wren", name: "Wren", description: "A deckhand on the night ferry.", author: "q", photoUrl: null, adult: false, modelId: "zai-org-glm-5-2", tags: [], stats: {} },
];
async function fakeVenice(route) {
  const req = route.request(), url = req.url(), body = req.postData() || "", auth = req.headers().authorization || "";
  const cors = { "access-control-allow-origin": "*" };
  const ok = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data), headers: cors });
  if (req.method() === "OPTIONS") {
    return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
  }
  if (url.includes("/models")) {
    const type = new URL(url).searchParams.get("type");
    if (MEDIA_MODELS[type]) return ok({ data: MEDIA_MODELS[type] });
    return ok({ data: [
      { id: "zai-org-glm-5-2", model_spec: { name: "GLM 5.2", privacy: "private", traits: ["default"], availableContextTokens: 198000,
        capabilities: { supportsFunctionCalling: true, supportsReasoning: true, supportsResponseSchema: true }, pricing: { input: { usd: 1.4 }, output: { usd: 4.4 } } } },
      { id: "tiny-model", model_spec: { name: "Tiny", privacy: "anonymized", uncensored: true, availableContextTokens: 32000,
        capabilities: { supportsVision: true }, pricing: { input: { usd: 0.1 }, output: { usd: 0.2 } } } },
      { id: "beta-model", model_spec: { name: "Beta only", beta: true, privacy: "private", pricing: {} } }] });
  }
  if (auth !== "Bearer sk-good") return ok({ error: "Authentication failed" }, 401);
  if (url.includes("/billing/balance")) {
    return ok({ canConsume: true, consumptionCurrency: "USD", balances: { usd: 12.5, diem: null, bundledCredits: null, earnedCredits: null }, diemEpochAllocation: 0 });
  }
  if (url.includes("/characters")) {
    seen.characters.push(url);
    const q = new URL(url).searchParams, tag = q.get("tags"), adult = q.get("isAdult");
    return ok({ object: "list", data: CHARACTERS.filter((c) => (adult === null || String(c.adult) === adult) && (!tag || c.tags.includes(tag))) });
  }
  if (url.includes("/chat/completions")) {
    const b = JSON.parse(body);
    // Tiny can't keep to a schema: asked to, it refuses, and without one it writes its JSON by hand
    if (b.response_format && b.model === "tiny-model") return ok({ error: "This model does not support response_format" }, 400);
    seen.chats.push(b);
    const json = (o) => (b.response_format ? JSON.stringify(o) : handWritten(o));
    const system = b.messages[0] && b.messages[0].role === "system" ? b.messages[0].content : "";
    const last = (b.messages.at(-1) || {}).content || "";
    const lastSaid = typeof last === "string" ? last : "";
    if (/^take your time/i.test(lastSaid)) await new Promise((r) => setTimeout(r, 1500));    // a slow reply
    let reply;
    if (system.startsWith("You decide whether a character")) {
      const said = (b.messages[1].content.match(/^Them: .*$/gm) || []).at(-1) || "";     // the last thing they said
      reply = /^Them:.*\bSend me a pic/i.test(said) ? json({ move: "photo", shot: "The character from the reference picture holds up a mug\nin a half-unpacked kitchen." })
        : /^Them:.*\bFilm the harbor/i.test(said) ? json({ move: "clip", shot: "The character from the reference pictures pans across the harbor at dusk." })
        : /^Them:.*\bWhisper it/i.test(said) ? json({ move: "voice", shot: "" }) : json({ move: "nothing", shot: "" });
    } else if (/^(?:\(You sent me [^\n]*\)\n\n)?\[Time passes/.test(lastSaid)) {          // after a word about the photo she sent last, if she did
      reply = "You're back!\n\nI kept the kettle warm.";
    } else if (system.startsWith("You write the shot for a photo")) {
      reply = "Shot: The character from the reference picture sits on a stack of moving boxes, grinning, warm lamplight.";
    } else if (system.startsWith("You write the shot for a video clip")) {
      reply = "The character from the reference pictures waves from the doorway as the camera drifts closer.";
    } else if (system.startsWith("You keep the memory of a character")) {
      seen.memories.push(b);
      reply = json({ notes: ["They asked about the ferry, six times over.", "I told them to ask again after the tide."] });
    } else if (system.startsWith("You describe how an original character looks")) {
      reply = "Thirties, wiry, a knitted cap, a reefer jacket with the collar up, salt in the stubble.";
    } else if (Array.isArray(last) && last[0].text.startsWith("Describe this photo")) {
      assert.match(last[1].image_url.url, /^data:image\/jpeg;base64,/, "the photo goes as a JPEG data URI");
      reply = "A small red square on a white table.";
    } else if (Array.isArray(last)) {
      assert.equal(last[1].type, "image_url", "a model that can see gets the photo itself");
      reply = "Nice photo.\n\nIs that your boat?";
    } else if (system.startsWith("You read a character")) {
      reply = json({ archetype: "gruff shopkeeper", premise: "keeps a log of every newcomer", setting: "a small port town",
        drives: ["help newcomers settle"], fears: ["losing the logbook"], voice: ["wry", "plain"], quirks: ["counts boats"],
        relationships: ["grudging guide to the user"], boundaries: ["won't oversell"], themes: ["arrival"] });
    } else if (system.startsWith("You are a character writer")) {
      assert.ok(body.includes("logbook") || body.includes("log of every"), "the writer gets the ideas");
      assert.ok(!body.includes("bait shop"), "the writer never sees the source");
      reply = json({ name: "Ines Corbel", tagline: "Ferry pilot with a pencil behind her ear",
        greeting: "Ticket? Kidding.\n\nWhere are you headed?",
        persona: "You are Ines Corbel, who pilots the morning ferry across a cold grey estuary. You sketch every passenger in a tiny notebook and give them the drawing at the far pier. You are cheerful, nosy and quick, and you hate fog.",
        examples: [{ user: "Is it far?", character: "Twelve minutes.\n\nNine if the gulls cooperate." }], tags: ["ferry"] });
    } else if (lastSaid.startsWith("Think hard")) {
      reply = b.max_tokens > 700 ? "Okay, I thought about it.\n\nTwelve minutes." : "";   // the first time, it thinks its room away
    } else if (lastSaid.startsWith("Loop for me")) {
      reply = "I'm not sure.\n\n".repeat(30);
    } else if (/^Say nothing(\n\n\[|$)/.test(lastSaid)) {
      reply = "";
    } else if (lastSaid.startsWith("[Start the conversation")) {
      reply = "Oh! Hi.\n\nCareful, the boxes bite.";
    } else {
      reply = "Mm. Good question.\n\nAsk me again after the tide.";
    }
    return ok({ choices: [{ message: { role: "assistant", content: reply } }], usage: { total_tokens: 42 } });
  }
  const file = (bytes, type, headers = {}) => route.fulfill({ status: 200, contentType: type, body: bytes, headers: { ...cors, ...headers } });
  if (url.endsWith("/image/edit") || url.endsWith("/image/multi-edit")) {
    const e = JSON.parse(body), model = e.model || e.modelId;
    if (refusing.has(model)) { seen.refused.push(model); return ok({ error: "Your prompt violates the content policy of Venice.ai or the model provider" }, 422); }
    seen.edits.push({ url, body: e });
    return file(newPicture(), "image/webp");
  }
  if (url.endsWith("/image/generate")) {
    const g = JSON.parse(body), blur = blurNext && g.safe_mode !== false;
    seen.generated.push(g);
    if (blur) blurNext = false;
    return file(newPicture(), "image/webp", blur ? { "x-venice-is-blurred": "true", "access-control-expose-headers": "x-venice-is-blurred" } : {});
  }
  if (url.endsWith("/audio/speech")) {
    if (speechDown) return ok({ error: "The model is at capacity." }, 503);
    seen.speech.push(JSON.parse(body));
    return file(wav(), "audio/wav");
  }
  if (url.endsWith("/audio/transcriptions")) {
    assert.ok(multipart(req), "a voice note goes as a form");
    seen.heard.push(body);
    return ok({ text: "hello from the mic", duration: 1.2 });
  }
  if (url.endsWith("/video/quote")) { const q = JSON.parse(body); seen.quotes.push(q); return ok({ quote: q.duration === "10s" ? 0.94 : 0.47 }); }
  if (url.endsWith("/video/queue")) {
    const q = JSON.parse(body);
    seen.queued.push(q);
    return ok({ model: q.model, queue_id: "q-" + seen.queued.length,
      ...(/-private$/.test(q.model) ? { download_url: "https://private-share.venice.ai/v1/share/read/clip-" + seen.queued.length } : {}) });
  }
  if (url.endsWith("/video/retrieve")) {
    const q = JSON.parse(body);
    seen.retrieved.push(q);
    if (seen.retrieved.filter((r) => r.queue_id === q.queue_id).length < 2) return ok({ status: "PROCESSING", average_execution_time: 60000, execution_duration: 20000 });
    return /-private$/.test(q.model) ? ok({ status: "COMPLETED", average_execution_time: 60000, execution_duration: 61000 }) : file(CLIP, "video/mp4");
  }
  if (url.endsWith("/video/complete")) { seen.completed.push(JSON.parse(body)); return ok({ success: true }); }
  return ok({ error: "not found" }, 404);
}
/** Venice's private-share links: the clip once, then the link is revoked */
async function fakeShare(route) {
  const req = route.request(), cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,DELETE" };
  seen.shares.push(req.method() + " " + req.url());
  assert.ok(!req.headers().authorization, "no key goes to a download link");
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  if (req.method() === "DELETE") return route.fulfill({ status: 204, headers: cors });
  return route.fulfill({ status: 200, contentType: "video/mp4", body: CLIP, headers: cors });
}

// ---------- small waits ----------
async function until(page, fn, arg, what, timeout = 7000) {
  try { await page.waitForFunction(fn, arg, { timeout }); } catch { throw new Error("timed out waiting for " + what); }
}
const count = (page, sel, n, timeout) => until(page, ([s, n]) => document.querySelectorAll(s).length === n, [sel, n], `${n} of ${sel}`, timeout);
const has = (page, sel, re, timeout) => until(page, ([s, src, fl]) => [...document.querySelectorAll(s)].some((el) => new RegExp(src, fl).test(el.textContent)),
  [sel, re.source, re.flags], `${sel} to read ${re}`, timeout);
const textOf = (page, sel) => page.locator(sel).first().evaluate((el) => el.textContent);
/** do something, then wait for one more reply matching re than there was before */
async function answered(page, act, re = /Ask me again after the tide\./, timeout = 10000) {
  const sel = "#log .line.them .said", n = () => page.evaluate(([s, src, fl]) => [...document.querySelectorAll(s)].filter((e) => new RegExp(src, fl).test(e.textContent)).length, [sel, re.source, re.flags]);
  const before = await n();
  await act();
  await until(page, ([s, src, fl, k]) => [...document.querySelectorAll(s)].filter((e) => new RegExp(src, fl).test(e.textContent)).length > k,
    [sel, re.source, re.flags, before], "a new reply reading " + re, timeout);
}
async function poll(fn, what, timeout = 7000) {
  for (const t0 = Date.now(); !(await fn());) {
    if (Date.now() - t0 > timeout) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 50));
  }
}

const v2 = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Captain Ro", description: "{{char}} runs a bait shop at the end of the pier.",
  first_mes: "We're closed. Mostly.", mes_example: "<START>\n{{user}}: Worms?\n{{char}}: Manners?", creator: "someone", tags: [] } };

async function main() {
  const pw = await playwright();
  const { srv, base } = await serve();
  const errors = [], missing = [];
  const quiet = (t) => t.startsWith("Failed to load resource") || t.includes("example.com");
  const watch = (page, tag) => {
    page.on("console", (m) => { if (m.type() === "error" && !quiet(m.text())) errors.push(tag + m.text()); });
    page.on("pageerror", (e) => errors.push(tag + String(e)));
    page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(base)) missing.push(r.url()); });
  };
  const venice = async (page) => {
    await page.route(/^https:\/\/api\.venice\.ai\//, fakeVenice);
    await page.route(/^https:\/\/private-share\.venice\.ai\//, fakeShare);
    // Venice's photos only come through its image service; asked for directly, they're refused
    await page.route(/^https:\/\/venice\.ai\/_next\/image\?/, (r) => { seen.photos.push(r.request().url()); r.fulfill({ status: 200, contentType: "image/png", body: PIXEL }); });
    await page.route(/^https:\/\/outerface\.venice\.ai\//, (r) => r.fulfill({ status: 403, contentType: "application/json", body: "{}" }));
  };
  if (SHOTS) await mkdir(SHOTS, { recursive: true });
  const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name), ...opts }); };
  // a fake microphone (a steady tone), allowed without asking: for recording a voice note
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined,
    args: [...(process.env.CHROME_FLAGS || "").split(/\s+/).filter(Boolean), "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  try {
    // ---------- desktop ----------
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    watch(page, "");
    await venice(page);
    await page.goto(base);

    // the first visit: no key and nobody in the harbor, so the harbor's own to meet, empty frames and a note
    await count(page, "#cast li", 3);
    await has(page, "#cast .tile[data-cast=maren] .go", /^meet$/);
    await count(page, "#vgrid li.ghost", 8);
    assert.match(await textOf(page, "#venstatus"), /venice key/);
    assert.match(await textOf(page, "#who-name"), /^chat$/i);
    await has(page, "#log .line.note .said", /paste your venice key/);
    assert.ok(await page.locator("#harbor-empty").isVisible(), "the empty harbor says so");
    assert.ok(await page.locator("#card-empty").isVisible(), "so does the empty card");
    assert.ok(await page.locator("#say").isDisabled(), "nobody to talk to yet");
    assert.equal(await page.evaluate(() => localStorage.length), 0, "a first visit keeps nothing");
    await page.waitForTimeout(150);
    await shot(page, "desktop.png");

    // a card comes in through the import dialog, and talks from its own examples without a key
    await page.click("#import");
    await page.setInputFiles("#file", { name: "ro.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(v2)) });
    await count(page, "#roster tr", 1);
    await has(page, "#who-name", /^Captain Ro$/);
    await has(page, "#log .line.them .said", /We're closed\. Mostly\./);
    await has(page, "#roster td", /Ported from Captain Ro by someone/);
    assert.ok(await page.locator("#keynote").isVisible(), "demo mode says so");
    await page.fill("#say", "Worms?");
    await page.keyboard.press("Enter");
    await has(page, "#log .line.me .said", /^Worms\?$/);
    await has(page, "#log .line.them .said", /^Manners\?$/);

    // the key: a bad one is refused, a good one is kept for this tab only
    await page.fill("#keyin", "sk-bad");
    await page.click("#keysave");
    await has(page, "#keystatus", /didn't accept/);
    await page.fill("#keyin", "sk-good");
    await page.click("#keysave");
    await has(page, "#keystatus", /saved for this tab/);
    assert.ok(await page.locator("#keynote").isHidden(), "no demo note with a key");
    assert.equal(await page.evaluate(() => localStorage.getItem("havre.key")), null, "an unremembered key stays out of localStorage");
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("havre.key"))), "sk-good");

    // Venice's characters: adult ones only when asked for, and photos come through Venice's image service
    await count(page, "#vgrid li:not(.ghost)", 2);
    assert.ok(seen.characters.some((u) => /isAdult=false/.test(u) && /sortBy=featured/.test(u)), "no adult characters unless asked");
    await until(page, () => { const i = document.querySelector("#vgrid img"); return !!i && i.complete && i.naturalWidth > 0; }, null, "a character's photo");
    assert.ok(seen.photos[0].startsWith("https://venice.ai/_next/image?url=https%3A%2F%2Fouterface.venice.ai%2Fsable.png&w="), seen.photos[0]);
    assert.equal(await page.locator("#vgrid .noface").count(), 1, "no photo is an empty frame");
    await has(page, "#balance", /^balance \$12\.50$/);
    // a new search draws a character's tile again only if something about them changed: their photo stays put
    await page.evaluate(() => { document.querySelector('#vgrid .tile[data-slug="sable-penrose"] img').dataset.kept = "yes"; });
    let asked = seen.characters.length;
    await page.selectOption("#vsort", "imports");
    await poll(() => seen.characters.length > asked, "a sorted search");
    assert.ok(seen.characters.at(-1).includes("sortBy=imports"), "the sort reaches Venice");
    await until(page, () => document.querySelector("#venstatus").textContent === "", null, "the sorted page");
    await count(page, "#vgrid li:not(.ghost)", 2);
    await has(page, "#vgrid .nm", /Wren/);
    assert.equal(await page.locator('#vgrid img[data-kept="yes"]').count(), 1, "Sable's photo wasn't drawn again");
    // a tag narrows the list, and comes off again: the page from before comes back without asking Venice
    asked = seen.characters.length;
    await page.getByRole("button", { name: "Only characters tagged neighbor" }).click();
    await poll(() => seen.characters.length > asked, "a search by tag");
    assert.ok(seen.characters.at(-1).includes("tags=neighbor"));
    await count(page, "#vgrid li:not(.ghost)", 1);
    asked = seen.characters.length;
    await page.getByRole("button", { name: "Show every tag, not just neighbor" }).click();
    await count(page, "#vgrid li:not(.ghost)", 2);
    assert.equal(seen.characters.length, asked, "a page seen a moment ago isn't asked for again");
    assert.equal(await page.locator('#vgrid img[data-kept="yes"]').count(), 1, "nor is her photo drawn again");
    // adult characters, once someone says they're 18 or older: then those, and their tags
    page.once("dialog", (d) => d.accept());
    await page.check("#vadult");
    await count(page, "#vgrid li:not(.ghost)", 1);
    assert.ok(seen.characters.at(-1).includes("isAdult=true"), "asked for as such: left out, Venice mixes them in with the rest");
    await has(page, "#vgrid .nm", /^After Dark$/);
    await has(page, "#vgrid .x18", /18\+/);
    assert.ok(await page.locator("#vtags").isHidden(), "their tags (they have none)");
    assert.equal(await page.evaluate(() => localStorage.getItem("havre.adult.18")), "true");
    asked = seen.characters.length;
    await page.uncheck("#vadult");
    await count(page, "#vgrid li:not(.ghost)", 2);
    await has(page, "#vtags", /#neighbor/);
    assert.equal(seen.characters.length, asked, "the page without them comes back, tags and all, without asking either");
    // the same search again asks Venice afresh
    await page.click("#vgo");
    await poll(() => seen.characters.length > asked, "the same search, asked again");

    // one of them says hello first, through Venice, with their own prompt
    const chatsBefore = seen.chats.length;
    await page.locator("#vgrid .tile", { hasText: "Sable Penrose" }).click();
    await page.waitForTimeout(50);
    await has(page, "#who-name", /^Sable Penrose$/);
    await has(page, "#log .line.them .said", /Careful, the boxes bite\./);
    assert.equal(await page.locator("#log .line.me").count(), 0, "what started it isn't shown");
    const hello = seen.chats[chatsBefore];
    assert.equal(hello.venice_parameters.character_slug, "sable-penrose");
    assert.equal(hello.messages.length, 1);
    assert.equal(hello.messages[0].role, "user");
    await count(page, "#roster tr", 2);
    assert.match(await page.locator('#vgrid .tile[aria-pressed="true"]').evaluate((el) => el.textContent), /Sable Penrose.*talking now/);
    // the model: their own on Venice to start with, and any other Venice model from the picker
    await has(page, "#model-btn", /^GLM 5\.2$/);
    await page.click("#model-btn");
    await count(page, "#mlist tr", 2);
    assert.match(await textOf(page, "#mlist tr"), /GLM 5\.2.*their own/);
    assert.match(await page.locator("#mlist tr", { hasText: "Tiny" }).evaluate((el) => el.textContent), /anonymized.*sees.*uncensored.*\$0\.10 \/ \$0\.20.*32k/);
    await shot(page, "desktop-models.png");
    await page.getByRole("button", { name: "Use Tiny" }).click();
    await has(page, "#model-btn", /^Tiny$/);
    await page.fill("#say", "Do you have a boat?");
    await page.keyboard.press("Enter");
    await has(page, "#log .line.them .said", /Ask me again after the tide\./);
    assert.equal(talks().at(-1).model, "tiny-model");
    await page.waitForTimeout(400);
    await shot(page, "desktop-chat.png");

    // a plain chat: no character, just a model, in one piece
    await page.click("#plain");
    await has(page, "#who-name", /^no character$/);
    await page.fill("#say", "What is a harbor?");
    await page.keyboard.press("Enter");
    await has(page, "#log .line.them .said", /Mm\. Good question\.\n\nAsk me again after the tide\./);
    const plain = talks().at(-1);
    assert.equal(plain.messages[0].role, "user", "no system prompt of Havre's");
    assert.equal(plain.venice_parameters.include_venice_system_prompt, true);
    assert.ok(!plain.venice_parameters.character_slug);
    assert.ok(await page.locator("#card-body").isHidden(), "a plain chat has no card");
    assert.equal(await page.locator("#tools button", { hasText: "ask for a photo" }).count(), 0, "a plain chat has nobody to send a photo");

    // ---------- your chats: several at once ----------
    await page.click("#lt-chats");
    await count(page, "#threads > li", 3);
    assert.ok(await page.locator("#vgrid").isHidden(), "one tab at a time");
    assert.match(await textOf(page, '#threads > li[aria-current="true"]'), /no character.*What is a harbor\?/, "the open chat, named by the first thing said");
    assert.match(await textOf(page, "#threads > li:nth-child(2)"), /Sable Penrose.*Do you have a boat\?.*Ask me again after the tide\./);
    // a slow reply from Sable keeps coming while you talk to Captain Ro
    await page.locator("#threads .trow", { hasText: "Sable Penrose" }).click();
    await has(page, "#who-name", /^Sable Penrose$/);
    await page.fill("#say", "Take your time, what's in the boxes?");
    await page.keyboard.press("Enter");
    await has(page, '#threads > li[aria-current="true"] .tsnip', /is typing/);
    await page.locator("#threads .trow", { hasText: "Captain Ro" }).click();
    await has(page, "#who-name", /^Captain Ro$/);
    assert.ok(await page.locator("#sendbtn").isEnabled(), "another chat isn't held up by Sable's reply");
    await answered(page, async () => { await page.fill("#say", "Worms, please"); await page.keyboard.press("Enter"); });
    await has(page, "#threads .tnew", /^1$/, 5000);
    await has(page, "#toast", /^Sable Penrose: Mm\. Good question\./);
    await has(page, "#chats-new", /^1$/);
    assert.equal(await page.title(), "(1) Havre");
    assert.equal(await page.locator("#log .said", { hasText: "in the boxes" }).count(), 0, "her reply stays in her chat");
    await page.locator("#threads .trow", { hasText: "Sable Penrose" }).click();
    await has(page, "#log .line.me .said", /what's in the boxes\?/);
    await has(page, "#log .line.them .said", /Ask me again after the tide\./);
    await count(page, "#threads .tnew", 0);
    assert.equal(await page.title(), "Havre");
    // a new chat with her: the old one stays; she says hello again
    await page.locator("#who-meta").getByRole("button", { name: "new chat" }).click();
    await count(page, "#threads > li", 4);
    await has(page, "#log .line.them .said", /Careful, the boxes bite\./);
    assert.equal(await page.locator("#log .said", { hasText: "in the boxes" }).count(), 0, "a new chat starts clean");
    assert.equal(await page.locator("#threads .tname", { hasText: "Sable Penrose" }).count(), 2);
    await shot(page, "desktop-chats.png");
    // named, then deleted
    page.once("dialog", (d) => d.accept("Moving day"));
    await page.locator("#who-meta").getByRole("button", { name: "rename" }).click();
    await has(page, '#threads > li[aria-current="true"] .ttitle', /^Moving day$/);
    page.once("dialog", (d) => d.accept());
    await page.locator("#who-meta").getByRole("button", { name: "delete" }).click();
    await count(page, "#threads > li", 3);
    await has(page, "#log .line.me .said", /what's in the boxes\?/);
    const store = await page.evaluate(() => ({ index: JSON.parse(localStorage.getItem("havre.threads.v1")), gone: JSON.parse(localStorage.getItem("havre.threads.gone")) }));
    assert.equal(Object.keys(store.index).length, 3);
    assert.equal(Object.keys(store.gone).length, 1, "remembered as deleted, so another tab won't bring it back");
    assert.equal(await page.evaluate((id) => localStorage.getItem("havre.msgs." + id), Object.keys(store.gone)[0]), null, "its messages went with it");
    await page.click("#lt-chars");

    // ---------- abilities ----------
    // a photo from Sable: the shot is written from the conversation, the price shows, and it's an edit of her own photo
    await page.locator("#vgrid .tile", { hasText: "Sable Penrose" }).click();
    await has(page, "#who-name", /^Sable Penrose$/);
    await page.fill("#say", "on moving day");
    await page.getByRole("button", { name: "ask for a photo" }).click();
    await until(page, () => { const t = document.querySelector("#ask-shot"); return !!t && /moving boxes/.test(t.value); }, null, "the shot");
    assert.equal(await page.inputValue("#say"), "", "what was typed became the request");
    const shotAsk = talks().at(-1);
    assert.match(shotAsk.messages[0].content, /^You write the shot for a photo/);
    assert.match(shotAsk.messages[1].content, /What was asked for: on moving day/);
    assert.ok(!shotAsk.venice_parameters.character_slug, "the shot is written outside the character");
    assert.match(await textOf(page, "#ask"), /from 1 picture of Sable Penrose · model: Grok Imagine · \$0\.03/);
    assert.match(await textOf(page, "#ask-go"), /^TAKE THE PHOTO · \$0\.03$/);
    await shot(page, "desktop-ask-photo.png");
    await page.click("#ask-go");
    await until(page, () => { const i = document.querySelector("#log .pic img"); return !!i && i.src.startsWith("blob:") && i.complete && i.naturalWidth > 0; }, null, "the photo in the chat");
    const edit = seen.edits.at(-1);
    assert.ok(edit.url.endsWith("/image/edit"), "one picture: an edit");
    assert.equal(edit.body.model, "grok-imagine-edit");
    assert.equal(edit.body.safe_mode, true, "safe mode, always");
    assert.equal(edit.body.image, "https://outerface.venice.ai/sable.png", "her own photo, by the address Venice keeps it at");
    assert.match(edit.body.prompt, /^The reference picture shows Sable Penrose\..*moving boxes/);
    assert.ok(await page.locator("#ask").isHidden(), "the panel closes when the photo arrives");
    await has(page, "#log .line.media .cap", /photo · Grok Imagine · \$0\.03 · save/);
    // the photo is in the conversation the model reads next, as something it sent
    await answered(page, async () => { await page.fill("#say", "Cute."); await page.keyboard.press("Enter"); });
    assert.match(talks().at(-1).messages.at(-1).content, /^\(You sent me a photo: The character from the reference picture sits on a stack of moving boxes, grinning, warm lamplight\.\)\n\nCute\.$/);

    // voice notes: one on request ("hear it"), then every reply, in the voice on her card
    const hears = page.getByRole("button", { name: "Hear this as a voice note from Sable Penrose" });
    assert.ok(await hears.count() >= 2, "text replies offer a voice note");
    await hears.last().click();
    await until(page, () => [...document.querySelectorAll("#log audio")].some((a) => a.src.startsWith("blob:")), null, "a voice note");
    assert.deepEqual(seen.speech.at(-1), { input: "Mm. Good question. Ask me again after the tide.", model: "tts-kokoro", speed: 1, voice: "af_sky" });
    await page.getByRole("button", { name: "voice notes: off" }).click();
    await has(page, "#tools", /voice notes: on/);
    const spoke = seen.speech.length;
    await answered(page, async () => { await page.fill("#say", "Say it out loud"); await page.keyboard.press("Enter"); });
    assert.ok(seen.speech.length > spoke, "a voice note with the reply");
    await until(page, () => { const l = [...document.querySelectorAll("#log .line")]; const i = l.findLastIndex((x) => x.querySelector("audio")); return i >= 0 && i < l.length - 1 && /Ask me again/.test(l.at(-1).textContent); },
      null, "the voice note, then the words under it");
    await page.getByRole("button", { name: "voice notes: on" }).click();

    // her voice and mood live on her card
    await page.locator("#who-meta").getByRole("button", { name: "card" }).click();
    await page.locator("#speech-group summary").click();
    await count(page, "#speech-voice option", 3);
    await page.selectOption("#speech-voice", "am_adam");
    await page.fill('[name="speech_mood"]', "dry, a little tired");
    await page.locator("#speech-model").getByRole("button", { name: "Change the voice model" }).click();
    await count(page, "#mlist tr", 2);
    assert.match(await textOf(page, "#mhead"), /VOICES/);
    await page.getByRole("button", { name: "Use Qwen 3 TTS 1.7B" }).click();
    await until(page, () => document.querySelector("#speech-voice").value === "Serena", null, "a voice of the new model");
    await page.click("#speech-sample");
    await until(page, () => { const a = document.querySelector("#speech-status audio"); return !!a && a.src.startsWith("blob:"); }, null, "a sample");
    assert.deepEqual(seen.speech.at(-1), { input: "Hi, I'm Sable Penrose. Your new neighbor needs help moving in.", model: "tts-qwen3-1-7b", speed: 1, voice: "Serena", prompt: "dry, a little tired" });
    await until(page, () => (JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.name === "Sable Penrose").speech || {}).model === "tts-qwen3-1-7b", null, "her card saved");
    const sable = await page.evaluate(() => JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.name === "Sable Penrose"));
    assert.deepEqual(sable.speech, { model: "tts-qwen3-1-7b", voice: "Serena", mood: "dry, a little tired", speed: 1 });
    // a picture of her for the reference sheet
    page.once("dialog", (d) => d.accept());
    await page.locator("#look-group summary").click();
    await page.click("#ref-add");
    await page.setInputFiles("#ref-file", { name: "sable.png", mimeType: "image/png", buffer: PIXEL });
    await count(page, "#refs .ref", 2);

    // a clip: priced by Venice first, then made, then home
    await page.locator("#chat").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "ask for a clip" }).click();
    await until(page, () => { const t = document.querySelector("#ask-shot"); return !!t && /waves from the doorway/.test(t.value); }, null, "the clip's shot");
    await has(page, "#ask", /venice's price: \$0\.47/);
    assert.deepEqual(seen.quotes.at(-1), { model: "grok-imagine-1-5-reference-to-video-private", duration: "5s", resolution: "720p", aspect_ratio: "9:16" });
    await page.locator("#ask select").first().selectOption("10s");
    assert.ok(await page.locator("#ask-go").isDisabled(), "the old price goes the moment the clip changes");
    await has(page, "#ask-go", /^MAKE THE CLIP · \$0\.94$/);
    assert.ok(await page.locator("#ask-go").isEnabled());
    await page.locator("#ask select").first().selectOption("5s");
    await has(page, "#ask-go", /^MAKE THE CLIP · \$0\.47$/);
    await shot(page, "desktop-ask-clip.png");
    await page.click("#ask-go");
    await has(page, "#log [data-job] .said", /is making a clip with Grok Imagine 1\.5 R2V/);
    const queued = seen.queued.at(-1);
    assert.equal(queued.model, "grok-imagine-1-5-reference-to-video-private");
    assert.equal(queued.reference_image_urls.length, 2, "her photo and the picture on her card");
    assert.match(queued.reference_image_urls[1], /^data:image\/webp;base64,/);
    assert.match(queued.prompt, /^The reference pictures show Sable Penrose\. .*waves from the doorway/);
    await until(page, () => { const v = document.querySelector("#log video"); return !!v && v.src.startsWith("blob:"); }, null, "the clip in the chat", 15000);
    assert.equal(await page.locator("#log [data-job]").count(), 0, "the progress line goes when the clip arrives");
    assert.deepEqual(seen.shares.filter((s) => !s.startsWith("OPTIONS")), ["GET https://private-share.venice.ai/v1/share/read/clip-1", "DELETE https://private-share.venice.ai/v1/share/read/clip-1"]);
    assert.deepEqual(seen.completed, [{ model: queued.model, queue_id: "q-1" }]);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("havre.clips.pending")).length), 0);
    await has(page, "#log .line.media .cap", /clip · Grok Imagine 1\.5 R2V · \$0\.47/);

    // hearing and seeing: off until switched on
    assert.equal(await page.getByRole("button", { name: "record a voice note" }).count(), 0);
    await page.getByRole("button", { name: "abilities" }).click();
    await count(page, "#ablist tr", 8);
    // adult photos and clips: on for someone who said they're 18 or older (for Venice's adult characters, above)
    await has(page, "#ablist tr", /^ADULT characters marked adult send adult photos and clips/);
    await has(page, "#ablist tr", /photos: Qwen Edit Uncensored · clips: Wan 3\.0 Reference · portraits: Krea 2 Turbo · without safe mode, only from pictures made here with ai/);
    assert.ok(await page.getByLabel("characters marked adult send adult photos and clips").isChecked());
    await page.getByLabel("let them hear my voice notes").check();
    await page.getByLabel("let them see my photos").check();
    await shot(page, "desktop-abilities.png");
    await page.click("#abclose");
    // your voice note: recorded, heard, answered
    await ctx.grantPermissions(["microphone"]);
    await page.getByRole("button", { name: "record a voice note" }).click();
    await has(page, "#tools .rec", /recording/);
    await page.waitForTimeout(1300);
    await answered(page, () => page.getByRole("button", { name: "stop and send" }).click());
    await has(page, "#log .line.me .words", /^hello from the mic$/);
    assert.match(seen.heard.at(-1), /name="model"\r\n\r\nnvidia\/parakeet-tdt-0\.6b-v3/);
    assert.match(seen.heard.at(-1), /filename="voice-note\.(webm|ogg|m4a)"/);
    await until(page, () => { const a = [...document.querySelectorAll("#log .line.me audio")].at(-1); return !!a && a.src.startsWith("blob:"); }, null, "your voice note in the chat");
    assert.equal(talks().at(-1).messages.at(-1).content, "(You sent me a short video: The character from the reference pictures waves from the doorway as the camera drifts closer.)\n\nhello from the mic",
      "what you said, after a word about the clip she sent");
    // your photo, to a model that can see (she talks through Tiny now)
    const red = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#c00"; g.fillRect(8, 8, 48, 48); return c.toDataURL("image/png"); });
    const redPng = Buffer.from(red.split(",")[1], "base64");
    await page.fill("#say", "my boat");
    await page.setInputFiles("#photo-in", { name: "boat.png", mimeType: "image/png", buffer: redPng });
    await has(page, "#log .line.them .said", /Is that your boat\?/);
    const looked = talks().at(-1).messages.at(-1);
    assert.equal(looked.content[0].text, "[a photo] my boat");
    assert.match(looked.content[1].image_url.url, /^data:image\/jpeg;base64,/);
    // and to a model that can't: a model that can see describes it first
    await page.click("#plain");
    await answered(page, () => page.setInputFiles("#photo-in", { name: "boat.png", mimeType: "image/png", buffer: redPng }));
    await has(page, "#log .line.me .cap", /Tiny told them: A small red square on a white table\./);
    assert.equal(talks().at(-1).model, "zai-org-glm-5-2");
    assert.equal(talks().at(-1).messages.at(-1).content, "[a photo: A small red square on a white table.]");

    // on their own: asked for a picture in passing, Sable decides to send one, out of the day's allowance
    await page.locator("#vgrid .tile", { hasText: "Sable Penrose" }).click();
    await has(page, "#tools", /on their own: on/);
    const pics = await page.locator("#log .pic img").count();
    const spent = () => page.evaluate(() => (JSON.parse(localStorage.getItem("havre.spent")) || { usd: 0 }).usd);
    const spentBefore = await spent();
    assert.ok(spentBefore > 0 && spentBefore < 0.01, "her voice note back to yours came out of the allowance: " + spentBefore);
    await answered(page, async () => { await page.fill("#say", "Send me a pic of your kitchen"); await page.keyboard.press("Enter"); });
    await count(page, "#log .pic img", pics + 1, 10000);
    await has(page, "#log .line.media .cap", /photo · Grok Imagine · \$0\.03 · on their own/);
    assert.match(seen.edits.at(-1).body.prompt, /holds up a mug in a half-unpacked kitchen/);
    const delta = await spent() - spentBefore;
    assert.ok(delta >= 0.03 && delta < 0.031, "the photo (and the little call that chose it) came out of the day's allowance: " + delta);
    // a voice note when she'd rather say it
    const notes = await page.locator("#log audio").count();
    await answered(page, async () => { await page.fill("#say", "Whisper it to me"); await page.keyboard.press("Enter"); });
    await count(page, "#log audio", notes + 1, 10000);
    await has(page, "#log .line.media .cap", /voice note · Serena · \$[0-9.]+ · on their own/);
    // a clip she'd like to send: offered with Venice's price, made only on a yes
    const queuedBefore = seen.queued.length;
    await answered(page, async () => { await page.fill("#say", "Film the harbor for me"); await page.keyboard.press("Enter"); });
    await has(page, "#log .line.offer", /wants to send you a 5s clip: .*pans across the harbor at dusk/, 10000);
    await has(page, "#log .line.offer button", /^SEND IT · \$0\.47$/);
    await shot(page, "desktop-offer.png");
    await page.getByRole("button", { name: "NOT NOW" }).click();
    await count(page, "#log .line.offer", 0);
    assert.equal(seen.queued.length, queuedBefore, "no clip without a yes");
    // a voice note she starts on her own that doesn't come: the chat says so, instead of going quiet after "is recording…"
    speechDown = true;
    await answered(page, async () => { await page.fill("#say", "Whisper it to me again"); await page.keyboard.press("Enter"); });
    await has(page, "#log .line.err .said", /^Sable Penrose's voice note didn't come: That model is busy at Venice right now\./, 10000);
    assert.equal(await page.locator("#log [data-typing]").count(), 0, "nobody is still recording");
    speechDown = false;
    // Venice turns her photo down: she tries once more with the next photo model, and when that one says no too, the
    // chat says her photo didn't come, instead of going quiet after "is taking a photo…"; the allowance gets it all back
    refusing.add("grok-imagine-edit").add("firered-image-edit");
    const refusedBefore = seen.refused.length, spentNo = await spent(), picsNo = await page.locator("#log .pic img").count();
    await answered(page, async () => { await page.fill("#say", "Send me a pic of the hallway"); await page.keyboard.press("Enter"); });
    await has(page, "#log .line.err .said", /^Sable Penrose's photo didn't come: Venice turned that down as against its content rules\.$/, 10000);
    assert.deepEqual(seen.refused.slice(refusedBefore), ["grok-imagine-edit", "firered-image-edit"], "once more, with the next photo model");
    assert.equal(await page.locator("#log [data-typing]").count(), 0, "nobody is still taking a photo");
    assert.equal(await page.locator("#log .pic img").count(), picsNo);
    assert.ok(await spent() - spentNo < 0.001, "neither photo came out of the allowance: " + (await spent() - spentNo));
    // one says no and the next says yes: her photo comes
    refusing.delete("firered-image-edit");
    await answered(page, async () => { await page.fill("#say", "Send me a pic of the stairs"); await page.keyboard.press("Enter"); });
    await count(page, "#log .pic img", picsNo + 1, 10000);
    await has(page, "#log .line.media .cap", /photo · FireRed · \$0\.04 · on their own/);
    assert.deepEqual(seen.refused.slice(refusedBefore), ["grok-imagine-edit", "firered-image-edit", "grok-imagine-edit"]);
    refusing.clear();
    // and when you come back after a while, she texts first in her chat, and Captain Ro in his, which isn't on screen
    await page.evaluate(() => {
      const index = JSON.parse(localStorage.getItem("havre.threads.v1"));
      for (const t of Object.values(index)) {
        if (!/^(sable|captain)/.test(t.card)) continue;
        const key = "havre.msgs." + t.id, kept = JSON.parse(localStorage.getItem(key));
        for (const m of kept.msgs) if (m.at) m.at -= 8 * 3600e3;
        localStorage.setItem(key, JSON.stringify(kept));
        t.at -= 8 * 3600e3;
      }
      localStorage.setItem("havre.threads.v1", JSON.stringify(index));
    });
    await page.reload();
    await has(page, "#log .line.them .said", /I kept the kettle warm\./);
    const nudges = () => talks().filter((b) => /^(?:\(You sent me [^\n]*\)\n\n)?\[Time passes/.test(String(b.messages.at(-1).content)));
    assert.match(nudges()[0].messages.at(-1).content, /^\(You sent me a photo: The character from the reference picture holds up a mug in a half-unpacked kitchen\.\)\n\n\[Time passes: about 8 hours since you last talked\. They just came back to the chat\./,
      "the photo she sent last, then the time that's passed");
    await poll(() => nudges().length === 2, "Captain Ro texting first", 9000);
    assert.match(nudges()[1].messages.at(-1).content, /^\[Time passes: about 8 hours since you last talked\. Reach out to them first/);
    await has(page, "#chats-new", /^1$/);
    await has(page, "#toast", /^Captain Ro: You're back!/);
    await page.waitForTimeout(300);
    assert.equal(nudges().length, 2, "one text each, and only from the characters you were last talking to");
    // with today's allowance spent, nothing more happens on their own: not even the call that decides
    await page.evaluate(() => {
      const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      localStorage.setItem("havre.spent", JSON.stringify({ day, usd: 0.25 }));
    });
    const decided = seen.chats.length - talks().length, photosNow = await page.locator("#log .pic img").count();
    await answered(page, async () => { await page.fill("#say", "Send me a pic of your garden"); await page.keyboard.press("Enter"); });
    await page.waitForTimeout(800);
    assert.equal(seen.chats.length - talks().length, decided, "no deciding once the allowance is spent");
    assert.equal(await page.locator("#log .pic img").count(), photosNow, "and no photo");
    await page.evaluate(() => localStorage.removeItem("havre.spent"));

    // a character with no picture yet: a first portrait from how they look, then the photo
    await page.click("#lt-chars");
    await page.locator("#vgrid .tile", { hasText: "Wren" }).click();
    await has(page, "#log .line.them .said", /Careful, the boxes bite\./);
    await page.getByRole("button", { name: "ask for a photo" }).click();
    await has(page, "#ask", /has no picture yet/);
    await has(page, "#ask-portrait", /^MAKE A FIRST PORTRAIT · \$0\.03$/);
    await page.click("#ask-portrait");
    await until(page, () => { const t = document.querySelector("#ask-shot"); return !!t && /moving boxes/.test(t.value); }, null, "the shot after the portrait");
    assert.match(seen.generated.at(-1).prompt, /^Portrait photo of Wren, an original adult character: Thirties, wiry.*stubble\. Safe for work/);
    assert.equal(seen.generated.at(-1).safe_mode, true);
    await until(page, () => !!JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.name === "Wren").portrait, null, "Wren's card saved");
    const wren = await page.evaluate(() => JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.name === "Wren"));
    assert.match(wren.portrait, /^data:image\/webp;base64,/);
    assert.match(wren.look.description, /^Thirties, wiry/);
    // the photo model turns the photo down: the panel says so, with the next photo model a click away
    refusing.add("grok-imagine-edit");
    const editsWren = seen.edits.length, refusedWren = seen.refused.length;
    assert.equal(await page.locator("#ask-saw").count(), 0, "nothing to see before a refusal");
    await page.click("#ask-go");
    await has(page, "#ask .status", /^Venice turned that down as against its content rules\. Change the shot, or try another model\.$/);
    assert.deepEqual(seen.refused.slice(refusedWren), ["grok-imagine-edit"]);
    assert.equal(seen.edits.length, editsWren, "nothing made");
    await has(page, "#ask-alt", /^TRY FIRERED · \$0\.04$/);
    await has(page, "#ask-go", /^TRY AGAIN · \$0\.03$/);
    // what venice saw: the call, its answer as it came, the words a filter may weigh, and the prompt, a click away
    await has(page, "#ask details.saw summary", /^what venice saw$/);
    assert.equal(await page.locator("#ask details.saw").evaluate((d) => d.open), false, "folded until asked");
    const sawWren = await textOf(page, "#ask-saw");
    assert.match(sawWren, /^Grok Imagine \(grok-imagine-edit\) · image\/edit · 1 picture · safe mode on\n/);
    assert.match(sawWren, /\nvenice: 422 — Your prompt violates the content policy of Venice\.ai or the model provider\n/);
    assert.match(sawWren, /\nwords a filter may weigh \(ages, youth\): none havre knows of\. a real person's name, or a public figure's, is turned down too\.\nprompt:\n/);
    assert.match(sawWren, /\nprompt:\nThe reference picture shows Wren\. Safe for work: everyone in it is an adult, fully clothed\. Keep their face, so it's clearly them\. How they look: Thirties, wiry.*New photo: .*moving boxes.* A natural photo with no text in it\.$/s);
    await page.locator("#ask details.saw summary").click();
    await has(page, "#ask details.saw .acts button", /^COPY$/);
    await shot(page, "desktop-ask-refused.png");
    await page.click("#ask-alt");
    await has(page, "#toast", /^Photo model: FireRed, from now on\.$/);
    await until(page, () => [...document.querySelectorAll("#log .pic img")].some((i) => i.src.startsWith("blob:")), null, "Wren's photo");
    assert.equal(seen.edits.at(-1).body.model, "firered-image-edit");
    assert.match(seen.edits.at(-1).body.image, /^[A-Za-z0-9+/]+=*$/, "a picture of the card's own goes as base64");
    await has(page, "#log .line.media .cap", /photo · FireRed · \$0\.04 · save/);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("havre.abilities")).photo), "firered-image-edit", "the photo model from now on");
    refusing.clear();
    // and back to Grok Imagine, for what comes next
    await page.getByRole("button", { name: "abilities" }).click();
    await page.getByRole("button", { name: "Change the photo model", exact: true }).click();
    await page.getByRole("button", { name: "Use Grok Imagine", exact: true }).click();
    await page.click("#abclose");
    // photos and voice notes stay through a reload, from this browser's own store
    await page.reload();
    await until(page, () => [...document.querySelectorAll("#log .pic img")].some((i) => i.src.startsWith("blob:") && i.complete && i.naturalWidth > 0), null, "the photo after a reload");

    // remix with credit, end to end, from the card that came in. His model can't keep to JSON (it writes it by hand), so
    // the two passes run on one that can, and the new character talks through his
    await page.locator("#roster tr", { hasText: "Captain Ro" }).getByRole("button", { name: "Captain Ro's card" }).click();
    await page.selectOption("#model-select", "tiny-model");
    await until(page, () => JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.name === "Captain Ro").model === "tiny-model", null, "his model saved");
    await page.locator("#roster tr", { hasText: "Captain Ro" }).getByRole("button", { name: "Remix Captain Ro" }).click();
    await has(page, "#rx-from", /^Captain Ro$/);
    assert.match(await textOf(page, "#rx-rights"), /reserves the rights/);
    await page.click("#rx-distill");
    await page.locator("#rx-ideas .chip").first().waitFor();
    await page.locator('#rx-ideas [aria-label="Add to Quirks"]').fill("hums sea shanties");
    await page.keyboard.press("Enter");
    await page.locator("#rx-ideas .chip", { hasText: "hums sea shanties" }).waitFor();
    await page.fill("#rx-twist", "make her a ferry pilot");
    await page.click("#rx-write");
    await has(page, "#rx-draft h4", /^Ines Corbel$/);
    assert.match(await page.locator("#rx-draft .verdict").getAttribute("class"), /fresh/);
    await shot(page, "desktop-remix.png");
    await page.locator("#rx-draft button", { hasText: "KEEP IN HARBOR" }).click();
    await has(page, "#who-name", /^Ines Corbel$/);
    await count(page, "#roster tr", 4);
    await has(page, "#log .line.them .said", /Where are you headed\?/);
    assert.equal(await page.locator("#studio.pane-chat").count(), 1, "a kept remix opens their chat, to say hello");
    assert.ok(await page.locator("#chat-back").isHidden(), "a wide screen shows the list and the chat side by side, so no way back is needed");
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.name === "Ines Corbel"));
    assert.equal(kept.lineage[0].relation, "inspired-by");
    const passes = seen.chats.filter((b) => /^You (read a character|are a character writer)/.test(b.messages[0].content));
    assert.ok(passes.length >= 2 && passes.every((b) => b.model === "zai-org-glm-5-2" && b.response_format), "the remix ran on a model that keeps to JSON");
    assert.equal(kept.model, "tiny-model", "she talks through his model");
    assert.equal(kept.lineage[0].name, "Captain Ro");
    assert.match(kept.lineage[0].ref, /^sha256:/);

    // pictures for her card, made with AI: a portrait drawn from how she looks, then one more picture made from it
    const inesNow = () => page.evaluate(() => JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.id === "ines-corbel"));
    await has(page, "#portrait-make", /^make one with ai · \$0\.03$/);
    const drawn = seen.generated.length;
    await page.click("#portrait-make");
    await until(page, () => /^data:image\/webp/.test((JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.name === "Ines Corbel") || {}).portrait || ""), null, "her portrait");
    assert.equal(seen.generated.length, drawn + 1, "one picture, drawn");
    assert.match(seen.generated.at(-1).prompt, /^Portrait photo of Ines Corbel, an original adult character: Thirties, wiry.*Safe for work/);
    assert.equal(seen.generated.at(-1).safe_mode, true);
    assert.match((await inesNow()).look.description, /^Thirties, wiry/, "how she looks, written on her card for next time");
    await until(page, () => { const i = document.querySelector("#sheet-face img"); return !!i && i.src.startsWith("data:image/webp"); }, null, "her portrait on the card");
    await page.evaluate(() => { document.querySelector("#look-group").open = true; });
    // how she looks, changed on her card: the next picture keeps her face, and follows the new words for the rest
    await page.fill('#sheet [name="look_description"]', "Thirties, red hair in a braid, a green raincoat.");
    await until(page, () => JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.id === "ines-corbel").look.description === "Thirties, red hair in a braid, a green raincoat.",
      null, "her new look saved");
    const edited = seen.edits.length;
    await has(page, "#ref-make", /^make one with ai · \$0\.03$/);
    await page.click("#ref-make");
    await count(page, "#refs .ref", 2);
    assert.equal(seen.edits.length, edited + 1, "made from the pictures she has");
    assert.equal(seen.edits.at(-1).body.image, (await inesNow()).portrait.split(",")[1], "her portrait, so it's still her");
    assert.match(seen.edits.at(-1).body.prompt, /^The reference picture shows Ines Corbel\..*Keep their face, so it's clearly them\. How they look: Thirties, red hair in a braid, a green raincoat\. Where the picture differs from these words, follow the words.*New photo: Full length, standing/);
    assert.equal(seen.edits.at(-1).body.safe_mode, true);
    await until(page, () => JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.name === "Ines Corbel").look.references.length === 1, null, "the picture kept on her card");
    await shot(page, "desktop-card-pictures.png");

    // her name stays hers: the rule in her prompt, and a reminder on the latest thing said
    await answered(page, async () => { await page.fill("#say", "Tell me about the ferry, part 1"); await page.keyboard.press("Enter"); });
    const first = talks().at(-1);
    assert.match(first.messages[0].content, /Your name is Ines Corbel\. Never introduce yourself by another name\./);
    assert.match(first.messages[0].content, /How you sound, in a few examples[^\n]*\n- When they say "Is it far\?", you text: "Twelve minutes\." "Nine if the gulls cooperate\."/);
    assert.equal(first.messages.at(-1).content, "Tell me about the ferry, part 1\n\n[You are Ines Corbel. Stay in character.]");
    assert.equal(first.messages.filter((m) => m.content.includes("Stay in character.]")).length, 1, "only on the latest");
    // what she remembers: a dozen messages in, her own model writes it down, and it rides in every chat with her
    assert.equal(seen.memories.length, 0);
    for (let i = 2; i <= 6; i++) await answered(page, async () => { await page.fill("#say", `Tell me about the ferry, part ${i}`); await page.keyboard.press("Enter"); });
    await poll(() => seen.memories.length === 1, "her memory written down");
    const mem = seen.memories[0];
    assert.equal(mem.model, "zai-org-glm-5-2", "written by a model that keeps to JSON (hers, Tiny, can't)");
    assert.match(mem.messages[1].content, /^The character: Ines Corbel/);
    assert.match(mem.messages[1].content, /What they remember so far: nothing yet\./);
    assert.match(mem.messages[1].content, /Them: Tell me about the ferry, part 1\nInes Corbel: Mm\. Good question\. Ask me again after the tide\./);
    assert.equal(mem.messages[1].content.match(/^Them: /gm).length, 6, "the dozen messages since the start");
    assert.ok(!mem.messages[1].content.includes("Stay in character"), "the reminder isn't something said");
    await page.evaluate(() => { document.querySelector("#memory-group").open = true; });
    await has(page, "#memory-list li", /They asked about the ferry, six times over\./);
    await answered(page, async () => { await page.fill("#say", "Who are you, again?"); await page.keyboard.press("Enter"); });
    assert.match(talks().at(-1).messages[0].content, /What you remember from your chats with them so far[^\n]*\n- They asked about the ferry, six times over\.\n- I told them to ask again after the tide\./);
    const memNow = () => page.evaluate(() => (JSON.parse(localStorage.getItem("havre.memory.v1")) || {})["ines-corbel"]);
    assert.ok(Object.values((await memNow()).upTo).length === 1, "where it read up to, in this chat");
    // forget one note; add one of your own; nothing of it goes into her card
    await page.getByRole("button", { name: "Forget: They asked about the ferry, six times over." }).click();
    await page.fill("#memory-add", "They're called Princess.");
    await page.press("#memory-add", "Enter");
    await count(page, "#memory-list li", 2);
    assert.deepEqual((await memNow()).notes, ["They're called Princess.", "I told them to ask again after the tide."]);
    assert.ok(!JSON.stringify(await inesNow()).includes("Princess"), "memory lives beside the card, never in it");
    await shot(page, "desktop-memory.png");
    // leaving a chat with a few new messages, she writes down what she remembers of them, so a new chat picks up there
    await answered(page, async () => { await page.fill("#say", "And the gulls?"); await page.keyboard.press("Enter"); });
    await page.locator("#who-meta").getByRole("button", { name: "new chat" }).click();
    await poll(() => seen.memories.length === 2, "what she remembers of the chat she left");
    const left2 = seen.memories[1].messages[1].content;
    assert.match(left2, /What they remember so far:\n- They're called Princess\.\n- I told them to ask again after the tide\./, "with what you gave her");
    assert.deepEqual(left2.match(/^Them: .*$/gm), ["Them: Who are you, again?", "Them: And the gulls?"], "only what's new since");
    // a new name goes all through her card
    const persona = (await inesNow()).persona;
    assert.match(persona, /^You are Ines Corbel/);
    await page.locator('#sheet [name="name"]').focus();
    await page.fill('#sheet [name="name"]', "Ines Marrec");
    await page.locator('#sheet [name="tagline"]').focus();
    await until(page, () => /^You are Ines Marrec/.test(JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.id === "ines-corbel").persona), null, "her persona renamed");
    assert.equal((await inesNow()).greeting, "Ticket? Kidding.\n\nWhere are you headed?", "what doesn't name her stays as it was");
    // a persona that calls her something else is pointed out, with the fix
    await page.fill('#sheet [name="persona"]', "You are Odile Brun, who pilots the morning ferry.");
    await has(page, "#name-note", /their persona calls them Odile Brun, but their name here is Ines Marrec/);
    await page.getByRole("button", { name: "call them Ines Marrec everywhere" }).click();
    await until(page, () => JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.id === "ines-corbel").persona === "You are Ines Marrec, who pilots the morning ferry.", null, "the persona fixed");
    assert.ok(await page.locator("#name-note").isHidden());
    await page.fill('#sheet [name="name"]', "Ines Corbel");
    await page.fill('#sheet [name="persona"]', persona);
    await until(page, () => JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.id === "ines-corbel").name === "Ines Corbel", null, "her name back");

    // a model that thinks its whole room away is asked once more, with room; a reply caught in a loop says it once
    await answered(page, async () => { await page.fill("#say", "Think hard: how far is it?"); await page.keyboard.press("Enter"); }, /Twelve minutes\./);
    assert.deepEqual(talks().slice(-2).map((b) => b.max_tokens), [700, 2100]);
    await answered(page, async () => { await page.fill("#say", "Loop for me"); await page.keyboard.press("Enter"); }, /I'm not sure\./);
    await until(page, () => document.querySelector("#composer").getAttribute("aria-busy") === "false", null, "the reply played out", 15000);
    assert.equal(await page.locator("#log .line.them .said", { hasText: "I'm not sure." }).count(), 1, "said once, not thirty times");
    // nothing at all, twice: said so; and the next message doesn't go out as two of yours in a row
    await page.fill("#say", "Say nothing");
    await page.keyboard.press("Enter");
    await has(page, "#log .line.err .said", /^Tiny sent back nothing, twice\./);
    await answered(page, async () => { await page.fill("#say", "Are you there?"); await page.keyboard.press("Enter"); });
    const turn = talks().at(-1).messages;
    assert.ok(turn.every((m, i) => i === 0 || m.role !== turn[i - 1].role), "never two from the same side in a row: " + turn.map((m) => m.role).join(","));
    assert.equal(turn.at(-1).content, "Say nothing\n\nAre you there?\n\n[You are Ines Corbel. Stay in character.]");

    // ---------- an adult character: adult photos and clips, the 18+ rule first, and the lines that stay ----------
    // every picture on her card was made here with ai (a portrait drawn from words, a picture made from it), and you
    // said you're 18 or older for Venice's adult characters: marked adult, her photos can be adult
    await page.locator('#sheet [name="adult"]').check();
    await until(page, () => JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.id === "ines-corbel").adult === true, null, "her card marked adult");
    await has(page, "#adult-note", /^their photos and clips can be adult: every picture on their card was made here with ai/);
    await has(page, "#roster th", /^Ines Corbel18\+/);
    await has(page, "#who-meta", /^18\+ \/ /);
    assert.ok(talks().length > 0);
    await page.locator("#chat").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "ask for a photo" }).click();
    await until(page, () => { const t = document.querySelector("#ask-shot"); return !!t && /moving boxes/.test(t.value) && !t.disabled; }, null, "her shot");
    assert.match(talks().at(-1).messages[0].content, /^You write the shot for a photo.*Hard rule, 18\+ only: everyone shown is an adult, 18 or older/, "the shot is written to the 18+ rule");
    await has(page, "#ask", /from 2 pictures of Ines Corbel · model: Qwen Edit Uncensored · \$0\.04/);
    await has(page, "#ask-rules", /^adult \(18\+\): made only from pictures made here with ai, with the 18\+ rule first in its prompt/);
    await has(page, "#ask-go", /^TAKE THE PHOTO · \$0\.04$/);
    await shot(page, "desktop-ask-adult.png");
    const editsBefore = seen.edits.length;
    await page.click("#ask-go");
    await poll(() => seen.edits.length > editsBefore, "her adult photo");
    const adultEdit = seen.edits.at(-1).body;
    assert.equal(adultEdit.modelId || adultEdit.model, "qwen-edit-uncensored");
    assert.equal(adultEdit.safe_mode, false, "safe mode off, for her");
    assert.ok(adultEdit.prompt.startsWith("Everyone shown is a grown adult. The reference picture"), adultEdit.prompt);
    assert.ok(!TRIPS.test(adultEdit.prompt) && !ADULT_TRIPS.test(adultEdit.prompt), "nothing in it for a content filter to turn down: " + adultEdit.prompt);
    await has(page, "#log .line.media .cap", /photo · Qwen Edit Uncensored · \$0\.04 · 18\+ · save/);
    // a clip from her: an uncensored model, priced first, its shot written to the 18+ rule too
    await page.getByRole("button", { name: "ask for a clip" }).click();
    await until(page, () => { const t = document.querySelector("#ask-shot"); return !!t && /waves from the doorway/.test(t.value) && !t.disabled; }, null, "her clip's shot");
    assert.match(talks().at(-1).messages[0].content, /^You write the shot for a video clip.*Hard rule, 18\+ only: everyone shown is an adult, 18 or older/);
    await has(page, "#ask", /model: Wan 3\.0 Reference · venice's price: \$0\.47/);
    assert.equal(seen.quotes.at(-1).model, "wan-3-0-reference-to-video");
    await page.locator("#ask").getByRole("button", { name: "CANCEL" }).click();
    // a picture uploaded to her card could be of anyone: her photos stay safe for work, and a picture made from it
    // with ai doesn't count as made here either
    await page.evaluate(() => { document.querySelector("#look-group").open = true; });
    await page.click("#ref-add");
    await page.setInputFiles("#ref-file", { name: "upload.png", mimeType: "image/png", buffer: picture(200) });
    await count(page, "#refs .ref", 3);
    await has(page, "#adult-note", /^a picture on their card wasn't made here with ai \(it was uploaded, or came from venice\)/);
    await page.click("#ref-make");
    await count(page, "#refs .ref", 4);
    assert.equal(seen.edits.at(-1).body.safe_mode, true, "a picture made from an uploaded one keeps safe mode on");
    assert.equal(seen.edits.at(-1).body.modelId || seen.edits.at(-1).body.model, "grok-imagine-edit");
    await page.getByRole("button", { name: "Remove picture 4" }).click();
    await count(page, "#refs .ref", 3);
    await has(page, "#adult-note", /wasn't made here with ai/);
    await page.getByRole("button", { name: "Remove picture 2" }).click();
    await count(page, "#refs .ref", 2);
    await has(page, "#adult-note", /^their photos and clips can be adult/);
    // the pictures for her card skip safe mode too, with the 18+ rule first: a portrait drawn from words, on an
    // uncensored model (safe mode would blur this one), then one made from the pictures she has
    await has(page, "#portrait-make", /^make one with ai · \$0\.04$/);
    const portraitWas = (await inesNow()).portrait, drawnBefore = seen.generated.length;
    blurNext = true;
    page.once("dialog", (d) => d.accept());
    await page.click("#portrait-make");
    await until(page, (p) => JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.id === "ines-corbel").portrait !== p, portraitWas, "her new portrait, kept");
    const adultDrawn = seen.generated.at(-1);
    assert.equal(seen.generated.length, drawnBefore + 1);
    assert.equal(adultDrawn.model, "krea-2-turbo");
    assert.equal(adultDrawn.safe_mode, false, "no safe mode for an adult character's portrait");
    assert.ok(adultDrawn.prompt.startsWith("Everyone shown is a grown adult. Portrait photo of Ines Corbel"), adultDrawn.prompt);
    assert.ok(!TRIPS.test(adultDrawn.prompt) && !ADULT_TRIPS.test(adultDrawn.prompt), adultDrawn.prompt);
    assert.equal(blurNext, true, "so nothing was blurred");
    blurNext = false;
    await has(page, "#adult-note", /^their photos and clips can be adult/);
    await has(page, "#ref-make", /^make one with ai · \$0\.04$/);
    const editedBefore = seen.edits.length;
    await page.click("#ref-make");
    await count(page, "#refs .ref", 3);
    const sheetEdit = seen.edits.at(-1).body;
    assert.equal(seen.edits.length, editedBefore + 1);
    assert.equal(sheetEdit.modelId || sheetEdit.model, "qwen-edit-uncensored");
    assert.equal(sheetEdit.safe_mode, false);
    assert.ok(sheetEdit.prompt.startsWith("Everyone shown is a grown adult. The reference picture"), sheetEdit.prompt);
    assert.ok(!ADULT_TRIPS.test(sheetEdit.prompt), sheetEdit.prompt);
    await has(page, "#adult-note", /^their photos and clips can be adult/);
    // with adult pictures switched off, safe mode is back on, and a blur says why
    await page.getByRole("button", { name: "abilities" }).click();
    await page.getByLabel("characters marked adult send adult photos and clips").uncheck();
    await page.click("#abclose");
    await has(page, "#portrait-make", /^make one with ai · \$0\.03$/);
    blurNext = true;
    page.once("dialog", (d) => d.accept());
    await page.click("#portrait-make");
    await has(page, "#portrait-status", /^Venice's safe mode blurred that picture, so it wasn't kept\. It was on because adult photos and clips are switched off under abilities\.$/);
    assert.equal(seen.generated.at(-1).safe_mode, true);
    assert.equal(blurNext, false, "it was blurred");
    await page.getByRole("button", { name: "abilities" }).click();
    await page.getByLabel("characters marked adult send adult photos and clips").check();
    await page.click("#abclose");
    await has(page, "#adult-note", /^their photos and clips can be adult/);
    // a shot that mentions someone under 18 stays safe for work: the other model, its price, and safe mode on
    await page.locator("#chat").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "ask for a photo" }).click();
    await until(page, () => { const t = document.querySelector("#ask-shot"); return !!t && /moving boxes/.test(t.value) && !t.disabled; }, null, "the next shot");
    await has(page, "#ask-go", /^TAKE THE PHOTO · \$0\.04$/);
    await page.fill("#ask-shot", "The character from the reference picture, with a teenager at the pier.");
    await has(page, "#ask-why", /the shot or the chat says “teenager”, which sounds like someone under 18, so this one stays safe for work/);
    await has(page, "#ask-go", /^TAKE THE PHOTO · \$0\.03$/);
    await has(page, "#ask", /model: Grok Imagine · \$0\.03/);
    assert.equal(await page.inputValue("#ask-shot"), "The character from the reference picture, with a teenager at the pier.", "what you typed stays");
    const editsNow = seen.edits.length;
    await page.click("#ask-go");
    await poll(() => seen.edits.length > editsNow, "the safe-for-work photo");
    const safeEdit = seen.edits.at(-1).body;
    assert.equal(safeEdit.modelId || safeEdit.model, "grok-imagine-edit");
    assert.equal(safeEdit.safe_mode, true);
    assert.match(safeEdit.prompt, /Safe for work: everyone in it is an adult, fully clothed\./);
    await count(page, "#ask", 1);
    await until(page, () => document.querySelector("#ask").hidden, null, "the panel closed");
    // starting her look over, from under look: every picture off her card, the portrait too. The next one is drawn from
    // how she looks alone (hers on an uncensored model, as an adult's), and it's her new portrait
    await page.evaluate(() => { document.querySelector("#look-group").open = true; });
    await count(page, "#refs .ref", 3);
    for (const name of ["Remove picture 3", "Remove picture 2", "Remove portrait"]) await page.getByRole("button", { name, exact: true }).click();
    await count(page, "#refs .ref", 1);
    assert.equal(await page.locator("#refs .ref button").count(), 0, "nothing left to remove");
    await until(page, () => { const c = JSON.parse(localStorage.getItem("havre.cards.v1")).find((x) => x.id === "ines-corbel"); return !c.portrait && !c.look.references.length; },
      null, "every picture gone");
    await has(page, "#adult-note", /has no picture made here yet/);
    await has(page, "#ref-make", /^make one with ai · \$0\.04$/);
    const generatedBefore = seen.generated.length, editsBefore2 = seen.edits.length;
    await page.click("#ref-make");
    await until(page, () => /^data:image\/webp/.test(JSON.parse(localStorage.getItem("havre.cards.v1")).find((x) => x.id === "ines-corbel").portrait), null,
      "her new portrait, drawn from words");
    assert.equal(seen.generated.length, generatedBefore + 1);
    assert.equal(seen.edits.length, editsBefore2, "made from no picture of before");
    assert.equal(seen.generated.at(-1).model, "krea-2-turbo");
    assert.match(seen.generated.at(-1).prompt, /Portrait photo of Ines Corbel, an original adult character: Thirties, red hair in a braid, a green raincoat\./);
    await count(page, "#refs .ref", 1);
    await has(page, "#adult-note", /^their photos and clips can be adult/);

    // exports, made in the browser; the PNG comes back in whole
    await page.getByRole("button", { name: "Export Ines Corbel" }).click();
    let png = "";
    for (const [kind, ext] of [["havre", ".havre.json"], ["v3", ".card.json"], ["prompt", ".txt"], ["png", ".png"]]) {
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click(`[data-out="${kind}"]`)]);
      assert.equal(dl.suggestedFilename(), "ines-corbel" + ext);
      const path = await dl.path(), data = await readFile(path);
      if (kind === "havre") assert.equal(JSON.parse(data).havre, 1);
      if (kind === "v3") assert.equal(JSON.parse(data).spec, "chara_card_v3");
      if (kind === "prompt") assert.match(String(data), /^You are Ines Corbel/);
      if (kind === "png") {
        assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.ok(data.includes("ccv3") && data.includes("chara"), "the card rides inside the picture");
        png = path;
      }
    }
    await page.click("#import");
    await page.setInputFiles("#file", png);
    await count(page, "#roster tr", 5);

    // the security policy: nothing but api.venice.ai (and its private-share links for clips)
    assert.equal(await page.evaluate(() => fetch("https://example.com/").then(() => "reached", () => "blocked")), "blocked");
    const csp = await page.evaluate(() => document.querySelector("meta[http-equiv=Content-Security-Policy]").content);
    assert.ok(csp.includes("connect-src https://api.venice.ai https://private-share.venice.ai;"), csp);
    assert.ok(csp.includes("media-src blob: https://private-share.venice.ai;"), csp);

    // two tabs: what's said in one shows in the other, and a chat deleted in one goes from both
    const p4 = await ctx.newPage();
    watch(p4, "second tab: ");
    await venice(p4);
    await page.click("#lt-chars");
    await page.click("#plain");
    await has(page, "#who-name", /^no character$/);
    await p4.goto(base);
    await p4.click("#lt-chats");
    await p4.locator("#threads .trow", { hasText: "no character" }).click();
    await has(p4, "#log .line.me .said", /^What is a harbor\?$/);
    const tabsBefore = await page.locator("#threads > li").count();
    await answered(page, async () => { await page.fill("#say", "Two tabs at once?"); await page.keyboard.press("Enter"); });
    await has(p4, "#log .line.me .said", /^Two tabs at once\?$/, 5000);
    p4.once("dialog", (d) => d.accept());
    await p4.locator("#who-meta").getByRole("button", { name: "delete" }).click();
    await count(page, "#threads > li", tabsBefore - 1, 5000);
    await has(page, "#log .line.note .said", /a plain chat: no character/);
    assert.equal(await page.locator("#log .said", { hasText: "Two tabs at once?" }).count(), 0, "the deleted chat left this tab too");
    await p4.close();

    // a character Venice marks adult is adult here too
    await page.click("#lt-chars");
    await page.check("#vadult");                         // said 18 or older already: not asked again
    await page.locator("#vgrid .tile", { hasText: "After Dark" }).click();
    await has(page, "#who-name", /^After Dark$/);
    await until(page, () => (JSON.parse(localStorage.getItem("havre.cards.v1")).find((c) => c.name === "After Dark") || {}).adult === true, null, "After Dark marked adult");
    await has(page, "#who-meta", /^18\+ \/ via venice/);
    await page.uncheck("#vadult");

    // the page below the studio
    assert.match(await textOf(page, "#agent-prompt"), /skill\.md/);
    await shot(page, "desktop-full.png", { fullPage: true });

    // a share card for links
    if (SHOTS) {
      const og = await ctx.newPage();
      watch(og, "og: ");
      await og.setViewportSize({ width: 1200, height: 630 });
      await og.goto(base + "tools/og.html");
      await shot(og, "og.png");
      await og.close();
    }
    await ctx.close();

    // ---------- the first version's cast leaves, unless someone changed them ----------
    const old = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p2 = await old.newPage();
    watch(p2, "earlier visitor: ");
    await venice(p2);
    await p2.goto(base);
    await p2.evaluate(() => {
      const seed = (id, name, updated) => ({ havre: 1, id, name, persona: "You are " + name + ".", portrait: `art/${id}.svg`,
        created: "2026-10-16T00:00:00.000Z", updated });
      localStorage.setItem("havre.cards.v1", JSON.stringify([seed("maren", "Maren", "2026-10-16T00:00:00.000Z"),
        seed("taskmaster", "Taskmaster", "2026-10-17T09:00:00.000Z"), seed("odile", "Odile", "2026-10-16T00:00:00.000Z")]));
      localStorage.setItem("havre.seeded.v1", "true");
      localStorage.setItem("havre.selected", JSON.stringify("maren"));
      // conversations kept the first way, one per character
      localStorage.setItem("havre.chats.v1", JSON.stringify({ maren: [{ role: "user", content: "hi" }],
        taskmaster: [{ role: "user", content: "Plan my week" }, { role: "assistant", content: "Monday first." }] }));
    });
    await p2.reload();
    await count(p2, "#roster tr", 1);
    const left = await p2.evaluate(() => {
      const threads = JSON.parse(localStorage.getItem("havre.threads.v1") || "{}"), t = Object.values(threads)[0];
      return { cards: JSON.parse(localStorage.getItem("havre.cards.v1")), seeded: localStorage.getItem("havre.seeded.v1"),
        v1: localStorage.getItem("havre.chats.v1"), threads: Object.values(threads).map((x) => x.card),
        kept: t ? JSON.parse(localStorage.getItem("havre.msgs." + t.id)) : null };
    });
    assert.deepEqual(left.cards.map((c) => c.id), ["taskmaster"]);
    assert.equal(left.cards[0].portrait, "", "the old drawings are gone, so is the link to them");
    assert.equal(left.seeded, null);
    assert.equal(left.v1, null, "the first store is read once and goes");
    assert.deepEqual(left.threads, ["taskmaster"], "Taskmaster's conversation became a chat; Maren's left with her");
    assert.equal(left.kept.card, "taskmaster", "a chat's messages know whose they are");
    assert.deepEqual(left.kept.msgs.map((m) => m.content), ["Plan my week", "Monday first."]);
    assert.ok(left.kept.msgs.every((m) => m.id), "every message has an id now");
    await has(p2, "#who-name", /^Taskmaster$/);
    await has(p2, "#log .line.them .said", /^Monday first\.$/);
    assert.ok(await p2.locator("#lp-chats").isVisible(), "someone with chats sees them first");
    await count(p2, "#threads > li", 1);
    await old.close();

    // ---------- the harbor's own: meet Maren without a key, and she's yours ----------
    const own = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p5 = await own.newPage();
    watch(p5, "the harbor's own: ");
    await venice(p5);
    await p5.goto(base);
    await count(p5, "#cast li", 3);
    assert.deepEqual(await p5.evaluate(() => [...document.querySelectorAll("#cast .nm")].map((e) => e.textContent)), ["Maren", "Odile", "Taskmaster"]);
    assert.equal(await p5.evaluate(() => localStorage.length), 0, "looking at them keeps nothing");
    await p5.click("#cast .tile[data-cast=maren]");
    await has(p5, "#who-name", /^Maren$/);
    await has(p5, "#log .line.them .said", /I'm Maren, I run the harbor\./);
    await has(p5, "#cast .tile[data-cast=maren] .go", /^talking now$/);
    await has(p5, "#roster td", /Ported from Maren by Havre/);
    assert.ok(await p5.locator("#keynote").isVisible(), "demo mode says so");
    await p5.fill("#say", "What is this place?");
    await p5.keyboard.press("Enter");
    await has(p5, "#log .line.them .said", /^A harbor\. Characters cross over from Venice and settle here\.$/);
    const mine = await p5.evaluate(() => JSON.parse(localStorage.getItem("havre.cards.v1")));
    assert.equal(mine.length, 1);
    assert.deepEqual([mine[0].id, mine[0].lineage.at(-1).ref, mine[0].lineage.at(-1).relation], ["maren", "havre:maren", "ported-from"], "a copy with the credit");
    assert.notEqual(mine[0].created, "2026-10-16T00:00:00.000Z", "the copy is dated when it was met, not when the card was written");
    await p5.click("#cast .tile[data-cast=odile]");
    await has(p5, "#who-name", /^Odile$/);
    await has(p5, "#cast .tile[data-cast=maren] .go", /^talk again$/);
    await p5.click("#cast .tile[data-cast=maren]");
    await has(p5, "#who-name", /^Maren$/);
    await count(p5, "#roster tr", 2);
    assert.ok(await p5.locator("#log .line.me .said", { hasText: "What is this place?" }).isVisible(), "the same chat, not a new copy of her");
    await own.close();

    // ---------- phone: an iPhone SE's screen, 375 by 667 ----------
    const W = 375;
    const phone = await browser.newContext({ viewport: { width: W, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p3 = await phone.newPage();
    watch(p3, "phone: ");
    await venice(p3);
    await p3.goto(base);
    await count(p3, "#vgrid li.ghost", 8);
    assert.ok(await p3.locator("#chat").isHidden(), "a phone shows the list first, and a chat once someone's picked");
    const wide = () => p3.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(await wide() <= W, `no sideways scroll on a phone (scrollWidth ${await wide()})`);
    // a field under 16px makes iOS Safari zoom in when it's tapped, and the page stays cut off
    const small = () => p3.evaluate(() => [...document.querySelectorAll("input:not([type=checkbox]):not([type=file]), select, textarea")]
      .filter((el) => el.offsetParent).map((el) => [el.id || el.name || el.className, parseFloat(getComputedStyle(el).fontSize)]).filter(([, s]) => s < 16));
    assert.deepEqual(await small(), [], "no field small enough for the phone to zoom in on");
    assert.match(await p3.locator(".motto").evaluate((el) => el.innerText), /characters\. talk to venice characters on your own key\. no account/, "the motto keeps its spaces on one line");
    await shot(p3, "phone.png");
    await p3.fill("#keyin", "sk-good");
    await p3.click("#keysave");
    await count(p3, "#vgrid li:not(.ghost)", 2);
    await p3.locator("#vgrid .tile", { hasText: "Wren" }).click();
    await has(p3, "#log .line.them .said", /Careful, the boxes bite\./);
    assert.ok(await p3.locator("#say").isVisible(), "the chat is on screen");
    assert.ok(await p3.locator("#chars").isHidden(), "and not stranded below the list: one at a time");
    assert.ok(await wide() <= W, `still no sideways scroll (scrollWidth ${await wide()})`);
    assert.deepEqual(await small(), [], "nor here");
    await p3.waitForTimeout(500);
    await shot(p3, "phone-chat.png");
    await shot(p3, "phone-full.png", { fullPage: true });
    // from a chat, back to the list it came from; a chat from your chats opens in its place, and goes back to them
    await has(p3, "#chat-back", /^← characters$/);
    await p3.click("#chat-back");
    assert.ok(await p3.locator("#chat").isHidden());
    assert.ok(await p3.locator("#lp-chars").isVisible());
    await p3.click("#lt-chats");
    await count(p3, "#threads > li", 1);
    await p3.waitForTimeout(400);
    await shot(p3, "phone-chats.png");
    await p3.locator("#threads .trow").first().click();
    assert.ok(await p3.locator("#chars").isHidden() && await p3.locator("#say").isVisible());
    await has(p3, "#chat-back", /^← your chats$/);
    await p3.click("#chat-back");
    assert.ok(await p3.locator("#lp-chats").isVisible());
    await phone.close();
  } finally {
    await browser.close();
    srv.close();
  }
  if (errors.length || missing.length) {
    console.error("console errors:", ...errors.map((e) => "\n  " + e), "\nmissing files:", ...missing.map((u) => "\n  " + u));
    process.exit(1);
  }
  console.log("smoke ok" + (SHOTS ? ", screenshots in " + SHOTS : ""));
}

main().catch((e) => { console.error(e); process.exit(1); });
