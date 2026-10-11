---
name: time
description: Set up and run Time, the GitHub-native agent factory in this repo (issues as cards, a `ready` label, a DONE line, @seat mentions, an hourly heartbeat in GitHub Actions). Use when asked to set up Time or the factory, check its status, write a card for it, tag a seat, or switch it to live.
---

# Time

GitHub is the ledger, GitHub Actions is the clock, chat is where the human plans. You (Claude Code, Cursor, or any agent with `gh`) are the hands for setup and the PM for cards.

## You are here

```
 chat ──writes──▶ issue (spec + DONE:) ──label `ready`──▶ heartbeat (hourly, Actions)
                                                              │ dry-run: comments "would dispatch"
                                                              ▼ live:    worker builds → PR
 @seat [model] [effort] in any comment ──▶ mention.yml ──▶ seat replies in thread
```

Files: `.github/workflows/{heartbeat,mention}.yml`, `.github/time/time.py` (stdlib), `.github/time/seats.json` (roster + aliases).

## Setup (idempotent; do the missing steps only)

1. `gh auth status` — must be logged in with access to this repo. If not, ask the human to run `gh auth login`.
2. Label: `gh label create ready --color 0e8a16 --description "Time picks this up on the next heartbeat" || true`
3. Variables: `gh variable set TIME_MODE --body dry-run` and `gh variable set TIME_DAILY_CAP --body 5` (skip if set: `gh variable list`).
4. Keys (repo secrets; the human pastes them, you never print or log them):
   - Seats on Venice: `gh secret set VENICE_API_KEY` (prompts for the value).
   - Worker on Cursor: `gh secret set CURSOR_API_KEY`.
   Check with `gh secret list` (names only). Missing keys are fine: seats say so in the thread.
5. Prove the clock: `gh workflow run heartbeat.yml`, then `gh run list --workflow heartbeat.yml -L 1` until it completes; it must be `success`.
6. Prove a seat: open a scratch issue whose body is `@kimi say hi in five words`; within a minute or two `github-actions[bot]` replies. Close the scratch issue.
7. Report to the human: what was already set, what you set, what is still missing (by name).

## Writing a card

An issue is a card. The heartbeat only dispatches cards that have the `ready` label **and** a `DONE:` line.

```
<what to change, as a short list>

DONE: <what finished means / where it goes next>, e.g. DONE: PR open, tests green, send to @review
```

No `DONE:` → the heartbeat asks for one instead of dispatching. Keep cards small: one PR's worth.

## Seats

`@seat [model] [effort]` anywhere in an issue, PR or comment. Up to two words after the seat are read; prose after that is ignored.

| write | runs |
|---|---|
| `@kimi` | seat default (see `seats.json`) |
| `@grok 4.7 low` | `grok-4-7`, low effort |
| `@qwen max high` | alias `max`, high effort |

Efforts: `low`, `med`, `high` (`xhigh`/`max` become `high`). Quoted lines and `code` are ignored. Bots never trigger replies.

## Going live

Only when the human says so: `gh variable set TIME_MODE --body live`. The daily cap (`TIME_DAILY_CAP`) still applies. Turning it off again is the same command with `dry-run`. Pausing everything: `gh workflow disable heartbeat.yml`.

## Rules

- Never print, echo, commit or paste a secret. Secrets go in with `gh secret set`, values typed by the human.
- Ask before: going live, raising the daily cap, or adding a self-hosted runner. A public repo must never get a self-hosted runner.
- Runner minutes: private repos get a monthly free allowance and each job rounds up to a minute. Keep the heartbeat hourly unless the human asks.
- Status questions: `gh issue list -l ready`, `gh run list -L 10`, and the latest Time comments on each card.
