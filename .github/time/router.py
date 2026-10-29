"""The router: what the factory works on next (time#68, #72).

Astra, the daily planner, gathers the candidates and asks its seat to judge each one; this module turns those
judgments into one ranked list, in arithmetic anyone can check, and picks from the top. In live mode the heartbeat
promotes queued cards in the same order instead of oldest first.

A candidate is an open card a worker can take (a `DONE:` line; not a parent, not a human's, not the venture loop's
own), work with no card yet that the factory could start (a new venture, or an optimization the factory's own records
show: see below), or a card of the spine (`teahubxyz/teahub`: Tea MCP, the Pages server, the Gitea look), which is
ranked and shown but never queued, since Time's worker builds in this repo only (#173). Each has a kind: venture,
feature, refinement or optimization.

    score = weight[kind] x restless(kind) x age x (value + 0.5 x unblocks) / size

- value (1-5) and size (S, M, L = 1, 2, 4) are the seat's judgment; unblocks counts the open cards that wait on it.
- weight is the owner's dial per kind, in time/router.json (all 1: balanced).
- restless: a kind the factory hasn't picked for a while climbs, 1 + rate x days (at most 10 days), so none starves.
- age: an old card climbs a little, 1 + 0.02 x days open (at most 20 days).

The cloud lane (`cloud` in time/router.json): each day the best-ranked actionable cards of the lane's sizes (M by
default: the bigger ones) are labelled `cloud`, up to `per_day` cards in the lane at once, instead of going to the API
worker. A launcher signed in to the owner's claude.ai account starts a Claude Code cloud session for each (the cloud-
session credit pays); the session's `claude/card-N-*` branch comes home through sync.py as a PR, sync relabels the card
`ready`, and the heartbeat adopts and reviews it like any card PR. `per_day: 0` (the default) is no cloud lane.

Optimization candidates (#171): the router reads three of the factory's own records over the last week and proposes the
work no one wrote a card for — the ledger (a route or model that takes over half the week's spend, a model whose spend
per call is double its own median), the Actions runs (a workflow that keeps failing or being cancelled) and the parked
cards (an `error` or `stuck` beat Time will not retry again). Each finding is a synthetic candidate the seat judges like
any other; live, a picked one is written as a card, never worked on in place. See the section below.

An L is ranked but never queued: a card is what one worker session finishes, so it is split first. Nor is a card that
waits: on a card still open (its `Depends on #N`), or on whatever the seat says blocks it (a PR that can't merge, a
human). Cards that can move come first in the promotion order, the ones that wait after them. The policy is
`score`; a bandit policy (Beth, Jev, Fable's restless-bandit maths) can replace it without touching how candidates are
gathered or how picks are queued.

Outcomes (#172): a bandit learns from rewards, so every live pick's outcome is recorded once the card settles — one
line in `time/ledger/router-outcomes.jsonl`, written by the daily housekeeping sweep, and one summary line per kind
over Astra's table. Nothing here reads them back into a pick yet; `score` is still the whole policy.

The same work twice (#198): `repeat_of` is the rule for two cards being the same work (Astra checks a title it is about
to write against the board; housekeeping checks every open card against the cards closed lately, and `superseded`
lists the ones another card looks to have finished). Both are hints for a reader, never an action.
"""
from __future__ import annotations

import datetime as dt
import json
import re

KINDS = ("venture", "feature", "refinement", "optimization")
SIZES = {"S": 1, "M": 2, "L": 4}
MODES = ("off", "dry", "live")
DEFAULTS = {"mode": "off", "weights": dict.fromkeys(KINDS, 1.0), "restless": 0.05, "cost_usd": {"S": 0.5, "M": 1.5, "L": 4.0},
            "cloud": {"per_day": 0, "sizes": ["M"]}}
