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

The router (time/router.json, `mode`: off | dry | live; router.py): instead of picking cards in prose, the seat judges
every candidate (its kind, its value 1-5, its size) and code ranks them with the owner's weights per kind, a restless
boost for kinds not picked lately, and the card's age. The log shows the ranked table. `dry` writes it and queues
nothing; `live` queues from the top while the day's money left covers each card's estimated cost, creates the seat's
new cards unqueued (they are candidates the next day), and the heartbeat promotes queued cards in the ranked order.
`off`, or no router.json, is the planner as before.
"""
from __future__ import annotations

import base64
import datetime as dt
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
_rspec = importlib.util.spec_from_file_location("router", HERE / "router.py")
router = importlib.util.module_from_spec(_rspec)
_rspec.loader.exec_module(router)
ROUTER_FILE = "time/router.json"

SPINE = os.environ.get("TIME_SPINE") or "teahubxyz/teahub"   # where AGENTS.md and docs/decisions.md live
LOG_TITLE = "Astra log"
SKIP = {"queued", "ready", "needs-human", "andon", "astra",   # already moving, a human's, or Astra's own log
        "venture", "venture-batch", "signal", "signup"}       # the venture loop's own: it runs them itself

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


ROUTER = """You are Astra, the daily planner of a small, fully AI-run software factory (Teahub). Today you judge the
candidates below; code ranks them with the owner's weights and queues from the top, so don't choose: judge each one.

