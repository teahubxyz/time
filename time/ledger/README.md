# Spend ledger

Time keeps a record of what it spends on models. This folder holds it.

- **One file per month:** `time/ledger/<YYYY-MM>.jsonl`, for example `2026-10.jsonl`.
- **One JSON line per model call.** Fields:
  - `at`: when the call was made, ISO 8601 in UTC (`2026-10-14T09:30:00Z`).
  - `model`: the model that was called.
  - `in`: input (prompt) tokens.
  - `out`: output (completion) tokens.
  - `usd`: the cost in US dollars, or `null` if the seat has no price (unpriced seats).

Example line:

```json
{"at":"2026-10-14T09:30:00Z","model":"some-model","in":1200,"out":350,"usd":0.0123}
```

## Who writes and reads it

- **Written by Time itself.** At the end of each run, Time appends that run's calls to the current month's file in one `ledger:` commit.
- **Read before every model call.** Whichever workflow is about to call a model (heartbeat, mentions, venture loop, Astra) adds up `usd` for today and for the month and refuses the call if either total has reached its cap (`TIME_DAILY_USD`, `TIME_MONTHLY_USD`). A `null` counts as zero.

## When a cap trips

Time stops calling models. The next time the heartbeat has a card to run, it opens one issue labelled `andon` (never a second while that one is open). A monthly cap also switches `TIME_MODE` to `dry-run`, or says in the issue that it couldn't, until a human raises the cap. A daily cap clears itself at midnight UTC. Close the issue once it is handled.

## Don't edit it by hand

Humans should never edit these files. The caps rely on them being exact, and Time only ever appends. A hand edit can hide spend or break the next append.
