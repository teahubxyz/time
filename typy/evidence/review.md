# typy v0 — independent browser acceptance

## Scope

- Acceptance target: `teahubxyz/time#254`, browser gameplay and visible UI.
- Target: `http://127.0.0.1:8788`, local generated-asset preview.
- Checkout base: `4c4456168e799aa7733e56fd69d43d1d8f456d88`; typy changes are uncommitted at this review point.
- Reviewed assets: `public/app.js` SHA-256 `d95ff6da39bfc51a0109b5fb372a2417529e3d3d17a82fce75744f19d470b330`; `public/style.css` SHA-256 `d0cc8d3d6b66f86b1bcce6dd654503e908ec4a108b53c73407c5e48dfa386f55`.
- Chrome 156 through Playwright. Desktop viewport 1440 × 1000; iPhone 13 emulation 390 × 844, device scale 3. This is mobile browser emulation; a real phone OS keyboard was not exercised.
- Independent browser-review pass: the reviewer did not modify application implementation. The reviewer authored the pure engine earlier; this browser pass checks the integrated frontend independently of its author.

## Checks

**12 passed, 3 failed** in `test/browser-smoke.mjs`.

Passed:

- Desktop ready stage, first-key start, no ordinary horizontal overflow.
- Incorrect character feedback, Backspace correction, and Space advancement.
- Escape restart; last-letter and upcoming-word settings; persisted settings.
- Pasted text and exact 50-word completion; accuracy and clean-streak result fields.
- Replay playback, original-word selection, and scrubber movement.
- Endless stop using Enter; failed sharing preserves the local result and exposes retry.
- Unavailable topic API renders a readable error and “use common words” recovery.
- `/daily` locks to 60 seconds and shows the board affordance **using a mocked API response**.
- Pasted HTML-like text is escaped and inert.
- Phone layout, a visible input larger than 44 px high, native input-event handling, and dialog bounds.
- No uncaught browser JavaScript exceptions during the pass.

The local preview intentionally returns 503 for real API calls. Those responses were used to review failure handling. They do not establish a backend defect or a successful backend deployment. Live topic generation, saved results, public replay, race links, board persistence, and OG response acceptance remain with the parent implementation/live-verification pass.

## Findings

### F1 — Enter on a result control restarts the game

**FAILED.** Complete a run, focus the Replay button, and press Enter. Expected: activate Replay. Observed: a new typing run opens. The document key handler handles the result-page Enter shortcut before honoring focused button/link activation.

Evidence: `keyboard-replay-bug.png`; browser check “keyboard Enter activates a focused result Replay button”. The same handler can prevent keyboard activation of other result controls.

### F2 — Enter on a settings control ends an endless run

**FAILED.** Start an endless run, focus the settings button, and press Enter. Expected: open settings. Observed: the run finishes and its result card appears. The global Enter-to-finish shortcut runs before focused control handling.

Evidence: `keyboard-settings-bug.png`; browser check “keyboard Enter opens a focused settings button during an endless run”.

### F3 — A legal 64-character word overflows the phone stage

**FAILED.** Paste a 64-character word and start it on the phone viewport. The word extends beyond the stage and expands the layout viewport from 390 to 619 CSS pixels, shrinking the overall page and clipping the word. The single-word stage must fit the entire supported word length.

Observed dimensions: word right edge 607 px, word content width 590 px, enlarged viewport width 619 px. Evidence: `phone-long-word.png`.

### Observations

- The untyped main word has computed color contrast approximately 1.71:1 (`#b8beb2` on `#f5f3ec`) and looks faint in the inspected screenshots. A darker main target would improve legibility while retaining a subtle upcoming ghost.
- A first, single-letter word in automatic mode has zero measured typing duration. Its per-word graph point becomes an extreme spike and flattens the remainder of the sparkline. This appears in the synthetic `a b` 50-word test; overall run WPM remains mathematically consistent. Treat zero-duration per-word measurements explicitly if polishing the chart.

## Evidence

