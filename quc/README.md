# quc

Hand an agent your repo, sit in the chair, watch. Live at https://quc.yolopreneur.lol/ (spec: teahubxyz/time#220).

One Cloudflare Worker, no dependencies, no build step. `npm start` serves it on :8787 (offline answers unless `VENICE_API_KEY`
is set), `npm test` runs the tests, `npm run deploy` deploys (needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and
`VENICE_API_KEY` for real models) and waits for `/api/health`.

## How a run works

1. **Start**: a public GitHub URL and one line of task. One run at a time per visitor (a cookie), 5 runs a day each, 300 a
   day in all (`RUNS_PER_DAY`, `RUNS_PER_DAY_ALL`).
2. **The cage**: quc downloads the repo's tarball from GitHub and keeps the readable text files (caps: 15 MB download, 2,000
   files, 40 KB a file, 4 files changed, 10 minutes). Nothing from the repo is executed, and nothing is pushed anywhere.
3. **Steps**: the chair page calls `POST /api/runs/:id/step` again and again; each call does one thing (clone, plan, rewrite
   one file, wrap up), so every request stays short. A coding model (`CODER_MODEL`, default Qwen3 Coder via Venice) plans and
   rewrites whole files; Grok (`PERSONA_MODEL`, default `grok-4-3` via Venice) narrates. Diffs, commits and commentary are
   appended to the run's event log.
4. **The chair**: the page shows the commentary and the diffs, read-only. Only the owner sees the safeword and the box.
5. **Safeword**: ends the run at once and throws the edits away (the replay still shows what happened).
6. **Magic words** (typed in the box, matched loosely; the persona drops hints, so keep them out of marketing copy):
   1. "may I say something": notes. Anything typed after this is passed to the agent as a note.
   2. "not that one": vetoes. Type a file's path and the agent reverts and skips it.
   3. "my repo, my rules": takes the wheel. The run ends as `unlocked` and the patch is yours.
   Anything else gets mocked.
7. **Replay**: the same URL, for anyone: a scrubber over every event, plus the aftermath card and the patch download.

Storage is a KV namespace (`time-quc`): `run:<id>`, `events:<id>`, `work:<id>` (repo text and edits), `active:<visitor>`,
`cap:<day>:*`, `lock:<id>`. KV is eventually consistent and has no compare-and-set; a Durable Object per run is the upgrade
when that matters.

## Pipeline

`.github/workflows/quc.yml` deploys on pushes to `quc/**` on main, and `ci.yml` runs `npm test --prefix quc` on PRs.
