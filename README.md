# time

A GitHub-native agent factory. GitHub is the ledger, GitHub-hosted runners are the clock (Time), the worker is a Venice seat with hands or a Cursor cloud agent, and chat is where you plan.

- **Cards**: an issue with a `DONE:` line, labelled `ready`.
- **Heartbeat** (`heartbeat.yml`, hourly and whenever a card is labelled `ready`): moves cards forward. In `dry-run` (default) it only says what it would do; with `TIME_MODE=live` it dispatches each card to the worker (`TIME_WORKER`: a Venice seat such as `venice:kimi`, which edits the repo and opens the PR itself, or a Cursor cloud agent), which opens a PR that closes the card. An optional reviewer (`TIME_REVIEW`) checks the PR. At most `TIME_DAILY_CAP` launches a day.
- **Mentions** (`mention.yml`): `@kimi`, `@grok 4.7`, `@qwen max high` in any issue, PR or comment gets that seat's reply (Venice).
- **Hands-off** (`TIME_AUTOMERGE=on`): label an issue `spec` and Time splits it into cards that run one at a time. A card's PR merges itself once the reviewer approves and checks are green, then the next card starts. Objections, red checks and protected paths (workflows, deploy, secrets) go to a human.
- **Venture loop** (`venture.yml`, every 20 min once `TIME_VENTURE=on`): one venture card a day. It scouts the repos that gained the most stars this week; seats pitch; the board votes (Borda, quorum of two); every board seat writes a launch plan (positioning, first users, pricing, channels, 7-day success and kill lines) and one seat synthesizes them into `LAUNCH.md`; the worker builds a launch page around a working product on `gh-pages` in its own design direction; deterministic checks and headless Chrome (phone and desktop) gate it, with two fix rounds before an andon; GitHub Pages ships it at `/ventures/<slug>/`. Signups go through an issue form (`.github/ISSUE_TEMPLATE/early-access.yml`), each one thanked on its issue; after 7 days the count of distinct people decides: build v2, kill, or watch a week more. The studio index lives at `/ventures/`. Launch posts are drafts for a human; nothing is posted outside the repo.
- **Doctor** (`doctor.yml`, manual): runs the tests and checks label, settings and keys.
- **Update** (`update.yml`, weekly or manual): opens a PR with the latest engine from teahubxyz/time, so every project stays on one Time instead of drifting copies.

## Setup

Open this repo in Claude Code or Cursor and say "set up Time". The agent follows `.claude/skills/time/SKILL.md`. You'll be asked to install Cursor's GitHub app on the repo and to paste your Cursor API key into `gh secret set CURSOR_API_KEY`.

## Status

For changes and release history, see [CHANGELOG.md](CHANGELOG.md).