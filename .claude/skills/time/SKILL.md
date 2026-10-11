---
name: time
description: Set up and run Time, the GitHub-native agent factory in this repo (a spec becomes cards, a worker (a Venice seat with hands, or a Cursor cloud agent) builds each one, a reviewer approves, Time merges on green and starts the next card; @seat mentions; an hourly heartbeat in GitHub Actions). Use when asked to set up Time or the factory, connect Cursor, check its status, write a spec or a card, tag a seat, switch it to live or hands-off, or update Time.
---

# Time

GitHub is the ledger, GitHub Actions is the clock, a Cursor cloud agent is the worker, chat is where the human plans.
You (Claude Code, Cursor, or any agent with `gh`) are the hands for setup and the PM for cards.

## You are here

```
 chat ─writes─▶ spec issue ─label `spec`─▶ planner ─▶ cards (`queued`, one PR each, in order)
                                                      │ first unblocked card gets `ready`
 chat ─writes─▶ card = issue (spec + DONE:) ─label `ready`─▶ heartbeat (on label + hourly)
                                                              │
   dry-run ◀─────────── TIME_MODE ───────────▶ live           ▼
   "would dispatch"                     Cursor cloud agent ─▶ PR "Closes #N"
                                                              │ next heartbeat finds it
                                                              ▼
                                        review (TIME_REVIEW): Cursor model | Venice seat | off
                                                              │ TIME_AUTOMERGE=on
                         Approve + checks green ─▶ squash merge ─▶ next `queued` card gets `ready`
                         Object · protected path · red checks ─▶ `needs-human`
 @seat [model] [effort] in any comment ─▶ mention.yml ─▶ seat replies in the thread (Venice)
```

