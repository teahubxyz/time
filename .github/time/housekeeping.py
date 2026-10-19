"""Housekeeping: the daily sweep. Deterministic on purpose: no model decides what to delete or close. stdlib only.

    python3 .github/time/housekeeping.py      # daily (housekeeping.yml), or by hand

Five steps, each idempotent (a second run finds nothing to do) and each logged:
  1. branches   delete every branch whose PR merged into the default branch. Never the default branch, `gh-pages`, a
                protected branch, a branch with an open PR, or a branch that has commits newer than its merge.
  2. signals    close `signal` issues whose venture's measuring window (TIME_VENTURE_MEASURE_DAYS, default 7) has passed
                with no signups (no 👍 on the issue, no early-access issue for the venture), with one closing line.
  3. milestones close milestones with no open issues and at least one closed one.
  4. outcomes   append one line to `time/ledger/router-outcomes.jsonl` per router pick that has settled (#172): merged
                or not, its PR, days from pick to close, the spend booked while its worker ran, and a venture's signups
                at day 7. A pick whose card is still open is in flight and waits for a later sweep.
  5. stale      list, never act: `needs-human` untouched for 3 days, open PRs idle 7 days, cards parked after their
                automatic retries, cards whose last beat is `error` for 2 days. One comment on the Astra log; none if empty.
Then one summary line on the Astra log. Only TIME_MODE=live changes anything; anything else (the default) prints what it
would do and writes nothing, comments included. A step that fails is logged and the others still run (exit code 1).
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

NEVER = {"gh-pages"}          # besides the default branch and protected ones
LOG_TITLE = "Astra log"
LOG_FALLBACK = 57             # the Astra log's number here, if it cannot be found by title
NEEDS_HUMAN_DAYS, PR_IDLE_DAYS, ERROR_DAYS = 3, 7, 2
VENTURES = "ventures/ventures.json"   # the venture registry (venture.py writes it), on the Pages branch
PAGES_BRANCH = "gh-pages"


def log(msg: str) -> None:
    print(msg, flush=True)


def repo() -> str:
    return f"/repos/{tm.REPO}"


def paged(path: str, pages: int = 40) -> list[dict]:
    sep = "&" if "?" in path else "?"
    out: list[dict] = []
    for page in range(1, pages + 1):
        batch = tm.gh("GET", f"{path}{sep}limit=50&page={page}") or []   # Gitea answers an issue with no reactions with null
        out += batch
        if len(batch) < 50:
            break
    return out


def parse(ts: str | None) -> dt.datetime | None:
    if not ts:
        return None
    try:
        d = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def age_days(ts: str | None, now: dt.datetime) -> float:
    d = parse(ts)
    return (now - d).total_seconds() / 86400 if d else 0.0


def stamp(ts: str | dt.datetime | None) -> str:
    """A timestamp written the way the ledger writes them, so one string comparison orders beats, ledger lines and
    windows alike whatever offset the API sent."""
    d = ts if isinstance(ts, dt.datetime) else parse(ts)
    return d.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if d else ""


def measure_days() -> int:
    """The venture measuring window: how long a signal issue is given, and the day a pick's signups are counted on."""
    return int(float(os.environ.get("TIME_VENTURE_MEASURE_DAYS") or 7))


def repo_file(path: str, ref: str = "") -> str | None:
    """A file in the repo, read through the API (the workflow checks out only `.github/time`). None if there is none."""
    try:
        f = tm.gh("GET", f"{repo()}/contents/{urllib.parse.quote(path)}" + (f"?ref={ref}" if ref else ""))
    except RuntimeError as e:
        if "-> 404" in str(e):
            return None
        raise
    return base64.b64decode(f.get("content") or "").decode(errors="replace")


def labelled(name: str, query: str = "state=open") -> list[dict]:
    """Issues (and PRs) that carry `name`. Each row is checked too: Gitea ignores a filter on a label the repo does not
    have and returns everything, which on the first live run listed every open issue as a parked card."""
    return [i for i in paged(f"{repo()}/issues?{query}&labels={urllib.parse.quote(name)}") if tm.has_label(i, name)]


def same_repo(pr: dict) -> bool:
    return ((pr.get("head") or {}).get("repo") or {}).get("full_name", tm.REPO) == tm.REPO  # a fork's branch is not ours


# ---------- 1. branches ----------

