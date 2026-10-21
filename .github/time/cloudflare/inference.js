// Front-end inference for the yolopreneur ventures, without a key in any page.
// One Worker (script time-inference) at inference.<TIME_VENTURE_DOMAIN> holds the Venice key as a secret and lets
// venture pages call an allowlisted slice of the Venice API under per-person, per-app and per-day limits.
// Deployed by .github/time/inference.py; the pages talk to it with the same bodies they would send Venice.
//
//   GET  /health                               -> { ok, rev, apps }
//   POST /v1/chat/completions                  model in CHAT_MODELS, no streaming, max_tokens <= MAX_TOKENS
//   POST /v1/audio/quote | queue | retrieve | complete    model in AUDIO_MODELS, duration_seconds <= AUDIO_SECONDS
//   POST /v1/image/generate                    model in IMAGE_MODELS
//   POST /v1/speech                            Venice TTS: { input, model?, voice?, speed?, response_format?, prompt?, temperature? }, model in TTS_MODELS
//   POST /v1/render                            one call, audio back: { prompt, lyrics?, duration?, bpm?, key?, timeSignature?, seed?, quality?, reference? }
//                                              reference: a data: URL of audio the new track should take after (Runware only; up to 8 MB)
//                                              Runware ACE-Step when RUNWARE_API_KEY is bound (quality "xl" picks XL Turbo),
//                                              else Venice queue+poll inside the worker; x-seed / x-cost / x-renderer headers
//
// Every call names its app with an `x-app` header (one of APPS) and comes from an allowed origin (ORIGINS, a comma
// list; `*.yolopreneur.lol` style wildcards allowed). Quotas are counted per (day, app, kind, person) and per
// (day, app, kind): CHAT_DAILY/RENDER_DAILY per person, CHAT_TOTAL/RENDER_TOTAL per app. A render is an audio queue
// or an image generate; retrieve polls, quotes and completes are free. Over a limit answers 429 with a plain reason.
//
// Bindings: QUOTA (KV). Secrets: VENICE_API_KEY, RUNWARE_API_KEY (optional). Vars: REV, APPS, ORIGINS, CHAT_MODELS, AUDIO_MODELS, IMAGE_MODELS,
// AUDIO_SECONDS, MAX_TOKENS, CHAT_DAILY, CHAT_TOTAL, RENDER_DAILY, RENDER_TOTAL.

const VENICE = "https://api.venice.ai/api/v1";
const MAX_BODY = 32768;
const MAX_RENDER_BODY = 8 * 1024 * 1024;        // a reference track rides along as base64

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
const list = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const num = (s, d) => { const n = Number(s); return Number.isFinite(n) && n > 0 ? n : d; };

function originOk(origin, env) {
  if (!origin) return false;
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
  return list(env.ORIGINS).some((p) => p.startsWith("*.") ? host === p.slice(2) || host.endsWith(p.slice(1)) : host === p);
}
function cors(req, env) {
  const origin = req.headers.get("origin");
  if (!originOk(origin, env)) return null;
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, OPTIONS",
           "access-control-allow-headers": "content-type, x-app", "access-control-max-age": "600", "vary": "origin" };
}

