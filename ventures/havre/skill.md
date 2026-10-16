---
name: havre
description: Write AI characters as Havre cards (.havre.json) with a persona, a short-form voice, an optional flow, examples and lineage; export them as Character Card V3 for SillyTavern-style apps; talk to them through Venice's API; and remix someone else's character into an original one, with credit. Use when someone asks for a character, persona or roleplay companion for Havre, a character-card app, or Venice.
---

# Havre

Havre (https://havre.yolopreneur.lol/) is a harbor for characters. A character is a card file its person keeps: who
they are, how they talk, how they meet someone new, and where they came from. People talk to them, and to Venice's own
public characters, in the browser with their own Venice API key; export them to other apps; and remix the ones they
love into someone new, with credit.

Everything you need is at https://havre.yolopreneur.lol/:

- `card.schema.json`: the format, as JSON Schema.
- `card.js`: reading, checking and converting cards (an ES module, no dependencies; works in Node 20+ and browsers).
- `venice.js`: the few Venice API calls Havre makes.

## A card

```json
{
  "havre": 1,
  "id": "juniper",
  "name": "Juniper",
  "tagline": "Night-shift radio host. Takes requests.",
  "greeting": "You're on the air.\n\nWhat are we playing for you tonight?",
  "persona": "You are Juniper, who hosts the 2 a.m. call-in show on a small coastal station...",
  "voice": { "short_form": true, "notes": "Warm, unhurried, a little teasing. One question at a time." },
  "flow": [],
  "examples": [
    { "user": "Can you play something sad?", "character": "Sad, or sad-but-you-can-dance-to-it?\n\nBe honest." }
  ],
  "tags": ["radio", "cozy"],
  "model": "zai-org-glm-5-2",
  "engine": {},
  "portrait": "",
  "creator": "",
  "license": "remix-with-credit",
  "lineage": [],
  "created": "2026-10-16T00:00:00.000Z",
  "updated": "2026-10-16T00:00:00.000Z"
}
```

Save it as `<id>.havre.json`. Only `havre` (always 1), `name` and `persona` are required; `normalizeCard()` in
`card.js` fills in the rest.

## Writing a good character

- **persona**: second person ("You are ..."), 120 to 300 words. Who they are, how they talk, what they want, what they
  won't do. Concrete details beat adjectives. `{{char}}` and `{{user}}` are filled in at chat time.
- **greeting**: one to three short texts, separated by a blank line.
- **voice**: `short_form: true` makes replies arrive as a few short texts, the way people text. Put how they talk in
  `notes` as traits ("clipped", "asks one question at a time"), never as catchphrases.
- **examples**: three to five exchanges. They teach the voice, and they are what a visitor without a key hears: the
  page answers with the example whose question is closest to what was said.
- **flow** (optional): stages for meeting someone new, taken in order. Each has a `stage`, a `goal` and `next` (when to
  move on). A coach's flow might be assess, plan, execute:
  ```json
  [{ "stage": "assess", "goal": "Ask what they're working on, the main blocker and the deadline.", "next": "you know all three." },
   { "stage": "plan", "goal": "Propose one plan and ask them to say go.", "next": "they say go." },
   { "stage": "execute", "goal": "Say: Switching to EXECUTION MODE. Then one concrete step at a time, each ending with when to report back." }]
  ```
- **license**: `remix-with-credit` (the default), `all-rights-reserved`, `cc-by-4.0` or `cc0`.
- **lineage**: where the character came from, as `{ relation, name, creator, ref, at, note }` with relation
  `ported-from`, `inspired-by` or `forked-from` and ref `venice:<slug>`, a URL, or `sha256:<hex>` of the source text.
  Only ever add entries. Never remove or edit one you didn't add.

Rules: write original characters, or port characters the person made. Never base a character on a real, private person.
Characters never invent links, prices or payments (Havre adds that rule to every system prompt).

## Checking a card

```sh
curl -O https://havre.yolopreneur.lol/card.js
node --input-type=module -e '
import * as C from "./card.js";
import { readFileSync } from "node:fs";
const card = C.normalizeCard(JSON.parse(readFileSync(process.argv[1], "utf8")));
const problems = C.validateCard(card);
console.log(problems.length ? problems : "valid");' juniper.havre.json
```

## Other formats

- **Character Card V3** (SillyTavern, RisuAI, Chub and other card apps): `C.toCharacterCardV3(card)`. The whole Havre
  card rides along in `data.extensions.havre`, so it comes back into Havre without loss. `C.toCharacterCardV2(card)`
  for older apps.
- **A PNG card**: `C.toPngCard(pngBytes, card)` writes the card into a portrait PNG (`ccv3` and `chara` text chunks).
- **A system prompt**: `C.systemPrompt(card)`, for any OpenAI-compatible API.
- **In**: `C.fromAny(input)` reads Havre JSON, Character Card V1, V2 or V3 (JSON or PNG bytes) or plain text.

## Talking to a character through Venice

Havre uses Venice's OpenAI-compatible API with the person's own key. Build the messages with `C.chatMessages(card,
history)` (the system prompt, the greeting, then the conversation) and send them:

```sh
curl https://api.venice.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $VENICE_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "zai-org-glm-5-2", "messages": [{"role": "system", "content": "<C.systemPrompt(card)>"},
       {"role": "user", "content": "hi"}],
       "venice_parameters": {"include_venice_system_prompt": false, "strip_thinking_response": true}}'
```

Split the reply into texts with `C.splitBubbles(reply)`. To talk through a public Venice character instead (its own
prompt, which nobody else can read), leave out the system message and set `venice_parameters.character_slug`.

## Remix with credit

To make someone new from a character the person didn't write, work like a clean room:

1. **Distill.** One model call reads the source and returns only ideas: `C.distillMessages(sourceText)` with
   `C.DISTILL_SCHEMA`. No names, no quotations, no sentences from the source. For a Venice character, whose prompt
   can't be read, ask it the questions in `C.INTERVIEW` and distill the answers.
2. **Edit.** Show the person the ideas. They remove what they don't want and add a twist. Their choices are part of
   the authorship.
3. **Write.** A second call gets only the ideas and the twist, never the source: `C.writeMessages(ideas, twist)` with
   `C.WRITE_SCHEMA`.
4. **Check.** `C.similarity(C.cardText(newCard), sourceText, { names: [sourceName], newName })` returns `fresh`,
   `close` or `too-close`, with the reasons (shared five-word phrases, the longest shared run of words, reused or
   look-alike names). If it isn't fresh, write again with `C.writeMessages(ideas, twist, C.avoidList(check,
   [sourceName]))`. Never keep a `too-close` result.
5. **Credit.** `C.cardFromWrite(result, { source, check })` adds an `inspired-by` lineage entry with the numbers.

Names and broad ideas aren't protected by copyright; a character's written expression can be. The clean room keeps
the expression out, and the lineage keeps the credit in. When in doubt, ask the creator. This isn't legal advice.

## Coming next

A hosted harbor with a page per character, and an API and an MCP server to create, update and talk to characters
without a browser.