- Command: `node typy/test/browser-smoke.mjs`, with temporary Chrome executable `/tmp/typy-browser/chrome-linux64/chrome` and local-preview network/browser permission.
- Machine-readable outcome: `browser-results.json`.
- Visually inspected: `desktop.png`, `phone.png`, `phone-long-word.png`, `result.png`.
- Additional evidence: `desktop-playing.png`, `keyboard-replay-bug.png`, `keyboard-settings-bug.png`.
- The result screenshot contains synthetic automated typing, not a human speed benchmark.

## Focused remediation recheck

The implementation owner fixed keyboard shortcut priority, added active-word fitting and resize redraw, darkened the target word, and omitted zero-duration per-word speed samples. The reviewer made no implementation changes.

- **F1 PASS:** Enter now activates the focused Replay button. Evidence: `keyboard-replay-fixed.png`.
- **F2 PASS:** Enter now opens settings during an endless run without finishing it. Evidence: `keyboard-settings-fixed.png`.
- **F3 static/reduced-motion PASS:** the 64-character word occupies 303 px inside the 390 px phone viewport; document width remains 390 px. Resizing to 360 px also preserves a 360 px document. Evidence: `phone-long-word-fixed.png`.
- **Contrast PASS:** computed main-target contrast is now **3.36:1** (`rgb(124,136,117)` on `rgb(245,243,236)`). Updated `desktop.png` and `phone.png` were visually inspected.
- **Graph edge case PASS:** a fixture with one zero-duration word and two measured words produces graph samples `[48,48]`, while retaining all 3 completed words, 6 correct output characters, and overall 72 WPM. The updated `result.png` shows a stable synthetic-typing line without the former first-point spike.

These five checks are recorded in `recheck-results.json`. The rechecked app asset SHA-256 was `5a2bf504cf121700568751713fd89c191bf0a50cadb70bbf8090867fab35fc92`; stylesheet SHA-256 was `6655a1827e0e542b1d1100e24b6c96435be586b1c676057e1489cd61f1d0475d`.

The first remediation build still had an **F3 normal-animation defect**. A targeted default-motion check found the outgoing `previous-word` ghost overflowing after completing a 64-character word. The next word was correct, but the invisible outgoing text expanded the phone document/viewport to **889 px** (outgoing content width 866 px, font size 24.96 px). Reproduction: iPhone viewport, automatic advancement, paste 64 `a` characters followed by `next`, type the first word, wait 250 ms. Historical evidence: `phone-long-word-transition.png` (visually inspected) and `transition-recheck.json`.

### Final outgoing-word recheck — PASS

The implementation owner subsequently copied the departing word's fitted font size onto the outgoing ghost and clipped stage animation overflow. With normal motion enabled, measurements both during the transition and after it finished now show **390 px viewport / 390 px document width**. The next word remains `next`; the outgoing ghost uses the fitted 8.74088 px font. No horizontal expansion occurs.

- Final evidence: `phone-long-word-transition-fixed.png` and `transition-recheck-fixed.json`.
- Both the final transition screenshot and refreshed `phone.png` were visually inspected.
- Final reviewed app SHA-256: `40bc694cacbda3c3ffc38205cf070c089fcfcf868e3605445816230dda74221f`.
- Final reviewed stylesheet SHA-256: `0ef997306a016254e2a0370b1c50fb200bf2ed71ab8b546ea6bdab10e4ece391`.
- Final reviewed engine SHA-256: `e8dc58fc8fbef76f272393170012b7c07c916e2a0cb9a3a7e84aa94e0d97c072`.

## Outcome

**PASS — reviewed frontend scope.**

All three reported acceptance failures are resolved and rechecked. Active and outgoing long-word geometry, resize handling, main-word contrast, and the zero-duration chart edge case pass. The earlier twelve successful functional checks remain the baseline; the recheck was limited to changed behavior and the concrete outgoing-animation risk. Real backend/deployment acceptance remains a separate parent-owned gate, not a claim made by this frontend receipt.

## Independent backend and deployment-source review

Scope: `src/worker.js`, `src/store.js`, `src/passages.js`, `src/og.js`, and `deploy.py`. Source inspection and local deterministic checks only; no provider or infrastructure calls were made in this review.

