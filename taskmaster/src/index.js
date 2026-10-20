// The server entry: where app secrets become the app's dependencies, and the only file that reads `env` directly.
//
// Secrets are set with `whop apps secrets set` and arrive as environment variables. None of them has a default
// that would let the app run half-configured and look fine:
//
//   VENICE_API_KEY            the voice. Without it a turn fails loudly rather than answering as nobody.
//   TASKMASTER_MODEL          the model id. Unset means GLM 5.2; an uncensored model is refused.
//   TASKMASTER_SHEET          the character sheet. The operator's; not in this repo.
//   TASKMASTER_PROMPT_HAGGLE  the haggle prompt. The operator's.
//   TASKMASTER_PROMPT_COACH   the coach prompt. The operator's.
//   TASKMASTER_CARD_SECRET    seals the quote card, so a card the model edited is worthless.
//   WHOP_API_KEY              reads memberships and, once the operator approves, writes checkouts.
//   WHOP_WEBHOOK_SECRET       verifies the payment webhook.
//   TASKMASTER_DEAL_LOG       where the deal log is appended. Defaults to ./deals.jsonl.
//   TASKMASTER_WHOP_LIVE      "on" lets the app create checkout configurations and write membership metadata.
//                             Card #66 leaves it off: nothing is created on Whop until the previews are approved.
//
// The stores are left to the host, because the right answer depends on where this runs: the in-memory defaults are
// for a single process and the tests, and a Whop deployment passes KV- or D1-backed ones with the same methods.
// All three hold derived state — the deals and threads of conversations in flight, and `packs`, which only says
// which pack membership to read for a seat holder (Whop's own metadata still decides whether the seat is there).

import { app } from "./server.js";
import { voice } from "./voice.js";
import { whop } from "./whop.js";
import { fileSink } from "./deallog.js";
import { packIndex } from "./seats.js";

export function memoryStore() {
  const m = new Map();
  return { get: async (id) => m.get(id) ?? null, save: async (v) => void m.set(v.id, v) };
}

export function create(env = process.env, { deals = memoryStore(), threads = memoryStore(), packs = packIndex(),
                                            log, experiments = null } = {}) {
  return app(env, {
    voice: voice({ apiKey: env.VENICE_API_KEY, model: env.TASKMASTER_MODEL }),
    whop: whop({ apiKey: env.WHOP_API_KEY, live: env.TASKMASTER_WHOP_LIVE === "on" }),
    deals,
    threads,
    packs,
    log: log ?? fileSink(env.TASKMASTER_DEAL_LOG ?? "deals.jsonl"),
    experiments,
  });
}

export default { create, memoryStore, packIndex };