async function who(req, app) {
  const ip = req.headers.get("cf-connecting-ip") || "?";
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${app}:${ip}`));
  return [...new Uint8Array(raw).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// One counter per (day, app, person) in KV holding both kinds, so a call costs one read and one write: free-tier KV
// allows 1,000 writes a day and two per call ran out. The app-wide total is the sum the counter can't see, so it is
// approximated as perPerson x people seen today only when KV is on a paid plan; here it is not enforced. KV is
// eventually consistent, so two calls in the same instant can both count; that only ever over-counts, never under.
// A KV failure (limit exceeded, outage) never blocks a call: the counter is bookkeeping, the music is the point.
async function spend(env, app, kind, person, perPerson, total) {
  try {
    const k = `${new Date().toISOString().slice(0, 10)}:${app}:${person}`;
    const c = JSON.parse((await env.QUOTA.get(k)) || "{}");
    c[kind] = (c[kind] || 0) + 1;
    await env.QUOTA.put(k, JSON.stringify(c), { expirationTtl: 2 * 86400 });
    if (c[kind] > perPerson) return "you're over today's limit for this app; come back tomorrow";
  } catch (e) { console.log("quota skipped: " + String(e).slice(0, 120)); }
  return "";
}

// What goes to Venice: the page's body, checked and trimmed, never the page's headers.
async function forward(path, body, env) {
  const res = await fetch(VENICE + path, { method: "POST", headers: { Authorization: "Bearer " + env.VENICE_API_KEY, "Content-Type": "application/json", Accept: "*/*" },
                                           body: JSON.stringify(body) });
  const headers = new Headers();
  for (const k of ["content-type", "content-length", "x-venice-is-blurred"]) if (res.headers.get(k)) headers.set(k, res.headers.get(k));
  return new Response(res.body, { status: res.status, headers });
}
const withCors = (res, h) => { for (const [k, v] of Object.entries(h)) res.headers.set(k, v); return res; };

/* ---------- /v1/render: one call, audio back ---------- */
const RUNWARE = "https://api.runware.ai/v1";
const RW_MODELS = { turbo: "runware:ace-step@v1.5-turbo", xl: "runware:ace-step@v1.5-xl-turbo", base: "runware:ace-step@v1.5" };
const KEY_RE = /^([A-G])(#|b)?\s*(major|minor)$/i;
function cleanKey(k) {
  const m = KEY_RE.exec(String(k || "").trim()); if (!m) return "";
  return m[1].toUpperCase() + (m[2] || "") + " " + m[3].toLowerCase();
}
async function renderRunware(body, env) {
  const model = RW_MODELS[String(body.quality || "turbo").toLowerCase()] || RW_MODELS.turbo;
  const task = { taskType: "audioInference", taskUUID: crypto.randomUUID(), model, positivePrompt: String(body.prompt).slice(0, 3000),
    duration: Math.max(30, Math.min(num(body.duration, 120), num(env.AUDIO_SECONDS, 120))), outputType: "URL", outputFormat: "MP3", deliveryMethod: "sync", includeCost: true,
    audioSettings: { bitrate: 192, channels: 2, sampleRate: 44100 }, settings: {} };
  if (Number.isInteger(+body.seed) && +body.seed >= 0) task.seed = Math.min(2147483647, +body.seed);
  if (typeof body.reference === "string" && /^data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(body.reference)) { task.inputs = { audio: body.reference }; delete task.duration; }   // the reference sets the length
  const beats = String(body.timeSignature || "").match(/^(\d)\/(4|8)$/);        // "3/4" → 3; Runware takes 2, 3, 4 or 6 beats to the bar
  if (beats && [2, 3, 4, 6].includes(+beats[1])) task.settings.timeSignature = +beats[1];
  if (body.steps) task.steps = Math.min(20, Math.max(1, +body.steps | 0));
  const ly = String(body.lyrics || "").trim(); if (ly.length >= 10) task.settings.lyrics = ly.slice(0, 3000);
  const bpm = +body.bpm; if (bpm >= 30 && bpm <= 300) task.settings.bpm = Math.round(bpm);
  const ks = cleanKey(body.key); if (ks) task.settings.keyScale = ks;
  task.settings.vocalLanguage = ly.length >= 10 ? "en" : "unknown";
  const res = await fetch(RUNWARE, { method: "POST", headers: { Authorization: "Bearer " + env.RUNWARE_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify([task]) });
  const d = await res.json().catch(() => null);
  const out = d && Array.isArray(d.data) ? d.data.find((x) => x.taskType === "audioInference") : null;
  if (!res.ok || !out || !out.audioURL) {
    const why = (d && d.errors && d.errors[0] && (d.errors[0].message || d.errors[0].code)) || (d && d.error) || ("runware " + res.status);
    throw Object.assign(new Error(String(why).slice(0, 200)), { status: res.status === 429 ? 429 : 502 });
  }
  const audio = await fetch(out.audioURL);
  if (!audio.ok) throw Object.assign(new Error("runware audio fetch " + audio.status), { status: 502 });
  return { body: audio.body, type: audio.headers.get("content-type") || "audio/mpeg", seed: out.seed, cost: out.cost, renderer: model };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function renderVenice(body, env) {
  const q = { model: "ace-step-15", prompt: String(body.prompt).slice(0, 512), duration_seconds: Math.max(60, Math.min(num(body.duration, 120), num(env.AUDIO_SECONDS, 120), 210)) };
  const ly = String(body.lyrics || "").trim(); if (ly) q.lyrics_prompt = ly.slice(0, 4000);
  const H = { Authorization: "Bearer " + env.VENICE_API_KEY, "Content-Type": "application/json", Accept: "*/*" };
  const qr = await fetch(VENICE + "/audio/queue", { method: "POST", headers: H, body: JSON.stringify(q) });
  const qd = await qr.json().catch(() => null);
  if (!qr.ok || !qd || !qd.queue_id) throw Object.assign(new Error((qd && (qd.error || qd.message)) || "venice queue " + qr.status), { status: qr.status === 422 ? 422 : 502 });
  const t0 = Date.now();
  while (Date.now() - t0 < 110000) {
    await sleep(3000);
    const r = await fetch(VENICE + "/audio/retrieve", { method: "POST", headers: H, body: JSON.stringify({ model: "ace-step-15", queue_id: qd.queue_id, delete_media_on_completion: true }) });
    const type = r.headers.get("content-type") || "";
    if (r.ok && /^audio\//i.test(type)) return { body: r.body, type, seed: null, cost: 0.03 * (q.duration_seconds / 60), renderer: "venice:ace-step-15" };
    const d = await r.json().catch(() => ({}));
    if (/FAIL|ERROR|CANCEL|REJECT/i.test(String(d.status || ""))) throw Object.assign(new Error("venice: " + String(d.status).toLowerCase()), { status: 502 });
  }
  throw Object.assign(new Error("venice: render timed out"), { status: 504 });
}
async function render(body, env, h) {
  if (!body.prompt || String(body.prompt).length < 2) return json({ error: "prompt is empty" }, 400, h);
  let out, err;
  if (env.RUNWARE_API_KEY) { try { out = await renderRunware(body, env); } catch (e) { err = e; } }
  if (!out) { try { out = await renderVenice(body, env); } catch (e) { return json({ error: (err ? err.message + "; then " : "") + e.message }, e.status || 502, h); } }
  const headers = { "content-type": out.type, "x-renderer": out.renderer, "access-control-expose-headers": "x-seed, x-cost, x-renderer, x-fallback", ...h };
  if (err) headers["x-fallback"] = String(err.message).replace(/[^\x20-\x7e]/g, "?").slice(0, 160);
  if (out.seed != null) headers["x-seed"] = String(out.seed);
  if (out.cost != null) headers["x-cost"] = String(out.cost);
  return new Response(out.body, { status: 200, headers });
}

async function api(req, env, url, h) {
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/health") return json({ ok: true, rev: env.REV, apps: list(env.APPS), renderer: env.RUNWARE_API_KEY ? "runware" : "venice" }, 200, h);
  if (req.method !== "POST") return json({ error: "POST only" }, 405, h);
  if (!env.VENICE_API_KEY) return json({ error: "no key on this worker yet" }, 503, h);
  const app = String(req.headers.get("x-app") || "").toLowerCase();
  if (!list(env.APPS).includes(app)) return json({ error: "unknown app: send an x-app header this worker knows" }, 403, h);
  const text = await req.text();
  if (text.length > (path === "/v1/render" ? MAX_RENDER_BODY : MAX_BODY)) return json({ error: "too big" }, 413, h);
  let body;
  try { body = JSON.parse(text); if (!body || typeof body !== "object" || Array.isArray(body)) throw 0; } catch { return json({ error: "send a JSON object" }, 400, h); }
  const person = await who(req, app);
  const model = String(body.model || "");

  if (path === "/v1/chat/completions") {
    if (!list(env.CHAT_MODELS).includes(model)) return json({ error: `model not allowed here: ${model.slice(0, 40)}` }, 403, h);
    if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: "messages is empty" }, 400, h);
    body.stream = false;
    body.max_tokens = Math.min(num(body.max_tokens, 1024), num(env.MAX_TOKENS, 2000));
    const no = await spend(env, app, "chat", person, num(env.CHAT_DAILY, 60), num(env.CHAT_TOTAL, 2000));
    if (no) return json({ error: no }, 429, h);
    return withCors(await forward("/chat/completions", body, env), h);
  }
  if (path === "/v1/render") {
    const no = await spend(env, app, "render", person, num(env.RENDER_DAILY, 20), num(env.RENDER_TOTAL, 400));
    if (no) return json({ error: no }, 429, h);
    return render(body, env, h);
  }
  const audio = path.match(/^\/v1\/audio\/(quote|queue|retrieve|complete)$/);
  if (audio) {
    if (!list(env.AUDIO_MODELS).includes(model)) return json({ error: `model not allowed here: ${model.slice(0, 40)}` }, 403, h);
    if (audio[1] === "queue") {
      body.duration_seconds = Math.min(num(body.duration_seconds, 60), num(env.AUDIO_SECONDS, 60));
      const no = await spend(env, app, "render", person, num(env.RENDER_DAILY, 20), num(env.RENDER_TOTAL, 400));
      if (no) return json({ error: no }, 429, h);
    }
    if (audio[1] === "retrieve") body.delete_media_on_completion = true;    // nothing of theirs stays at Venice
    return withCors(await forward("/audio/" + audio[1], body, env), h);
  }
  if (path === "/v1/speech") {
    const m = model || "tts-kokoro";
    if (!list(env.TTS_MODELS || "tts-kokoro,tts-orpheus,tts-qwen3-1-7b,tts-elevenlabs-turbo-v2-5,tts-chatterbox-hd").includes(m)) return json({ error: `model not allowed here: ${m.slice(0, 40)}` }, 403, h);
    if (!body.input || String(body.input).length < 2) return json({ error: "input is empty" }, 400, h);
    const q = { model: m, input: String(body.input).slice(0, 4096), voice: String(body.voice || "af_sky").slice(0, 64), response_format: /^(mp3|wav|flac|opus|aac)$/.test(body.response_format) ? body.response_format : "mp3",
      speed: Math.max(0.5, Math.min(1.5, +body.speed || 1)) };
    if (typeof body.prompt === "string" && body.prompt.trim()) q.prompt = body.prompt.trim().slice(0, 500);       // style: Qwen3 only, ignored elsewhere
    if (Number.isFinite(+body.temperature) && body.temperature !== undefined) q.temperature = Math.max(0, Math.min(2, +body.temperature));
    const no = await spend(env, app, "render", person, num(env.RENDER_DAILY, 20), num(env.RENDER_TOTAL, 400));
    if (no) return json({ error: no }, 429, h);
    return withCors(await forward("/audio/speech", q, env), h);
  }
  if (path === "/v1/image/generate") {
    if (!list(env.IMAGE_MODELS).includes(model)) return json({ error: `model not allowed here: ${model.slice(0, 40)}` }, 403, h);
    body.safe_mode = true;
    const no = await spend(env, app, "render", person, num(env.RENDER_DAILY, 20), num(env.RENDER_TOTAL, 400));
    if (no) return json({ error: no }, 429, h);
    return withCors(await forward("/image/generate", body, env), h);
  }
  return json({ error: "no such endpoint" }, 404, h);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const h = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: h ? 204 : 403, headers: h || {} });
    if (!h && url.pathname !== "/health") return json({ error: "this worker only serves its own ventures' pages" }, 403);
    try { return await api(req, env, url, h || {}); }
    catch (e) { return json({ error: "backend error", detail: String(e).slice(0, 200) }, 500, h || {}); }
  },
};
