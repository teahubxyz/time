// venice.js: the Venice API calls Havre makes, straight from the browser with the visitor's own key.
// The page's security policy only lets it connect to api.venice.ai (and, without the key, to the private-share links
// Venice hands out for clips from its private video models), so the key can't be sent anywhere else.
// Docs: https://docs.venice.ai/  (OpenAI-compatible; character_slug and friends live in venice_parameters)

export const BASE = "https://api.venice.ai/api/v1";

export class VeniceError extends Error {
  /**
   * refused: Venice turned it down as against its content rules (its own, or the ones of the model's maker). One that
   * comes from Venice's answer also carries the answer (said, code, body), and one from a picture or clip call carries
   * what was sent (sent: endpoint, model, pictures, safe_mode, prompt), for the page's "what venice saw".
   */
  constructor(message, status, refused = false) { super(message); this.status = status; this.refused = !!refused; }
}

/**
 * What went wrong, from Venice's answer, as an error to throw. A 422 is a no on content when Venice says so (its
 * CONTENT_POLICY_VIOLATION) or says nothing; its other 422s (a clip too long, a picture too big) are what they say.
 */
function failure(status, body) {
  const e = body && body.error;
  const said = String((e && typeof e === "object" ? e.message : e) || (body && body.message) || "").slice(0, 240);
  const code = String((e && typeof e === "object" && e.code) || (body && body.code) || "");
  const refused = status === 422 && (/CONTENT_POLICY/i.test(code) || /content polic|violat|moderat|blocked|safety/i.test(said) || !said);
  const err = new VeniceError(explain(status, said, refused), status, refused);
  // Venice's answer as it came, for the "what venice saw" block: its words, its code, and the body when it says nothing
  err.said = said;
  err.code = code;
  err.body = body == null ? "" : (() => { try { return JSON.stringify(body).slice(0, 600); } catch { return ""; } })();
  return err;
}
/** what a picture or a clip call sent, kept on the error it failed with (sent), so the page can show it */
function sent(e, what) {
  if (e && e.name !== "AbortError") e.sent = what;
  return e;
}
function explain(status, said, refused) {
  // Venice's own words for it ("violates the content policy of Venice.ai or the model provider") say no more than this
  if (refused) return "Venice turned that down as against its content rules" + (/content polic/i.test(said) || !said ? "." : ` (“${said.replace(/[.\s]+$/, "")}”).`);
  if (status === 401 || status === 403) return "Venice didn't accept that key. Check it at venice.ai → Settings → API.";
  if (status === 402) return "Venice says the key is out of credit.";
  if (status === 429) return "Venice is rate-limiting this key. Wait a moment and try again.";
  if (status === 404) return "Venice doesn't know that " + (said.includes("model") ? "model." : "character or model.");
  if (status === 413) return "That file is too big for Venice.";
  if (status === 503) return "That model is busy at Venice right now. Try again in a moment, or pick another.";
  if (status >= 500) return "Venice had a problem (" + status + "). Try again in a moment.";
  return said || "Venice answered " + status + ".";
}

/** a data: URI's base64, or a URL as it is: what Venice's image endpoints take */
const imageInput = (s) => (/^data:image\/[a-z0-9.+-]+;base64,/i.test(s) ? s.slice(s.indexOf(",") + 1) : s);
const usdOf = (x) => (x && typeof x.usd === "number" ? x.usd : null);

export class Venice {
  /** key: a Venice API key, or "" for the calls that need none (the model list) */
  constructor(key = "", { fetch: f = globalThis.fetch.bind(globalThis), base = BASE } = {}) {
    this.key = key;
    this.fetch = f;
    this.base = base;
  }

