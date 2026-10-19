"""The router: what the factory works on next (time#68, #72).

Astra, the daily planner, gathers the candidates and asks its seat to judge each one; this module turns those
judgments into one ranked list, in arithmetic anyone can check, and picks from the top. In live mode the heartbeat
promotes queued cards in the same order instead of oldest first.

A candidate is an open card a worker can take (a `DONE:` line; not a parent, not a human's, not the venture loop's
own), or work with no card yet that the factory could start (a new venture). Each has a kind: venture, feature,
refinement or optimization.

    score = weight[kind] x restless(kind) x age x (value + 0.5 x unblocks) / size

- value (1-5) and size (S, M, L = 1, 2, 4) are the seat's judgment; unblocks counts the open cards that wait on it.
- weight is the owner's dial per kind, in time/router.json (all 1: balanced).
- restless: a kind the factory hasn't picked for a while climbs, 1 + rate x days (at most 10 days), so none starves.
- age: an old card climbs a little, 1 + 0.02 x days open (at most 20 days).

An L is ranked but never queued: a card is what one worker session finishes, so it is split first. The policy is
`score`; a bandit policy (Beth, Jev, Fable's restless-bandit maths) can replace it without touching how candidates are
gathered or how picks are queued.
"""
from __future__ import annotations

import datetime as dt
import json
import re

KINDS = ("venture", "feature", "refinement", "optimization")
SIZES = {"S": 1, "M": 2, "L": 4}
MODES = ("off", "dry", "live")
DEFAULTS = {"mode": "off", "weights": dict.fromkeys(KINDS, 1.0), "restless": 0.05, "cost_usd": {"S": 0.5, "M": 1.5, "L": 4.0}}
LOOP = {"venture", "venture-batch", "signal", "signup"}       # the venture loop's own cards: it runs them itself
HELD = {"needs-human", "andon", "astra", "planned"} | LOOP     # a human's, an alarm, Astra's log, parents, the loop's
LINED_UP = {"queued", "ready"}                                 # already moving: ranked (for promotion), never queued again
DONE = re.compile(r"^\s*DONE:", re.M | re.I)
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
    return {"mode": mode if mode in MODES else "off",
            "weights": {k: _num(w.get(k), 1.0) for k in KINDS},
            "restless": _num(got.get("restless"), DEFAULTS["restless"], 0.0, 1.0),
            "cost_usd": {s: _num(c.get(s), DEFAULTS["cost_usd"][s]) for s in SIZES}}


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
    out = []
    for i in issues:
        labels, body = labels_of(i), i.get("body") or ""
        if labels & HELD or not DONE.search(body):
            continue
        out.append({"key": f"#{i['number']}", "n": i["number"], "title": _txt(i.get("title"), 120), "body": body[:500],
                    "labels": sorted(labels), "lined_up": bool(labels & LINED_UP), "actionable": True,
                    "kind": guess_kind(i.get("title") or "", body, labels), "unblocks": waits.get(i["number"], 0),
                    "created": str(i.get("created_at") or "")})
    return out


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
    return out


def rank(cands: list[dict], assess: dict[str, dict], cfg: dict, last: dict[str, str], today: dt.date) -> list[dict]:
    """Best first; ties to the older card."""
    scored = [score(c, assess.get(c["key"]) or {}, cfg, last, today) for c in cands]
    return sorted(scored, key=lambda r: (-r["score"], r["n"] if r["n"] is not None else 10**9))


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
    """Card numbers best first: the heartbeat promotes queued cards in this order."""
    return [r["n"] for r in ranked if r["n"] is not None]


def table(ranked: list[dict], picked: list[dict], mode: str, limit: int = 15) -> str:
    chosen = {r["key"] for r in picked}
    mark = "queued today" if mode == "live" else "would queue"
    rows = []
    for k, r in enumerate(ranked[:limit], 1):
        note = (f"**{mark}**" if r["key"] in chosen else "lined up" if r["lined_up"]
                else r.get("why_not", "") if not r["actionable"] else "")
        name = f"{r['key']} {r['title']}" if r["n"] is not None else r["title"]
        rows.append(f"| {k} | {_txt(name, 80).replace('|', '/')} | {r['kind']} | {r['value']:g} | {r['size']} | "
                    f"{r['unblocks']} | {r['restless']:g} | {r['score']:g} | {_txt(r['why'], 140).replace('|', '/')} | "
                    f"{_txt(note, 90).replace('|', '/')} |")
    more = f"\n\n_{len(ranked) - limit} more ranked below these._" if len(ranked) > limit else ""
    return ("| # | card | kind | value | size | waiting | restless | score | why | status |\n|---|---|---|---|---|---|---|---|---|---|\n"
            + "\n".join(rows) + more)
