"""Astra: the factory's daily planner. One model call a day that reads the ledger and the board and decides what
to work on next. It queues; it never spends on its own beyond its one call.

    python3 .github/time/astra.py tick      # daily (astra.yml): read, decide, queue up to a few cards

Luna is Time's deterministic tick (no model); Sol is the hourly heartbeat that executes cards with a seat; Astra is the
slow outer loop that orients them. Astra labels its picks `queued`, never `ready`: the heartbeat's promote_next moves
one queued card at a time to `ready` (oldest first, `Depends on: #N` respected), so Astra's work lines up behind
whatever is already queued instead of running beside it on the same files. Guardrails are code, not prompt: at most
TIME_ASTRA_MAX_READY cards queued and TIME_ASTRA_MAX_NEW cards created per run; an existing issue is only queued if it
has a `DONE:` line and none of `queued`/`ready`/`needs-human`/`andon`; an open `andon` issue means Astra writes its note
and queues nothing; the spend cap is checked by the engine like any other call. Everything Astra does is a comment on
one issue, "Astra log", so a human can read the day's reasoning in one place and object there.

The router (time/router.json, `mode`: off | dry | live; router.py): instead of picking cards in prose, the seat judges
every candidate (its kind, its value 1-5, its size) and code ranks them with the owner's weights per kind, a restless
boost for kinds not picked lately, and the card's age. The log shows the ranked table. `dry` writes it and queues
nothing; `live` queues from the top while the day's money left covers each card's estimated cost (the allowance left
in the pool that takes the worker's route, else the daily cap's remainder, never more than the month has left),
creates the seat's new cards unqueued (they are candidates the next day; never a repeat of an open or lately closed
card), and the heartbeat promotes queued cards in the ranked order. Over the table the log shows what each kind's past
picks returned (picks, merged share, median days, median $), from the outcomes housekeeping records (#172). The spine's
own open cards (`TIME_SPINE`, `teahubxyz/teahub`) are ranked beside Time's, keyed `teahub#N` and marked "spine: not
queued": a worker here builds in this repo only, so their value only tells the owner what the platform needs next (#173).
A reply that judges nothing, or next to nothing, is a loud no-op rather than a flat ranking (#211): the day's comment
says what came back and the router queues nothing, sends nothing to the cloud lane and writes no cards.
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
import urllib.parse
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
SPINE_KEY = SPINE.split("/")[-1] or "spine"                  # the prefix of a spine card's key in the table: teahub#N
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
- blocked: only when it can't move today, what it waits on (a PR that can't merge, a human, something outside the
  repo); leave it out otherwise. A blocked card is never queued, however it scores. A card whose `Depends on: #N` card
  is still open is already held back by code.
A candidate keyed `{spine_key}#N` is a card of the spine, the platform's own repo: judge its value like any other (it
tells the owner what the platform needs next), but no worker here can build it, so code never queues it.
You may also write up to {max_new} new cards for work the board is missing; they are candidates from tomorrow on.
Never write one that posts outside the repo or touches workflows, secrets or variables, and never one for work that is
already a candidate or is in the list of cards closed lately: that work is done or under way.

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


def spine_issues(query: str = "state=open") -> list[dict]:
    """The spine's issues (never PRs) through the same API, each row checked against the labels the query names exactly
    as `tm.issues` checks this repo's: Gitea ignores a filter on a label the repo does not have and answers with every
    issue instead (#137)."""
    want = [l for l in (urllib.parse.parse_qs(query).get("labels") or [""])[0].split(",") if l]
    rows = [i for i in tm.gh("GET", f"/repos/{SPINE}/issues?type=issues&limit=50&{query}") or [] if not i.get("pull_request")]
    return [i for i in rows if "labels" not in i or all(tm.has_label(i, l) for l in want)]


def spine_candidates() -> list[dict]:
    """The spine's open cards as candidates (#173): ranked and shown, never queued. The spine is context, not a
    dependency, so a read failure is a log line and the day's ranking goes up without it."""
    try:
        return router.spine(spine_issues(), SPINE_KEY)
    except Exception as e:  # noqa: BLE001
        print(f"spine issues unreadable: {str(e)[:120]}")
        return []


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
            "spend": {"today": round(today, 2), "daily_cap": day_cap, "month": round(month, 2), "monthly_cap": month_cap,
                      "pools": {p["name"]: {"spent": round(tm.pool_spent(p), 2), "allowance": round(tm.allowance(p), 2)} for p in tm.pools()}}}


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


