"""Astra: the factory's daily planner. One model call a day that reads the ledger and the board and decides what
to work on next. It queues; it never spends on its own beyond its one call.

    python3 .github/time/astra.py tick      # daily (astra.yml): read, decide, queue up to a few cards

Luna is Time's deterministic tick (no model); Sol is the hourly heartbeat that executes cards with a seat; Astra is the
slow outer loop that orients them. Astra labels its picks `queued`, never `ready`: the heartbeat's promote_next moves
one queued card at a time to `ready` (oldest first, `Depends on #N` respected), so Astra's work lines up behind
whatever is already queued instead of running beside it on the same files. Guardrails are code, not prompt: at most
TIME_ASTRA_MAX_READY cards queued and TIME_ASTRA_MAX_NEW cards created per run; an existing issue is only queued if it
has a `DONE:` line and none of `queued`/`ready`/`needs-human`/`andon`; an open `andon` issue means Astra writes its note
and queues nothing; the spend cap is checked by the engine like any other call. Everything Astra does is a comment on
one issue, "Astra log", so a human can read the day's reasoning in one place and object there.
"""
from __future__ import annotations

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

SPINE = os.environ.get("TIME_SPINE") or "teahubxyz/teahub"   # where AGENTS.md and docs/decisions.md live
LOG_TITLE = "Astra log"
SKIP = {"queued", "ready", "needs-human", "andon", "astra"}   # already moving, a human's, or Astra's own log

RULES = """You are Astra, the daily planner of a small, fully AI-run software factory (Teahub). Once a day you read the
state below and decide what the factory should work on next. You do not do the work: you queue cards, and a worker seat
builds queued cards one at a time; you only choose and write cards.

Rules:
- Prefer finishing over starting. Unblock open PRs and half-done cards before opening new work. Cards already labelled
  `queued` or `ready` are already lined up; don't queue them again.
- A card is an issue with a clear list of changes and one `DONE:` line (what must be true for it to be finished, e.g.
  "DONE: PR open, tests green"). Small, one PR each, a worker can finish in one session.
- Never touch workflows, secrets, variables, or anything under docs/decisions.md; those are a human's. Never queue
  anything that posts outside the repo.
- Respect the budget: the day's cap is small. At most {max_ready} cards may be queued and {max_new} created.
- If nothing is worth doing, say so; an empty day is fine.

Answer with JSON only, no prose around it:
{{"note": "<3-6 sentences: what the factory did yesterday, what matters today, and why you chose these>",
  "queue": [<existing open issue numbers to queue now; they must already have a DONE: line>],
  "new": [{{"title": "<card title>", "body": "<what to change, as a list, ending with a DONE: line>", "queue": true}}]}}"""


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name) or default)
    except ValueError:
        return default


def spine_file(path: str) -> str:
    try:
        import base64
        return base64.b64decode(tm.gh("GET", f"/repos/{SPINE}/contents/{path}")["content"]).decode(errors="replace")
    except Exception as e:  # noqa: BLE001  the spine is context, not a dependency
        return f"(could not read {SPINE}/{path}: {str(e)[:80]})"


def board() -> dict:
    """What Astra reads: open issues and PRs, yesterday's closed issues, andons, spend."""
    open_issues = tm.issues("state=open")
    closed = tm.gh("GET", f"/repos/{tm.REPO}/issues?type=issues&state=closed&limit=20")
    prs = tm.gh("GET", f"/repos/{tm.REPO}/pulls?state=open&limit=20")
    today, day_cap, month, month_cap = tm.budget()
    trim = lambda i: {"n": i["number"], "title": i["title"], "labels": [l["name"] for l in i.get("labels") or []],
                      "has_done": bool(re.search(r"^\s*DONE:", i.get("body") or "", re.M | re.I)),
                      "body": (i.get("body") or "")[:600], "updated": i.get("updated_at")}
    return {"issues": [trim(i) for i in open_issues if i["title"] != LOG_TITLE],
            "closed_recently": [{"n": i["number"], "title": i["title"], "closed": i.get("closed_at")} for i in closed[:20]],
            "prs": [{"n": p["number"], "title": p["title"], "head": p["head"]["ref"], "mergeable": p.get("mergeable")} for p in prs],
            "andons": [i["number"] for i in open_issues if any(l["name"] == "andon" for l in i.get("labels") or [])],
            "spend": {"today": round(today, 2), "daily_cap": day_cap, "month": round(month, 2), "monthly_cap": month_cap}}