LOOP = {"venture", "venture-batch", "signal", "signup"}       # the venture loop's own cards: it runs them itself
HELD = {"needs-human", "andon", "astra", "planned"} | LOOP     # a human's, an alarm, Astra's log, parents, the loop's
LINED_UP = {"queued", "ready", "cloud"}                        # already moving: ranked (for promotion), never queued again
CLOUD = "cloud"                                                # a card in the cloud lane: a cloud session builds it
DONE = re.compile(r"^\s*DONE:", re.M | re.I)
SPINE_WHY_NOT = "spine: not queued (Time builds in this repo only)"
NEW_VENTURE = {"key": "venture:new", "n": None, "title": "Start a new venture: research, pick, build and launch one page",
               "body": "The venture loop (venture.py): one venture, researched and picked by the lead, built and judged.",
               "labels": [], "lined_up": False, "actionable": False, "kind": "venture", "unblocks": 0, "created": "",
               "why_not": "not wired to the router yet; the venture loop is paused (TIME_VENTURE=off)"}


def _num(v, default: float, lo: float = 0.0, hi: float = 100.0) -> float:
    try:
        return min(hi, max(lo, float(v)))
    except (TypeError, ValueError):
        return default


def _txt(v, n: int) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()[:n]


def config(raw: str | None) -> dict:
    """time/router.json over the defaults. Unreadable is the defaults, and an unknown mode is off."""
    try:
        got = json.loads(raw) if raw else {}
    except ValueError:
        got = {}
    got = got if isinstance(got, dict) else {}
    w = got.get("weights") if isinstance(got.get("weights"), dict) else {}
    c = got.get("cost_usd") if isinstance(got.get("cost_usd"), dict) else {}
    mode = str(got.get("mode", "off")).strip().lower()
    cl = got.get("cloud") if isinstance(got.get("cloud"), dict) else {}
    sizes = [s for s in (cl.get("sizes") if isinstance(cl.get("sizes"), list) else DEFAULTS["cloud"]["sizes"]) if s in ("S", "M")]
    return {"mode": mode if mode in MODES else "off",
            "weights": {k: _num(w.get(k), 1.0) for k in KINDS},
            "restless": _num(got.get("restless"), DEFAULTS["restless"], 0.0, 1.0),
            "cost_usd": {s: _num(c.get(s), DEFAULTS["cost_usd"][s]) for s in SIZES},
            "cloud": {"per_day": int(_num(cl.get("per_day"), 0, 0, 10)), "sizes": sizes}}


def labels_of(issue: dict) -> set[str]:
    return {lb["name"] if isinstance(lb, dict) else lb for lb in issue.get("labels") or []}


def guess_kind(title: str, body: str, labels: set[str]) -> str:
    """The kind when the seat gives none: a `kind:<x>` label, the loop's labels, a live venture's folder, then words."""
    for k in KINDS:
        if f"kind:{k}" in labels:
            return k
    if labels & LOOP:
        return "venture"
    if re.search(r"^\s*Base:\s*gh-pages\b", body or "", re.M | re.I):
        return "refinement"   # work on a launched venture's folder
    text = f"{title}\n{body}".lower()
    if re.search(r"\b(cost|spend|cach\w*|cheaper|faster|slow\w*|latency|tokens?|optimi[sz]\w*)\b", text):
        return "optimization"
    if re.search(r"\b(fix\w*|polish\w*|refine\w*|tighten\w*|clean ?up|rename\w*|bug\w*)\b", text):
        return "refinement"
    return "feature"


def candidates(issues: list[dict]) -> list[dict]:
    """Every open card a worker could take, lined-up ones included (ranked, so the heartbeat promotes in order)."""
    waits: dict[int, int] = {}
    for i in issues:
        for d in set(re.findall(r"Depends on #(\d+)", i.get("body") or "")):
            waits[int(d)] = waits.get(int(d), 0) + 1
    open_n = {i.get("number") for i in issues}
    out = []
    for i in issues:
        labels, body = labels_of(i), i.get("body") or ""
        if labels & HELD or not DONE.search(body):
            continue
        deps = sorted({int(d) for d in re.findall(r"Depends on #(\d+)", body)} & open_n)   # a closed dependency is done
        out.append({"key": f"#{i['number']}", "n": i["number"], "title": _txt(i.get("title"), 120), "body": body[:500],
                    "labels": sorted(labels), "lined_up": bool(labels & LINED_UP), "actionable": not deps,
                    "kind": guess_kind(i.get("title") or "", body, labels), "unblocks": waits.get(i["number"], 0),
                    "created": str(i.get("created_at") or ""),
                    **({"why_not": "waits on " + ", ".join(f"#{d}" for d in deps)} if deps else {})})
    return out


