"""Steward: the factory's repair tick, inside Time. A block that is only reported is a status page; this one repairs.

    python3 .github/time/steward.py      # every 6 hours (steward.yml) and on workflow_dispatch

Two parts, in order.

1. Deterministic, free, no model: merge card PRs that carry a trusted Approve and green checks and that `touches_protected`
   does not hold (the same tests `land()` applies, TIME_AUTOMERGE included); close an `andon` whose cause has healed (a
   spend window that has refilled -- a daily cap past midnight UTC, a pool back under its allowance -- or a key that is
   now set); re-dispatch the heartbeat if its latest run failed.
2. Only for what is left and is a real block: one call to the steward seat (TIME_STEWARD, default `claude:opus`; `off`
   disables the whole tick) with the repair charter. It books to the ledger like every other call. It repairs with the
   tools below (labels, the few variables it may touch, a heartbeat retry, a comment that hands a card back to its
   worker) and may escalate to the operator only for money beyond the caps or a human-only step. Code checks that, not
   the prompt: `t_set_variable` and `t_escalate` refuse anything else whatever the charter says.

One entry per run goes to the Astra log (#57), in Astra's thread and style: Merged / Fixed / Left, with the reason for
anything left. A comment the steward leaves on a card carries `{"steward": true}` and no `beat`, so it cannot change the
card's state; the one exception is the `merged` beat of a PR it merged, which is the beat `land()` writes for the same act.
"""
from __future__ import annotations

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

LOG_TITLE = "Astra log"   # astra.py's thread: one place a human reads the factory's day
DEFAULT_SEAT = "claude:opus"
HEARTBEAT = "heartbeat.yml"
STEWARD_LABELS = {"ready", "queued", "needs-human"}
# the only variables the steward may set, and the values it may set them to; never money (the caps), merge policy or trust
STEWARD_VARS = {"TIME_MODE": r"live|dry-run", "TIME_PARALLEL": r"[1-9]", "TIME_STUCK_HOURS": r"\d{1,3}", "TIME_DAILY_CAP": r"\d{1,3}"}
PARKED = ("error", "stuck", "blocked")   # a card whose last beat says its worker stopped
# the reason sentences budget_check writes into an andon's body. The title says "... / $9.00 out of pocket this month"
# whichever cap tripped, so only the reason tells a daily breach from a monthly one.
MONTHLY = re.compile(r"month's (?:[\w-]+ )?spend is")
POOL = re.compile(r"\bpool (\S+) has spent\b")
DAILY = "today's spend is"

CHARTER = """You are the steward of a small, fully AI-run software factory (Time). The deterministic part of this run has
already merged what could be merged and closed what had healed. What follows is what is left, as JSON.

Your job, in order, for each block: name it; repair it with the tools you have; escalate only if it cannot be repaired.
- Tools: `label` (ready / queued / needs-human), `comment` (on a card or PR: hand a card back to its worker with the reason,
  or leave a note the next run reads), `set_variable` (TIME_MODE, TIME_PARALLEL, TIME_STUCK_HOURS, TIME_DAILY_CAP only),
  `dispatch_heartbeat` (a retry of the clock), `escalate`.
- Escalate to the operator ONLY for money beyond the caps (the caps are never yours to raise) or a human-only step: a login, a
  payment, a legal signature. A failing check, an objection, a parked card, a conflict, a wrong label is yours: fix it or hand
  the card back to its worker. "Needs a human" about something you could have repaired is the failure this seat exists to end.
- Never touch workflows, secrets, the spend caps, TIME_AUTOMERGE, TIME_PROTECTED or TIME_TRUSTED, and never merge anything.
- Be brief. When you are done, reply with 2-4 sentences: what you found, what you did, what you left and why."""

