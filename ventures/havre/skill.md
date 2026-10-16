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
- `venice.js`: the Venice API calls Havre makes: chat, characters, models, photos, voice notes, hearing and clips.
- `abilities.js`: the prompts and rules behind photos, clips, voice notes, hearing and seeing.

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
  "adult": false,
  "model": "zai-org-glm-5-2",
  "engine": {},
  "portrait": "",
  "look": { "description": "Forties, short dark curls, a big knitted cardigan, headphones round her neck.", "references": [] },
  "speech": { "model": "tts-kokoro", "voice": "af_bella", "mood": "warm, unhurried", "speed": 1 },
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
- **examples**: three to five exchanges. They teach the voice (the first four go into the system prompt), and they are
  what a visitor without a key hears: the page answers with the example whose question is closest to what was said.
- **name**: keep it the same everywhere. The persona should open with "You are <name>", and the greeting and examples
  shouldn't call them anything else: a model given two names drifts to the other one.
- **flow** (optional): stages for meeting someone new, taken in order. Each has a `stage`, a `goal` and `next` (when to
  move on). A coach's flow might be assess, plan, execute:
  ```json
  [{ "stage": "assess", "goal": "Ask what they're working on, the main blocker and the deadline.", "next": "you know all three." },
   { "stage": "plan", "goal": "Propose one plan and ask them to say go.", "next": "they say go." },
   { "stage": "execute", "goal": "Say: Switching to EXECUTION MODE. Then one concrete step at a time, each ending with when to report back." }]
  ```
- **look** (optional): how they look. `description` is a sentence or two (an adult; face, hair, build, clothes).
  `references` holds up to three more pictures besides the `portrait`, best as data: URIs (PNG, JPEG, WebP or GIF)
  so they travel with the card. Havre makes photos and clips of the character from the portrait and these, when
  they're kept in the card (or the character's own photo on Venice). Pictures of the character only: art, or
  pictures the person made. Never a photo of a real person.
- **speech** (optional): how they sound in a voice note. `model` is a Venice voice model (`tts-kokoro` if empty),
  `voice` one of its voices, `mood` a short delivery note ("warm, teasing") that Qwen 3 voices follow, and `speed`
  0.25 to 4.
- **adult** (optional): `true` for a character for grown-ups only (18+). Everyone in their chats and pictures is an
  adult, 18 or older, and Havre puts that in their system prompt as a hard rule. Character cards carry it as an `nsfw`
  tag, both ways, and a remix of an adult character is adult too.
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
history)`: the system prompt (who they are, how they talk with their examples, their flow, their name and the house
rules), the greeting, the last 40 messages, and on the latest one a reminder of who is answering
(`[You are <name>. Stay in character.]`), since a model drifts from a prompt far above. `C.chatMessages(card, history,
{ memory })` adds what the character remembers of your chats (`memory.js`). Then send them:

```sh
curl https://api.venice.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $VENICE_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "zai-org-glm-5-2", "messages": [{"role": "system", "content": "<C.systemPrompt(card)>"},
       {"role": "user", "content": "hi"}],
       "venice_parameters": {"include_venice_system_prompt": false, "strip_thinking_response": true}}'
```

Split the reply into texts with `C.splitBubbles(reply)`. To talk through a public Venice character instead (its own
prompt, which nobody else can read), leave out the system message and set `venice_parameters.character_slug`.

## Photos, clips and voice notes

In Havre a character can send more than texts. `abilities.js` has the prompts and `venice.js` the calls:

- **A photo**: a text model writes the shot from the conversation (`A.shotMessages(card, A.apiHistory(history), ask)`),
  then `venice.editImage({ model, prompt: A.photoPrompt(card, shot, n), images })` edits the character's own
  pictures (`/image/edit`, or `/image/multi-edit` for several). Safe mode is always on. A character with no picture
  yet gets a first portrait from `A.portraitPrompt(card)` through `/image/generate`.
- **A clip**: the same kind of shot (`kind: "clip"`), priced first with `venice.quoteVideo()`, then
  `venice.queueVideo()` with a reference-to-video model and the character's pictures, polled with
  `venice.retrieveVideo()`. Always show the price before queueing.
- **A voice note**: `venice.speak({ model, voice, input: A.speakable(reply), mood, speed })` (`/audio/speech`).
- **Hearing and seeing** (only if the person switches them on): `venice.transcribe()` turns their voice note into
  words; their photo goes to a model that can see (`A.withPicture(messages, dataUrl)`), or is described by one first.
- **On their own**: after a reply where it fits (they were asked to show or say something, or the reply is about
  something worth showing), `A.moveMessages(card, history)` with `A.MOVE_SCHEMA` lets the character's model choose a
  photo, a voice note, a clip or nothing. Havre sends photos and voice notes out of a daily allowance the person sets,
  never two photos in a row, and only offers a clip, with Venice's price, for the person to accept. After a long gap
  (`A.BACK_AFTER`), the character texts first (`A.comeBack(ms)`).

Rules for photos and clips: safe for work, everyone shown is an adult, never a real or identifiable person. Make
them only from pictures the person can see on the card.

The one exception is an `adult` character, once the person has said they're 18 or older: when every picture on their
card was made with AI (never one that was uploaded, which could be of anyone), their photos and clips can be adult.
`A.adultCheck(card, { of18, made, shot, said })` decides; they go to Venice's uncensored models with safe mode off,
and every prompt opens with the 18+ rule (`A.ADULT_ONLY`). Never when the card, the shot or the chat mentions anyone
under 18 (`A.underage`): then it's safe for work, as usual. The pictures made for their card go without safe mode
too: a portrait drawn from words (`A.portraitPrompt(card, limit, { adult: true })`, when
`A.adultCheck(card, { of18, drawn: true })` says so), and one made from their pictures when every one of those was
made with AI.

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
