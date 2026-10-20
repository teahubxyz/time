# Secrets: what, where, who uses it

Three places hold secrets. **Repo Actions secrets** (teahubxyz/time → Settings → Actions → Secrets) are write-only:
a workflow run can read them, nothing else can. **hb-5** keeps operator copies in `/Users/Shared/teahub-secrets/*.env`
for deploys run by hand from the Mac. **Boring** has its own tokens for infra tools (DNS, Fly) and never shares them.
A secret should be staged in the repo if a workflow consumes it; hb-5 copies are a convenience, not the source of truth.

| Secret | What it's for | Consumed by | Repo secret | hb-5 file |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | Claude seats (plan / build / review) | venture.yml, venture-loop.yml, doctor.yml, mention.yml, housekeeping.yml | yes | anthropic.env |
| `VENICE_API_KEY` | Venice seats; **the shared inference worker's key** (chat, ACE-Step, images) | doctor.yml, venture*.yml, **inference.yml** | yes | venice.env |
| `RUNWARE_API_KEY` | Runware ACE-Step behind `/v1/render` on the inference worker (optional; Venice otherwise) | **inference.yml** | stage it | — |
| `CLOUDFLARE_API_TOKEN` | Writes Workers + KV: deploys the inference worker and per-venture backends. Workers-scoped (no D1). Needed on **every** deploy, not stored in the worker | **inference.yml**, venture*.yml (optional), doctor.yml, labs-aicharts.yml | **missing** (workflows read it as empty) | cloudflare-workers.env |
| `CLOUDFLARE_ACCOUNT_ID` | Which Cloudflare account (`dac3b11890319628eb5cd761445b63ee`); not secret | same as the token; inference.yml defaults it | optional | inference-deploy.sh |
| `TIME_TOKEN` | The `time` bot: opens and merges PRs (Actions identity can't) | venture*.yml, housekeeping.yml | yes | — |
| `TIME_SEAT_*` | Per-seat key overrides (claude/haiku/sonnet/opus/fable) | venture*.yml | optional | — |
| `CURSOR_API_KEY` | Cursor cloud agent as worker | venture.yml, doctor.yml | optional | — |
| `SYNC_GITHUB_TOKEN`, `SYNC_GITHUB_KEY` | Mirror to GitHub | sync.yml | yes | — |
| `GITHUB_TOKEN` | Gitea's per-run token, automatic | everything | automatic | — |

Variables (not secret, Settings → Actions → Variables): `TIME_VENTURE_DOMAIN` = `yolopreneur.lol` (inference.yml defaults it),
`TIME_MODE`, `TIME_WORKER`, `TIME_REVIEW`, `TIME_AUTOMERGE`, `TIME_DAILY_*`, `TIME_VENTURE_*`.

Worker secrets (inside Cloudflare, written at deploy): `VENICE_API_KEY`, `RUNWARE_API_KEY`. The pages never see any key;
they call `inference.<domain>` with an `x-app` header from an allowed origin (`.github/time/cloudflare/inference.js`).

Elsewhere: Boring holds its own Cloudflare (DNS/zones) and Fly tokens; the pages server (`green-tea-pages`) holds a read
token for gh-pages; `claude-code.env` on hb-5 is the operator's Claude Code OAuth token. None of these are repo secrets.

To deploy the inference worker: Actions → inference → Run workflow (needs `CLOUDFLARE_API_TOKEN` + `VENICE_API_KEY`,
`RUNWARE_API_KEY` optional), or from hb-5 `sh ~/scratch/inference-deploy.sh` (reads the env files above).