TOOLS = [
    {"type": "function", "function": {"name": "label", "description": "Add or remove one label on a card or PR.",
     "parameters": {"type": "object", "properties": {"number": {"type": "integer"}, "name": {"type": "string", "enum": sorted(STEWARD_LABELS)},
                    "action": {"type": "string", "enum": ["add", "remove"]}}, "required": ["number", "name", "action"]}}},
    {"type": "function", "function": {"name": "comment", "description": "Comment on a card or PR as Time. Use it to hand a card back to its worker.",
     "parameters": {"type": "object", "properties": {"number": {"type": "integer"}, "text": {"type": "string"}}, "required": ["number", "text"]}}},
    {"type": "function", "function": {"name": "set_variable", "description": "Set one Actions variable: " + ", ".join(sorted(STEWARD_VARS)) + ".",
     "parameters": {"type": "object", "properties": {"name": {"type": "string", "enum": sorted(STEWARD_VARS)}, "value": {"type": "string"}},
                    "required": ["name", "value"]}}},
    {"type": "function", "function": {"name": "dispatch_heartbeat", "description": "Run the heartbeat workflow once, now.",
     "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {"name": "escalate", "description": "Open one issue for the operator. Only for money beyond the caps or a human-only step.",
     "parameters": {"type": "object", "properties": {"kind": {"type": "string", "enum": ["money", "human-only"]},
                    "title": {"type": "string"}, "reason": {"type": "string", "description": "What is blocked, what you tried, what exactly the human must do."}},
                    "required": ["kind", "title", "reason"]}}},
]


class Report:
    """What this run did: the three sections of the log entry."""

    def __init__(self):
        self.merged: list[str] = []
        self.fixed: list[str] = []
        self.left: list[dict] = []        # {"what", "why", "ask", "card", "since"}: ask = a real block the model may repair
        self.escalated: list[str] = []

    def leave(self, what: str, why: str, ask: bool = False, card: int | None = None, since: str = "") -> None:
        self.left.append({"what": what, "why": why, "ask": ask, "card": card, "since": since})


def log_entry(seat: str, spend: tuple[float, float], rep: Report, note: str) -> tuple[str, dict]:
    """The log comment, in Astra's style: a header with the spend, the run's note, then Merged / Fixed / Left."""
    def section(name: str, items: list[str]) -> list[str]:
        return [f"{name}: none"] if not items else [f"{name}:"] + [f"- {i}" for i in items]
    lines = [f"🧭 Steward ({seat}), spend ${spend[0]:.2f} of ${spend[1]:.2f} today:", "", note, ""]
    lines += section("Merged", rep.merged) + section("Fixed", rep.fixed)
    lines += section("Left", [f"{l['what']}: {l['why']}" for l in rep.left])
    if rep.escalated:
        lines += section("Escalated to the operator", rep.escalated)
    meta = {"beat": "steward", "merged": len(rep.merged), "fixed": len(rep.fixed), "left": len(rep.left), "escalated": len(rep.escalated)}
    return "\n".join(lines), meta


def log_issue() -> int:
    """Astra's thread, or a fresh one in Astra's words: the steward writes into the same log a human already reads."""
    for i in tm.issues("state=open"):
        if i["title"] == LOG_TITLE:
            return i["number"]
    return tm.new_issue(LOG_TITLE, "Astra, the daily planner, writes one comment here per day: what it read, what it "
                        "queued, and why. Object in a reply; Astra reads this thread too.", ["astra"])["number"]


def say(number: int, text: str, **meta) -> None:
    tm.comment(number, f"🧭 Steward: {text}", {"steward": True, **meta})


# ---------- 1. deterministic: no model call, no money ----------

def card_of(pr: dict) -> int | None:
    """The card a PR answers: `Closes #N` in its body (sync.py puts one on every branch it brings in), or its branch
    `time/card-N`. A PR that answers no card is nobody's to merge here."""
    m = re.search(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)", pr.get("body") or "", re.I) \
        or re.match(r"time/card-(\d+)", (pr.get("head") or {}).get("ref") or "")
    return int(m.group(1)) if m else None