def step_branches(live: bool) -> int:
    default = tm.default_branch()
    open_heads = {p["head"]["ref"] for p in paged(f"{repo()}/pulls?state=open") if same_repo(p)}
    merged: dict[str, dt.datetime | None] = {}   # head ref -> when its latest merged PR merged
    for p in paged(f"{repo()}/pulls?state=closed&sort=recentupdate"):
        if (p.get("merged") or p.get("merged_at")) and (p.get("base") or {}).get("ref") == default and same_repo(p):
            at = parse(p.get("merged_at"))
            ref = p["head"]["ref"]
            merged[ref] = max([d for d in (merged.get(ref), at) if d], default=None)
    deleted = 0
    for b in paged(f"{repo()}/branches"):
        name = b["name"]
        if name == default or name in NEVER or b.get("protected") or name not in merged:
            continue
        if name in open_heads:
            log(f"branches: keep {name} (open PR)")
            continue
        tip = parse((b.get("commit") or {}).get("timestamp"))
        if tip and merged[name] and tip > merged[name]:
            log(f"branches: keep {name} (commits after its merge)")
            continue
        if not live:
            log(f"branches: would delete {name}")
            continue
        try:
            tm.gh("DELETE", f"{repo()}/branches/{urllib.parse.quote(name, safe='')}")
        except RuntimeError as e:
            if "-> 404" not in str(e):   # already gone is fine
                raise
            continue
        log(f"branches: deleted {name}")
        deleted += 1
    return deleted


# ---------- 2. signal issues ----------

def person(user: dict | None) -> str | None:
    login = ((user or {}).get("login") or "").lower()
    if not login or (user or {}).get("type") == "Bot" or login in (tm.REPO.split("/")[0].lower(), tm.TIME_USER.lower(), tm.TIME_BOT.lower()):
        return None
    return login


def signup_people(until: str = "9999") -> dict[str, set[str]]:
    """venture slug -> distinct people who opened an early-access issue for it before `until` (all of them by default)."""
    out: dict[str, set[str]] = {}
    for i in labelled("signup", "state=all&type=issues"):
        m = re.search(r"^###\s*Venture\s*$\n+(.*?)(?=^###\s|\Z)", i.get("body") or "", re.M | re.S)
        who = person(i.get("user"))
        if m and who and m.group(1).strip() and stamp(i.get("created_at")) < until:
            out.setdefault(m.group(1).strip().lower(), set()).add(who)
    return out


def step_signals(live: bool, now: dt.datetime) -> int:
    days = measure_days()
    due = [i for i in labelled("signal", "state=open&type=issues")
           if not i.get("pull_request") and age_days(i.get("created_at"), now) >= days]
    if not due:
        return 0
    signups = signup_people()
    closed = 0
    for i in due:
        n = i["number"]
        m = re.search(r"[?&]venture=([\w.-]+)", i.get("body") or "")
        if not m:
            log(f"signals: keep #{n} (cannot tell which venture it belongs to)")
            continue
        people = set(signups.get(m.group(1).lower(), set()))
        people |= {w for r in paged(f"{repo()}/issues/{n}/reactions") if r.get("content") in ("+1", "👍")
                   and (w := person(r.get("user")))}
        if people:
            log(f"signals: keep #{n} ({len(people)} signup(s))")
            continue
        if not live:
            log(f"signals: would close #{n} (0 signups after {days} days)")
            continue
        tm.gh("PATCH", f"{repo()}/issues/{n}", {"state": "closed"})
        tm.comment(n, f"Closed by housekeeping: 0 signups in the {days}-day measuring window.", {"housekeeping": "signal"})
        log(f"signals: closed #{n}")
        closed += 1
    return closed


# ---------- 3. milestones ----------

def step_milestones(live: bool) -> int:
    closed = 0
    for m in paged(f"{repo()}/milestones?state=open"):
        if int(m.get("open_issues") or 0) or not int(m.get("closed_issues") or 0):
            continue
        if not live:
            log(f"milestones: would close {m.get('title')!r}")
            continue
        tm.gh("PATCH", f"{repo()}/milestones/{m['id']}", {"state": "closed"})
        log(f"milestones: closed {m.get('title')!r}")
        closed += 1
    return closed


# ---------- 4. the router's outcomes ----------
# What a pick turned into, so a learning policy (a restless bandit) has rewards to read. The ledger has no card field,
# so a card's spend is the dollars booked while its worker ran: each `dispatched` beat until the next beat on the card
# (the chosen proxy of the two the card offered; review and planning calls on the card are not counted).

def run_windows(beats: list[dict], settled: str) -> list[tuple[str, str]]:
    """The card's worker runs as [start, end) in UTC: a `dispatched` beat until the next beat on the card, the last one
    until the card settled."""
    at = [stamp(b.get("at")) for b in beats]
    out = [(at[k], next((s for s in at[k + 1:] if s), settled)) for k, b in enumerate(beats)
           if b.get("beat") == "dispatched" and at[k]]
    return [(a, z) for a, z in out if a < z]