def spine(issues: list[dict], prefix: str = "teahub") -> list[dict]:
    """The spine's open cards as candidates, keyed `<prefix>#N` (#173). Every one with a `DONE:` line counts: they are
    ranked and shown so the owner (or the CEO) reads what the spine needs next, and never queued or labelled from here,
    since Time's worker builds in this repo only. `n` is None, as for any candidate with no card in this repo, so no
    pick, no cloud pick and no promotion order can reach one."""
    out = []
    for i in issues:
        labels, body = labels_of(i), i.get("body") or ""
        if not DONE.search(body):
            continue
        out.append({"key": f"{prefix}#{i['number']}", "n": None, "title": _txt(i.get("title"), 120), "body": body[:500],
                    "labels": sorted(labels), "lined_up": False, "actionable": False,
                    "kind": guess_kind(i.get("title") or "", body, labels), "unblocks": 0,
                    "created": str(i.get("created_at") or ""), "why_not": SPINE_WHY_NOT})
    return out


# ---------- optimization candidates from the factory's own records (#171) ----------
# Three sources, each read by arithmetic over the last week, so optimization work no longer waits for a human to notice
# it. Every finding is a synthetic candidate: key `opt:<source>:<id>`, kind optimization, a drafted title and body, and
# no card (`n` is None, as for the spine's cards, so neither the cloud lane nor the promotion order can reach one: both
# skip a candidate with no number). `pick` does reach one, and weighs it against the day's money and its slots like any
# other candidate, so a finding the seat rates highly can take a real card's slot; live, a picked one is written as a
# card (unqueued, a candidate from tomorrow) and never worked on in place. A source a card already names is not proposed
# again, open or closed lately: the week the ledger reads outlives the card written about it, so keying open cards alone
# would propose the same spend again the day its card closed.

OPT = "opt:"
OPT_DAYS = 7              # the window the ledger and the runs are read over
OPT_MIN_USD = 0.25        # a week's spend under this is pennies: nothing to optimize
OPT_SHARE = 0.5           # a group over this share of the week's spend is a candidate
OPT_SKEW = 2.0            # a model whose spend per call is this many times its own median is a candidate
OPT_CALLS = 4             # fewer calls than this say nothing about a model's median
OPT_FAILS = 2             # failed or cancelled runs of one workflow that make a candidate
OPT_PARKED_DAYS = 1       # a parked card is a candidate once its beat is older than this, in whole days
BAD_RUN = ("failure", "cancelled", "canceled")
NAMES = re.compile(rf"^\s*Router:\s*({OPT}\S+)", re.M)


def _recent(at, today: dt.date, days: int) -> bool:
    """Is this timestamp inside the last `days` days? By the day, like the rest of the router's arithmetic."""
    return str(at or "")[:10] >= (today - dt.timedelta(days=days)).isoformat()


def _opt(source: str, ident: str, title: str, body: list[str], created: str,
         done: str = "PR open that does the above, tests green.") -> dict:
    """One synthetic candidate. The body names its own key, which is how a source is proposed once and not every day,
    and carries the `DONE:` line the card is written with. A key holds no spaces: `named` reads it back as one word."""
    word = re.sub(r"\s+", "-", str(ident).strip()) or "unknown"
    key = f"{OPT}{source}:{word}"
    return {"key": key, "n": None, "title": _txt(title, 120),
            "body": "\n".join(body) + f"\n\nRouter: {key}\n\nDONE: {done}",
            "labels": [], "lined_up": False, "actionable": True, "kind": "optimization", "unblocks": 0,
            "created": created or ""}