def merge_ready(rep: Report) -> None:
    """Merge every card PR that `land()` would merge. What it would not merge is left, with the reason."""
    automerge = (os.environ.get("TIME_AUTOMERGE") or "off").strip() == "on"
    for listed in tm.gh("GET", f"/repos/{tm.REPO}/pulls?state=open&limit=50"):
        n = card_of(listed)
        if n is None or listed.get("state", "open") != "open":
            continue
        what = f"PR #{listed['number']} (card #{n})"
        try:
            comments = tm.gh("GET", f"/repos/{tm.REPO}/issues/{n}/comments?limit=100")
            beats = tm.beats_of(comments)
            last = beats[-1]["at"] if beats else ""
            pr = tm.gh("GET", f"/repos/{tm.REPO}/pulls/{listed['number']}")
            if pr.get("merged_at") or pr.get("state", "open") != "open":
                continue
            # the same window land() reads: a verdict from before the worker answered a review no longer counts
            revised = max((b["at"] for b in beats if b.get("revised")), default="")
            cast = tm.votes(pr, max(pr["created_at"], revised))
            v = tm.decide(cast)
            if v == "object":
                rep.leave(what, "a reviewer objected", ask=True, card=n, since=last)
            elif v is None:
                rep.leave(what, "no trusted verdict yet" if not cast else "the council is split or short of the quorum",
                          ask=bool(cast), card=n, since=last)
            elif (hit := tm.touches_protected(pr["number"])):
                rep.leave(what, f"approved, but it touches protected paths ({', '.join(hit[:5])}): a human merges this one")
            elif not automerge:
                rep.leave(what, "approved, but TIME_AUTOMERGE is not on")
            else:
                _merge(pr, n, what, beats, rep)
        except Exception as e:  # noqa: BLE001  one PR must not stop the others or the log
            rep.leave(what, f"could not be checked: {type(e).__name__}: {str(e)[:160]}", ask=True)


def _merge(pr: dict, n: int, what: str, beats: list[dict], rep: Report) -> None:
    """An approved, unprotected card PR: merge it on green, or leave it with what is in the way (land()'s order)."""
    last = beats[-1] if beats else {}
    if pr.get("mergeable") is False:   # the heartbeat merges its base in; the steward only says what it sees
        rep.leave(what, "approved, but it no longer merges cleanly", ask=True, card=n, since=last.get("at", ""))
        return
    c = tm.checks(pr["head"]["sha"])
    need = (os.environ.get("TIME_REQUIRE_CHECKS") or "on").strip() != "off"
    if c == "pending":
        rep.leave(what, "approved; checks are pending")
    elif c == "none" and need:
        if last.get("beat") in ("no-checks", "ci-dispatched"):
            rep.leave(what, "approved, but there are still no checks and I only merge on green", ask=True, card=n, since=last.get("at", ""))
        elif tm.dispatch_ci(pr):
            say(n, f"approved; running CI on PR #{pr['number']} before merging.", beat="ci-dispatched", pr=pr["number"])
            rep.fixed.append(f"dispatched CI on {what}, which had none")
        else:
            rep.leave(what, "approved, but it has no checks and there is no CI workflow to dispatch", ask=True)
    elif c == "fail":
        rep.leave(what, "approved, but checks are failing", ask=True, card=n, since=last.get("at", ""))
    else:
        tm.gh("POST", f"/repos/{tm.REPO}/pulls/{pr['number']}/merge", {"Do": "squash", "delete_branch_after_merge": True}, as_time=True)
        if tm.gh("GET", f"/repos/{tm.REPO}/issues/{n}")["state"] == "open":
            tm.gh("PATCH", f"/repos/{tm.REPO}/issues/{n}", {"state": "closed"})
        # the one steward comment that keeps a beat: it is the `merged` beat land() writes for the same act, so the card reads as done
        tm.comment(n, f"⏱️ Time: approved and green, merged PR #{pr['number']}. Card done.", {"beat": "merged", "pr": pr["number"], "steward": True})
        rep.merged.append(what)