def months(since: str, until: str) -> list[str]:
    """The ledger months a span touches, `2026-10` first."""
    out, m = [], since[:7]
    while m <= until[:7] and len(out) < 24:
        out.append(m)
        m = f"{int(m[:4]) + (m[5:] == '12')}-{int(m[5:]) % 12 + 1:02d}"
    return out


def window_usd(windows: list[tuple[str, str]]) -> float:
    """Dollars the ledger booked inside any of these windows."""
    if not windows:
        return 0.0
    rows = [r for m in months(min(a for a, _ in windows), max(z for _, z in windows)) for r in tm.ledger_lines(m)]
    return sum(r.get("usd") or 0 for r in rows if any(a <= str(r.get("at") or "") < z for a, z in windows))


def ventures() -> list[dict]:
    """The venture registry on the Pages branch. Read-only here; unreadable is an empty studio."""
    try:
        reg = json.loads(repo_file(VENTURES, PAGES_BRANCH) or "{}")
    except (ValueError, RuntimeError) as e:
        log(f"outcomes: venture registry unreadable: {str(e)[:120]}")
        return []
    return [v for v in (reg.get("ventures") if isinstance(reg, dict) else None) or [] if isinstance(v, dict)]


def signups_by(v: dict, until: str) -> int:
    """Distinct people (not bots, not the owner) who asked for early access for this venture or 👍'd its signal issue
    before `until`. The slug match is the signal step's, so a signup that named the venture some other way is missed."""
    people = set(signup_people(until).get(str(v.get("slug") or "").lower(), set()))
    if v.get("signal"):
        people |= {w for r in paged(f"{repo()}/issues/{v['signal']}/reactions") if r.get("content") in ("+1", "👍")
                   and stamp(r.get("created_at")) < until and (w := person(r.get("user")))}
    return len(people)


def day_after(day: str, days: int) -> str:
    """Midnight `days` days after a date, as a ledger timestamp; "" when the date is not one."""
    try:
        return (dt.date.fromisoformat(day[:10]) + dt.timedelta(days=days)).strftime("%Y-%m-%dT00:00:00Z")
    except ValueError:
        return ""


def step_outcomes(live: bool, now: dt.datetime) -> int:
    """One line per settled pick in `router.OUTCOMES`, appended in one commit. A pick already in the file is never
    written twice; a pick whose card is still open, or whose venture has not reached day 7, waits for a later sweep."""
    picks = router.picks(tm.beats_of(paged(f"{repo()}/issues/{log_issue()}/comments")))
    if not picks:
        return 0
    have = {r["n"] for r in router.read_outcomes(repo_file(router.OUTCOMES))}
    rows, registry = [], None
    for n, p in sorted(picks.items()):
        if n in have:
            continue
        try:
            card = tm.gh("GET", f"{repo()}/issues/{n}")
        except RuntimeError as e:
            if "-> 404" not in str(e):
                raise
            log(f"outcomes: skip #{n} (no such card)")
            continue
        if (card.get("state") or "open") != "closed":
            log(f"outcomes: keep #{n} (still in flight)")
            continue
        settled = stamp(card.get("closed_at")) or stamp(card.get("updated_at")) or stamp(now)
        beats = tm.beats_of(paged(f"{repo()}/issues/{n}/comments"))
        signups = None
        if p["kind"] == "venture":
            registry = ventures() if registry is None else registry
            v = next((x for x in registry if x.get("card") == n), None)
            day7 = day_after(str(v.get("launched") or v.get("planned") or p["picked"]), measure_days()) if v else ""
            if day7 and day7 > stamp(now):
                log(f"outcomes: keep #{n} (its venture's day {measure_days()} is {day7[:10]})")
                continue
            signups = signups_by(v, day7 or "9999") if v else None
        row = router.outcome(p, card, beats, window_usd(run_windows(beats, settled)), signups)
        if row:
            rows.append(row)
            log(f"outcomes: #{n} settled ({'merged' if row['merged'] else 'not merged'}, {row['days']} day(s), "
                f"${row['usd'] or 0:.2f}" + (f", {row['signups']} signup(s)" if row["signups"] is not None else "") + ")")
    if not rows:
        return 0
    if not live:
        log(f"outcomes: would record {len(rows)} settled pick(s)")
        return 0
    tm.git_commit(tm.default_branch(), {}, f"router: {len(rows)} settled pick(s)",
                  append={router.OUTCOMES: "".join(json.dumps(r, separators=(",", ":")) + "\n" for r in rows).encode()})
    log(f"outcomes: recorded {len(rows)} settled pick(s) in {router.OUTCOMES}")
    return len(rows)