`node typy/test/backend.test.js`: **13 tests passed**. These cover saved-field whitelisting and recomputed scores, malformed replay rejection, sharing round trips, origin/content-type checks, canonical daily scoring, concurrent independent board entries, topic cache/filter/provider errors, strict concurrent quota reservation, missing-quota fail-closed behavior, PNG encoding, and escaped social metadata/security headers.

Verified implementation properties:

- Replay bodies are limited to 1.5 MB; accepted fields are reconstructed instead of persisting arbitrary client fields or actual mistyped characters.
- Scores are recomputed from timing/outcome events. Daily submissions must match today's full canonical 60-second passage.
- New topic generation reserves a serialized visitor/global allowance before the provider request, has a 25-second timeout and bounded output, and caches suitable text. Provider failure does not substitute fabricated content.
- Quota state retains daily HMAC identifiers instead of raw IP addresses. The deployment disables application observability logging.
- Result metadata is escaped; the page has restrictive script/object/frame policies; OG output is a genuine 1200 × 630 PNG.
- Deployment requires credentials before API writes, refuses a dirty typy checkout, checks generated assets against source, bounds uploaded modules, and refuses unexpected Durable Object migration tags.

### Backend findings at initial review

**B1 — accepted passage differs when raced.** `validateResult` accepted an externally submitted 72-character word, while `TypingGame` truncates it to 64. A saved replay and its race could therefore use different text. Deterministic evidence: `serverLength: 72`, `raceEngineLength: 64` in `backend-review-findings.json`.

**B2 — midnight requests postpone cleanup.** A quota request at 23:59:50 scheduled cleanup for the next day at 00:01. A request at 00:00:10 then replaced that still-pending alarm with one a full day later. Repeated activity in that window can retain expired visitor rows indefinitely. Deterministic evidence: alarm moved from `2026-10-25T00:01:00.000Z` to `2026-10-26T00:01:00.000Z`; old and new visitor rows both remained.

Both findings were routed to the backend implementation owner, who owns the fixes and regression tests. The independent reviewer made no backend changes.

**Initial nonblocking UX observation:** requesting a missing result URL directly returned a readable JSON 404 instead of an HTML recovery page. This included potential KV propagation misses; it was not an assertion that valid deployed links failed.

### Final focused backend recheck — PASS

The backend owner fixed B1 and B2 and added an HTML recovery shell for missing result/race pages. The reviewer independently exercised only those changed behaviors, without network or deployment calls:

- A canonical 64-character passage is accepted and reconstructs identically in `TypingGame`. 65- and 72-character words, fullwidth Unicode text, and curly-apostrophe variants are rejected instead of silently changing between replay and race.
- A request at 00:00:10 preserves the cleanup alarm already scheduled for 00:01. That alarm removes the prior day's visitor rows, keeps the current day's row, and rearms expiry for the following day.
- With no further requests, the following day's alarm removes the remaining visitor row and expired counters. Cleanup is no longer dependent on later traffic.
- Missing `/r/<id>` and `/race/<id>` return HTML 404 pages containing the existing retry UI. `/api/results/<id>` correctly remains a JSON 404.

Evidence: `backend-review-recheck.json`. The initial 13 backend tests were independently run; the backend author's additional regression suite was not redundantly rerun in full. The focused independent fixtures verify the specific corrected invariants above.

Final reviewed source SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `src/worker.js` | `3a1b927cb83c3e740c58319088ddd93838a46bc46e89ce232ab0f893d27cb355` |
| `src/store.js` | `f88e28c1a47987357416c46cfe6f2b1bf4dbc5a6753426a3edb85d641aeea6e1` |
| `src/passages.js` | `42b8a9721f564fc3b449dd7b05c19d861ea74b8463105df0b857859292a4147f` |
| `src/og.js` | `c23399b8d88b8cdc620211ec7e227573201c805069bd7e1f12128fa590de264a` |
| `deploy.py` | `b616a07c9b2f195866c752480428009fc7cc56347c7777b43c36861bc2616656` |

**PASS — bounded backend and deployment-source review.** No remaining blocker was found within this scope. Actual Cloudflare behavior, provider availability, live sharing/races, and final deployment health remain the parent's separate acceptance gate.