def healed(andon: dict) -> str | None:
    """Why this andon's cause is gone, or None when it is not (or cannot be told to be).

    A spend window that has refilled and a key that is now set are facts the code can read. The monthly cap is money: the
    operator raises it, nobody else."""
    text = f"{andon.get('title') or ''}\n{andon.get('body') or ''}"
    today, day_cap = tm.budget()[:2]
    if MONTHLY.search(text):   # monthly: a human raises the cap and sets TIME_MODE back; not mine to close
        return None
    if (m := POOL.search(text)):   # a capacity pool refills on its own schedule
        p = next((p for p in tm.pools() if p.get("name") == m.group(1)), None)
        if p and tm.pool_spent(p) < tm.allowance(p):
            return f"pool {p['name']} has ${tm.allowance(p) - tm.pool_spent(p):.2f} of its allowance again"
        return None
    if DAILY in text:   # budget_check's daily reason: it heals itself at midnight UTC
        if (andon.get("created_at") or "9")[:10] < dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d") and today < day_cap:
            return f"it was a daily cap, and today's spend is ${today:.2f} of ${day_cap:.2f} after midnight UTC"
        return None
    keys = re.findall(r"\bno ([A-Z][A-Z0-9_]+) secret\b", text)
    if keys and all(os.environ.get(k) for k in keys):
        return f"{', '.join(keys)} {'is' if len(keys) == 1 else 'are'} set now"
    return None


def close_healed(rep: Report) -> None:
    """Close each open `andon` whose cause has healed, saying why on the issue."""
    for a in tm.issues("state=open&labels=andon"):
        why = healed(a)
        if not why:
            continue
        try:
            say(a["number"], f"closing this andon: {why}.", healed=True)
            tm.gh("PATCH", f"/repos/{tm.REPO}/issues/{a['number']}", {"state": "closed"})
            rep.fixed.append(f"closed andon #{a['number']}: {why}")
        except Exception as e:  # noqa: BLE001
            rep.leave(f"andon #{a['number']}", f"healed ({why}) but I could not close it: {str(e)[:160]}", ask=True)


def still_open(rep: Report) -> None:
    """Every andon the deterministic part did not close, with what it waits on. Money is named as money: the model is not
    asked to repair a cap it may not raise."""
    spoken = {l["what"] for l in rep.left}
    for a in tm.issues("state=open&labels=andon"):
        what = f"andon #{a['number']}"
        if what in spoken:
            continue
        text = f"{a.get('title') or ''}\n{a.get('body') or ''}"
        if MONTHLY.search(text):
            rep.leave(what, "the monthly cap is money: the operator raises it, and sets TIME_MODE back to live")
        elif POOL.search(text):
            rep.leave(what, "a capacity pool is spent for now; it refills on its own schedule")
        elif DAILY in text:
            rep.leave(what, "a daily cap, which heals after midnight UTC")
        else:
            rep.leave(what, "its cause has not healed", ask=True)


def heartbeat_failed() -> dict | None:
    """The heartbeat's latest run if it failed, else None. Raises when the forge cannot list runs."""
    out = tm.gh("GET", f"/repos/{tm.REPO}/actions/runs?limit=50")
    runs = out.get("workflow_runs") if isinstance(out, dict) else out
    # Gitea gives the workflow as `path`, bare or as `.github/workflows/heartbeat.yml@refs/heads/main`; `name` is its `name:`
    mine = [r for r in runs or [] if HEARTBEAT in str(r.get("path") or "") or r.get("name") == "heartbeat"]
    if not mine:
        return None
    latest = max(mine, key=lambda r: r.get("id") or 0)
    # only `failure`: a run the concurrency group cancelled, or one still going, is not a broken clock
    return latest if str(latest.get("conclusion") or latest.get("status") or "").lower() == "failure" else None


def dispatch_heartbeat() -> None:
    tm.gh("POST", f"/repos/{tm.REPO}/actions/workflows/{HEARTBEAT}/dispatches", {"ref": tm.default_branch()})


def retry_heartbeat(rep: Report) -> None:
    """A clock that stopped is the factory stopped: one dispatch, this run."""
    try:
        run = heartbeat_failed()
    except Exception as e:  # noqa: BLE001  the forge may not list runs at all; that is not a block to repair
        rep.leave("heartbeat", f"I could not read its runs: {str(e)[:160]}")
        return
    if not run:
        return
    try:
        dispatch_heartbeat()
        rep.fixed.append(f"the heartbeat's latest run (#{run.get('id')}) failed; dispatched it once")
    except Exception as e:  # noqa: BLE001
        rep.leave("heartbeat", f"its latest run (#{run.get('id')}) failed and I could not dispatch it: {str(e)[:160]}", ask=True)