def outcomes() -> list[dict]:
    """The settled picks housekeeping has recorded (#172), for the summary per kind over the table. Context, not a
    dependency: unreadable, the table goes up without it."""
    try:
        f = tm.gh("GET", f"/repos/{tm.REPO}/contents/{router.OUTCOMES}")
        return router.read_outcomes(base64.b64decode(f.get("content") or "").decode(errors="replace"))
    except Exception as e:  # noqa: BLE001
        if "-> 404" not in str(e):
            print(f"router outcomes unreadable: {str(e)[:120]}")
        return []


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


def money_left() -> tuple[float, str]:
    """What the router may queue against today, and where it comes from (#175): the allowance left in the pool that takes
    the worker's route (as budget_check sees it), or the daily cap's remainder without one; either way no more than
    what's left of the monthly cap."""
    today, day_cap, month, month_cap = tm.budget()
    spec = (os.environ.get("TIME_WORKER") or "cursor").strip()
    p = tm.pool_for(tm.provider_of(tm.worker_seat_model(spec)[1])) if tm.seat_worker(spec) else None
    left, source = (tm.allowance(p) - tm.pool_spent(p), f"pool {p['name']}") if p else (day_cap - today, "daily cap")
    return max(0.0, min(left, month_cap - month)), source


def closed_lately(days: int = 14) -> list[dict]:
    """Cards closed (done, or dropped) in the last `days` days, newest first: the seat sees them so it doesn't write a
    card for work already finished (it proposed the housekeeping label fix two days running after #137 had landed)."""
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        return [i for i in tm.issues(f"state=closed&since={since}") if i.get("title") != LOG_TITLE]
    except Exception as e:  # noqa: BLE001  context, not a dependency
        print(f"closed cards unreadable: {str(e)[:120]}")
        return []


JUDGED_SHARE = 0.25   # below this share of the candidates judged, the reply is not a ranking at all (#211)


def judged_enough(judged: int, total: int) -> bool:
    """Whether the seat's reply judged enough of the board to rank it. A reply with no `assess` scores every candidate at
    the unjudged default (value 3, size M), which is a flat table, not a ranking: on 2026-10-20 (log #57) 37 of 37 came
    back unjudged, every score 1.911, and the router still queued from the top and sent three cards to the cloud lane."""
    return judged > 0 and judged >= total * JUDGED_SHARE


