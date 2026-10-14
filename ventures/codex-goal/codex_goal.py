#!/usr/bin/env python3
"""codex-goal: persist a per-project objective across `codex exec` sessions.

External memory, not native Codex state: it stores the goal outside the
directory Codex is allowed to write to, and injects it as plain user-context
text on every `set`/`show`/`run` the human runs. Codex itself never sees a
"mark complete" affordance -- only `set` can change the stored goal, and
`set` is never invoked by codex-goal's own `run` command.

Usage:
  codex_goal.py set   [-C DIR] GOAL_TEXT...
  codex_goal.py show  [-C DIR] [--json] [--history]
  codex_goal.py run   [-C DIR] [--codex-bin PATH] [--resume ID | --last]
                       [--dry-run] [-- CODEX_ARGS... [PROMPT]]
"""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import uuid

try:
    import fcntl
except ImportError:  # pragma: no cover - POSIX only, matches board brief hosts
    fcntl = None

SCHEMA_VERSION = 1
MAX_GOAL_CHARS = 4000
MAX_HISTORY = 50
ENV_HOME = "CODEX_GOAL_HOME"


def state_home() -> str:
    override = os.environ.get(ENV_HOME)
    if override:
        return override
    return os.path.join(os.path.expanduser("~"), ".codex-goal")


def project_key(project_dir: str) -> str:
    real = os.path.realpath(project_dir)
    digest = hashlib.sha256(real.encode("utf-8")).hexdigest()[:16]
    base = os.path.basename(real.rstrip("/")) or "root"
    safe_base = "".join(c if c.isalnum() or c in "-_." else "-" for c in base)
    return f"{safe_base}-{digest}"


def goal_path(home: str, key: str) -> str:
    return os.path.join(home, "goals", f"{key}.json")


def runlog_path(home: str, key: str) -> str:
    return os.path.join(home, "runs", f"{key}.jsonl")


def lock_path(home: str, key: str) -> str:
    return os.path.join(home, "locks", f"{key}.lock")


