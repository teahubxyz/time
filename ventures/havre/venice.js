// venice.js: the few Venice API calls Havre makes, straight from the browser with the visitor's own key.
// The page's security policy only lets it connect to api.venice.ai, so the key can't be sent anywhere else.
// Docs: https://docs.venice.ai/  (OpenAI-compatible; character_slug and friends live in venice_parameters)

export const BASE = "https://api.venice.ai/api/v1";

export class VeniceError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

function explain(status, body) {
  const said = (body && (body.error && (body.error.message || body.error)) || body && body.message || "").toString().slice(0, 240);
  if (status === 401 || status === 403) return "Venice didn't accept that key. Check it at venice.ai → Settings → API.";
  if (status === 402) return "Venice says the key is out of credit.";
  if (status === 429) return "Venice is rate-limiting this key. Wait a moment and try again.";
  if (status === 404) return "Venice doesn't know that " + (said.includes("model") ? "model." : "character or model.");
  if (status >= 500) return "Venice had a problem (" + status + "). Try again in a moment.";
  return said || "Venice answered " + status + ".";
}

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
    if (!res.ok) throw new VeniceError(explain(res.status, data), res.status);
    return data;
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
   * One page of public Venice characters: { list, more }. Adult characters only with adult: true. sort: featured,
   * imports, highestRating, mostRecent (or any other sortBy Venice takes); search matches names, descriptions and
   * #tags; tags narrows to a tag.
   */
  async characterPage({ search = "", limit = 24, offset = 0, sort = "", tags = "", adult = false } = {}) {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (!adult) q.set("isAdult", "false");
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
    return { list: raw.filter((c) => c && (adult || !c.adult)).map(characterInfo), more: raw.length >= limit };
  }

  /** public Venice characters (adult ones only with adult: true) */
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

function characterInfo(c) {
  return {
    slug: c.slug, name: c.name || c.slug, description: c.description || "", creator: c.author || "",
    photo: /^https:\/\/outerface\.venice\.ai\//.test(c.photoUrl || "") ? c.photoUrl : "",
    url: "https://venice.ai/c/" + encodeURIComponent(c.slug), model: c.modelId || "", tags: c.tags || [],
    imports: c.stats && c.stats.imports || 0, rating: c.stats && c.stats.averageRating || 0, web: !!c.webEnabled,
    adult: !!c.adult,
  };
}
