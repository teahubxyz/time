"""The router: what the factory works on next (time#68, #72).

Astra, the daily planner, gathers the candidates and asks its seat to judge each one; this module turns those
judgments into one ranked list, in arithmetic anyone can check, and picks from the top. In live mode the heartbeat
promotes queued cards in the same order instead of oldest first.

A candidate is an open card a worker can take (a `DONE:` line; not a parent, not a human's, not the venture loop's
own), work with no card yet that the factory could start (a new venture, or a v2 of a live venture people signed up
for), or a card of the spine (`teahubxyz/teahub`: Tea MCP, the Pages server, the Gitea look), which is ranked and shown
but never queued, since Time's worker builds in this repo only (#173). Each has a kind: venture, feature, refinement
or optimization.

Ventures (#170): "start a new venture" is actionable only once the venture loop is in router mode (`TIME_VENTURE=router`,
which Astra reads as `TIME_VENTURE_MODE`); under `on` or `off` the loop decides for itself, so the candidate is shown
with what's missing instead. Every live venture in `ventures/ventures.json` with signups is also a "v2 of <venture>"
candidate, shown with its signups. Both have no card here (`n` is None), so no pick, no cloud pick and no promotion
order reaches one: Astra starts them itself (venture.yml dispatched with `start=true` for a new venture, the venture's
own v2 card for a v2).

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

An L is ranked but never queued: a card is what one worker session finishes, so it is split first. Nor is a card that
waits: on a card still open (a `Depends on: #N` line per card it waits on), or on whatever the seat says blocks it (a
PR that can't merge, a human). Cards that can move come first in the promotion order, the ones that wait after them.
The policy is `score`; a bandit policy (Beth, Jev, Fable's restless-bandit maths) can replace it without touching how
candidates are gathered or how picks are queued.

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
DEPENDS = re.compile(r"Depends on:?[ \t]*#(\d+)", re.I)   # one line per card waited on; the planner writes them (#244)
SPINE_WHY_NOT = "spine: not queued (Time builds in this repo only)"
NEW_VENTURE = {"key": "venture:new", "n": None, "title": "Start a new venture: research, pick, build and launch one page",
               "body": "The venture loop (venture.py): one venture, researched and picked by the lead, built and judged.",
               "labels": [], "lined_up": False, "actionable": False, "kind": "venture", "unblocks": 0, "created": "",
               "why_not": "the venture loop isn't in router mode (TIME_VENTURE=router, which Astra reads as TIME_VENTURE_MODE)"}
VENTURE_MODE = "router"   # the one TIME_VENTURE mode in which the router, not the schedule, starts a venture
VENTURE_KEY = "venture:"  # the key of a candidate with no card here that Astra starts itself (venture:new, venture:v2:<slug>)


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
        for d in set(DEPENDS.findall(i.get("body") or "")):
            waits[int(d)] = waits.get(int(d), 0) + 1
    open_n = {i.get("number") for i in issues}
    out = []
    for i in issues:
        labels, body = labels_of(i), i.get("body") or ""
        if labels & HELD or not DONE.search(body):
            continue
        deps = sorted({int(d) for d in DEPENDS.findall(body)} & open_n)   # a closed dependency is done
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


def new_venture(mode: str) -> dict:
    """"Start a new venture": actionable only when Astra is told the loop is in router mode, since only then does the
    loop wait to be asked. Its size and cost come from the seat, like any card's."""
    hot = str(mode or "").strip().lower() == VENTURE_MODE
    return {**NEW_VENTURE, "actionable": True, "why_not": ""} if hot else dict(NEW_VENTURE)


def v2_candidates(reg: dict) -> list[dict]:
    """A "v2 of <venture>" for every live venture people signed up for, from `ventures/ventures.json` on the Pages
    branch: the studio's next version of something that already got a signal. No signups, no candidate — a v2 of a page
    nobody asked for is work the factory has no reason to do. Like a new venture it has no card here (`n` is None)."""
    out = []
    for v in reg.get("ventures") or []:
        if not isinstance(v, dict) or v.get("status") != "live" or not v.get("slug"):
            continue
        try:
            signups = int(v.get("signups") or 0)
        except (TypeError, ValueError):
            continue
        if signups <= 0:
            continue
        name = _txt(v.get("name") or v["slug"], 60)
        out.append({**NEW_VENTURE, "key": f"venture:v2:{v['slug']}", "title": f"v2 of {name} ({signups} signups)",
                    "body": _txt(f"{v.get('one_liner', '')} Build the next version of ventures/{v['slug']}/ from what its "
                                 f"{signups} signup(s) asked for.", 400),
                    "actionable": True, "why_not": "", "slug": v["slug"], "name": name, "signups": signups,
                    "next_v": int(_num(v.get("version"), 1.0, 1.0, 99.0)) + 1})
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
        note = (f"**{mark}**" if r["key"] in chosen else ("**to the cloud today**" if mode == "live" else "**would go to the cloud**")
                if r["key"] in sent else "; ".join(x for x in (lane, r.get("why_not", "") if not r["actionable"] else "") if x))
        name = f"{r['key']} {r['title']}" if "#" in r["key"] else r["title"]   # a card's number, here or on the spine
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