# ---------- 5. the stale list ----------

def stale(now: dt.datetime) -> dict[str, list[tuple[int, float, str]]]:
    """category -> [(number, age in days, title)]. Read-only."""
    out: dict[str, list[tuple[int, float, str]]] = {}

    def add(cat: str, number: int, age: float, title: str) -> None:
        out.setdefault(cat, []).append((number, age, title))
    for i in labelled("needs-human"):   # issues and PRs alike
        age = age_days(i.get("updated_at") or i.get("created_at"), now)
        if age > NEEDS_HUMAN_DAYS:
            add(f"`needs-human`, untouched for over {NEEDS_HUMAN_DAYS} days", i["number"], age, i.get("title", ""))
    for p in paged(f"{repo()}/pulls?state=open"):
        age = age_days(p.get("updated_at") or p.get("created_at"), now)
        if age >= PR_IDLE_DAYS:
            add(f"open PRs idle {PR_IDLE_DAYS} days or more", p["number"], age, p.get("title", ""))
    for i in labelled("parked", "state=open&type=issues"):
        add("parked cards", i["number"], age_days(i.get("updated_at") or i.get("created_at"), now), i.get("title", ""))
    for card in labelled("ready", "state=open&type=issues"):   # last beat: error for a while, or parked
        beats = [b for b in tm.beats_of(paged(f"{repo()}/issues/{card['number']}/comments")) if b["beat"] not in ("blocked", "capped")]
        last = beats[-1] if beats else None
        if not last:
            continue
        age = age_days(last["at"], now)
        if last["beat"] == "parked":
            add("parked cards", card["number"], age, card.get("title", ""))
        elif last["beat"] == "error" and age > ERROR_DAYS:
            add(f"`error` cards older than {ERROR_DAYS} days", card["number"], age, card.get("title", ""))
    for cat, rows in out.items():   # a card can be listed under two names (parked label and beat): once per category
        out[cat] = list({r[0]: r for r in rows}.values())
    return out


def stale_text(found: dict[str, list[tuple[int, float, str]]]) -> str:
    lines = ["🧹 Housekeeping: the stale list (nothing was changed; for the steward)", ""]
    for cat, rows in found.items():
        lines.append(f"- {cat}: " + "; ".join(f"#{n} {t[:60]} ({a:.0f}d)" for n, a, t in sorted(rows)))
    return "\n".join(lines)


def log_issue() -> int:
    for i in labelled("astra", "state=open&type=issues"):
        if i.get("title") == LOG_TITLE:
            return i["number"]
    return LOG_FALLBACK


# ---------- the run ----------

def main() -> int:
    live = (os.environ.get("TIME_MODE") or "dry-run").strip() == "live"
    now = dt.datetime.now(dt.timezone.utc)
    log(f"housekeeping {now:%Y-%m-%dT%H:%MZ} mode={'live' if live else 'dry-run'}")
    failed = 0
    done = {"branches": 0, "signals": 0, "milestones": 0, "outcomes": 0}
    found: dict = {}
    for name, step in (("branches", lambda: step_branches(live)), ("signals", lambda: step_signals(live, now)),
                       ("milestones", lambda: step_milestones(live)), ("outcomes", lambda: step_outcomes(live, now))):
        try:
            done[name] = step()
        except Exception as e:  # noqa: BLE001  one step must not stop the others
            failed += 1
            log(f"{name}: failed: {type(e).__name__}: {str(e)[:200]}")
    try:
        found = stale(now)
    except Exception as e:  # noqa: BLE001
        failed += 1
        log(f"stale: failed: {type(e).__name__}: {str(e)[:200]}")
    count = len({r[0] for rows in found.values() for r in rows})
    if found:
        log(stale_text(found))
    line = (f"🧹 Housekeeping: {done['branches']} branch(es) deleted, {done['signals']} signal issue(s) closed, "
            f"{done['milestones']} milestone(s) closed, {done['outcomes']} router pick(s) settled, {count} stale."
            + (f" {failed} step(s) failed; see the run log." if failed else ""))
    log(line)
    if live:
        try:
            target = log_issue()
            if found:
                tm.comment(target, stale_text(found), {"housekeeping": "stale", "count": count})
            tm.comment(target, line, {"housekeeping": "run", **done, "stale": count})
        except Exception as e:  # noqa: BLE001
            failed += 1
            log(f"log: failed: {type(e).__name__}: {str(e)[:200]}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
