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

With a board (TIME_ASTRA_PITCH: seats that each propose a slate; TIME_ASTRA_BOARD: seats that rank it, default the
same), the day is the venture loop's ceremony turned inward. Every planning seat proposes up to a few cards, the
slates merge into one field, the board ranks the field (Borda 3/2/1 with a quorum of two, the venture board's own
tally and `top`), and only the top picks are queued or created: a card wanted by one seat alone is never opened. The
same guardrails apply to every pick. Unset, Astra is the single planner above.
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
_vspec = importlib.util.spec_from_file_location("vt", HERE / "venture.py")
vt = importlib.util.module_from_spec(_vspec)
_vspec.loader.exec_module(vt)   # the venture board's machinery: each(), ask_json(), top(), seat_list()
vt.tm = tm   # its seats spend through this run's governor and ledger, not a second copy of them

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

SLATE = """You are `{seat}`, one of the planners of a small, fully AI-run software factory (Teahub). Once a day each planner
proposes a slate of work; the board ranks every slate together, and only cards that two seats want get queued. You do
not do the work: a worker seat builds queued cards one at a time.

Propose up to {n} cards. A card is either an existing open issue to queue now (it must already have a `DONE:` line and
carry none of the labels queued/ready/needs-human/andon) or a new card: a clear list of changes ending in one `DONE:`
line, small enough for one PR and one worker session.

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


# ---------- the board for internal work: slates, a ranking, the quorum ----------

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


def tick() -> int:
    seat = (os.environ.get("TIME_ASTRA_SEAT") or "opus").strip()
    max_ready, max_new = env_int("TIME_ASTRA_MAX_READY", 2), env_int("TIME_ASTRA_MAX_NEW", 2)
    pitchers = vt.seat_list("TIME_ASTRA_PITCH", "")
    judges = vt.seat_list("TIME_ASTRA_BOARD", "") or pitchers
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
    who = f"board of {', '.join(judges)}" if pitchers else seat
    lines = [f"🔭 Astra ({who}), spend ${state['spend']['today']:.2f} of ${state['spend']['daily_cap']:.2f} today:", "", plan["note"], ""]
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
    sys.exit(tick() if sys.argv[1:2] == ["tick"] else __doc__)