@contextlib.contextmanager
def locked(home: str, key: str):
    """Exclusive file lock guarding read-modify-write of one project's state."""
    path = lock_path(home, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fh = open(path, "a+")
    try:
        if fcntl is not None:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        if fcntl is not None:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        fh.close()


def atomic_write_json(path: str, payload: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "w") as fh:
            json.dump(payload, fh, indent=2, sort_keys=True)
            fh.write("\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)  # atomic on POSIX: a reader never sees a partial file
    except Exception:
        with contextlib.suppress(OSError):
            os.remove(tmp)
        raise


def append_jsonl(path: str, record: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    line = json.dumps(record, sort_keys=True) + "\n"
    with open(path, "a") as fh:
        fh.write(line)
        fh.flush()
        os.fsync(fh.fileno())


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def load_state(path: str) -> dict | None:
    if not os.path.exists(path):
        return None
    with open(path) as fh:
        return json.load(fh)


def cmd_set(args: argparse.Namespace) -> int:
    text = " ".join(args.goal).strip()
    if not text:
        print("codex-goal: refusing an empty goal", file=sys.stderr)
        return 2
    if len(text) > MAX_GOAL_CHARS:
        print(f"codex-goal: goal exceeds {MAX_GOAL_CHARS} characters", file=sys.stderr)
        return 2

    home = state_home()
    key = project_key(args.project)
    path = goal_path(home, key)

    with locked(home, key):
        state = load_state(path)
        ts = now_iso()
        if state is None:
            state = {
                "schema_version": SCHEMA_VERSION,
                "project": {"path": os.path.realpath(args.project), "key": key},
                "current": None,
                "history": [],
            }
        if state["current"] is not None:
            state["history"].append(state["current"])
            state["history"] = state["history"][-MAX_HISTORY:]
        state["current"] = {
            "goal_id": f"g-{uuid.uuid4().hex[:12]}",
            "text": text,
            "created_at": ts,
            "updated_at": ts,
        }
        atomic_write_json(path, state)

    print(f"codex-goal: saved goal {state['current']['goal_id']} for {key}")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    home = state_home()
    key = project_key(args.project)
    state = load_state(goal_path(home, key))

    if state is None or state.get("current") is None:
        if args.json:
            print(json.dumps({"project_key": key, "current": None}))
        else:
            print(f"codex-goal: no goal set for {key}. Run: codex_goal.py set <goal>")
        return 1

    if args.json:
        payload = {"project_key": key, "current": state["current"]}
        if args.history:
            payload["history"] = state["history"]
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        cur = state["current"]
        print(f"project   {key}")
        print(f"goal_id   {cur['goal_id']}")
        print(f"updated   {cur['updated_at']}")
        print(f"text      {cur['text']}")
        if args.history and state["history"]:
            print("\nhistory (oldest first):")
            for h in state["history"]:
                print(f"  - [{h['updated_at']}] {h['goal_id']}: {h['text']}")
    return 0


INJECT_HEADER = "[codex-goal] Persisted objective for this project (external memory, injected by a wrapper -- not native Codex state):"
INJECT_FOOTER = "[/codex-goal] Continue working toward the objective above unless the user says otherwise."


def build_prompt(goal_text: str, extra_prompt: str | None) -> str:
    block = f"{INJECT_HEADER}\n{goal_text}\n{INJECT_FOOTER}"
    if extra_prompt:
        return f"{block}\n\n{extra_prompt}"
    return block


def cmd_run(args: argparse.Namespace) -> int:
    home = state_home()
    key = project_key(args.project)
    state = load_state(goal_path(home, key))
    if state is None or state.get("current") is None:
        print(f"codex-goal: no goal set for {key}. Run: codex_goal.py set <goal>", file=sys.stderr)
        return 2

    goal = state["current"]
    passthrough = list(args.codex_args)
    extra_prompt = None
    if passthrough and not passthrough[-1].startswith("-"):
        # Last bare token (if any) is the user's extra instruction for this turn;
        # everything else is forwarded to `codex exec` untouched.
        extra_prompt = passthrough.pop()

    prompt = build_prompt(goal["text"], extra_prompt)

    argv = [args.codex_bin, "exec"]
    mode = "new"
    session_arg = None
    if args.resume or args.last:
        argv.append("resume")
        mode = "resume"
        if args.last:
            argv.append("--last")
            session_arg = "last"
        else:
            argv.append(args.resume)
            session_arg = args.resume
    argv.extend(passthrough)
    argv.append(prompt)

    if args.dry_run:
        print(json.dumps({"argv": argv, "mode": mode}, indent=2))
        return 0

    record = {
        "ts": now_iso(),
        "mode": mode,
        "session_arg": session_arg,
        "goal_id": goal["goal_id"],
        "goal_preview": goal["text"][:120],
        "argv": argv,
    }

    try:
        proc = subprocess.Popen(argv, start_new_session=True)
    except FileNotFoundError:
        print(f"codex-goal: codex binary not found: {args.codex_bin}", file=sys.stderr)
        record["exit_code"] = 127
        append_jsonl(runlog_path(home, key), record)
        return 127

    def forward_signal(signum, _frame):
        with contextlib.suppress(ProcessLookupError):
            os.killpg(proc.pid, signum)

    old_sigint = signal.signal(signal.SIGINT, forward_signal)
    old_sigterm = signal.signal(signal.SIGTERM, forward_signal)
    try:
        exit_code = proc.wait()
    finally:
        signal.signal(signal.SIGINT, old_sigint)
        signal.signal(signal.SIGTERM, old_sigterm)

    record["exit_code"] = exit_code
    append_jsonl(runlog_path(home, key), record)
    return exit_code


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="codex_goal.py", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("-C", "--project", default=os.getcwd(), help="project directory (default: cwd)")

    p_set = sub.add_parser("set", parents=[common], help="save/replace the goal for this project")
    p_set.add_argument("goal", nargs="+", help="goal text")
    p_set.set_defaults(func=cmd_set)

    p_show = sub.add_parser("show", parents=[common], help="print the current goal")
    p_show.add_argument("--json", action="store_true")
    p_show.add_argument("--history", action="store_true")
    p_show.set_defaults(func=cmd_show)

    p_run = sub.add_parser("run", parents=[common], help="spawn `codex exec` with the goal injected")
    p_run.add_argument("--codex-bin", default=os.environ.get("CODEX_GOAL_BIN", "codex"))
    resume_group = p_run.add_mutually_exclusive_group()
    resume_group.add_argument("--resume", metavar="SESSION_ID", help="resume this session id")
    resume_group.add_argument("--last", action="store_true", help="resume the most recent session")
    p_run.add_argument("--dry-run", action="store_true", help="print the argv that would run, do not spawn")
    p_run.add_argument("codex_args", nargs=argparse.REMAINDER, metavar="-- CODEX_ARGS...")
    p_run.set_defaults(func=cmd_run)

    args = parser.parse_args(argv)
    if args.command == "run" and args.codex_args and args.codex_args[0] == "--":
        args.codex_args = args.codex_args[1:]
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
