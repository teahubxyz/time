# time

The clock for a GitHub-native agent factory: GitHub is the ledger, GitHub-hosted runners are Time, chat is where you plan.

- **Mentions** (`mention.yml`): write `@kimi`, `@grok 4.7`, `@qwen max high` in an issue, PR or comment and that seat replies in the thread. Seats and aliases: `.github/time/seats.json`.
- **Heartbeat** (`heartbeat.yml`): every hour, open issues labelled `ready` get picked up. An issue needs a `DONE:` line (what finished means, e.g. `DONE: send to @review`). Dry-run until the repo variable `TIME_MODE` is `live`; at most `TIME_DAILY_CAP` (default 5) dispatches a day.

Brains run on Venice (`VENICE_API_KEY` repo secret). Comments Time posts never trigger another run.
