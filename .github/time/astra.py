"""Astra: the factory's daily planner. One model call a day that reads the ledger and the board and decides what
to work on next. It queues; it never spends on its own beyond its one call.

    python3 .github/time/astra.py tick      # daily (astra.yml): read, decide, queue up to a few cards

Luna is Time's deterministic tick (no model); Sol is the hourly heartbeat that executes cards with a seat; Astra is the
slow outer loop that orients them. Astra labels its picks `queued`, never `ready`: the heartbeat's promote_next moves
queued cards to `ready` (the live ranking's order, else oldest first, `Depends on: #N` respected) up to TIME_PARALLEL
in flight at once, so Astra's work waits for a free slot instead of starting on the day it was queued. Guardrails are
code, not prompt: at most TIME_ASTRA_MAX_READY cards queued and TIME_ASTRA_MAX_NEW cards created per run; an existing
issue is only queued if it has a `DONE:` line and none of `queued`/`ready`/`needs-human`/`andon`; an open `andon` issue
means Astra writes its note and queues nothing; the spend cap is checked by the engine like any other call. Everything
Astra does is a comment on one issue, "Astra log", so a human can read the day's reasoning in one place and object there.

The router (time/router.json, `mode`: off | dry | live; router.py): instead of picking cards in prose, the seat judges
every candidate (its kind, its value 1-5, its size) and code ranks them with the owner's weights per kind, a restless
boost for kinds not picked lately, and the card's age. The candidates include the optimizations the factory's own
records show (#171): the ledger's spend by model and entry point, workflows whose runs keep failing, and cards parked
with their retries spent. Those have no card yet, so a picked one is written as one (unqueued) instead of being queued,
and a source a card already names is not proposed again, open or closed lately. The log shows the ranked table. `dry`
writes it and queues nothing; `live` queues from the top while the day's money left covers each card's estimated cost
(the allowance left in the pool that takes the worker's route, else the daily cap's remainder, never more than the month has left),
creates the seat's new cards unqueued (they are candidates the next day; never a repeat of an open or lately closed
card), and the heartbeat promotes queued cards in the ranked order. Over the table the log shows what each kind's past
picks returned (picks, merged share, median days, median $), from the outcomes housekeeping records (#172). The spine's
own open cards (`TIME_SPINE`, `teahubxyz/teahub`) are ranked beside Time's, keyed `teahub#N` and marked "spine: not
queued": a worker here builds in this repo only, so their value only tells the owner what the platform needs next (#173).
Ventures (#170): told the loop is in router mode (`TIME_VENTURE_MODE=router`, the loop's own `TIME_VENTURE`), "start a
new venture" is actionable and ranked at the seat's size and cost like any card, and every live venture with signups is
a "v2 of <venture>" candidate. A picked new venture dispatches `venture.yml` with `start=true` (the same Actions call
the heartbeat makes to run CI) and is never queued as a card; a picked v2 posts the venture's own open v2 card, or
writes one (Base: gh-pages) and queues it. The log line says which.
A reply that judges nothing, or next to nothing, is a loud no-op rather than a flat ranking (#211): the day's comment
says what came back and the router queues nothing, sends nothing to the cloud lane and writes no cards — so no venture
is dispatched or written on the strength of a reply that ranked nothing either.
`off`, or no router.json, is the planner as before.

The board (#279: TIME_ASTRA_PITCH, seats that each propose a slate; TIME_ASTRA_BOARD, seats that rank it, default the
same): the day is the venture loop's ceremony turned inward, so the factory's own work is deliberated the way a venture
is instead of chosen by one seat alone. Every planning seat proposes up to a few cards, the slates merge into one field
(the same issue, or the same new title, from two seats is one card with both proposers), the board ranks the field
(Borda 3/2/1 with a quorum of two, the venture board's own tally and `top`), and only the top picks are queued or
created: a card wanted by one seat alone is never opened. The same guards and caps apply to every pick. The board is
the explicit variable, so it decides the day whatever router.json says; unset, Astra is the router or the single
planner above, unchanged.
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
_vspec = importlib.util.spec_from_file_location("vt", HERE / "venture.py")
vt = importlib.util.module_from_spec(_vspec)
_vspec.loader.exec_module(vt)   # the venture board's machinery: each(), ask_json(), top(), seat_list()
vt.tm = tm   # its seats spend through this run's governor and ledger, not a second copy of them
ROUTER_FILE = "time/router.json"
PAGES_BRANCH = "gh-pages"              # where ventures/ventures.json lives: the live ventures and their signups (#170)
VENTURE_WORKFLOW = "venture.yml"       # dispatched with start=true when the router picks a new venture (#170)

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


SLATE = """You are `{seat}`, one of the planners of a small, fully AI-run software factory (Teahub). Once a day each planner
proposes a slate of work; the board ranks every slate together, and only cards that two seats want get queued. You do
not do the work: a worker seat builds queued cards one at a time.