def ledger_candidates(rows: list[dict], today: dt.date, days: int = OPT_DAYS) -> list[dict]:
    """The week's spend, grouped by model and by entry point (a line's `entry` where it has one, else `pool`, the route
    it booked to). Two questions are worth a card: a group that took over half of what the factory spent, and a model
    whose spend per call is double its own median (a few heavy calls hiding behind a cheap average). A dimension with
    one group that spent anything says nothing about a share — everything went through it by definition, which is what
    `pool` reads like on this repo's own ledger, where every call but three free Venice ones booked to anthropic.
    Pennies are left alone (OPT_MIN_USD), and one group yields at most one candidate."""
    week = [r for r in rows or [] if isinstance(r, dict) and _recent(r.get("at"), today, days)]
    total = sum(_num(r.get("usd"), 0.0, 0.0, 1e6) for r in week)
    calls: dict[tuple[str, str], list[float]] = {}
    for r in week:
        for dim, name in (("model", r.get("model")), ("entry", r.get("entry") or r.get("pool"))):
            if name:
                calls.setdefault((dim, _txt(name, 60)), []).append(_num(r.get("usd"), 0.0, 0.0, 1e6))
    # a share needs something to compare it with: two groups of the dimension that each spent over the floor
    alone = {dim for dim in ("model", "entry") if len([k for k, u in calls.items() if k[0] == dim and sum(u) >= OPT_MIN_USD]) < 2}
    out = []
    for (dim, name), usd in sorted(calls.items()):
        spent, n = sum(usd), len(usd)
        what = "the model" if dim == "model" else "the entry point"
        if spent < OPT_MIN_USD:
            continue
        if total and spent > OPT_SHARE * total and dim not in alone:
            out.append(_opt("ledger", f"{dim}:{name}", f"Why did {name} cost ${spent:.2f} of the week's ${total:.2f}?", [
                f"- Over the last {days} days {name} ({what}) booked ${spent:.2f} of the ${total:.2f} the factory spent "
                f"on models, over {n} call(s): more than half of the bill.",
                "- Read what those calls are and make them cheaper: a shorter system prompt, the prompt cache, a smaller "
                "seat for the easy half of the work, or simply fewer calls.",
                "- Change no behaviour the factory depends on, and say in the PR what the same week would have cost."],
                today.isoformat()))
            continue
        per, mid = spent / n, median(usd) or 0.0   # `median` is in the outcomes section below
        if dim == "model" and n >= OPT_CALLS and mid > 0 and per >= OPT_SKEW * mid:
            out.append(_opt("ledger", f"{dim}:{name}", f"Why does {name} cost ${per:.4f} a call against a ${mid:.4f} median?", [
                f"- {name} made {n} call(s) in the last {days} days for ${spent:.2f}: ${per:.4f} a call against a median "
                f"of ${mid:.4f} a call, so a few heavy calls carry the bill.",
                "- Find the heavy ones (the longest prompts, the longest answers) and cut what they send or ask for; the "
                "cheap calls are already cheap.",
                "- Say in the PR which calls they were and what they cost before and after."],
                today.isoformat()))
    return out


def _workflow(run: dict) -> str:
    """Which workflow a run belongs to: its file's name, else the workflow's name, else its id."""
    path = str(run.get("path") or "").strip().rsplit("/", 1)[-1]
    return _txt(path or run.get("name") or run.get("workflow_id") or "unknown", 60)


