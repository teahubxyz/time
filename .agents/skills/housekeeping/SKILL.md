---
name: housekeeping
description: The daily sweep of this repo: prunes merged branches, closes spent signal issues and empty milestones, records what the router's picks turned into, and lists what is stale. Use when asked what housekeeping did, why a branch or issue was closed, where the router's outcomes come from, how to run the sweep by hand, or what to do with the stale list.
---

# Housekeeping

Deterministic: `.github/time/housekeeping.py` decides, never a model. Every step is idempotent, so a second run finds nothing to do.

## Trigger

- `housekeeping.yml`: daily, a jittered minute after the Astra tick (13:13 UTC), and `workflow_dispatch`. It runs
  `python3 .github/time/housekeeping.py` with the heartbeat's env, as the `time` user.
- `TIME_MODE=live` makes it act. Anything else (the default) is a dry run: it prints `would delete ...` / `would close ...`
  in the run log and changes and comments nothing.
- By hand: Actions → housekeeping → Run workflow, or locally with `GITHUB_REPOSITORY`, `GITHUB_TOKEN`, `TIME_TOKEN` set.

## What the sweep does

1. **Branches.** Deletes every branch whose PR merged into the default branch (`time/card-*`, `ceo/*`, `labs/*`, anything
   with a merged PR; merges made through the MCP keep their head branch, Time's own merges delete it). Never the default
   branch, `gh-pages`, a protected branch, a branch with an open PR, or a branch that has commits after its merge.
2. **Signal issues.** Closes `signal` issues ("want the next version?") older than `TIME_VENTURE_MEASURE_DAYS` (default 7)
   whose venture has no signups: no 👍 from a person and no early-access issue for its slug. One closing line names the count.
   Issues with signups are left to the venture loop.
3. **Milestones.** Closes milestones with no open issues and at least one closed one. An empty, never-used milestone stays.
4. **Router outcomes.** For each card the router picked in live mode (Astra's `picked` beats), one line in
   `time/ledger/router-outcomes.jsonl` once the card closes: merged or not, its PR, days from pick to close, the spend
   booked while its worker ran, and, for a venture pick, the venture's signups at day 7. A pick whose card is still open
   waits for a later sweep, and one already in the file is never written twice. The file's fields are documented in
   `time/ledger/README.md`; Astra's log summarises it per kind over the ranked table. The data is for a learning policy
   (a restless bandit) to read later; nothing uses it to pick today.
5. **Stale list.** No action, one comment on the Astra log (#57): `needs-human` untouched for over 3 days, open PRs idle
   7 days or more, cards parked after their automatic retries, `error` cards older than 2 days. An empty list posts no comment.

Each run ends with one line on the Astra log: branches deleted, issues closed, milestones closed, picks settled, stale
count. A step that fails is logged and the others still run; the job exits 1.

## What the steward does with the stale list

Housekeeping never acts on it. Read it on #57 once a day and for each entry either:

- **`needs-human` card or PR:** decide it (merge, close, or comment `/time retry` to send it back to the worker) and remove the label.
- **Idle PR:** merge it, push it, or close it. A PR nobody wants closes; its branch goes at the next sweep.
- **Parked card:** read why it stopped, fix the card (smaller, clearer `DONE:`) or close it.
- **`error` card:** comment `/time retry`, or close it if the error is not worth another try.

## The workflow

The workflow file is the CEO's merge. It is the heartbeat's job with this step in place of `time.py heartbeat`:

```yaml
name: housekeeping
on:
  schedule:
    - cron: "17 13 * * *"   # a few minutes after the Astra tick (13:13)
  workflow_dispatch:
concurrency:
  group: housekeeping
  cancel-in-progress: false
jobs:
  sweep:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5
        with:
          sparse-checkout: .github/time
          persist-credentials: false
      - run: python3 .github/time/housekeeping.py
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TIME_TOKEN: ${{ secrets.TIME_TOKEN }}   # branch and issue writes go out as the `time` user
          TIME_MODE: ${{ vars.TIME_MODE }}
          TIME_VENTURE_MEASURE_DAYS: ${{ vars.TIME_VENTURE_MEASURE_DAYS }}
```

Tests: `python3 .github/time/test_housekeeping.py` (offline fake forge).