def parked_cards(rep: Report) -> None:
    """A `ready` card whose last beat says its worker stopped is a block the steward can hand back."""
    for card in tm.issues("state=open&labels=ready"):
        try:
            cs = tm.gh("GET", f"/repos/{tm.REPO}/issues/{card['number']}/comments?limit=100")
            real = [b for b in tm.beats_of(cs) if b["beat"] not in ("capped",)]
            if real and real[-1]["beat"] in PARKED:
                rep.leave(f"card #{card['number']}", f"parked on `{real[-1]['beat']}`", ask=True, card=card["number"], since=real[-1]["at"])
        except Exception as e:  # noqa: BLE001
            print(f"card #{card['number']}: {e}")


def already_handled(rep: Report) -> None:
    """A block the steward has already spoken on since the card's last beat goes back to waiting: no second model call,
    and no second comment, for the same thing. The card moves, or a human does."""
    for item in rep.left:
        if not (item["ask"] and item["card"]):
            continue
        cs = tm.gh("GET", f"/repos/{tm.REPO}/issues/{item['card']}/comments?limit=100")
        if any(tm.is_time(c) and '"steward":true' in (c.get("body") or "") and c["created_at"] > item["since"] for c in cs):
            item["ask"], item["why"] = False, item["why"] + " (the steward has handed this back already; it waits for the card to move)"


# ---------- 2. the model, for what is left ----------

class Tools:
    """The steward's hands. Every fence is here, not in the charter: a prompt cannot talk its way past code."""

    def __init__(self, rep: Report):
        self.rep = rep

    def call(self, name: str, a: dict) -> str:
        try:
            return getattr(self, f"t_{name}")(a)
        except AttributeError:
            return f"unknown tool {name}"
        except Exception as e:  # noqa: BLE001  the model reads the error and tries something else
            return f"error: {type(e).__name__}: {str(e)[:300]}"

    def t_label(self, a: dict) -> str:
        n, name = int(a["number"]), str(a["name"])
        if name not in STEWARD_LABELS:
            return f"refused: the steward may only use {', '.join(sorted(STEWARD_LABELS))}"
        (tm.label if a.get("action") == "add" else tm.unlabel)(n, name)
        self.rep.fixed.append(f"{a.get('action')} label `{name}` on #{n}")
        return "done"

    def t_comment(self, a: dict) -> str:
        say(int(a["number"]), str(a["text"])[:3000])
        self.rep.fixed.append(f"commented on #{a['number']}")
        return "done"

    def t_set_variable(self, a: dict) -> str:
        name, value = str(a["name"]), str(a["value"])
        if name not in STEWARD_VARS or not re.fullmatch(STEWARD_VARS[name], value):
            return f"refused: allowed variables are {', '.join(f'{k} ({v})' for k, v in STEWARD_VARS.items())}"
        if name == "TIME_MODE" and value == "live" and tm.budget()[2] >= tm.budget()[3]:
            return "refused: the monthly cap is reached; raising it is the operator's"
        path = f"/repos/{tm.REPO}/actions/variables/{name}"
        try:
            tm.gh("PUT", path, {"value": value})
        except RuntimeError as e:   # Gitea: PUT updates an existing variable, POST creates it
            if "-> 404" not in str(e):
                raise
            tm.gh("POST", path, {"value": value})
        self.rep.fixed.append(f"set variable {name}={value}")
        return "done"

    def t_dispatch_heartbeat(self, a: dict) -> str:
        dispatch_heartbeat()
        self.rep.fixed.append("dispatched the heartbeat")
        return "dispatched"

    def t_escalate(self, a: dict) -> str:
        kind = str(a.get("kind"))
        if kind not in ("money", "human-only"):
            return "refused: escalate only for `money` beyond the caps or a `human-only` step (a login, a payment, a legal signature)"
        title = f"Steward: {str(a['title'])[:150]}"
        if any(i["title"] == title for i in tm.issues("state=open&labels=needs-human")):
            return "already open"
        tm.new_issue(title, f"🧭 The steward cannot repair this and hands it to the operator ({kind}).\n\n{str(a['reason'])[:3000]}\n\n"
                     "Close this once it's handled.", ["needs-human"])
        self.rep.escalated.append(f"{kind}: {title}")
        return "opened"