def run_candidates(runs, today: dt.date, days: int = OPT_DAYS) -> list[dict]:
    """Actions runs as `/actions/runs` gives them (the shape `tea_actions` reads: the list, or `{"workflow_runs": [...]}`).
    A workflow with OPT_FAILS or more failed or cancelled runs in the window is one candidate, with the failure count
    and the last run's id, which is where to start reading."""
    rows = runs.get("workflow_runs") if isinstance(runs, dict) else runs
    bad: dict[str, list[dict]] = {}
    for r in rows or []:
        if not isinstance(r, dict) or str(r.get("conclusion") or "").strip().lower() not in BAD_RUN:
            continue
        if _recent(r.get("created_at") or r.get("run_started_at") or r.get("started_at") or r.get("updated_at"), today, days):
            bad.setdefault(_workflow(r), []).append(r)
    out = []
    for wf, rs in sorted(bad.items()):
        if len(rs) < OPT_FAILS:
            continue
        last = max(rs, key=lambda r: (str(r.get("created_at") or ""), str(r.get("id") or "")))
        out.append(_opt("ci", wf, f"Why does {wf} keep failing? {len(rs)} runs in {days} days", [
            f"- `{wf}` has {len(rs)} failed or cancelled run(s) in the last {days} days; the last one is run "
            f"`{last.get('id')}`. A workflow that fails this often is either broken or flaky, and either way the factory "
            "reads its red as noise.",
            "- Read that run, find the one cause, and fix it in the code the workflow runs (a test, a script, a missing "
            "guard), not by making the check weaker.",
            "- Workflow files are a human's: if the change belongs in `.github/workflows/`, write the exact change in the "
            "PR and the commit message and stop at the code."],
            today.isoformat()))
    return out


def parked_candidates(parked: list[dict], today: dt.date, days: int = OPT_PARKED_DAYS) -> list[dict]:
    """Cards parked by an `error` or `stuck` beat (as astra.parked_cards reads them): one candidate each, to retry it by
    hand or split it. A card with an open PR belongs to the review path, and one whose automatic retries (#78) are not
    spent is Time's own to retry; neither is proposed, nor is one whose beat is not yet older than `days` whole days —
    at the default that means a card parked today or yesterday waits, and one parked the day before is a candidate."""
    out = []
    for p in parked or []:
        if not isinstance(p, dict):
            continue
        n, at, beat = p.get("n"), str(p.get("at") or ""), str(p.get("beat") or "")
        if n is None or beat not in ("error", "stuck") or p.get("open_pr"):
            continue
        if _num(p.get("retries_left"), 0.0) > 0 or _recent(at, today, days):
            continue
        out.append(_opt("parked", str(n), f"Retry or split #{n}: {_txt(p.get('title'), 70)}", [
            f"- #{n} has been parked since {at[:10] or 'a while ago'}: its last beat was `{beat}` and Time's automatic "
            "retries are spent, so it sits still with no PR of its own and no one waiting on it.",
            f"- Read the beats on #{n}, find what stopped the worker, and either fix that so a retry goes through, or "
            "split the card into ones a worker finishes in one session.",
            f"- Leave #{n} open: the work here is getting it moving again."],
            at or today.isoformat(),
            done=f"#{n} is moving again (a retry that goes through, or the cards that replace it), tests green."))
    return out


def named(issues: list[dict]) -> set[str]:
    """The sources these cards already name (`Router: opt:<source>:<id>` in the body): proposed once, not every day.
    Astra passes the open cards and the ones closed lately, so a source isn't proposed again the day its card closes
    while the window the finding came from is still the same week."""
    return {m for i in issues for m in NAMES.findall(i.get("body") or "")}


def opt_candidates(ledger: list[dict], runs, parked: list[dict], today: dt.date, known=frozenset()) -> list[dict]:
    """Every optimization the three sources show today, minus the ones a card already names (`known`)."""
    found = ledger_candidates(ledger, today) + run_candidates(runs, today) + parked_candidates(parked, today)
    return [c for c in found if c["key"] not in known]


def last_picked(beats: list[dict]) -> dict[str, str]:
    """The day each kind was last picked, from Astra's live beats."""
    out: dict[str, str] = {}
    for b in beats:
        if b.get("router") != "live":
            continue
        day = str(b.get("at") or "")[:10]
        for p in b.get("picked") or []:
            k = p.get("kind") if isinstance(p, dict) else None
            if k in KINDS and day > out.get(k, ""):
                out[k] = day
    return out


def _days(since: str, today: dt.date, cap: float) -> float:
    try:
        return float(min(cap, max(0, (today - dt.date.fromisoformat(since[:10])).days)))
    except ValueError:
        return float(cap)   # never picked (or no date): as restless as it gets


