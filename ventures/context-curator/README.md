# Context Curator

A browser-only manual editor for a completed exploratory span in an agent transcript. Inspired by [openai/codex#14747](https://github.com/openai/codex/issues/14747), closed as not planned. It keeps the surrounding context and replaces one contiguous span with a conclusion you write.

## Install and use

Open `site/index.html` directly in a modern browser. No installation, dependencies, account, server, or model calls. The hosted page offers that same complete HTML as a free offline download. The initial interactive example is an **illustrative** debugging transcript, not a recorded execution or performance benchmark.

1. Try the sample, open a JSON file, or paste JSON and press **Load this JSON**.
2. Choose first and last messages (1-based, both inclusive). Write the root cause, supporting evidence, unresolved questions, and next action.
3. Press **Replace selected span**. Read the complete message diff and expandable full JSON views. Size measurement compares compact UTF-8 JSON bytes, including conclusion metadata, not tokens, costs, or Markdown file size. A long conclusion can make the result larger.
4. Download the Markdown continuation packet or curated JSON. **Save untouched original** downloads the exact loaded text, including whitespace. **Undo replacement** restores the previous working result (one level). Replacements always target the loaded original, never accumulate silently.
5. Review the packet before manually handing it to a fresh session. All messages are quoted as JSON in Markdown, with fences safe for embedded backticks. No commands or transcript HTML are executed.

## JSON transcript format (version 1)

```json
{"version":1,"title":"Optional metadata","messages":[
  {"id":"m1","role":"system","content":"Keep the requirements."},
  {"id":"m2","role":"tool","content":"Exploratory evidence."},
  {"id":"m3","role":"user","content":"Next task."}
]}
```

Required: `version: 1`, 1–500 messages, each with a unique nonempty string `id`, `role` in `system|user|assistant|tool`, and string `content`. Limit: 2 MiB UTF-8 source JSON. Additional top-level and message fields survive. Retained messages are structurally identical; formatting in curated JSON is normalized. The original source string is preserved separately, byte-for-byte for valid UTF-8 input. Invalid imports leave the last loaded original and result available. Files must be valid UTF-8.

`sample.json` is the example. The manual replacement is an assistant message tagged `curator.kind = "manual-conclusion"`, with `replacedIds` for the entire selected span and a unique generated ID. Selected messages and their metadata are absent from the curated export; they remain in the original. Selection may include any role: review carefully before removing requirements or instructions.

## Privacy and limits

Transcript processing stays in browser memory. No fetch, telemetry, third-party fonts/scripts, local storage, session edits, or configuration access. Closing or reloading loses working state; download the original and exports first. Only the optional signup form posts email, plan, and note to the existing `/api/signup` service. Offline signup is unavailable. `?joined=1#join` shows the thank-you state.

This does not import native Codex/Claude session files, automatically summarize, resume a session, count model tokens, or guarantee a good conclusion. Convert an explicit transcript export into the documented format yourself. It is a handoff aid, not a compaction API. Do not include sensitive context in the signup note. A malicious transcript can still contain misleading instructions: quoted Markdown is not an agent security boundary.

## Develop and verify

From this directory:

```sh
python3 build.py
node --test tests/core.test.cjs
# Browser checks require Playwright installed outside this repo:
NODE_PATH=/tmp/context-curator-browser/node_modules node tests/browser.cjs
```

`build.py` embeds `core.js`, the sample, and `site/app.js` into `site/template.html`, writes the standalone `site/index.html`, and copies the sample and README beside it. Libre Baskerville Latin regular/italic WOFF2 (Fontsource package, SIL OFL 1.1 in `site/fonts/OFL.txt`) is vendored and embedded as data URLs so the single-file download keeps its typography offline. No build dependency beyond Python 3; core tests require Node 18+. Browser tests accept `CHROME_PATH` (default hb-5 Chrome), `PAGE_URL` (default file://), and `EVIDENCE_DIR` (default /tmp/context-curator-evidence). They cover desktop/phone overflow, undo, imports, exports, escaping, form payload and thank-you state, and screenshots. Run `python3 tests/signup.py /path/to/existing/server.py` for signup acceptance: it imports the existing handler with temporary data, never the real signup list. Checked launch evidence is in `evidence/`; native macOS browser verification was blocked by this seat sandbox (Mach bootstrap permission denied). Node core tests did run on macOS. Container Chromium passed both file:// and a local HTTP `/v/context-curator/` route, including reopening the downloaded HTML offline. The public route is deliberately not polled: publication happens after the issue reply.

Launch is confined to this venture directory; the factory runner publishes `site/` at `/v/context-curator/` after the issue reply. No shared deployment files are changed.
