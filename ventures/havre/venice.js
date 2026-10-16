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

  /** text models with their prices (USD per million tokens); no key needed */
  async models() {
    const d = await this.call("/models?type=text", { auth: false });
    return (d && d.data || []).filter((m) => !(m.model_spec && m.model_spec.offline)).map((m) => {
      const s = m.model_spec || {}, p = s.pricing || {};
      return {
        id: m.id, name: s.name || m.id, ctx: s.availableContextTokens || 0, traits: s.traits || [],
        input: p.input && p.input.usd, output: p.output && p.output.usd,
        json: !!(s.capabilities && s.capabilities.supportsResponseSchema),
      };
    });
  }

  /** public Venice characters, safe-for-work only */
  async characters({ search = "", limit = 24, offset = 0 } = {}) {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) q.set("search", search);
    const d = await this.call("/characters?" + q);
    return (d && d.data || []).filter((c) => !c.adult).map(characterInfo);
  }

  async character(slug) {
    const d = await this.call("/characters/" + encodeURIComponent(slug));
    const c = d && d.data;
    if (!c) throw new VeniceError("Venice doesn't know that character.", 404);
    if (c.adult) throw new VeniceError("That character is marked adult; Havre only shows safe-for-work characters for now.", 451);
    return characterInfo(c);
  }

  /**
   * One chat completion. characterSlug: speak through a public Venice character (its own prompt, which Havre never
   * sees). schema: ask for JSON matching it. Returns { text, usage }.
   */
  async chat({ model, messages, characterSlug = "", schema = null, maxTokens = 700, temperature = 0.8, signal } = {}) {
    // short-form chat wants fast, plain replies: no reasoning pass (a reasoning model can spend the whole budget
    // thinking and send back nothing), and only Havre's own system prompt
    const venice_parameters = { disable_thinking: true, strip_thinking_response: true, include_venice_system_prompt: false };
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
    imports: c.stats && c.stats.imports || 0, rating: c.stats && c.stats.averageRating || 0,
  };
}