def score(c: dict, a: dict, cfg: dict, last: dict[str, str], today: dt.date) -> dict:
    """One candidate, judged (`a`: the seat's kind, value, size, why) and scored, with every factor kept for the table."""
    kind = a.get("kind") if a.get("kind") in KINDS else c["kind"]
    size = str(a.get("size") or "M").strip().upper()[:1]
    size = size if size in SIZES else "M"
    value = _num(a.get("value"), 3.0, 1.0, 5.0)
    restless = 1 + cfg["restless"] * _days(last.get(kind, ""), today, 10)
    age = 1 + 0.02 * (_days(c["created"], today, 20) if c.get("created") else 0)
    s = cfg["weights"][kind] * restless * age * (value + 0.5 * c["unblocks"]) / SIZES[size]
    out = {**c, "kind": kind, "value": value, "size": size, "why": _txt(a.get("why"), 200),
           "restless": round(restless, 2), "age": round(age, 2), "score": round(s, 3), "judged": bool(a)}
    if size == "L" and out["actionable"]:
        out["actionable"], out["why_not"] = False, "L: split it into cards a worker finishes in one session first"
    blocked = _txt(a.get("blocked"), 120) if isinstance(a.get("blocked"), str) else ""
    if blocked.lower() not in ("", "no", "none", "false", "-", "n/a") and out["actionable"]:
        out["actionable"], out["why_not"] = False, f"blocked: {blocked}"   # the seat knows what no Depends line says
    return out


def rank(cands: list[dict], assess: dict[str, dict], cfg: dict, last: dict[str, str], today: dt.date) -> list[dict]:
    """Best first; ties to the older card."""
    scored = [score(c, assess.get(c["key"]) or {}, cfg, last, today) for c in cands]
    return sorted(scored, key=lambda r: (-r["score"], r["n"] if r["n"] is not None else 10**9))


def pick_cloud(ranked: list[dict], cfg: dict, in_lane: int) -> list[dict]:
    """From the top: actionable cards of the lane's sizes, not lined up, until the lane holds `per_day` cards (those
    still labelled `cloud` count). The cloud-session credit pays for these, so no money check."""
    want, out = cfg["cloud"]["per_day"] - in_lane, []
    for r in ranked:
        if len(out) >= want:
            break
        if r["n"] is not None and r["actionable"] and not r["lined_up"] and r["size"] in cfg["cloud"]["sizes"]:
            out.append(r)
    return out


def pick(ranked: list[dict], cfg: dict, left_usd: float, max_n: int) -> list[dict]:
    """From the top: cards not yet lined up, while the day's money left covers their size's estimated cost."""
    out, spent = [], 0.0
    for r in ranked:
        if len(out) >= max_n:
            break
        if r["lined_up"] or not r["actionable"]:
            continue
        cost = cfg["cost_usd"][r["size"]]
        if spent + cost > left_usd:
            continue
        out.append(r)
        spent += cost
    return out


def order(ranked: list[dict]) -> list[int]:
    """Card numbers best first, the ones that can move before the ones that wait: the heartbeat promotes queued cards in
    this order (and still skips a card whose dependency is open)."""
    cards = [r for r in ranked if r["n"] is not None]
    return [r["n"] for r in cards if r["actionable"]] + [r["n"] for r in cards if not r["actionable"]]


# ---------- outcomes: what a pick turned into (#172) ----------
# A learning policy needs rewards. Housekeeping settles each live pick into one line here; these functions are the
# shape of a line, the arithmetic over the lines, and nothing else. No pick reads them yet.

OUTCOMES = "time/ledger/router-outcomes.jsonl"   # under time/ledger/, the one path CI ignores: the daily append is not code
FIELDS = ("n", "kind", "picked", "settled", "merged", "pr", "days", "usd", "signups")