For every candidate give:
- kind: venture (a new venture, or a venture's next version), feature (new functionality), refinement (making what
  exists better: fixes, polish, a live venture's page or skills) or optimization (cost, speed, reliability)
- value: 1-5, what finishing it is worth to the factory now (5: it unblocks the factory, or the owner asked for it and
  it matters today; 1: nice to have, stale, or a duplicate of another card)
- size: S (well under one worker session), M (one session), L (more than one: it must be split first)
- why: one short sentence
You may also write up to {max_new} new cards for work the board is missing; they are candidates from tomorrow on.
Never write one that posts outside the repo or touches workflows, secrets or variables.

Answer with JSON only, no prose around it:
{{"note": "<3-6 sentences: what happened yesterday and what matters today>",
  "assess": [{{"key": "<the candidate's key, e.g. #82>", "kind": "feature", "value": 3, "size": "M", "why": "..."}}],
  "new": [{{"title": "<card title>", "body": "<what to change, as a list, ending with a DONE: line>"}}]}}"""


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


def router_config() -> dict:
    """time/router.json on the default branch; missing or unreadable, the router is off and Astra plans as before."""
    try:
        f = tm.gh("GET", f"/repos/{tm.REPO}/contents/{ROUTER_FILE}")
        return router.config(base64.b64decode(f.get("content") or "").decode(errors="replace"))
    except Exception as e:  # noqa: BLE001
        if "-> 404" not in str(e):
            print(f"router config unreadable: {str(e)[:120]}")
        return router.config(None)


def recent(log: int, days: int = 14) -> list[dict]:
    """The log's comments of the last `days` days, oldest first (Gitea pages from the oldest, so a plain limit=20
    read the thread's first twenty comments forever)."""
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    out: list[dict] = []
    for page in range(1, 5):
        batch = tm.gh("GET", f"/repos/{tm.REPO}/issues/{log}/comments?since={since}&limit=50&page={page}") or []
        out += batch
        if len(batch) < 50:
            break
    return out


def parse(raw: str) -> dict:
    """The first JSON object in the seat's reply."""
    dec = json.JSONDecoder()
    for m in re.finditer(r"\{", raw or ""):
        try:
            out, _ = dec.raw_decode(raw, m.start())
        except ValueError:
            continue
        if isinstance(out, dict):
            return out
    return {}


def router_tick(cfg: dict, seat: str, log: int, context: str, thread: list[dict], max_ready: int, max_new: int) -> int:
    """The seat judges every candidate; router.py ranks them; live queues from the top, dry only shows the ranking."""
    open_issues = [i for i in tm.issues("state=open") if i.get("title") != LOG_TITLE]
    cands = router.candidates(open_issues) + [dict(router.NEW_VENTURE)]
    listing = "\n\n".join(f"### {c['key']}: {c['title']}\nlabels: {', '.join(c['labels']) or '-'}; opened "
                          f"{c['created'][:10] or '-'}; cards waiting on it: {c['unblocks']}\n{c['body'][:400]}" for c in cands)
    today, day_cap, month, month_cap = tm.budget()
    user = (f"Factory context (the spine's AGENTS.md and the newest decisions):\n{context}\n\nSpend: ${today:.2f} of "
            f"${day_cap:.2f} today, ${month:.2f} of ${month_cap:.2f} this month.\n\nCandidates ({len(cands)}):\n\n{listing}")
    try:
        out = parse(tm.think(seat, None, None, ROUTER.format(max_new=max_new), user))
    except tm.Budget as e:
        tm.comment(log, f"🔭 Astra: {e}. No ranking today.", {"beat": "astra", "router": cfg["mode"], "queued": 0, "capped": True})
        return 0
    assess = {str(a.get("key") or "").strip(): a for a in out.get("assess") or [] if isinstance(a, dict)}
    ranked = router.rank(cands, assess, cfg, router.last_picked(tm.beats_of(thread)), dt.datetime.now(dt.timezone.utc).date())
    picks = router.pick(ranked, cfg, max(0.0, day_cap - today), max_ready)
    new = [c for c in out.get("new") or [] if isinstance(c, dict) and c.get("title")][:max_new]
    live, created = cfg["mode"] == "live", []
    if live:
        for r in picks:
            tm.label(r["n"], "queued")   # the heartbeat promotes it, in ranked order
        for c in new:
            body = str(c.get("body") or "")
            if not router.DONE.search(body):
                body += "\n\nDONE: PR open that does the above, tests green."
            created.append(tm.new_issue(str(c["title"])[:200], body + "\n\n<sub>card written by Astra</sub>", [])["number"])
    unjudged = sum(1 for r in ranked if not r["judged"])
    w = cfg["weights"]
    head = (f"🔭 Astra ({seat}), router `{cfg['mode']}`, spend ${today:.2f} of ${day_cap:.2f} today. Weights: "
            + ", ".join(f"{k} {w[k]:g}" for k in router.KINDS) + f"; restless {cfg['restless']:g}/day.")
    lines = [head, "", str(out.get("note") or "(no note)"), "", router.table(ranked, picks, cfg["mode"]), ""]
    if unjudged:
        lines.append(f"_{unjudged} candidate(s) the seat didn't judge are scored at value 3, size M._")
    if live:
        lines.append(("Queued: " + ", ".join(f"#{r['n']}" for r in picks)) if picks else "Queued nothing today.")
        if created:
            lines.append("New cards (candidates from tomorrow): " + ", ".join(f"#{n}" for n in created))
    else:
        lines.append("Dry run: nothing queued or created. Live, it would queue: "
                     + (", ".join(f"#{r['n']}" for r in picks) or "nothing") + ".")
        if new:
            lines.append("It would write: " + "; ".join(router._txt(c["title"], 100) for c in new) + ".")
    meta = {"beat": "astra", "router": cfg["mode"], "queued": len(picks) if live else 0, "order": router.order(ranked),
            "picked": [{"n": r["n"], "kind": r["kind"]} for r in picks] if live else [],
            "would": [r["n"] for r in picks] if not live else [], "new": created}
    tm.comment(log, "\n".join(lines), meta)
    print(f"astra router {cfg['mode']}: picks={[r['n'] for r in picks]} new={created} ranked={len(ranked)}")
    return 0


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
    thread = recent(log)
    human = [c["body"][:500] for c in thread if not tm.is_time(c)][-5:]
    if human:
        context += "\n\nRecent human replies on the Astra log (follow these):\n- " + "\n- ".join(human)
    cfg = router_config()
    if cfg["mode"] != "off":
        return router_tick(cfg, seat, log, context, thread, max_ready, max_new)
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
