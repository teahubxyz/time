"""Time on the office bus: each of Time's jobs checks in on Teahub's office bus when it starts and when it ends, so
the other agents (and the spokesperson) can see the factory's clock working. teahubxyz/teahub AGENTS.md has the rule;
the bus itself is Tea MCP's (`POST /bus`, teahubxyz/teahub mcp/README.md).

Best effort, always: a bus that is down, slow or refusing never fails or delays a job by more than a few seconds,
and nothing here raises. It posts as Time's own user (TIME_TOKEN) and only says what job ran and where its run is.
TIME_BUS=off turns it off; TIME_BUS_URL points it elsewhere.
"""
from __future__ import annotations

import json
import os
import urllib.request

DEFAULT_URL = "https://mcp.teahub.xyz/bus"
TIMEOUT = 5.0


def run_url() -> str:
    server, repo, run = (os.environ.get(k, "") for k in ("GITHUB_SERVER_URL", "GITHUB_REPOSITORY", "GITHUB_RUN_ID"))
    return f"{server}/{repo}/actions/runs/{run}" if server and repo and run else ""


def checkin(name: str, status: str, role: str = "Time") -> bool:
    """One check-in as Time's `name` (heartbeat, astra, ...). True if the bus took it."""
    token = os.environ.get("TIME_TOKEN", "").strip()
    if os.environ.get("TIME_BUS", "on").strip().lower() == "off" or not token:
        return False
    url = run_url()
    body = {"action": "checkin", "name": f"time-{name}"[:40], "role": role[:60],
            "status": (f"{status} ({url})" if url else status)[:500]}
    req = urllib.request.Request(os.environ.get("TIME_BUS_URL") or DEFAULT_URL, method="POST",
                                 data=json.dumps(body).encode(),
                                 headers={"Authorization": f"token {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status == 200
    except Exception as e:  # noqa: BLE001 - the bus is never a reason for a job to fail
        print(f"office bus: check-in skipped ({type(e).__name__})")
        return False


def around(name: str, job, role: str = "Time") -> int:
    """Run `job()` between a start and an end check-in, and return its exit code."""
    checkin(name, f"{name}: running", role)
    try:
        code = job()
    except BaseException as e:
        checkin(name, f"{name}: failed ({type(e).__name__})", role)
        raise
    checkin(name, f"{name}: done" if not code else f"{name}: finished with code {code}", role)
    return code