def picks(beats: list[dict]) -> dict[int, dict]:
    """Every card the router picked in live mode, from Astra's beats: card number -> {n, kind, picked (the day)}. A
    card picked twice (it came back after a park) keeps its first pick; that is when the factory spent the choice."""
    out: dict[int, dict] = {}
    for b in beats:
        if b.get("router") != "live":
            continue
        day = str(b.get("at") or "")[:10]
        for p in b.get("picked") or []:
            n = p.get("n") if isinstance(p, dict) else None
            if isinstance(n, int) and n not in out:
                out[n] = {"n": n, "kind": p.get("kind") if p.get("kind") in KINDS else "feature", "picked": day}
    return out


def span(since: str, until: str) -> int | None:
    """Whole days from one date to another, None when either is not a date."""
    try:
        return (dt.date.fromisoformat(until[:10]) - dt.date.fromisoformat(since[:10])).days
    except ValueError:
        return None


def outcome(p: dict, card: dict, beats: list[dict], usd: float | None, signups: int | None) -> dict | None:
    """One line for a pick, or None while its card is still open: a pick in flight has no outcome yet. Merged or not
    and the PR number come from the card's own beats (a `merged` beat is a landing; any beat naming a `pr` is the PR
    the card had), `days` counts the pick's day to the card's close, `usd` and `signups` are the caller's."""
    if (card.get("state") or "open") != "closed":
        return None
    settled = str(card.get("closed_at") or card.get("updated_at") or "")[:10]
    merged = next((b for b in beats if b.get("beat") == "merged"), None)
    pr = (merged or {}).get("pr") or next((b.get("pr") for b in reversed(beats) if b.get("pr")), None)
    return {"n": p["n"], "kind": p["kind"], "picked": p["picked"], "settled": settled, "merged": bool(merged),
            "pr": int(pr) if pr else None, "days": span(p["picked"], settled),
            "usd": round(usd, 4) if usd is not None else None, "signups": signups}


def read_outcomes(raw: str | None) -> list[dict]:
    """The outcomes log as rows, oldest first. A line that is not an outcome is skipped: the file is append-only and
    one bad line must not hide the rest."""
    out = []
    for line in (raw or "").splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and isinstance(row.get("n"), int):
            out.append(row)
    return out