  async call(path, { method = "GET", body, signal, auth = true } = {}) {
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (auth) {
      if (!this.key) throw new VeniceError("Add your Venice API key first.", 0);
      headers.Authorization = "Bearer " + this.key;
    }
    let res;
    try {
      res = await this.fetch(this.base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      throw new VeniceError("Couldn't reach Venice. Check your connection.", 0);
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw failure(res.status, data);
    return data;
  }

  /** a call whose answer may be a file (a picture, a voice note, a video): the response itself, once it's ok */
  async raw(path, { method = "POST", body, form, signal } = {}) {
    if (!this.key) throw new VeniceError("Add your Venice API key first.", 0);
    const headers = { Authorization: "Bearer " + this.key };
    if (body) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await this.fetch(this.base + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined), signal });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      throw new VeniceError("Couldn't reach Venice. Check your connection.", 0);
    }
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      throw failure(res.status, data);
    }
    return res;
  }

  /**
   * Venice's other models, by type: inpaint (photo edits), image, tts (voices), asr (hearing) or video. No key needed.
   * Each comes with what the page shows and needs: its price, its voices, its lengths and sizes.
   */
  async mediaModels(type) {
    const d = await this.call("/models?type=" + encodeURIComponent(type), { auth: false });
    return (d && d.data || []).filter((m) => m && !(m.model_spec && (m.model_spec.offline || m.model_spec.beta))).map((m) => mediaInfo(type, m));
  }

  /**
   * A photo: an edit of one or more pictures (URLs or data: URIs; the first is the base). Venice's safe mode is on
   * unless safe is false, which Havre passes only for an adult character whose pictures it made itself (abilities.js
   * adultCheck). Returns { blob, blurred }.
   */
  async editImage({ model, prompt, images, safe = true, signal } = {}) {
    const pics = (images || []).filter(Boolean);
    if (!pics.length) throw new VeniceError("A photo needs at least one picture of the character.", 0);
    const safe_mode = safe !== false, endpoint = pics.length === 1 ? "image/edit" : "image/multi-edit";
    let res;
    try {
      res = pics.length === 1
        ? await this.raw("/image/edit", { body: { model, prompt, image: imageInput(pics[0]), safe_mode, output_format: "webp" }, signal })
        : await this.raw("/image/multi-edit", { body: { modelId: model, prompt, images: pics.map(imageInput), safe_mode, output_format: "webp" }, signal });
    } catch (e) { throw sent(e, { endpoint, model, pictures: pics.length, safe_mode, prompt }); }
    return { blob: await res.blob(), blurred: res.headers && res.headers.get ? res.headers.get("x-venice-is-blurred") === "true" : false };
  }

  /**
   * A picture from words alone (a portrait for a character's card). Venice's safe mode is on unless safe is false,
   * which Havre passes only for an adult character (abilities.js adultCheck, drawn). Returns { blob, blurred }.
   */
  async generateImage({ model, prompt, aspect = "", safe = true, signal } = {}) {
    const body = { model, prompt, safe_mode: safe !== false, format: "webp", return_binary: true };
    if (aspect) body.aspect_ratio = aspect;
    let res;
    try { res = await this.raw("/image/generate", { body, signal }); }
    catch (e) { throw sent(e, { endpoint: "image/generate", model, pictures: 0, safe_mode: body.safe_mode, prompt }); }
    return { blob: await res.blob(), blurred: res.headers && res.headers.get ? res.headers.get("x-venice-is-blurred") === "true" : false };
  }

  /** a voice note: words read out by a voice model. mood goes to models that take a style prompt; the rest ignore it. */
  async speak({ model, voice, input, mood = "", speed = 1, format = "", signal } = {}) {
    const body = { input: String(input || "").slice(0, 4096), model, speed };
    if (format) body.response_format = format;
    if (voice) body.voice = voice;
    if (mood) body.prompt = String(mood).slice(0, 500);
    const res = await this.raw("/audio/speech", { body, signal });
    return res.blob();
  }

  /** what was said in a recording: { text, duration } */
  async transcribe({ file, name = "voice.webm", model, signal } = {}) {
    const form = new FormData();
    form.append("file", file, name);
    if (model) form.append("model", model);
    form.append("response_format", "json");
    const res = await this.raw("/audio/transcriptions", { form, signal });
    const d = await res.json();
    return { text: String(d && d.text || "").trim(), duration: d && typeof d.duration === "number" ? d.duration : null };
  }

  /** what a clip would cost, in USD, before anything is made */
  async quoteVideo({ model, duration, resolution = "", aspect = "", audio, signal } = {}) {
    const body = { model, duration };
    if (resolution) body.resolution = resolution;
    if (aspect) body.aspect_ratio = aspect;
    if (typeof audio === "boolean") body.audio = audio;
    const d = await this.call("/video/quote", { method: "POST", body, signal });
    return typeof (d && d.quote) === "number" ? d.quote : null;
  }

  /**
   * Start a clip. images are the character's pictures: reference-to-video models get them all, other models the
   * first one. Returns { queueId, downloadUrl } (the second only from Venice's private models).
   */
  async queueVideo({ model, prompt, duration, resolution = "", aspect = "", audio, images = [], signal } = {}) {
    const body = { model, prompt, duration };
    if (resolution) body.resolution = resolution;
    if (aspect) body.aspect_ratio = aspect;
    if (typeof audio === "boolean") body.audio = audio;
    const pics = images.filter(Boolean);
    if (/reference-to-video/.test(model)) { if (pics.length) body.reference_image_urls = pics.slice(0, 4); }
    else if (pics.length) body.image_url = pics[0];
    let d;
    try { d = await this.call("/video/queue", { method: "POST", body, signal }); }
    catch (e) { throw sent(e, { endpoint: "video/queue", model, pictures: Math.min(pics.length, /reference-to-video/.test(model) ? 4 : 1), prompt }); }
    if (!d || !d.queue_id) throw new VeniceError("Venice didn't start the clip.", 0);
    return { queueId: d.queue_id, downloadUrl: typeof d.download_url === "string" ? d.download_url : "" };
  }

  /**
   * How a clip is coming along: { done: false, elapsed, expected } while it's being made, then { done: true, blob }
   * (or { done: true, blob: null } when it waits at its download link). Venice keeps its copy until completeVideo(),
   * so a download that breaks halfway can be tried again.
   */
  async retrieveVideo({ model, queueId, signal } = {}) {
    const res = await this.raw("/video/retrieve", { body: { model, queue_id: queueId }, signal });
    const type = (res.headers && res.headers.get && res.headers.get("content-type")) || "";
    let d;
    try {
      if (/^(video\/|application\/octet-stream)/i.test(type)) return { done: true, blob: await res.blob() };
      d = await res.json();
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      throw new VeniceError("Couldn't read Venice's answer about the clip.", 0);
    }
    const status = String(d && d.status || "").toUpperCase();
    if (status === "COMPLETED") return { done: true, blob: null };
    if (/FAIL|ERROR|CANCEL|REJECT|EXPIRE/.test(status)) throw new VeniceError(`Venice couldn't make the clip (${status.toLowerCase()}).`, -2);
    return { done: false, elapsed: d && d.execution_duration || 0, expected: d && d.average_execution_time || 0 };
  }

  /** a clip waiting at its private download link (no key goes with it) */
  async downloadVideo(url, { signal } = {}) {
    if (!/^https:\/\/private-share\.venice\.ai\//.test(url)) throw new VeniceError("That isn't a Venice download link.", -1);
    let res;
    try { res = await this.fetch(url, { signal }); } catch (e) {
      if (e && e.name === "AbortError") throw e;
      throw new VeniceError("Couldn't download the clip from Venice.", 0);
    }
    if (!res.ok) throw new VeniceError(res.status === 410 ? "Venice has already deleted that clip." : "Couldn't download the clip (" + res.status + ").", res.status);
    try { return await res.blob(); } catch { throw new VeniceError("The clip's download broke off.", 0); }
  }

  /** revoke a private download link once the clip is safely home (no key goes with it either) */
  async revokeDownload(url) {
    if (!/^https:\/\/private-share\.venice\.ai\//.test(url)) return false;
    try { await this.fetch(url, { method: "DELETE" }); return true; } catch { return false; }       // it lapses within a day anyway
  }

  /** tell Venice the clip is home, so it deletes its copy */
  async completeVideo({ model, queueId } = {}) {
    try { await this.call("/video/complete", { method: "POST", body: { model, queue_id: queueId } }); return true; } catch { return false; }
  }

  /**
   * Text models: what each can do, how private it is, and what it costs (USD per million tokens). No key needed.
   * Models that are offline, or open only to Venice's beta testers, are left out.
   */
  async models() {
    const d = await this.call("/models?type=text", { auth: false });
    return (d && d.data || []).filter((m) => m && !(m.model_spec && (m.model_spec.offline || m.model_spec.beta))).map((m) => {
      const s = m.model_spec || {}, p = s.pricing || {}, c = s.capabilities || {}, dep = s.deprecation || null;
      return {
        id: m.id, name: s.name || m.id, ctx: s.availableContextTokens || 0, traits: s.traits || [],
        input: p.input && p.input.usd, output: p.output && p.output.usd,
        privacy: s.privacy || "", uncensored: !!s.uncensored,
        vision: !!c.supportsVision, tools: !!c.supportsFunctionCalling, reasoning: !!c.supportsReasoning, web: !!c.supportsWebSearch,
        json: !!c.supportsResponseSchema,
        retiring: dep ? String(dep.removesAt || dep.date || "soon").slice(0, 10) : "",
      };
    });
  }

  /** what is left to spend on this key: { amount, currency, canConsume } */
  async balance() {
    const d = await this.call("/billing/balance");
    const b = d && d.balances || {}, currency = d && d.consumptionCurrency || "USD";
    const amount = { DIEM: b.diem, BUNDLED_CREDITS: b.bundledCredits, EARNED_CREDITS: b.earnedCredits }[currency] ?? b.usd;
    return { amount: typeof amount === "number" ? amount : null, currency, canConsume: !!(d && d.canConsume) };
  }

  /**
   * One page of public Venice characters: { list, more }. adult: true lists the adult ones, and only them (left
   * unasked, Venice mixes them into the rest, where the first pages barely change); otherwise there are none. sort:
   * featured, imports, highestRating, mostRecent (or any other sortBy Venice takes); search matches names,
   * descriptions and #tags; tags narrows to a tag.
   */
  async characterPage({ search = "", limit = 24, offset = 0, sort = "", tags = "", adult = false } = {}) {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    q.set("isAdult", adult ? "true" : "false");
    if (search) q.set("search", search);
    if (sort) q.set("sortBy", sort);
    if (tags) q.set("tags", tags);
    let d;
    try {
      d = await this.call("/characters?" + q);
    } catch (e) {
      if (e.status !== 400) throw e;
      for (const k of ["sortBy", "isAdult", "tags"]) q.delete(k);   // asked for something this API doesn't take: ask plainly
      d = await this.call("/characters?" + q);
    }
    const raw = d && Array.isArray(d.data) ? d.data : [];
    return { list: raw.filter((c) => c && !!c.adult === !!adult).map(characterInfo), more: raw.length >= limit };
  }

  /** public Venice characters (the adult ones with adult: true, else the rest) */
  async characters(opts = {}) {
    return (await this.characterPage(opts)).list;
  }

  async character(slug, { adult = false } = {}) {
    const d = await this.call("/characters/" + encodeURIComponent(slug));
    const c = d && d.data;
    if (!c) throw new VeniceError("Venice doesn't know that character.", 404);
    if (c.adult && !adult) throw new VeniceError("That character is marked adult. Switch on adult characters to see them.", 451);
    return characterInfo(c);
  }

  /**
   * One chat completion. characterSlug: speak through a public Venice character (its own prompt, which Havre never
   * sees). veniceSystemPrompt: keep Venice's own system prompt (a plain chat with no character). schema: ask for JSON
   * matching it. Returns { text, usage }.
   */
  async chat({ model, messages, characterSlug = "", veniceSystemPrompt = false, schema = null, maxTokens = 700, temperature = 0.8, signal } = {}) {
    // short-form chat wants fast, plain replies: no reasoning pass (a reasoning model can spend the whole budget
    // thinking and send back nothing), and only Havre's own system prompt
    const venice_parameters = { disable_thinking: true, strip_thinking_response: true, include_venice_system_prompt: !!veniceSystemPrompt };
    if (characterSlug) { venice_parameters.character_slug = characterSlug; delete venice_parameters.include_venice_system_prompt; }
    const body = { model, messages, max_tokens: maxTokens, temperature, stream: false, venice_parameters };
    if (schema) body.response_format = { type: "json_schema", json_schema: { name: "result", strict: true, schema } };
    let d;
    try {
      d = await this.call("/chat/completions", { method: "POST", body, signal });
    } catch (e) {
      if (!(schema && e.status === 400)) throw e;
      delete body.response_format;                          // a model without structured output: ask in words
      d = await this.call("/chat/completions", { method: "POST", body, signal });
    }
    const msg = d && d.choices && d.choices[0] && d.choices[0].message || {};
    return { text: String(msg.content || ""), usage: d && d.usage || null };
  }
}

function mediaInfo(type, m) {
  const s = m.model_spec || {}, p = s.pricing || {}, c = s.constraints || {}, dep = s.deprecation || null;
  const base = { id: m.id, name: s.name || m.id, privacy: s.privacy || "", uncensored: !!s.uncensored, traits: s.traits || [],
    retiring: dep ? String(dep.removesAt || dep.date || "soon").slice(0, 10) : "" };
  const oneK = p.resolutions && p.resolutions["1K"];
  if (type === "inpaint") {
    return { ...base, price: usdOf(oneK) ?? usdOf(p.inpaint), extra: p.inputImages ? usdOf(p.inputImages.additional) : null,
      included: p.inputImages && typeof p.inputImages.included === "number" ? p.inputImages.included : 1,
      maxIn: c.maxInputImages || (c.combineImages ? 3 : 1), promptLimit: c.promptCharacterLimit || 1500 };
  }
  if (type === "image") return { ...base, price: usdOf(p.generation) ?? usdOf(oneK), aspects: c.aspectRatios || [], promptLimit: c.promptCharacterLimit || 1500 };
  if (type === "tts") return { ...base, perMChars: usdOf(p.input), voices: s.voices || [], format: s.default_format || "" };
  if (type === "asr") return { ...base, perSecond: usdOf(p.per_audio_second) };
  if (type === "video") {
    return { ...base, kind: c.model_type || "", ref: /reference-to-video/.test(m.id), durations: c.durations || [],
      resolutions: c.resolutions || [], aspects: c.aspect_ratios || [], audio: !!c.audio, audioConfigurable: !!c.audio_configurable,
      promptLimit: c.prompt_character_limit || 2500 };
  }
  return base;
}

function characterInfo(c) {
  return {
    slug: c.slug, name: c.name || c.slug, description: c.description || "", creator: c.author || "",
    photo: /^https:\/\/outerface\.venice\.ai\//.test(c.photoUrl || "") ? c.photoUrl : "",
    url: "https://venice.ai/c/" + encodeURIComponent(c.slug), model: c.modelId || "", tags: c.tags || [],
    imports: c.stats && c.stats.imports || 0, rating: c.stats && c.stats.averageRating || 0, web: !!c.webEnabled,
    adult: !!c.adult,
  };
}
