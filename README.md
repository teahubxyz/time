# time

A GitHub-native agent factory. GitHub is the ledger, GitHub-hosted runners are the clock (Time), a Cursor cloud agent is the worker, and chat is where you plan.

- **Cards**: an issue with a `DONE:` line, labelled `ready`.
- **Heartbeat** (`heartbeat.yml`, hourly): moves cards forward. In `dry-run` (default) it only says what it would do; with `TIME_MODE=live` it dispatches each card to a Cursor cloud agent, which opens a PR that closes the card. An optional reviewer (`TIME_REVIEW`) checks the PR. At most `TIME_DAILY_CAP` launches a day.
- **Mentions** (`mention.yml`): `@kimi`, `@grok 4.7`, `@qwen max high` in any issue, PR or comment gets that seat's reply (Venice).
- **Doctor** (`doctor.yml`, manual): runs the tests and checks label, settings and keys.

## Setup

Open this repo in Claude Code or Cursor and say "set up Time". The agent follows `.claude/skills/time/SKILL.md`. You'll be asked to install Cursor's GitHub app on the repo and to paste your Cursor API key into `gh secret set CURSOR_API_KEY`.