def median(xs: list[float]) -> float | None:
    s = sorted(xs)
    if not s:
        return None
    return float(s[len(s) // 2]) if len(s) % 2 else (s[len(s) // 2 - 1] + s[len(s) // 2]) / 2


def summary(rows: list[dict]) -> dict[str, dict]:
    """Per kind, what its settled picks returned: how many, the merged share, the median days from pick to close and
    the median dollars. A kind with no settled pick is left out."""
    out = {}
    for k in KINDS:
        mine = [r for r in rows if r.get("kind") == k]
        if mine:
            out[k] = {"picks": len(mine), "merged": sum(1 for r in mine if r.get("merged")) / len(mine),
                      "days": median([r["days"] for r in mine if isinstance(r.get("days"), (int, float))]),
                      "usd": median([r["usd"] for r in mine if isinstance(r.get("usd"), (int, float))])}
    return out


def outcome_lines(rows: list[dict]) -> list[str]:
    """The header over Astra's table: one line per kind, so the owner sees what a kind has returned before changing
    its weight. No settled pick yet, no header."""
    got = summary(rows)
    if not got:
        return []
    out = [f"Settled picks so far ({len(rows)} in `{OUTCOMES}`):"]
    for k, s in got.items():
        days = f"{s['days']:g} day(s) median" if s["days"] is not None else "days unknown"
        usd = f"${s['usd']:.2f} median" if s["usd"] is not None else "$ unknown"
        out.append(f"- {k}: {s['picks']} pick(s), {s['merged'] * 100:.0f}% merged, {days}, {usd}")
    return out


def table(ranked: list[dict], picked: list[dict], mode: str, limit: int = 15, cloud: list[dict] = ()) -> str:
    chosen, sent = {r["key"] for r in picked}, {r["key"] for r in cloud}
    mark = "queued today" if mode == "live" else "would queue"
    rows = []
    for k, r in enumerate(ranked[:limit], 1):
        lane = "cloud lane" if CLOUD in r.get("labels", ()) else "lined up" if r["lined_up"] else ""
        if r["key"] in chosen:   # a candidate with no card (an `opt:` finding) is written as one instead of being queued
            note = f"**written as #{r['written']}**" if r.get("written") else \
                f"**{mark}**" if r["n"] is not None else "**would be written as a card**"
        elif r["key"] in sent:
            note = "**to the cloud today**" if mode == "live" else "**would go to the cloud**"
        else:
            note = "; ".join(x for x in (lane, r.get("why_not", "") if not r["actionable"] else "") if x)
        # a card's number, here or on the spine; an `opt:` finding, its source
        name = f"{r['key']} {r['title']}" if "#" in r["key"] or r["key"].startswith(OPT) else r["title"]
        rows.append(f"| {k} | {_txt(name, 80).replace('|', '/')} | {r['kind']} | {r['value']:g} | {r['size']} | "
                    f"{r['unblocks']} | {r['restless']:g} | {r['score']:g} | {_txt(r['why'], 140).replace('|', '/')} | "
                    f"{_txt(note, 90).replace('|', '/')} |")
    more = f"\n\n_{len(ranked) - limit} more ranked below these._" if len(ranked) > limit else ""
    return ("| # | card | kind | value | size | waiting | restless | score | why | status |\n|---|---|---|---|---|---|---|---|---|---|\n"
            + "\n".join(rows) + more)


# ---------- the same work twice: repeats and superseded cards (#198) ----------
# Nobody here closes or drops a card: these two functions say "these look like the same work", and a reader decides.
# Astra asks before writing a card; housekeeping's sweep asks of every open card, so a card whose work landed under
# another number doesn't sit on the board being ranked and queued again.

# `Port: #139`, `Port of #139`, `Follows #48`, `Follows on from #48`, `Follow-up to #48`: the card this one carries
# over from or continues, the way `Depends on #N` names what it waits on.
REF = re.compile(r"\b(?:Port(?:s|ed|ing)?|Follow-up|Follows?)\b(?:[\s:]*(?:of|from|on|to|up))*[\s:]*#(\d+)", re.I)


def _norm(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (title or "").lower()).strip()


def repeat_of(title: str, known: list[dict]) -> int | None:
    """The card a title repeats, if any: the same words, or the whole of one title (four words or more) inside the
    other. Not a similarity score: sibling cards share most of their words ("Tool: havre_check", "Tool: havre_new") and
    are not repeats. Paraphrases are the reader's to spot."""
    t = _norm(title)
    for i in known:
        k = _norm(i.get("title", ""))
        short, long_ = sorted((t, k), key=len)
        if t and k and (t == k or (len(short.split()) >= 4 and short in long_)):
            return i.get("number")
    return None


def refs(body: str | None) -> set[int]:
    """The cards a body ports or follows (`REF`)."""
    return {int(n) for n in REF.findall(body or "")}


def superseded(open_cards: list[dict], closed: list[dict]) -> list[dict]:
    """Open cards whose work a closed card looks to have already done: `{"n", "title", "by", "why"}`, by card number.
    Three signals, in order of how much they say, and the first that hits is the one reported:
      - the closed card's title repeats the open one's (`repeat_of`),
      - the closed card ports or follows the open card itself (`Port of #48` on the card that landed),
      - both cards port or follow the same card (two goes at carrying the same work over).
    A hint, never a verdict: a reader decides what to close, so the lists stay small and the rule stays checkable."""
    done = [(c, refs(c.get("body"))) for c in closed if isinstance(c.get("number"), int)]
    out = []
    for i in open_cards:
        n, title = i.get("number"), i.get("title") or ""
        mine = refs(i.get("body"))
        others = [(c, r) for c, r in done if c["number"] != n]
        hit = next(((c, "the same title") for c, _ in others if repeat_of(title, [c])), None) \
            or next(((c, f"#{c['number']} follows it") for c, r in others if n in r), None) \
            or next(((c, "both carry over " + ", ".join(f"#{k}" for k in sorted(mine & r))) for c, r in others if mine & r), None)
        if hit:
            out.append({"n": n, "title": _txt(title, 120), "by": hit[0]["number"], "why": hit[1]})
    return out
