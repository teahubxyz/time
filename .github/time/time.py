"""Time: the clock for a GitHub-native agent factory. stdlib only; runs on GitHub-hosted runners.

    python3 .github/time/time.py mention     # on issue/comment events: answer @seat [model] [effort]
    python3 .github/time/time.py heartbeat   # on schedule: look at `ready` issues and dispatch (dry-run by default)

Ledger = this GitHub repo. Brains = Venice (VENICE_API_KEY secret). Seats and aliases: .github/time/seats.json.
Loop guards: bots and Time's own comments never trigger replies; comments posted with GITHUB_TOKEN don't start
workflows; the heartbeat has a daily cap.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEATS = json.loads((HERE / "seats.json").read_text())
REPO = os.environ.get("GITHUB_REPOSITORY", "")
GH = "https://api.github.com"
VENICE = "https://api.venice.ai/api/v1"
MARK = "<!-- time "
EFFORTS = {"low": "low", "med": "medium", "medium": "medium", "high": "high", "xhigh": "high", "max": "high"}


def http(method: str, url: str, token: str, body=None, timeout: float = 120.0):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                          "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            t = r.read()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {url.split('?')[0]} -> {e.code}: {e.read().decode(errors='replace')[:200]}") from None


def gh(method: str, path: str, body=None):
    return http(method, f"{GH}{path}", os.environ["GITHUB_TOKEN"], body)


def comment(issue: int, text: str, meta: dict) -> None:
    gh("POST", f"/repos/{REPO}/issues/{issue}/comments",
       {"body": f"{text}\n\n{MARK}{json.dumps(meta, separators=(',', ':'))} -->"})


# ---------- seats: @seat [model] [effort] ----------

_catalog: list[str] | None = None


def catalog() -> list[str]:
    global _catalog
    if _catalog is None:
        try:
            _catalog = [m["id"] for m in http("GET", f"{VENICE}/models?type=text", os.environ["VENICE_API_KEY"])["data"]]
        except Exception:  # noqa: BLE001  aliases still work without it
            _catalog = []
    return _catalog


def resolve(seat: str, word: str) -> str | None:
    s = SEATS[seat]
    w = word.lower()
    if w in s.get("aliases", {}):
        return s["aliases"][w]
    if w.isdigit() or not re.match(r"^[a-z]{0,3}\d[\w.-]*$|^[a-z][\w.-]*-[\w.-]+$", w):
        return None
    ids = [i for i in catalog() if s["family"] in i and not i.startswith("e2ee-")]
    if w in ids:
        return w
    n = w.replace(".", "-")
    exact = [i for i in ids if i.replace(".", "-").endswith(f"{s['family']}-{n}")]
    near = exact or [i for i in ids if re.search(rf"(^|-){re.escape(n)}(-|$)", i.replace(".", "-"))]
    return min(near, key=lambda i: (len(i), i)) if near else None


def mentions(text: str) -> dict[str, tuple[str | None, str | None]]:
    if MARK in text:
        return {}
    text = re.sub(r"```.*?```|`[^`]*`", "", text, flags=re.S)
    text = "\n".join(l for l in text.splitlines() if not l.lstrip().startswith(">"))
    pat = re.compile(r"(?<![\w@/.-])@(" + "|".join(SEATS) + r")\b((?:[ \t]+[^\s@`]+){0,2})", re.I)
    out = {}
    for m in pat.finditer(text):
        seat, model, effort = m.group(1).lower(), None, None
        for w in m.group(2).split():
            w = w.strip(",.:;!?)(").lower()
            if model is None and (r := resolve(seat, w)) and not (w in EFFORTS and w not in SEATS[seat].get("aliases", {})):
                model = r
            elif effort is None and w in EFFORTS:
                effort = EFFORTS[w]
            else:
                break
        out[seat] = (model, effort)
    return out


def think(seat: str, model: str | None, effort: str | None, system: str, user: str) -> str:
    key = os.environ.get("VENICE_API_KEY")
    if not key:
        raise LookupError("no VENICE_API_KEY secret on this repo yet")
    body = {"model": model or SEATS[seat]["default"], "temperature": 0.4, "max_tokens": 2500,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "venice_parameters": {"include_venice_system_prompt": False}}
    if effort:
        body["reasoning_effort"] = effort
    out = http("POST", f"{VENICE}/chat/completions", key, body, timeout=240)
    text = out["choices"][0]["message"]["content"] or ""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip() or "(empty reply)"


RULES = """You were @mentioned in a GitHub issue or PR thread of a small agent factory. Reply as yourself, in the thread.
Answer what was asked, concretely and briefly. You can't run code or browse; say so if the ask needs that.
Never invent links, numbers or results. If you are only mentioned in passing, reply with exactly NO_REPLY."""


def cmd_mention() -> int:
    ev = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    issue = ev["issue"]
    src = ev.get("comment") or issue
    author = src["user"]
    if author.get("type") == "Bot" or MARK in (src.get("body") or ""):
        print("skip: bot or Time's own comment")
        return 0
    found = mentions(src.get("body") or "")
    if not found:
        print("no seat mentioned")
        return 0
    comments = gh("GET", f"/repos/{REPO}/issues/{issue['number']}/comments?per_page=30")
    thread = [f"# {issue['title']}\n{(issue.get('body') or '')[:6000]}"]
    thread += [f"**{c['user']['login']}**: {(c.get('body') or '')[:3000]}" for c in comments[-20:]]
    for seat, (model, effort) in found.items():
        system = (HERE / "seats" / f"{seat}.md").read_text() if (HERE / "seats" / f"{seat}.md").exists() else \
            f"You are `{seat}`, a seat in this factory. Your brain is {SEATS[seat]['label']}."
        user = "\n\n".join(thread) + f"\n\n## You are `{seat}`. Reply to @{author['login']}:\n{src.get('body', '')[:4000]}"
        used = model or SEATS[seat]["default"]
        try:
            text = think(seat, model, effort, system + "\n\n" + RULES, user)
        except LookupError as e:
            text, used = f"I'm `{seat}`, but I can't answer yet: {e}.", "none"
        if text.strip().strip(".").upper() == "NO_REPLY":
            continue
        sig = f"<sub>{seat} · {used}" + (f" · effort {effort}" if effort else "") + " · via Time</sub>"
        comment(issue["number"], f"@{author['login']} {text}\n\n{sig}", {"seat": seat, "model": used, "effort": effort})
        print("replied as", seat, used, effort)
    return 0


# ---------- heartbeat ----------

def cmd_heartbeat() -> int:
    mode = os.environ.get("TIME_MODE") or "dry-run"
    cap = int(os.environ.get("TIME_DAILY_CAP") or 5)
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    issues = gh("GET", f"/repos/{REPO}/issues?state=open&labels=ready&per_page=50")
    issues = [i for i in issues if "pull_request" not in i]
    sent_today, todo = 0, []
    for i in issues:
        cs = gh("GET", f"/repos/{REPO}/issues/{i['number']}/comments?per_page=100")
        beats = [c for c in cs if MARK in (c.get("body") or "") and '"beat":' in c["body"]]
        sent_today += sum(1 for c in beats if c["created_at"].startswith(today))
        if beats:
            continue  # already picked up once; the next step is the worker's, not the clock's
        done = re.search(r"^\s*DONE:\s*(.+)$", i.get("body") or "", re.M | re.I)
        todo.append((i, done.group(1).strip() if done else None))
    print(f"tick {today} mode={mode} ready={len(issues)} new={len(todo)} sent_today={sent_today}/{cap}")
    for i, done in todo:
        if sent_today >= cap:
            print("daily cap reached; stopping")
            break
        if not done:
            comment(i["number"], "⏱️ Time: this is labelled `ready` but has no `DONE:` line, so there's nothing to "
                    "dispatch against yet. Add one (e.g. `DONE: send to @review`) and I'll pick it up.",
                    {"beat": "needs-done", "mode": mode})
        elif mode == "dry-run":
            comment(i["number"], f"⏱️ Time (dry run): would dispatch this to the worker now.\n\n- DONE: {done}\n"
                    "- Worker: not wired yet (set `TIME_MODE=live` once a worker exists)",
                    {"beat": "would-dispatch", "mode": mode})
        else:
            comment(i["number"], "⏱️ Time: live mode is set but no worker is wired yet, so nothing was dispatched.",
                    {"beat": "no-worker", "mode": mode})
        sent_today += 1
    return 0


if __name__ == "__main__":
    sys.exit({"mention": cmd_mention, "heartbeat": cmd_heartbeat}[sys.argv[1]]())
