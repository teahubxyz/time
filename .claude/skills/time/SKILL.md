---
name: time
description: Set up and run Time, the GitHub-native agent factory in this repo (issues as cards, a `ready` label, a DONE line, a Cursor cloud agent as the worker, @seat mentions, an hourly heartbeat in GitHub Actions). Use when asked to set up Time or the factory, connect Cursor, check its status, write a card, tag a seat, or switch it to live.
---

# Time

GitHub is the ledger, GitHub Actions is the clock, a Cursor cloud agent is the worker, chat is where the human plans.
You (Claude Code, Cursor, or any agent with `gh`) are the hands for setup and the PM for cards.

## You are here

```
 chat ─writes─▶ card = issue (spec + DONE:) ─label `ready`─▶ heartbeat (on label + hourly)
                                                              │
   dry-run ◀─────────── TIME_MODE ───────────▶ live           ▼
   "would dispatch"                     Cursor cloud agent ─▶ PR "Closes #N"
                                                              │ next heartbeat finds it
                                                              ▼
                                        review (TIME_REVIEW): Cursor model | Venice seat | off
 @seat [model] [effort] in any comment ─▶ mention.yml ─▶ seat replies in the thread (Venice)
```

Card states (Time's comments on the issue): `would-dispatch` → `dispatched` → `pr` · side states `needs-done`, `stuck`, `blocked` (a key is missing; resumes by itself once added), `error` (comment `/time retry`).

Files: `.github/workflows/{heartbeat,mention,doctor}.yml`, `.github/time/time.py` (stdlib), `.github/time/seats.json`, `.github/time/test_time.py` (offline tests).

## Setup (idempotent; do only what's missing)

1. `gh auth status` — logged in with admin on this repo. If not: ask the human to run `gh auth login`.
2. Label: `gh label create ready --color 0e8a16 --description "Time picks this up on the next heartbeat" || true`
3. Settings (`gh variable list` first; set only missing ones):
   - `gh variable set TIME_MODE --body dry-run`
   - `gh variable set TIME_DAILY_CAP --body 5` — max agent launches per day
   - optional `TIME_CURSOR_MODEL` (worker model id; unset = Cursor's default), `TIME_REVIEW`, `TIME_STUCK_HOURS` (default 6)
4. Cursor (the worker):
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

## Going live

Only when the human says so: `gh variable set TIME_MODE --body live`. The daily cap still applies. Back to `dry-run` the same way. Stop everything: `gh workflow disable heartbeat.yml`.

## Rules

- Never print, echo, commit or paste a secret. Secrets go in with `gh secret set`, values typed by the human.
- Ask before: going live, raising the daily cap, changing the heartbeat schedule, adding a self-hosted runner. A public repo must never get a self-hosted runner.
- Runner minutes: private repos have a monthly free allowance, each job rounds up to a minute; keep the heartbeat hourly unless asked. Cursor agent runs bill to the human's Cursor plan.
- Changed `time.py`? Run `python3 .github/time/test_time.py` before committing.
- Status: `gh issue list -l ready`, `gh run list -L 10`, and the latest Time comment on each card.