Card states (Time's comments on the issue): `would-dispatch` → `dispatched` → `pr` → `merged` · landing states `needs-human`, `no-checks`, `checks-failed` · side states `needs-done`, `stuck`, `blocked` (a key is missing; resumes by itself once added), `error` (comment `/time retry`).

Files: `.github/workflows/{heartbeat,mention,doctor,update}.yml`, `.github/time/time.py` (stdlib), `.github/time/seats.json`, `.github/time/test_time.py` (offline tests).

## Setup (idempotent; do only what's missing)

1. `gh auth status` — logged in with admin on this repo. If not: ask the human to run `gh auth login`.
2. Labels: `gh label create ready --color 0e8a16 --description "Time picks this up on the next heartbeat" || true`, and for hands-off mode `gh label create spec --color 5319e7 || true; gh label create queued --color c5def5 || true; gh label create planned --color ededed || true; gh label create needs-human --color d93f0b || true`
3. Settings (`gh variable list` first; set only missing ones):
   - `gh variable set TIME_MODE --body dry-run`
   - `gh variable set TIME_DAILY_CAP --body 5` — max agent launches per day
   - `TIME_WORKER`: `cursor` (default) or `venice:<seat> [model] [effort]`, e.g. `venice:kimi code`. A Venice seat needs only `VENICE_API_KEY`: it reads and writes the repo on branch `time/card-N` through the GitHub API, runs tests on the runner, and opens the PR itself. Workflow files are refused to it.
   - optional `TIME_CURSOR_MODEL` (Cursor worker model id), `TIME_REVIEW`, `TIME_STUCK_HOURS` (default 6), `TIME_WORKER_STEPS` (default 40 tool calls per card), `TIME_WORKER_FALLBACK` (default `grok build`: takes over when the worker's model stays overloaded; `off` to disable), `TIME_WORKER_MAX_TOKENS` (default 16000)
4. Cursor (the worker, only when `TIME_WORKER` is `cursor`):
   - The human installs Cursor's GitHub app on this repo (Cursor dashboard → Integrations → GitHub). Cloud agents can't clone or open PRs without it. You can't check this from `gh`; ask them to confirm.
   - The human creates an API key (Cursor dashboard → API Keys) and stores it: `gh secret set CURSOR_API_KEY` (they paste the value at the prompt).
5. Optional, seats on Venice: `gh secret set VENICE_API_KEY`. Without it, `@seat` mentions reply that the key is missing.
6. Check: `gh workflow run doctor.yml`, wait for `gh run list --workflow doctor.yml -L 1` to finish, then read it with `gh run view --log` (or the run summary). It runs the offline tests, then checks the label, settings and keys, and lists the Cursor models the key can use. Use one of those ids for `TIME_CURSOR_MODEL` or a `cursor:<id>` reviewer.
7. Prove the clock in dry-run: make a small card (below) with the `ready` label, run `gh workflow run heartbeat.yml`, and confirm Time comments "would dispatch".
8. Report to the human: what was already set, what you set, what's still missing (by name), and that it's in dry-run.

## Working from Cursor

The human can run everything from Cursor's chat in this repo:
- "Make a card for X" → you write the issue (`gh issue create --title ... --body ...` with a `DONE:` line) and add `--label ready` once they agree. Labelling `ready` starts the heartbeat within about a minute; in live mode that launches the cloud agent.
- "What's in flight?" → `gh issue list -l ready` plus the latest Time comment on each card, and `gh pr list`.
- When the PR appears, review it with them here (`gh pr diff N`, `gh pr checkout N`) and merge when they say so.
- One-off work that doesn't need a card can still go straight to Cursor's own Cloud agents from the Cursor UI; cards are for work that should have a finish line, a review and a place in the log.

## Writing a card

```
<what to change, as a short list; one PR's worth>

DONE: <what finished means>, e.g. DONE: PR open, tests green
```

Label it `ready`. No `DONE:` line → Time asks for one instead of dispatching. The worker is told to open a PR containing `Closes #N`; that's how Time links the PR back.

## Review

`TIME_REVIEW` (repo variable):
- `off` (default)
- `cursor:<model id>` — a second Cursor agent, on a different model, reviews the PR without pushing (uses one launch from the daily cap)
- `venice:<seat> [model] [effort]`, e.g. `venice:kimi` or `venice:grok 4.7 high` — that seat posts its review on the PR

## Seats

`@seat [model] [effort]` anywhere in an issue, PR or comment: `@kimi`, `@grok 4.7 low`, `@qwen max high`. Roster and aliases in `seats.json`. Efforts: `low`, `med`, `high`. Quoted lines and `code` are ignored; bots never trigger replies.

Not a Time seat: `@cursor`. If Cursor's GitHub app is installed, `@cursor` in a comment is Cursor's own integration and it answers directly.

## Hands-off: spec in, merged work out

1. CI: the project needs at least one check on pull requests (tests or lint). Without checks Time won't merge
   (`TIME_REQUIRE_CHECKS=off` overrides, not recommended). Add `.github/workflows/ci.yml` for the project's stack.
2. A reviewer: `gh variable set TIME_REVIEW --body cursor:<model id>` (or `venice:kimi`).
3. `gh variable set TIME_AUTOMERGE --body on`. Time squash-merges a card's PR when the reviewer's latest verdict is
   Approve and every check is green, then gives `ready` to the next card. Approve/Object counts from bots and from the
   repo's owner, members and collaborators only.
4. Human gate: PRs touching `TIME_PROTECTED` paths (default `.github/,deploy,infra/,.env,secret`) are never merged by
   Time; they get `needs-human`. So are PRs the reviewer objects to.
5. Specs: write an issue, label it `spec`. One card per line, `- title — DONE: what finished means`, or `### title`
   sections that contain a `DONE:` line. Time creates `queued` cards that run one at a time (`TIME_PARALLEL`, default 1).
   A spec that isn't card-shaped is split by a seat when `VENICE_API_KEY` is set (`TIME_PLANNER`, default kimi).

## Updating Time

The engine lives centrally in teahubxyz/time. `update.yml` (weekly, or `gh workflow run update.yml`) opens a PR with
the latest `time.py`, tests, seats and this skill from `TIME_UPSTREAM`@`TIME_CHANNEL` (default `main`; pin a tag
for stability). Actions can't edit workflow files, so the PR lists any that changed for you to copy. Improvements go
to teahubxyz/time as PRs so every project gets them. Needs "Allow GitHub Actions to create pull requests" on.

## Going live

Only when the human says so: `gh variable set TIME_MODE --body live`. The daily cap still applies. Back to `dry-run` the same way. Stop everything: `gh workflow disable heartbeat.yml`.

## Rules

- Never print, echo, commit or paste a secret. Secrets go in with `gh secret set`, values typed by the human.
- Ask before: going live, turning on auto-merge, raising the daily cap, changing the heartbeat schedule, adding a self-hosted runner. A public repo must never get a self-hosted runner.
- Runner minutes: private repos have a monthly free allowance, each job rounds up to a minute; keep the heartbeat hourly unless asked. Cursor agent runs bill to the human's Cursor plan.
- Changed `time.py`? Run `python3 .github/time/test_time.py` before committing.
- Status: `gh issue list -l ready`, `gh run list -L 10`, and the latest Time comment on each card.

## Ventures (optional)

`gh variable set TIME_VENTURE --body on` starts the venture loop (`venture.yml`, every 20 minutes): one venture card a day, from the repos trending on GitHub to a launch page on GitHub Pages. Seats pitch, the board votes, board seats write launch plans that one seat synthesizes into `LAUNCH.md`, the worker builds the page on `gh-pages`, deterministic checks and headless Chrome gate it, and seven days of signups decide (v2, kill, or one more week). It needs `VENICE_API_KEY`; the loop creates the `gh-pages` branch, the Pages site and the `signup` label if it can.
- Signups come in through the issue form `.github/ISSUE_TEMPLATE/early-access.yml` (label `signup`); the loop thanks each one on its issue. A signup is a distinct GitHub account (not the owner, not a bot) that opened an early-access issue or 👍'd the venture's signal issue.
- Settings: `TIME_VENTURE_PITCH`, `TIME_VENTURE_BOARD` (comma-separated seats), `TIME_VENTURE_CHAIR` (synthesizes the launch plans), `TIME_VENTURE_MEASURE_DAYS` (default 7).
- A page that still fails its checks after two fix rounds gets `needs-human`: fix it on `gh-pages` and comment `/time retry` on the card. A Venice outage only makes a stage wait; it never closes a card.
- The studio index is generated at `/ventures/` from `ventures/ventures.json`; launch posts are drafts on the card, never sent.