def router_tick(cfg: dict, seat: str, log: int, context: str, thread: list[dict], max_ready: int, max_new: int) -> int:
    """The seat judges every candidate; router.py ranks them; live queues from the top, dry only shows the ranking."""
    open_issues = [i for i in tm.issues("state=open") if i.get("title") != LOG_TITLE]
    cands = router.candidates(open_issues) + spine_candidates() + [dict(router.NEW_VENTURE)]
    listing = "\n\n".join(f"### {c['key']}: {c['title']}\nlabels: {', '.join(c['labels']) or '-'}; opened "
                          f"{c['created'][:10] or '-'}; cards waiting on it: {c['unblocks']}\n{c['body'][:400]}" for c in cands)
    today, day_cap, month, month_cap = tm.budget()
    left, source = money_left()
    closed = closed_lately()
    done = "\n".join(f"- #{i['number']} {i['title']}" for i in closed[:50]) or "- (none)"
    user = (f"Factory context (the spine's AGENTS.md and the newest decisions):\n{context}\n\nSpend: ${today:.2f} of "
            f"${day_cap:.2f} today, ${month:.2f} of ${month_cap:.2f} this month out of pocket (credit-paid spend excluded); "
            f"${left:.2f} left to queue against ({source})."
            f"\n\nCards closed in the last 14 days (done or dropped; don't write these again):\n{done}"
            f"\n\nCandidates ({len(cands)}):\n\n{listing}")
    try:
        raw = tm.think(seat, None, None, ROUTER.format(max_new=max_new, spine_key=SPINE_KEY), user)
    except tm.Budget as e:
        tm.comment(log, f"🔭 Astra: {e}. No ranking today.", {"beat": "astra", "router": cfg["mode"], "queued": 0, "capped": True})
        return 0
    out = parse(raw)
    assess = {str(a.get("key") or "").strip(): a for a in out.get("assess") or [] if isinstance(a, dict)}
    judged = sum(1 for c in cands if c["key"] in assess)   # a key that matches no candidate judged nothing
    # the raw reply's size and stop reason, so a reply cut off by the output limit is visible as the cause (#211)
    print(f"astra router {cfg['mode']}: reply {len(raw)} chars, stop {getattr(raw, 'stop', '') or '-'}, "
          f"judged {judged} of {len(cands)}")
    if not judged_enough(judged, len(cands)):
        said = f"judged {judged} of {len(cands)}" if judged else "returned no assessments"
        tm.comment(log, f"🔭 Astra: the judge {said} ({router._txt(raw, 200) or 'empty'}); nothing queued or sent today.",
                   {"beat": "astra", "router": cfg["mode"], "queued": 0, "unjudged": True})
        return 0
    ranked = router.rank(cands, assess, cfg, router.last_picked(tm.beats_of(thread)), dt.datetime.now(dt.timezone.utc).date())
    in_lane = sum(1 for i in open_issues if router.CLOUD in router.labels_of(i))
    to_cloud = router.pick_cloud(ranked, cfg, in_lane)   # the cloud lane takes its cards first: its credit is separate
    sent = {r["key"] for r in to_cloud}
    picks = router.pick([r for r in ranked if r["key"] not in sent], cfg, left, max_ready)
    new, repeats = [], []
    for c in [c for c in out.get("new") or [] if isinstance(c, dict) and c.get("title")]:
        n = router.repeat_of(str(c["title"]), open_issues + closed)   # the sweep checks the board with the same rule (#198)
        (repeats.append((c, n)) if n else new.append(c))
    new = new[:max_new]
    live, created = cfg["mode"] == "live", []
    if live:
        for r in picks:
            tm.label(r["n"], "queued")   # the heartbeat promotes it, in ranked order
        for r in to_cloud:
            tm.label(r["n"], router.CLOUD)   # the Mac's launcher starts a cloud session for it
        for c in new:
            body = str(c.get("body") or "")
            if not router.DONE.search(body):
                body += "\n\nDONE: PR open that does the above, tests green."
            created.append(tm.new_issue(str(c["title"])[:200], body + "\n\n<sub>card written by Astra</sub>", [])["number"])
    unjudged = sum(1 for r in ranked if not r["judged"])
    w = cfg["weights"]
    head = (f"🔭 Astra ({seat}), router `{cfg['mode']}`, spend ${today:.2f} of ${day_cap:.2f} today, ${left:.2f} left to "
            f"queue against ({source}). Weights: "
            + ", ".join(f"{k} {w[k]:g}" for k in router.KINDS) + f"; restless {cfg['restless']:g}/day."
            + (f" Cloud lane: {in_lane} in it, up to {cfg['cloud']['per_day']}." if cfg["cloud"]["per_day"] else ""))
    settled = router.outcome_lines(outcomes())   # what each kind has returned, over the table (#172)
    lines = [head, "", str(out.get("note") or "(no note)"), ""] + (settled + [""] if settled else []) \
        + [router.table(ranked, picks, cfg["mode"], cloud=to_cloud), ""]
    if unjudged:
        lines.append(f"_{unjudged} candidate(s) the seat didn't judge are scored at value 3, size M._")
    if live:
        lines.append(("Queued: " + ", ".join(f"#{r['n']}" for r in picks)) if picks else "Queued nothing today.")
        if to_cloud:
            lines.append("To the cloud lane: " + ", ".join(f"#{r['n']}" for r in to_cloud))
        if created:
            lines.append("New cards (candidates from tomorrow): " + ", ".join(f"#{n}" for n in created))
    else:
        lines.append("Dry run: nothing queued or created. Live, it would queue: "
                     + (", ".join(f"#{r['n']}" for r in picks) or "nothing") + "."
                     + (" To the cloud lane: " + ", ".join(f"#{r['n']}" for r in to_cloud) + "." if to_cloud else ""))
        if new:
            lines.append("It would write: " + "; ".join(router._txt(c["title"], 100) for c in new) + ".")
    if repeats:
        lines.append("Not written, repeats of existing cards: "
                     + "; ".join(f"{router._txt(c['title'], 80)} (#{n})" for c, n in repeats) + ".")
    meta = {"beat": "astra", "router": cfg["mode"], "queued": len(picks) if live else 0, "order": router.order(ranked),
            "picked": [{"n": r["n"], "kind": r["kind"]} for r in picks] if live else [],
            "would": [r["n"] for r in picks] if not live else [], "new": created,
            "cloud": [r["n"] for r in to_cloud] if live else [], "would_cloud": [r["n"] for r in to_cloud] if not live else []}
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
    per = ", ".join(f"{k} ${v['spent']:.2f} of ${v['allowance']:.2f}" for k, v in state["spend"]["pools"].items()) \
        or f"${state['spend']['today']:.2f} of ${state['spend']['daily_cap']:.2f}"
    lines = [f"🔭 Astra ({seat}), spend today, {per}:", "", plan["note"], ""]
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
    if sys.argv[1:2] != ["tick"]:
        sys.exit(__doc__)
    import office  # the office bus (teahubxyz/teahub AGENTS.md): best effort, never fails the job
    sys.exit(office.around("astra", tick, "Time: the daily planner"))
