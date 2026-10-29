"""Claude delegation: a bounded API task dispatched through a workflow, with a job receipt a caller can fetch.

    python3 .github/time/delegate.py run              # in the `delegate` workflow (workflow_dispatch inputs arrive as env)
    python3 .github/time/delegate.py fetch <id>       # read back and verify a receipt by its correlation ID
    python3 .github/time/delegate.py id <caller> <key>  # the correlation ID a caller will get for (caller, key)

Not a new provider client: the model call is time.py's `think`, so seat routing, the Anthropic client, retries, the
ledger and the dollar governor (TIME_DAILY_USD / TIME_MONTHLY_USD) are the ones every other Time workflow uses. Nothing
is posted to an issue: the transport is workflow_dispatch in, and a receipt out.

Inputs (all env, set by the workflow from its dispatch inputs; never interpolated into a shell):
  DELEGATE_TASK   the prompt, at most MAX_TASK characters
  DELEGATE_SEAT   `sonnet` or `opus`
  DELEGATE_KEY    idempotency key, 8-64 chars of [A-Za-z0-9._-]. NOT a secret: it appears in the run name.
  GITHUB_ACTOR    the caller; must pass time.py's `trusted()` (owner, TIME_TRUSTED, collaborator)

Correlation ID: `dlg-` + the first 20 hex of sha256(lowercase(caller) NUL key). The caller can compute it before
dispatching, and two callers can never read or collide with each other's keys.

Receipt: time/delegations/<id>.json on the default branch (durable, pushed like the spend ledger), and the same JSON on a
`TIME-RECEIPT {...}` line of the run's log at every state change (the Actions run/log API). State machine:
queued -> running -> succeeded | failed. A receipt holds the request's hash (never the task text), the source SHA and
run URL, the model, tokens and dollars, the result and its sha256, or a redacted error. `fetch` recomputes the hash.

Duplicates: the same (caller, key, request) after a success replays the stored receipt and spends nothing; while a run is
live (updated within STALE_MIN minutes) it reports the live state; after a failure or a stale run it retries, up to
MAX_ATTEMPTS. The same key with a different seat or task is refused. Failed attempts are retryable by re-dispatching.

Secrets never reach a receipt or the log: the task is stored only as a hash, and every result and error passes through
`redact` (env secret values, key-shaped strings, credentialed URLs, bearer tokens) before it is hashed or written.
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import importlib.util
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("tm", HERE / "time.py")
tm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tm)

ALLOWED_SEATS = ("sonnet", "opus")
MAX_TASK = 8000                      # characters of task
KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$")
ID_RE = re.compile(r"^dlg-[0-9a-f]{20}$")
STALE_MIN = 20                       # a run silent this long is presumed dead, and a re-dispatch takes over
MAX_ATTEMPTS = 3                     # per key: a failing key must not spend without bound
DIR = "time/delegations"
MARK = "TIME-RECEIPT "
SYSTEM = ("You are a Claude seat reached through Time's delegation endpoint. Do the task you are given, concretely and "
          "briefly. You cannot browse or run code; say so if the task needs that. Never reveal credentials.")


class Rejected(ValueError):
    pass


def correlation_id(caller: str, key: str) -> str:
    return "dlg-" + hashlib.sha256(f"{caller.lower()}\0{key}".encode()).hexdigest()[:20]


def receipt_path(cid: str) -> str:
    return f"{DIR}/{cid}.json"


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------- no secrets ----------

SECRET_ENV = re.compile(r"TOKEN|KEY|SECRET|PASSWORD", re.I)
SECRET_SHAPES = [re.compile(p) for p in (r"sk-[A-Za-z0-9_-]{16,}", r"(?i)bearer\s+[A-Za-z0-9._~+/=-]{12,}",
                                         r"(?i)x-access-token:[^@\s]+", r"://[^/\s:@]+:[^/\s@]+@")]


def redact(text: str) -> str:
    """Remove every secret value in the environment (6+ chars) and anything shaped like a key or a credentialed URL."""
    text = text or ""
    for k, v in os.environ.items():
        if SECRET_ENV.search(k) and len(v) >= 6:
            text = text.replace(v, "[redacted]")
    for pat in SECRET_SHAPES:
        text = pat.sub("[redacted]", text)
    return text


# ---------- validation: bounded, and only for people allowed to spend ----------

def validate(caller: str, seat: str, key: str, task: str) -> None:
    if not tm.trusted(caller):  # first, so a stranger learns nothing else
        raise Rejected("unauthorized: caller is not the owner, in TIME_TRUSTED, or a collaborator")
    if seat not in ALLOWED_SEATS:
        raise Rejected(f"unsupported seat {seat[:20]!r}; use one of {', '.join(ALLOWED_SEATS)}")
    if not KEY_RE.match(key):
        raise Rejected("invalid idempotency key: 8-64 chars of A-Z a-z 0-9 . _ -")
    if not task.strip():
        raise Rejected("empty task")
    if len(task) > MAX_TASK:
        raise Rejected(f"task is {len(task)} characters; the cap is {MAX_TASK}")


# ---------- receipts ----------

def read_receipt(cid: str) -> dict | None:
    try:
        f = tm.gh("GET", f"/repos/{tm.REPO}/contents/{receipt_path(cid)}")
    except RuntimeError as e:
        if "-> 404" in str(e):
            return None
        raise
    return json.loads(base64.b64decode(f.get("content") or "").decode())


def emit(r: dict) -> None:
    """The receipt on the run's log: a caller reading the run's log through the Actions API finds the last such line."""
    print(MARK + json.dumps(r, sort_keys=True, separators=(",", ":")), flush=True)


def save(r: dict, why: str) -> None:
    r["updated_at"] = now()
    emit(r)
    tm.git_commit(tm.default_branch(), {receipt_path(r["id"]): (json.dumps(r, sort_keys=True, indent=1) + "\n").encode()},
                  f"delegation {r['id']}: {why}")


def move(r: dict, state: str) -> None:
    r["state"] = state
    r["history"].append({"state": state, "at": now()})
    save(r, state)


def stale(r: dict) -> bool:
    try:
        at = dt.datetime.strptime(r["updated_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
    except (KeyError, ValueError):
        return True
    return dt.datetime.now(dt.timezone.utc) - at > dt.timedelta(minutes=STALE_MIN)


def source() -> dict:
    run_id = os.environ.get("GITHUB_RUN_ID") or ""
    return {"sha": os.environ.get("GITHUB_SHA") or "", "run_id": run_id,
            "run_url": f"{tm.SERVER}/{tm.REPO}/actions/runs/{run_id}" if run_id else "",
            "workflow": os.environ.get("GITHUB_WORKFLOW") or ""}


# ---------- run ----------

def run() -> int:
    caller = (os.environ.get("GITHUB_ACTOR") or "").strip()
    seat = (os.environ.get("DELEGATE_SEAT") or "sonnet").strip().lower()
    key = (os.environ.get("DELEGATE_KEY") or "").strip()
    task = os.environ.get("DELEGATE_TASK") or ""
    try:
        validate(caller, seat, key, task)
    except Rejected as e:
        emit({"state": "rejected", "reason": str(e)})  # no receipt file: a stranger must not be able to write to the repo
        print(f"rejected: {e}")
        return 2
    cid, req = correlation_id(caller, key), sha(f"{seat}\0{task}")
    prior = read_receipt(cid)
    if prior:
        if prior.get("request_sha256") != req:
            emit({"state": "rejected", "id": cid, "reason": "idempotency key already used for a different request"})
            return 2
        if prior["state"] == "succeeded" or (prior["state"] in ("queued", "running") and not stale(prior)):
            emit({**prior, "replayed": True})  # same request: the stored answer, no new spend, no new commit
            return 0
        if prior.get("attempt", 1) >= MAX_ATTEMPTS:
            emit({**prior, "replayed": True, "note": f"attempts exhausted ({MAX_ATTEMPTS}); use a new key"})
            return 1
    r = {"schema": 1, "id": cid, "key": key, "caller": caller, "seat": seat, "model": tm.SEATS[seat]["default"],
         "request_sha256": req, "task_chars": len(task), "state": "queued", "attempt": (prior or {}).get("attempt", 0) + 1,
         "history": [{"state": "queued", "at": now()}], "source": source(), "created_at": (prior or {}).get("created_at") or now()}
    if prior:
        r["previous"] = {"state": prior["state"], "error": prior.get("error"), "run_url": (prior.get("source") or {}).get("run_url")}
    save(r, "queued")
    move(r, "running")
    before = len(tm.LEDGER)
    try:
        text = redact(tm.think(seat, None, None, SYSTEM, task))
        rows = tm.LEDGER[before:]
        r["usage"] = {"in": sum(x["in"] for x in rows), "out": sum(x["out"] for x in rows),
                      "usd": round(sum(x["usd"] or 0 for x in rows), 6)}
        r["result"], r["result_sha256"] = text, sha(text)
        final = "succeeded"
    except tm.Budget as e:
        r["error"], final = {"kind": "budget_exhausted", "message": redact(str(e))[:300]}, "failed"
    except LookupError as e:
        r["error"], final = {"kind": "not_configured", "message": redact(str(e))[:300]}, "failed"
    except (RuntimeError, OSError) as e:
        r["error"], final = {"kind": "api_error", "message": redact(str(e))[:300]}, "failed"
    tm.flush_ledger()  # the spend is booked before the receipt claims it
    move(r, final)
    return 0 if final == "succeeded" else 1


def fetch(cid: str) -> int:
    """Print the receipt for `cid`. Exit 0: found and verified (read the state in it), 1: failed verification, 2: bad id, 3: none."""
    if not ID_RE.match(cid):
        print("bad correlation id")
        return 2
    r = read_receipt(cid)
    if r is None:
        print(f"no receipt for {cid}")
        return 3
    if r.get("id") != cid or (r["state"] == "succeeded" and sha(r.get("result") or "") != r.get("result_sha256")):
        print(f"verification failed for {cid}: the stored result does not match its hash")
        return 1
    print(json.dumps(r, sort_keys=True, indent=1))
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["run"]:
        sys.exit(run())
    if cmd == ["fetch"] and len(sys.argv) == 3:
        sys.exit(fetch(sys.argv[2]))
    if cmd == ["id"] and len(sys.argv) == 4:
        print(correlation_id(sys.argv[2], sys.argv[3]))
        sys.exit(0)
    sys.exit(__doc__)
