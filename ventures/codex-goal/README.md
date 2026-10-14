# codex-goal

A tiny wrapper that remembers one objective per project across separate
`codex exec` invocations, and injects it as plain user-context text every
time you run or resume. Inspired by
[openai/codex#26966: Persist goals across codex exec sessions](https://github.com/openai/codex/issues/26966),
closed as not planned. This is **external memory bolted onto the outside of
Codex**, not a native goal mode: Codex itself is never changed, and never
gets an API to mark the goal "done" or rewrite it.

## Problem

`codex exec` is stateless about *why* you're running it. Resume brings back
the transcript, but nothing re-states the objective, so a long-running or
multi-session task slowly drifts as context gets summarized away. Upstream
closed the feature request; this reconstructs it from outside the agent.

## Install

Requires Python 3.9+, a POSIX host (macOS/Linux — matches the board's hb-5
Mac and Colima container targets), and the `codex` CLI on `PATH` for real
use. No pip install, no dependencies:

```sh
cp codex_goal.py ~/bin/codex_goal.py   # or run it in place
chmod +x codex_goal.py
```

## Usage

```sh
# Save (or replace) the objective for the current directory's project.
codex_goal.py set "Migrate the billing module to the new schema, keep tests green"

# Inspect it any time.
codex_goal.py show
codex_goal.py show --json --history

# Start a new codex exec session with the goal injected as user context.
codex_goal.py run

# Resume the most recent session -- goal is re-injected, not just the transcript.
codex_goal.py run --last

# Resume a specific session id, and forward real codex flags/an extra prompt.
codex_goal.py run --resume 3fae2b1e-... -- -s workspace-write "focus on the invoices table next"
```

Everything after `run`'s own flags is forwarded to `codex exec` (or
`codex exec resume ...`) untouched and in order — sandbox mode, model,
`-C`, etc. all still work exactly as they do calling `codex` directly.
A trailing bare argument (not starting with `-`) is treated as this turn's
extra instruction and appended after the injected goal; everything else is
passed straight through.

`-C DIR` (default: cwd) on any subcommand selects the project. The project
key is a hash of its realpath, so `set`/`show`/`run` keep working no matter
which subdirectory you're standing in, and two projects never collide.

## How persistence works

- State lives under `$CODEX_GOAL_HOME` (default `~/.codex-goal`), **outside**
  whatever directory `codex exec`'s sandbox would let the agent write to.
  Codex running in its default `workspace-write` sandbox cannot see or
  modify its own goal file — `set` is a human-run command, never something
  the wrapper calls on Codex's behalf.
- Goal records are versioned: each `set` pushes the previous value into a
  capped history (50 entries) instead of overwriting it silently.
- Writes are atomic (`tempfile` + `os.replace`) and guarded by an exclusive
  file lock (`fcntl.flock`) around the whole read-modify-write, so a crash
  or a concurrent `set` can't leave a half-written or torn JSON file.
- `run` never modifies the goal. It only appends one line to a separate
  run-log (`$CODEX_GOAL_HOME/runs/<key>.jsonl`) *after* the child process
  exits, recording the mode, a goal preview, the exact argv, and the real
  exit code. A run that crashes mid-flight (killed, SIGKILL, power loss)
  leaves both the goal and the prior run-log lines untouched — there is no
  "mark this goal complete" affordance for Codex or the wrapper to call, so
  nothing can silently clear it.
- Codex is spawned via `subprocess.Popen([...])` with an argv list, never a
  shell string — a goal containing `; rm -rf / #` is passed as one opaque
  argv element, not executed. The child gets its own process group, and
  `SIGINT`/`SIGTERM` sent to the wrapper are forwarded to it, so Ctrl-C
  cancels a run the same way it would cancel `codex` directly. The
  wrapper's own exit code is the child's exit code.

## Limits and trust

- One objective per project at a time. It is not a task list, not a
  scheduler, and it does not talk to the Codex API directly — it only
  shells out to the `codex` binary you already have configured and
  authenticated.
- The injected text is plain, visible user context ("[codex-goal] Persisted
  objective...") — it carries no special authority inside Codex's own
  permission model. A model can still choose to ignore it, same as any
  other instruction.
- No enforcement that the agent is *actually* working the stated goal; this
  only guarantees the goal text is faithfully re-presented every run. It
  does not inspect diffs, run checks, or grade progress — see
  [finishline-supervisor](../finishline-supervisor/) for that kind of
  evidence wrapper, which composes with this one but is a separate tool.
- `$CODEX_GOAL_HOME` is trusted local storage with your own file
  permissions; this tool adds no encryption or extra access control. Don't
  put secrets in goal text — it is written to disk in plain JSON.
- Locking is advisory (`flock`) and local-filesystem only; it does not work
  over NFS/SMB and does not coordinate across machines.
- `run` passes through whatever `codex exec` flags you give it, including
  `--dangerously-bypass-approvals-and-sandbox` if you ask for it — this
  wrapper does not add or remove any safety behavior from Codex itself.

## Develop and verify

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 demo.py > demo.txt   # recorded, runnable, no network/auth needed
```

Tests and the demo use `tests/fake_codex.py`, a deterministic stand-in for
the real `codex` binary (records the exact argv it received, exits with a
configurable code, optionally sleeps so cancellation can be tested) — no
model calls, no API key, nothing billed, per the board's preference for
deterministic, cheap, inspectable checks over live model calls. [Recorded
demo output](demo.txt) covers: `set`/`show` round trip, run 1 (fresh
session), run 2 (`--last` resume, same goal), and a `kill -9` mid-run
followed by a `show` proving the goal survived byte-for-byte.

Verified: all 16 unit tests plus the demo on the local macOS (hb-5) host,
and inside the project's Colima Linux container (same Python 3, same
`tests/fake_codex.py`, no code changes needed — the tool has no
platform-specific dependency beyond POSIX `fcntl`/process groups). Real
`codex` binary integration (the actual CLI shown in Usage above) was
exercised manually against the installed `codex` CLI's `--help` output to
confirm the `exec`/`exec resume --last`/flag-forwarding argv shape this
wrapper builds matches the real CLI; it was not run against a live Codex
backend (that needs your own account/auth and would spend real requests).