def log_issue() -> int:
    for i in tm.issues("state=open"):
        if i["title"] == LOG_TITLE:
            return i["number"]
    return tm.new_issue(LOG_TITLE, "Astra, the daily planner, writes one comment here per day: what it read, what it "
                        "queued, and why. Object in a reply; Astra reads this thread too.", ["astra"])["number"]


def decide(state: dict, context: str, seat: str) -> dict:
    user = f"Factory context (the spine's AGENTS.md and the newest decisions):\n{context}\n\nBoard:\n{json.dumps(state, indent=1)}"
    raw = tm.think(seat, None, None, RULES.format(max_ready=env_int("TIME_ASTRA_MAX_READY", 2), max_new=env_int("TIME_ASTRA_MAX_NEW", 2)), user)
    m = re.search(r"\{.*\}", raw, re.S)
    try:
        out = json.loads(m.group(0)) if m else {}
    except ValueError:
        out = {}
    picks = out.get("queue") if out.get("queue") is not None else out.get("ready")   # older answers said "ready"
    return {"note": str(out.get("note") or raw[:800]), "queue": [int(n) for n in picks or [] if str(n).isdigit()],
            "new": [c for c in out.get("new") or [] if isinstance(c, dict) and c.get("title")]}


def tick() -> int:
    seat = (os.environ.get("TIME_ASTRA_SEAT") or "opus").strip()
    max_ready, max_new = env_int("TIME_ASTRA_MAX_READY", 2), env_int("TIME_ASTRA_MAX_NEW", 2)
    state = board()
    log = log_issue()
    if state["andons"]:
        tm.comment(log, f"🔭 Astra: an andon is open (#{', #'.join(map(str, state['andons']))}), so I'm queuing nothing today. "
                   "Close it once it's handled and I'll plan tomorrow.", {"beat": "astra", "queued": 0, "andon": True})
        return 0
    context = spine_file("AGENTS.md")[:6000] + "\n\n" + "\n".join(spine_file("docs/decisions.md").splitlines()[-25:])
    # the log thread is part of the context: humans object there
    thread = tm.gh("GET", f"/repos/{tm.REPO}/issues/{log}/comments?limit=20")
    human = [c["body"][:500] for c in thread if not tm.is_time(c)][-5:]
    if human:
        context += "\n\nRecent human replies on the Astra log (follow these):\n- " + "\n- ".join(human)
    try:
        plan = decide(state, context, seat)
    except tm.Budget as e:
        tm.comment(log, f"🔭 Astra: {e}. No plan today.", {"beat": "astra", "queued": 0, "capped": True})
        return 0
    by_n = {i["n"]: i for i in state["issues"]}
    queued, created, skipped = [], [], []
    for n in plan["queue"][:max_ready]:
        i = by_n.get(n)
        if not i or not i["has_done"] or SKIP & set(i["labels"]):
            skipped.append(n)
            continue
        tm.label(n, "queued")
        queued.append(n)
    for c in plan["new"][:max_new]:
        body = str(c.get("body") or "")
        if not re.search(r"^\s*DONE:", body, re.M | re.I):
            body += "\n\nDONE: PR open that does the above, tests green."
        issue = tm.new_issue(str(c["title"])[:200], body + "\n\n<sub>card written by Astra</sub>", [])
        created.append(issue["number"])
        if c.get("queue", c.get("ready", True)) and len(queued) + len(created) <= max_ready:
            tm.label(issue["number"], "queued")   # the heartbeat promotes it when nothing else is in flight
    lines = [f"🔭 Astra ({seat}), spend ${state['spend']['today']:.2f} of ${state['spend']['daily_cap']:.2f} today:", "", plan["note"], ""]
    if queued:
        lines.append("Queued: " + ", ".join(f"#{n}" for n in queued))
    if created:
        lines.append("New cards: " + ", ".join(f"#{n}" for n in created))
    if skipped:
        lines.append("Skipped (no DONE line, already moving, or a human's): " + ", ".join(f"#{n}" for n in skipped))
    if not (queued or created):
        lines.append("Queued nothing today.")
    tm.comment(log, "\n".join(lines), {"beat": "astra", "queued": len(queued) + len(created), "queue": queued, "new": created})
    print(f"astra: queued={queued} new={created} skipped={skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(tick() if sys.argv[1:2] == ["tick"] else __doc__)
