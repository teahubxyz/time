// The voice: Venice, as the old app used, called from a server route with the key from Whop app secrets.
//
// Three things the old app got wrong and this does not:
//
//   * It defaulted to `venice-uncensored`. There is no uncensored default here, and `model()` refuses one outright;
//     the operator names the model in TASKMASTER_MODEL (Havre's Taskmaster card runs on GLM 5.2).
//   * The character sheet was a Venice character, which tied the persona to one provider. The sheet here is plain
//     text in a secret, composed by mode.js, so the same sheet runs on another model unchanged.
//   * Nothing bounded what a member could spend of the owner's tokens. The owner pays here, so there is a limit
//     per member and haggle replies are kept short.
//
// The voice gets exactly one tool, `quote`, and the deal desk executes it. The model cannot name a price any other
// way, and `strip()` takes out the *asterisk narration* the old persona used, which the card asks to drop.

export const BASE = "https://api.venice.ai/api/v1";
export const DEFAULT_MODEL = "zai-org/glm-5.2";
export const HAGGLE_MAX_TOKENS = 180;   // a couple of lines: short replies are the persona and the token budget both
export const COACH_MAX_TOKENS = 400;

export const PER_MEMBER = 40;           // model calls per member per window
export const WINDOW_MS = 60 * 60 * 1000;

// The one tool the haggle prompt may call. The desk decides what the answer is.
export const QUOTE_TOOL = {
  type: "function",
  function: {
    name: "quote",
    description: "Put a price on the table. The deal desk accepts, counters or refuses; say its number, not yours.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["tier", "price"],
      properties: {
        tier: { type: "string", description: "the tier being quoted" },
        price: { type: "number", description: "dollars, for the whole tier (a seat pack is priced as a pack)" },
        reason: { type: "string", enum: ["scope", "urgency", "commitment", "pay_now"],
                  description: "what the member gave that earns a step down; omit when holding the price" },
        note: { type: "string", maxLength: 200,
                description: "what they said that earns it, about the work only — never about who they are" },
      },
    },
  },
};

export function model(name) {
  const id = String(name ?? DEFAULT_MODEL).trim();
  if (!id) return DEFAULT_MODEL;
  if (/uncensored/i.test(id)) throw new Error(`refusing an uncensored model (${id}): name a model in TASKMASTER_MODEL`);
  return id;
}

export function strip(text) {
  return String(text ?? "")
    .replace(/\*[^*\n]{1,200}\*/g, "")   // *leans back in the chair* — gone
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n").map((l) => l.trimEnd()).join("\n")
    .trim();
}

// One counter per member per window. `clock` is injectable so the test does not wait an hour.
export function limiter({ per = PER_MEMBER, windowMs = WINDOW_MS, clock = Date.now } = {}) {
  const seen = new Map();
  return {
    take(member) {
      const now = clock();
      const hits = (seen.get(member) ?? []).filter((t) => now - t < windowMs);
      if (hits.length >= per) {
        seen.set(member, hits);
        return { ok: false, left: 0, retry_after_ms: windowMs - (now - hits[0]) };
      }
      hits.push(now);
      seen.set(member, hits);
      return { ok: true, left: per - hits.length };
    },
  };
}

export function voice({ apiKey, model: name, base = BASE, fetch: f = globalThis.fetch } = {}) {
  const id = model(name);
  return {
    model: id,
    async say({ system, messages, tools = null, max_tokens = HAGGLE_MAX_TOKENS, temperature = 0.7 }) {
      if (!apiKey) throw new Error("no Venice API key: set it with `whop apps secrets set`");
      const res = await f(`${base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: id, max_tokens, temperature,
          messages: [{ role: "system", content: system }, ...messages],
          ...(tools ? { tools, tool_choice: "auto" } : {}),
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`venice answered ${res.status}: ${JSON.stringify(out).slice(0, 200)}`);
      const choice = out.choices?.[0]?.message ?? {};
      return {
        text: strip(choice.content ?? ""),
        calls: (choice.tool_calls ?? []).map((c) => ({
          id: c.id,
          name: c.function?.name,
          args: parse(c.function?.arguments),
        })),
        usage: out.usage ?? null,
      };
    },
  };
}

const parse = (s) => { try { return JSON.parse(s ?? "{}"); } catch { return {}; } };