def ask_steward(spec: str, blocks: list[dict], context: dict, rep: Report) -> str:
    """One conversation with the steward seat. Books to the ledger through tm.chat; a cap or a missing key ends it politely."""
    seat, model, effort = tm.worker_seat_model(spec)
    user = "Blocks:\n" + json.dumps(blocks, indent=1) + "\n\nContext:\n" + json.dumps(context, indent=1)
    msgs = [{"role": "system", "content": CHARTER}, {"role": "user", "content": user}]
    tools, last = Tools(rep), ""
    for _ in range(int(os.environ.get("TIME_STEWARD_STEPS") or 8)):
        body = {"model": model, "temperature": 0.2, "max_tokens": 4000, "messages": msgs, "tools": TOOLS,
                "venice_parameters": {"include_venice_system_prompt": False}}
        if effort:
            body["reasoning_effort"] = effort
        try:
            msg = tm.chat(body, timeout=240)["choices"][0]["message"]
        except (tm.Budget, LookupError) as e:   # out of money, or no key: the deterministic part still gets its log entry
            return f"No model call: {e}."
        msgs.append({k: v for k, v in msg.items() if k in ("role", "content", "tool_calls")})
        last = msg.get("content") or last
        calls = msg.get("tool_calls") or []
        if not calls:
            break
        for c in calls:
            try:
                args = json.loads(c["function"].get("arguments") or "{}")
            except ValueError:
                args = {}
            msgs.append({"role": "tool", "tool_call_id": c["id"], "content": tools.call(c["function"]["name"], args)})
    return re.sub(r"<think>.*?</think>", "", last, flags=re.S).strip()[:1200] or "(the steward gave no summary)"


def context() -> dict:
    """What the seat needs to judge a block without reading the whole forge."""
    today, day_cap, month, month_cap = tm.budget()
    return {"mode": os.environ.get("TIME_MODE") or "dry-run", "automerge": os.environ.get("TIME_AUTOMERGE") or "off",
            "spend": {"today": round(today, 2), "daily_cap": day_cap, "month": round(month, 2), "monthly_cap": month_cap},
            "open_andons": [{"n": i["number"], "title": i["title"], "body": (i.get("body") or "")[:500]} for i in tm.issues("state=open&labels=andon")],
            "needs_human": [{"n": i["number"], "title": i["title"]} for i in tm.issues("state=open&labels=needs-human")]}


# ---------- the tick ----------

def tick() -> int:
    spec = (os.environ.get("TIME_STEWARD") or DEFAULT_SEAT).strip()
    if spec.lower() == "off":
        print("steward: off")
        return 0
    rep = Report()
    for step in (merge_ready, close_healed, retry_heartbeat, parked_cards, still_open):
        try:
            step(rep)
        except Exception as e:  # noqa: BLE001  a forge hiccup in one step must not skip the rest or the log
            rep.leave(step.__name__, f"{type(e).__name__}: {str(e)[:160]}")
    try:
        already_handled(rep)
    except Exception as e:  # noqa: BLE001
        print(f"steward: {e}")
    blocks = [l for l in rep.left if l["ask"]]
    note = "Nothing needed a model call."
    if blocks:
        note = ask_steward(spec, [{"what": b["what"], "why": b["why"]} for b in blocks], context(), rep)
    spend = tm.budget()
    text, meta = log_entry(spec, (spend[0], spend[1]), rep, note)
    tm.comment(log_issue(), text, meta)
    print(f"steward: merged={len(rep.merged)} fixed={len(rep.fixed)} left={len(rep.left)} asked={bool(blocks)}")
    return 0


if __name__ == "__main__":
    sys.exit(tick())