Propose up to {n} cards. A card is either an existing open issue to queue now (it must already have a `DONE:` line and
carry none of the labels queued/ready/needs-human/andon, nor be one of the venture loop's own, which it runs itself) or
a new card: a clear list of changes ending in one `DONE:` line, small enough for one PR and one worker session.

Rules:
- Prefer finishing over starting. Unblock open PRs and half-done cards before opening new work.
- Never touch workflows, secrets, variables, or anything under docs/decisions.md; those are a human's. Never propose
  anything that posts outside the repo.
- If nothing is worth doing, propose nothing; an empty slate is fine.

Answer with JSON only, no prose around it:
{{"note": "<2-4 sentences: what matters today and why these>",
  "cards": [{{"issue": <existing open issue number>, "why": "<one line>"}},
            {{"title": "<card title>", "body": "<what to change, as a list, ending with a DONE: line>", "why": "<one line>"}}]}}"""


RANK = """You are `{seat}` on the board of a small, fully AI-run software factory (Teahub), ranking the cards the planners
proposed today:

{cards}

Rank up to three by: does it finish or unblock something already in flight, is it small enough for one worker session
and one PR, is its DONE line checkable, does it stay inside the repo and away from workflows, secrets, variables and
docs/decisions.md, and is it worth part of a small daily budget. If nothing is, rank nothing.
Reply with ONLY JSON: {{"ranking": ["<card id>", "<card id>"], "reason": "one sentence"}} (ranking may be [])."""


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
A candidate whose key starts `opt:` is not a card yet: it is something the factory's own records show (a route that took
over half the week's spend, a workflow that keeps failing, a card parked with its retries spent), with a title and body
already drafted. Judge it like the rest; if it is picked it is written as a card for a worker to take later, never
worked on today, so judge whether that work is worth a card at all.
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


def context_for(state: dict, context: str) -> str:
    return f"Factory context (the spine's AGENTS.md and the newest decisions):\n{context}\n\nBoard:\n{json.dumps(state, indent=1)}"


def decide(state: dict, context: str, seat: str) -> dict:
    raw = tm.think(seat, None, None, RULES.format(max_ready=env_int("TIME_ASTRA_MAX_READY", 2), max_new=env_int("TIME_ASTRA_MAX_NEW", 2)),
                   context_for(state, context))
    m = re.search(r"\{.*\}", raw, re.S)
    try:
        out = json.loads(m.group(0)) if m else {}
    except ValueError:
        out = {}
    picks = out.get("queue") if out.get("queue") is not None else out.get("ready")   # older answers said "ready"
    return {"note": str(out.get("note") or raw[:800]), "queue": [int(n) for n in picks or [] if str(n).isdigit()],
            "new": [c for c in out.get("new") or [] if isinstance(c, dict) and c.get("title")]}


# ---------- the board for internal work (#279): slates, a ranking, the quorum ----------

def slate(state: dict, context: str, seats: list[str], n: int) -> tuple[list[dict], dict[str, str]]:
    """Every planning seat proposes up to n cards at once; the slates merge into one field. An existing issue passes
    the single planner's guards or is dropped; the same issue (or the same new title) from two seats is one card
    with both proposers. Returns the field and each seat's note."""
    by_n = {i["n"]: i for i in state["issues"]}
    user = context_for(state, context)
    answers = vt.each(seats, lambda s: vt.ask_json(s, SLATE.format(seat=s, n=n), user))
    field: list[dict] = []
    notes: dict[str, str] = {}
    for s, out in zip(seats, answers):
        if not out:
            continue
        notes[s] = str(out.get("note") or "")[:400]
        for c in (out.get("cards") or [])[:n]:
            if not isinstance(c, dict):
                continue
            why = str(c.get("why") or "")[:200]
            if str(c.get("issue") or "").isdigit():
                num = int(c["issue"])
                i = by_n.get(num)
                if not i or not i["has_done"] or SKIP & set(i["labels"]):
                    continue
                same = next((d for d in field if d.get("issue") == num), None)
                cand = {"slug": f"#{num}", "issue": num, "title": i["title"], "body": i["body"], "by": s, "why": why}
            elif c.get("title"):
                cand = {"slug": f"new-{len(field) + 1}", "title": str(c["title"])[:200], "body": str(c.get("body") or ""),
                        "by": s, "why": why}
                same = next((d for d in field if "issue" not in d and vt._forms(d["title"]) & vt._forms(cand["title"])), None)
            else:
                continue
            if same:
                if s not in same["by"].split(", "):
                    same["by"] += f", {s}"
                continue
            field.append(cand)
    return field, notes


def rank(field: list[dict], seats: list[str]) -> dict:
    """The board ranks the field: every seat up to three cards at once, Borda 3/2/1, as on the venture board.
    Returns {"votes", "score", "backers"}, the shape venture.top reads."""
    text = "\n\n".join(f"### {c['slug']} (proposed by {c['by']})\n{c['title']}\n{c['body'][:600]}\nWhy: {c['why']}" for c in field)
    score = {c["slug"]: 0 for c in field}
    backers = {c["slug"]: 0 for c in field}
    votes: dict[str, dict] = {}
    results = vt.each(seats, lambda s: vt.ask_json(s, f"You are `{s}`.", RANK.format(seat=s, cards=text)))
    for s, v in zip(seats, results):
        if not v:
            continue
        seen: list[str] = []
        for slug in v.get("ranking") or []:   # a seat listing the same card thrice gets one vote for it
            slug = str(slug).strip()
            if slug in score and slug not in seen:
                seen.append(slug)
        v["ranking"] = seen
        votes[s] = v
        for pts, slug in zip((3, 2, 1), seen):
            score[slug] += pts
            backers[slug] += 1
    return {"votes": votes, "score": score, "backers": backers}


def deliberate(state: dict, context: str, pitchers: list[str], judges: list[str], max_ready: int, max_new: int) -> tuple[dict, list[str]]:
    """The venture ceremony turned inward: slates, a ranking, and the top picks wanted by two seats become the plan,
    at most max_ready in all and max_new of them new. Returns the plan (as decide() shapes it) and the minutes."""
    field, notes = slate(state, context, pitchers, max_ready + max_new)
    minutes = [f"Slates from {', '.join(pitchers)}; the board is {', '.join(judges)}."]
    minutes += [f"- `{s}`: {note}" for s, note in notes.items() if note]
    if not field:
        minutes.append("No cards were proposed.")
        return {"note": "The planners proposed nothing today.", "queue": [], "new": []}, minutes
    meta = rank(field, judges)
    by_slug = {c["slug"]: c for c in field}
    picks: list[str] = []
    fresh = 0
    for slug in vt.top(field, meta, len(field)):   # ranked by Borda, each wanted by two seats
        if "issue" not in by_slug[slug]:
            if fresh >= max_new:
                continue
            fresh += 1
        picks.append(slug)
        if len(picks) >= max_ready:
            break
    minutes += ["", "| card | proposed by | score | backers | |", "|---|---|---|---|---|"]
    for c in field:
        minutes.append(f"| {c['slug']} {c['title'][:60]} | {c['by']} | {meta['score'][c['slug']]} | {meta['backers'][c['slug']]} | "
                       f"{'picked' if c['slug'] in picks else ''} |")
    minutes += [f"- `{s}` ranked {', '.join(v['ranking']) or 'nothing'}: {str(v.get('reason') or '')[:200]}" for s, v in meta["votes"].items()]
    chosen = [by_slug[s] for s in picks]
    note = ("The board picked " + ", ".join(f"{c['slug']} ({c['title'][:40]})" for c in chosen) + ".") if chosen else \
        "No card was wanted by two seats; nothing queued."
    return {"note": note, "queue": [c["issue"] for c in chosen if "issue" in c],
            "new": [{"title": c["title"], "body": c["body"], "queue": True} for c in chosen if "issue" not in c]}, minutes


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


def venture_registry() -> dict:
    """`ventures/ventures.json` on the Pages branch: the live ventures and their signups, for the v2 candidates (#170).
    Context, not a dependency: unreadable, there are no ventures to iterate on and the day's ranking goes up without
    them."""
    try:
        f = tm.gh("GET", f"/repos/{tm.REPO}/contents/ventures/ventures.json?ref={PAGES_BRANCH}")
        reg = json.loads(base64.b64decode(f.get("content") or "").decode(errors="replace"))
        return reg if isinstance(reg, dict) else {}
    except Exception as e:  # noqa: BLE001
        if "-> 404" not in str(e):   # no ventures.json on the Pages branch yet: nothing to iterate on, nothing to say
            print(f"venture registry unreadable: {str(e)[:120]}")
        return {}


def start_venture(r: dict, open_issues: list[dict]) -> str:
    """A picked venture candidate (#170). A new venture: `venture.yml` is dispatched with `start=true`, and the loop in
    router mode starts one card there; nothing is queued here, since there is no card to queue. A v2: the venture's own
    open v2 card if the loop already wrote one, else a new card on the Pages branch — never a dispatch, which would
    start a different, brand-new venture. Returns what happened, for the log."""
    if r["key"] == router.NEW_VENTURE["key"]:
        try:
            tm.gh("POST", f"/repos/{tm.REPO}/actions/workflows/{VENTURE_WORKFLOW}/dispatches",
                  {"ref": tm.default_branch(), "inputs": {"start": "true"}})
        except RuntimeError as e:
            return f"new venture: dispatching {VENTURE_WORKFLOW} failed ({str(e)[:100]})"
        return f"new venture: dispatched {VENTURE_WORKFLOW} with start=true"
    v = f"v{r['next_v']}"
    for i in open_issues:
        t = (i.get("title") or "").lower()
        if re.search(rf"\b{v}\b", t) and (r["name"].lower() in t or r["slug"] in t):
            return f"{r['name']} {v}: already on #{i['number']}, posted that card"
    n = tm.new_issue(f"{r['name']} {v}: build the next version from what signups asked for",
                     f"Build {v} of **{r['name']}** in `ventures/{r['slug']}/` from what its signups asked for (its signal "
                     f"issue and the early-access issues for it). {r['body']}\n\nBase: gh-pages\n\nRead the folder first "
                     f"and keep what works.\n\nDONE: PR open against gh-pages with {v} of `ventures/{r['slug']}/`, checks "
                     "green.\n\n<sub>card written by Astra</sub>", [])["number"]
    tm.label(n, "queued")   # the heartbeat promotes it like any card
    return f"{r['name']} {v}: no card yet, wrote and queued #{n}"

def ledger_week(days: int = router.OPT_DAYS) -> list[dict]:
    """The ledger lines the router reads (#171): this month's file, and the previous one when the window straddles it.
    router.ledger_candidates keeps the last `days` days of them."""
    now = dt.datetime.now(dt.timezone.utc)
    months = sorted({now.strftime("%Y-%m"), (now - dt.timedelta(days=days)).strftime("%Y-%m")})
    try:
        return [r for m in months for r in tm.ledger_lines(m) if isinstance(r, dict)]
    except Exception as e:  # noqa: BLE001  a source, not a dependency: unreadable is no candidates from it
        print(f"ledger unreadable: {str(e)[:120]}")
        return []


def action_runs(limit: int = 50) -> list[dict]:
    """The newest workflow runs, from the endpoint `tea_actions` reads (`/actions/runs`; Gitea wraps them in
    `workflow_runs`)."""
    try:
        got = tm.gh("GET", f"/repos/{tm.REPO}/actions/runs?limit={limit}")
    except Exception as e:  # noqa: BLE001
        print(f"actions runs unreadable: {str(e)[:120]}")
        return []
    return got if isinstance(got, list) else (got or {}).get("workflow_runs") or []


def parked_cards() -> list[dict]:
    """The `ready` cards whose last real beat parked them, with what the router needs of each: the beat and when it was
    written, whether a PR of theirs is open, and how many of #78's automatic retries are left. A card someone trusted
    has typed `/time retry` on since that beat is left out: the next heartbeat dispatches it (it clears `last` exactly
    as a spare automatic retry does), so proposing "retry or split" for it would be a card for work already under way."""
    auto_max = env_int("TIME_AUTO_RETRY", 1)
    out: list[dict] = []
    try:
        prs = tm.gh("GET", f"/repos/{tm.REPO}/pulls?state=open&limit=50") or []
        for card in tm.issues("state=open&labels=ready"):
            cs = tm.gh("GET", f"/repos/{tm.REPO}/issues/{card['number']}/comments?limit=100") or []
            beats = [b for b in tm.beats_of(cs) if b.get("beat") not in ("blocked", "capped")]
            if not beats or beats[-1].get("beat") not in ("error", "stuck"):
                continue
            if tm.retry_requested(cs, beats[-1]["at"]):
                continue   # a person already asked for the retry: the next heartbeat runs it, so it needs no card
            # an automatic retry is one run of consecutive `auto_retry` beats, counted as the heartbeat counts it
            used = sum(1 for k, b in enumerate(beats) if b.get("auto_retry") and not (k and beats[k - 1].get("auto_retry")))
            out.append({"n": card["number"], "title": card.get("title") or "", "beat": beats[-1]["beat"],
                        "at": beats[-1]["at"], "retries_left": max(0, auto_max - used),
                        "open_pr": any(p.get("state", "open") == "open" for p in tm.linked_prs(prs, card["number"]))})
    except Exception as e:  # noqa: BLE001
        print(f"parked cards unreadable: {str(e)[:120]}")
    return out


JUDGED_SHARE = 0.25   # below this share of the candidates judged, the reply is not a ranking at all (#211)


def judged_enough(judged: int, total: int) -> bool:
    """Whether the seat's reply judged enough of the board to rank it. A reply with no `assess` scores every candidate at
    the unjudged default (value 3, size M), which is a flat table, not a ranking: on 2026-10-20 (log #57) 37 of 37 came
    back unjudged, every score 1.911, and the router still queued from the top and sent three cards to the cloud lane."""
    return judged > 0 and judged >= total * JUDGED_SHARE


def router_tick(cfg: dict, seat: str, log: int, context: str, thread: list[dict], max_ready: int, max_new: int) -> int:
    """The seat judges every candidate; router.py ranks them; live queues from the top, dry only shows the ranking."""
    open_issues = [i for i in tm.issues("state=open") if i.get("title") != LOG_TITLE]
    mode = os.environ.get("TIME_VENTURE_MODE") or ""   # the venture loop's own TIME_VENTURE, passed on by astra.yml
    closed = closed_lately()
    today_d = dt.datetime.now(dt.timezone.utc).date()
    cands = router.candidates(open_issues) + spine_candidates() \
        + [router.new_venture(mode)] + router.v2_candidates(venture_registry())
    # what no one wrote a card for (#171): the ledger, the Actions runs and the parked cards, each proposed once. The
    # cards closed lately name their sources too: a week's spend outlives the card written about it, so keying the open
    # ones alone would propose the same finding again the day its card closed.
    cands += router.opt_candidates(ledger_week(), action_runs(), parked_cards(), today_d, router.named(open_issues + closed))
    listing = "\n\n".join(f"### {c['key']}: {c['title']}\nlabels: {', '.join(c['labels']) or '-'}; opened "
                          f"{c['created'][:10] or '-'}; cards waiting on it: {c['unblocks']}\n{c['body'][:400]}" for c in cands)
    today, day_cap, month, month_cap = tm.budget()
    left, source = money_left()
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
    ranked = router.rank(cands, assess, cfg, router.last_picked(tm.beats_of(thread)), today_d)
    in_lane = sum(1 for i in open_issues if router.CLOUD in router.labels_of(i))
    to_cloud = router.pick_cloud(ranked, cfg, in_lane)   # the cloud lane takes its cards first: its credit is separate
    sent = {r["key"] for r in to_cloud}
    picks = router.pick([r for r in ranked if r["key"] not in sent], cfg, left, max_ready)
    new, repeats = [], []
    for c in [c for c in out.get("new") or [] if isinstance(c, dict) and c.get("title")]:
        n = router.repeat_of(str(c["title"]), open_issues + closed)   # the sweep checks the board with the same rule (#198)
        (repeats.append((c, n)) if n else new.append(c))
    new = new[:max_new]
    queued = [r for r in picks if r["n"] is not None]
    no_card = [r for r in picks if r["n"] is None]
    ventures = [r for r in no_card if str(r["key"]).startswith(router.VENTURE_KEY)]
    found = [r for r in no_card if r not in ventures]   # the records' own findings (#171)
    live, created, started = cfg["mode"] == "live", [], []
    if live:
        for r in queued:
            tm.label(r["n"], "queued")   # the heartbeat promotes it, in ranked order
        for r in ventures:
            started.append(start_venture(r, open_issues))   # dispatched or written, never queued as itself
        for r in found:
            # a candidate with no card (an optimization the records showed): it becomes a card, never worked on in place
            r["written"] = tm.new_issue(r["title"][:200], r["body"] + "\n\n<sub>card written by Astra</sub>", [])["number"]
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
        lines.append(("Queued: " + ", ".join(f"#{r['n']}" for r in queued)) if queued else "Queued nothing today.")
        lines += [f"Venture: {x}" for x in started]
        if found:
            lines.append("Written from the factory's own records (candidates from tomorrow): "
                         + ", ".join(f"#{r['written']} ({r['key']})" for r in found))
        if to_cloud:
            lines.append("To the cloud lane: " + ", ".join(f"#{r['n']}" for r in to_cloud))
        if created:
            lines.append("New cards (candidates from tomorrow): " + ", ".join(f"#{n}" for n in created))
    else:
        lines.append("Dry run: nothing queued or created. Live, it would queue: "
                     + (", ".join(f"#{r['n']}" if r["n"] is not None else r["title"] for r in picks if r not in found)
                        or "nothing") + "."
                     + (" And write a card for: " + ", ".join(r["key"] for r in found) + "." if found else "")
                     + (" To the cloud lane: " + ", ".join(f"#{r['n']}" for r in to_cloud) + "." if to_cloud else ""))
        if new:
            lines.append("It would write: " + "; ".join(router._txt(c["title"], 100) for c in new) + ".")
    if repeats:
        lines.append("Not written, repeats of existing cards: "
                     + "; ".join(f"{router._txt(c['title'], 80)} (#{n})" for c, n in repeats) + ".")
    meta = {"beat": "astra", "router": cfg["mode"], "queued": len(queued) if live else 0,
            "started": started, "order": router.order(ranked),
            "picked": [{"n": r.get("written", r["n"]), "kind": r["kind"]} for r in picks] if live else [],
            "would": [r["n"] for r in queued] if not live else [], "new": created,
            "opt": [{"key": r["key"], "card": r.get("written")} for r in found],
            "cloud": [r["n"] for r in to_cloud] if live else [], "would_cloud": [r["n"] for r in to_cloud] if not live else []}
    tm.comment(log, "\n".join(lines), meta)
    print(f"astra router {cfg['mode']}: picks={[r['n'] for r in queued]} opt={[r['key'] for r in found]} "
          f"new={created} ranked={len(ranked)}" + "".join(f" | {x}" for x in started))
    return 0


def tick() -> int:
    seat = (os.environ.get("TIME_ASTRA_SEAT") or "opus").strip()
    max_ready, max_new = env_int("TIME_ASTRA_MAX_READY", 2), env_int("TIME_ASTRA_MAX_NEW", 2)
    pitchers = vt.seat_list("TIME_ASTRA_PITCH", "")          # the board: set, it deliberates instead of the router or one seat
    judges = vt.seat_list("TIME_ASTRA_BOARD", "") or pitchers
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
    if not pitchers:
        cfg = router_config()
        if cfg["mode"] != "off":
            return router_tick(cfg, seat, log, context, thread, max_ready, max_new)
    minutes: list[str] = []
    try:
        if pitchers:
            plan, minutes = deliberate(state, context, pitchers, judges, max_ready, max_new)
        else:
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
    who = f"board of {', '.join(judges)}" if pitchers else seat
    lines = [f"🔭 Astra ({who}), spend today, {per}:", "", plan["note"], ""]
    if minutes:
        lines += minutes + [""]
    if queued:
        lines.append("Queued: " + ", ".join(f"#{n}" for n in queued))
    if created:
        lines.append("New cards: " + ", ".join(f"#{n}" for n in created))
    if skipped:
        lines.append("Skipped (no DONE line, already moving, or a human's): " + ", ".join(f"#{n}" for n in skipped))
    if not (queued or created):
        lines.append("Queued nothing today.")
    tm.comment(log, "\n".join(lines), {"beat": "astra", "queued": len(queued) + len(created), "queue": queued, "new": created,
                                       "board": judges if pitchers else []})
    print(f"astra: queued={queued} new={created} skipped={skipped}")
    return 0


if __name__ == "__main__":
    if sys.argv[1:2] != ["tick"]:
        sys.exit(__doc__)
    import office  # the office bus (teahubxyz/teahub AGENTS.md): best effort, never fails the job
    sys.exit(office.around("astra", tick, "Time: the daily planner"))
