# typy

One word at a time. Type it, find the next one, settle into a rhythm.

**Live:** https://typy.lol/ (the original https://typy.yolopreneur.lol/ still works)  
**Brief:** [time#254](https://teahub.xyz/teahubxyz/time/issues/254)

## Play

- 30 seconds, 60 seconds, 120 seconds, 50 words, endless, and tempo.
- The first typed character starts the run. Backspace fixes mistakes. Space advances; settings can advance on the last correct letter instead. Automatic advancement tolerates one habitual Space immediately afterward without adding an error or extra output.
- Word changes are immediate and stationary. Letter feedback reuses the rendered glyphs; word fitting runs only when the word or viewport changes. Idle stages do no repeated DOM work. Optional faded context sits beside the centered target: the previous and next words a size down, and the word after next smaller and fainter again. That third word appears only when a few of its letters fit, and a partial fit fades out instead of ending in an ellipsis.
- Tempo is the ramp: it waits for each word's beat, accelerates by 3.5% on success, and ends after three missed beats. Its starting pace comes from the device's last measured average, the beat pace shows the current target, and the word dims while the pace ghost is more than a character ahead of you.
- Common words are weighted by frequency. The words menu also accepts a topic or a pasted passage, capped at 300 words.
- Topic paths such as **/react-hooks** generate a short Venice passage and cache it for 30 days.
- **/daily** uses one deterministic passage per UTC day and locks the run to 60 seconds. Sharing a completed daily run adds an optional name to the daily board.
- Reduced motion is honoured live, not only at load: the stylesheet drops animation and transitions, the error nudge does not run, and the beat rail steps in tenths rather than sliding.
- Finished runs show WPM, accuracy, clean-word streaks, slower words, and a speed sparkline. Replay follows original key timing and supports scrubbing.
- Choose Share to publish a replay at **/r/:id**. A result includes a real PNG social preview. **/race/:id** uses the original passage, mode, advancement setting, and timing as a ghost: its run plays letter by letter in a lane under your stage, and the result card says who won (decided on whole wpm). Watching a race back plays both runs on one clock, yours on the stage and the ghost's in the lane, and a race you share remembers the result it raced, so anyone with its link can see the verdict and watch the race.

## Themes

Eighteen themes, plus **auto** (typy by day, typy night after dark, following the system setting) and **random** (a new theme on every visit and as each run begins, never the same one twice running). Random is the default until you keep a theme. Open the picker with the palette button, the theme name in the footer, or **Alt+T** (Option+T on a Mac). Arrow keys preview themes live on the page, Enter keeps one, and Esc puts the kept one back. Typing filters by name, or by "dark" and "light".

A theme is a few colours in **public/themes.js**: paper, ink, accent and error are enough, and `resolveTheme` mixes the rest. **test/themes.test.js** holds every theme to readable contrast (typed letters at least 7:1 on their paper, the word to type 3:1, the word after next fainter than the next) and keeps the default theme identical to the stylesheet's `:root`. **public/themes.js** is a classic script in `<head>`: it deals or restores the theme and paints it before the first render, so a dark theme never flashes light. Local storage (`typy.theme`) keeps only the kept choice and the last random deal, never colours.

Ported palettes, all MIT licensed: Solarized (Ethan Schoonover), Catppuccin, Dracula, Nord (Arctic Ice Studio), Gruvbox (Pavel Pertsev), Tokyo Night (enkia) and Rosé Pine.

## Music

The note button in the header (or **Alt+M**, Option+M on a Mac) turns on a little jazz. The letters of each word play its melody, every new word brings the next chord of an eight-bar loop in F (I–VI–ii–V, then iii–vi–ii–V), and a wrong letter is a soft muted thump instead of a wrong note. Keys to the right of the last one step up the scale and keys to the left step down, so a word's shape on the keyboard is the shape of its tune, and a doubled letter repeats its note. Tempo mode changes chords on the beat, a race rings a soft ting each time the ghost finishes a word, and the run ends on the home chord: brighter for a win, the relative minor for a loss, left hanging for a dead heat.

**public/music.js** keeps the mapping pure and deterministic: a conductor turns the same event log replays already store into notes and chords, so a replay plays back exactly the music its run made. The sound is synthesized with Web Audio (an FM electric piano, a bass, a generated room and a limiter): no samples, nothing fetched, and no audio context at all until music is turned on. Music is off by default; local storage (`typy.music`) keeps the choice. **test/music.test.js** holds every note to its bar's scale and checks that live play and its replay make identical music.

## Development

Node 22 or newer. The app and Worker have no runtime package dependencies.

    cd typy
    npm start

The local server runs at http://127.0.0.1:8787 with ephemeral memory storage and the real quota class. Restarting it clears local results. Set PORT to choose another port. Set VENICE_API_KEY to exercise real topic generation locally; otherwise that route returns a clear unavailable response. Common words, pasted text, the daily, sharing, replay, and score images still work locally.

    npm test

The test files can also be run directly for individual test output:

    node test/game.test.js
    node test/backend.test.js

Optional browser acceptance uses Playwright. Each script uses Playwright's own Chromium unless `CHROME` (`TYPY_CHROME` for the smoke script) points at another executable:

    node test/browser-smoke.mjs      # TYPY_QA_URL, default http://127.0.0.1:8788
    node test/integration.mjs        # TYPY_BASE_URL, default http://127.0.0.1:8787
    node test/responsiveness.mjs     # TYPY_BASE_URL, default http://127.0.0.1:8787

The smoke script expects a **static preview**: the page and its assets served without the API, so it can check the offline paths, the mocked daily and the failed share. The other two need `npm start`.

The integration script uses the actual local backend, creates a test result, reloads its public link, checks the preview PNG, replays it, and opens the ghost race. Set TYPY_BASE_URL to test a deployment; it creates one clearly named test replay and does not submit a synthetic daily-board score.

The responsiveness script keeps normal motion enabled and checks immediate readable word transitions, idle rendering, fast spaced input in both advancement modes, and phone long-word layout. Engine tests also verify exact 100/160 WPM input streams in 30/60-second runs without changing the scoring formula.

The build bundles the HTML and static source into Worker ES modules. Commit both the authored files and generated **src/page.js** and **src/assets.js**. Deployment refuses mismatched generated files.

## Deployment

The source lives under **typy/** on the time repository's main branch, following the existing quc Worker pattern. This app needs its own backend, so it is served directly by the Worker rather than the static venture folder.

Deploy with the existing operator credentials: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and VENICE_API_KEY. Their approved locations are documented in the repository's **.github/time/SECRETS.md**. No credential belongs in this directory or in frontend code.

    # From the repository root:
    npm run build --prefix typy
    npm test --prefix typy
    # Commit and merge the tested source, then deploy from that clean checkout:
    python3 typy/deploy.py
    python3 typy/deploy.py --health

The deploy script reuses **.github/time/cloudflare.py**, uploads the committed ES modules, reuses a KV namespace named **time-typy**, and attaches **typy.lol**, **www.typy.lol** (the Worker redirects it to the apex) and the original **typy.yolopreneur.lol**. Link previews always name typy.lol. Its first upload creates the SQLite Durable Object class **QuotaGate** with migration **typy-v1**. Later uploads retain the same store and quota namespace. The operator machine needs Python and git; committed generated assets make Node unnecessary there.

Deploys are manual: no workflow deploys main or runs `npm test --prefix typy` yet. Adding one means editing `.github/workflows`, which needs a human.

The Worker returns its code revision through **/api/health**. The deployment receipt also records the exact source commit. Verify the custom domain and asset responses separately from the upload.

## Storage, privacy, and limits

- Unshared runs and pasted passages remain in the browser. Best scores, settings, and the optional display name use local storage.
- A share contains the chosen passage, relative key timing and outcome metadata, computed score, mode, and optional name, plus, for a race, the ID of the result it raced. Actual mistyped characters and input buffers are never serialized or accepted into stored results.
- Scores are recomputed on the server from replay outcomes; daily submissions must match the current canonical passage and full 60-second run. This is an informal game leaderboard, not a proof of human typing.
- KV stores one immutable result per ID, one topic per canonical slug, and separate daily-board entries. Concurrent scores do not overwrite a shared leaderboard object. A new link or board entry can take a short time to replicate between locations.
- The quota object reserves new-generation and save limits atomically. Daily defaults are eight uncached topics per visitor, 80 total, 30 saves per visitor, and 2,000 total. It also spaces new topic requests by eight seconds and saves by one second.
- Raw IP addresses are used only inside the quota object's request to derive an HMAC scoped to the UTC day. They are never persisted. Old daily hashes and counters are purged. No analytics, account, or persistent visitor cookie is added.
- Topic input and model output are screened for a general audience, normalized to plain text, and bounded. The provider uses **mistral-small-3-2-24b-instruct**, configurable through TOPIC_MODEL.
- Endless play can continue indefinitely. Replay memory is bounded to 30,000 events and 6,000 word timings. If a run exceeds that history, the local full score remains available and the incomplete replay cannot be published. Uploads are also capped at 1.5 MB.

## Scoring

WPM is net correct output characters divided by five and by elapsed minutes. Completed words include one normalized separator in either advancement mode. Deleting and retyping characters cannot inflate net output. Accuracy is correct character attempts divided by all character attempts, including mistakes and excluding navigation or correction keys.

Timed runs stop at exactly their deadline, including when a background tab resumes late. Tempo misses are measured against the original beat deadlines. The speed chart omits a zero-duration first word because no measurable typing interval exists for it.

## API

| Route | Purpose |
|---|---|
| GET /api/health | Runtime bindings and revision |
| GET /api/passage?topic=react-hooks | Cached or generated topic |
| GET /api/daily | Shared UTC-day passage |
| GET /api/board?day=YYYY-MM-DD | Daily top 50 |
| POST /api/results | Validate and publish a completed replay |
| GET /api/results/:id | Read a saved replay |
| GET /api/og/:id.png | 1200 × 630 PNG score preview |

## Acceptance evidence

**evidence/review.md** records the independent desktop/phone review and the corrected keyboard and long-word regressions. The integration receipts cover actual API persistence, public replay, ghost routing, shared daily text, and PNG rendering. Tests and review receipts distinguish mocked frontend cases from real backend checks.
