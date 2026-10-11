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




# ---------- worker: Cursor cloud agents ----------
# Docs: Cloud Agents API (POST /v1/agents, GET /v1/models). The agent opens a PR that says "Closes #N";
# Time finds that PR on GitHub, so tracking never depends on fields of Cursor's responses.

CURSOR = os.environ.get("CURSOR_API_BASE", "https://api.cursor.com")


def cursor(method: str, path: str, body=None):
    key = os.environ.get("CURSOR_API_KEY")
    if not key:
        raise LookupError("no CURSOR_API_KEY secret on this repo yet")
    return http(method, f"{CURSOR}{path}", key, body, timeout=60)


def repo_url() -> str:
    return f"https://github.com/{REPO}"


def default_branch() -> str:
    return gh("GET", f"/repos/{REPO}").get("default_branch") or "main"


BUILD_PROMPT = """You are the worker for card #{n} in {repo}: "{title}".

{body}

How to finish:
- Make the change described above, small and focused. Follow AGENTS.md and any repo skills if present.
- Run the project's tests or checks if they exist.
- Open one pull request into `{base}`. Its description MUST contain the line `Closes #{n}` and a short summary
  of what changed and how you checked it.
- The card's finish line is: DONE: {done}
"""

REVIEW_PROMPT = """Review pull request #{pr} in {repo} for card #{n} ("{title}"). Do NOT push commits.
Check the diff against the card and its finish line (DONE: {done}): correctness, tests, scope, anything risky.
Leave one PR comment that starts with **Approve** or **Object**, then your reasons as a short list with file:line."""


def cursor_launch(prompt: str, *, model: str | None, pr_url: str | None = None, create_pr: bool = True) -> dict:
    r = {"url": repo_url()}
    if pr_url:
        r["prUrl"] = pr_url
    else:
        r["startingRef"] = default_branch()
    body = {"prompt": {"text": prompt}, "repos": [r], "autoCreatePR": create_pr}
    if model:
        body["model"] = {"id": model}
    out = cursor("POST", "/v1/agents", body)
    agent = out.get("agent") or out
    return {"agent_id": agent.get("id"), "agent_url": agent.get("url") or agent.get("webUrl"),
            "status": (out.get("run") or {}).get("status") or agent.get("status")}


# ---------- heartbeat ----------

def beats_of(comments: list[dict]) -> list[dict]:
    """Time's own state comments on a card, oldest first, as {meta..., at}."""
    out = []
    for c in comments:
        b = c.get("body") or ""
        if MARK in b and '"beat":' in b:
            try:
                meta = json.loads(b.split(MARK, 1)[1].rsplit("-->", 1)[0])
            except ValueError:
                continue
            out.append({**meta, "at": c["created_at"]})
    return out


def retry_requested(comments: list[dict], since: str) -> bool:
    return any(c["created_at"] > since and c["user"].get("type") != "Bot" and "/time retry" in (c.get("body") or "")
               for c in comments)


def linked_prs(prs: list[dict], n: int) -> list[dict]:
    pat = re.compile(rf"\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#{n}\b", re.I)
    return [p for p in prs if pat.search(p.get("body") or "")]


def pr_diff(number: int, limit: int = 100_000) -> str:
    req = urllib.request.Request(f"{GH}/repos/{REPO}/pulls/{number}",
                                 headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
                                          "Accept": "application/vnd.github.diff"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode(errors="replace")[:limit]


def review(card: dict, pr: dict, done: str) -> dict:
    """TIME_REVIEW: off | venice:<seat> [model] [effort] | cursor[:<model id>]"""
    spec = (os.environ.get("TIME_REVIEW") or "off").strip()
    if spec in ("", "off"):
        return {"review": "off"}
    kind, _, rest = spec.partition(":")
    if kind == "cursor":
        r = cursor_launch(REVIEW_PROMPT.format(pr=pr["number"], repo=REPO, n=card["number"], title=card["title"], done=done),
                          model=rest.strip() or None, pr_url=pr["html_url"], create_pr=False)
        return {"review": "cursor", **r}
    if kind == "venice":
        words = rest.split()
        seat = words[0] if words else "kimi"
        model, effort = mentions(f"@{rest}").get(seat, (None, None)) if seat in SEATS else (None, None)
        diff = pr_diff(pr["number"])
        user = (f"# Card #{card['number']}: {card['title']}\n{(card.get('body') or '')[:4000]}\n\n"
                f"# PR #{pr['number']}: {pr['title']}\n{(pr.get('body') or '')[:3000]}\n\n# Diff\n{diff}")
        system = (f"You are `{seat}`, reviewing a pull request made by another agent. "
                  + REVIEW_PROMPT.format(pr=pr["number"], repo=REPO, n=card["number"], title=card["title"], done=done)
                  .replace("Leave one PR comment that", "Your reply is posted as the PR comment. It"))
        text = think(seat, model, effort, system, user)
        gh("POST", f"/repos/{REPO}/issues/{pr['number']}/comments",
           {"body": f"{text}\n\n<sub>review by {seat} · {model or SEATS[seat]['default']} · via Time</sub>"})
        return {"review": "venice", "seat": seat}
    return {"review": f"unknown spec {spec!r}"}


def cmd_heartbeat() -> int:
    mode = (os.environ.get("TIME_MODE") or "dry-run").strip()
    cap = int(os.environ.get("TIME_DAILY_CAP") or 5)
    stuck_h = float(os.environ.get("TIME_STUCK_HOURS") or 6)
    worker_model = (os.environ.get("TIME_CURSOR_MODEL") or "").strip() or None
    now = dt.datetime.now(dt.timezone.utc)
    today = now.date().isoformat()
    cards = [i for i in gh("GET", f"/repos/{REPO}/issues?state=open&labels=ready&per_page=50") if "pull_request" not in i]
    prs = gh("GET", f"/repos/{REPO}/pulls?state=all&sort=updated&direction=desc&per_page=50")
    launches_today = 0
    plan = []
    for card in cards:
        cs = gh("GET", f"/repos/{REPO}/issues/{card['number']}/comments?per_page=100")
        beats = beats_of(cs)
        launches_today += sum(1 for b in beats if b.get("launched") and b["at"].startswith(today))
        real = [b for b in beats if b["beat"] != "blocked"]  # "blocked" = a key was missing; resume once it's added
        last = real[-1] if real else None
        blocked = any(b["beat"] == "blocked" and (not last or b["at"] >= last["at"]) for b in beats)
        if last and retry_requested(cs, last["at"]):
            last = None
        m = re.search(r"^\s*DONE:\s*(.+)$", card.get("body") or "", re.M | re.I)
        plan.append((card, last, m.group(1).strip() if m else None, blocked))
    print(f"tick {now:%Y-%m-%dT%H:%MZ} mode={mode} cards={len(cards)} launches_today={launches_today}/{cap}")

    for card, last, done, blocked in plan:
        n, state = card["number"], (last or {}).get("beat")
        try:
            if state in (None, "needs-done", "would-dispatch") and not done:
                if state != "needs-done":
                    comment(n, "⏱️ Time: this is labelled `ready` but has no `DONE:` line, so there's nothing to dispatch "
                            "against yet. Add one (e.g. `DONE: PR open, tests green`) and I'll pick it up.",
                            {"beat": "needs-done", "mode": mode})
                continue
            if state in (None, "needs-done") and mode != "live":
                comment(n, f"⏱️ Time (dry run): would dispatch this to the worker now.\n\n- DONE: {done}\n"
                        f"- Worker: Cursor cloud agent{f' ({worker_model})' if worker_model else ''}, opens a PR that closes #{n}\n"
                        "- Goes for real once `TIME_MODE=live`", {"beat": "would-dispatch", "mode": mode})
                continue
            if state in (None, "needs-done", "would-dispatch") and mode == "live":
                if launches_today >= cap:
                    print(f"#{n}: daily cap reached")
                    continue
                r = cursor_launch(BUILD_PROMPT.format(n=n, repo=REPO, title=card["title"], body=(card.get("body") or "")[:20000],
                                                      base=default_branch(), done=done), model=worker_model)
                launches_today += 1
                link = f" ([agent]({r['agent_url']}))" if r.get("agent_url") else ""
                comment(n, f"⏱️ Time: dispatched to a Cursor cloud agent{link}. It will open a PR that closes #{n}; "
                        "I'll link it here when it appears.", {"beat": "dispatched", "launched": True, **r, "model": worker_model})
                continue
            if state in ("dispatched", "stuck"):
                found = linked_prs(prs, n)
                if found:
                    pr = found[0]
                    rv = review(card, pr, done or "")
                    launches_today += 1 if rv.get("review") == "cursor" else 0
                    note = {"off": "No reviewer is set (`TIME_REVIEW`).", "cursor": "A Cursor agent is reviewing it.",
                            "venice": f"`{rv.get('seat')}` reviewed it on the PR."}.get(rv["review"], rv["review"])
                    comment(n, f"⏱️ Time: PR #{pr['number']} is up for this card. {note}",
                            {"beat": "pr", "pr": pr["number"], "launched": rv.get("review") == "cursor", **rv})
                elif state == "dispatched":
                    age_h = (now - dt.datetime.fromisoformat(last["at"].replace("Z", "+00:00"))).total_seconds() / 3600
                    if age_h > stuck_h:
                        comment(n, f"⏱️ Time: dispatched {age_h:.0f}h ago and no PR closing #{n} yet. Check the agent"
                                f"{' (' + last['agent_url'] + ')' if last.get('agent_url') else ''}; comment `/time retry` to "
                                "dispatch again.", {"beat": "stuck"})
        except LookupError as e:  # a key is missing: say so once, plainly
            if not blocked:
                comment(n, f"⏱️ Time: can't go further on this card: {e}. I'll carry on once it's added.", {"beat": "blocked"})
        except Exception as e:  # noqa: BLE001  one card must not stop the others
            print(f"#{n}: {type(e).__name__}: {e}")
            comment(n, f"⏱️ Time: the worker call failed: `{str(e)[:300]}`. Comment `/time retry` to try again.",
                    {"beat": "error"})
    return 0


# ---------- doctor ----------

def cmd_doctor() -> int:
    lines, ok = [], True

    def row(name: str, good: bool, detail: str) -> None:
        nonlocal ok
        ok &= good or name.startswith("(optional)")
        lines.append(f"| {'✅' if good else '⚠️'} | {name} | {detail} |")

    labels = [l["name"] for l in gh("GET", f"/repos/{REPO}/labels?per_page=100")]
    row("label `ready`", "ready" in labels, "exists" if "ready" in labels else "missing: `gh label create ready`")
    row("TIME_MODE", True, os.environ.get("TIME_MODE") or "dry-run (default)")
    row("TIME_DAILY_CAP", True, os.environ.get("TIME_DAILY_CAP") or "5 (default)")
    row("TIME_REVIEW", True, os.environ.get("TIME_REVIEW") or "off (default)")
    try:
        ids = [m["id"] for m in http("GET", f"{VENICE}/models?type=text", os.environ["VENICE_API_KEY"])["data"]] \
            if os.environ.get("VENICE_API_KEY") else None
        row("(optional) VENICE_API_KEY (seats)", ids is not None, f"works, {len(ids)} models" if ids else "not set")
    except Exception as e:  # noqa: BLE001
        row("(optional) VENICE_API_KEY (seats)", False, f"set but failing: {str(e)[:120]}")
    try:
        models = cursor("GET", "/v1/models")
        items = models.get("models") or models.get("data") or models.get("items") or (models if isinstance(models, list) else [])
        names = [m.get("id") if isinstance(m, dict) else str(m) for m in items]
        row("CURSOR_API_KEY (worker)", True, f"works; models: {', '.join(n for n in names[:12] if n) or 'listed'}")
    except LookupError:
        row("CURSOR_API_KEY (worker)", False, "not set: `gh secret set CURSOR_API_KEY`")
    except Exception as e:  # noqa: BLE001
        row("CURSOR_API_KEY (worker)", False, f"set but failing: {str(e)[:160]}")
    report = "## Time doctor\n\n| | check | detail |\n|---|---|---|\n" + "\n".join(lines) + \
        "\n\nThe Cursor GitHub app must also be installed on this repo for cloud agents to open PRs (not checkable from here)."
    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        Path(os.environ["GITHUB_STEP_SUMMARY"]).write_text(report)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit({"mention": cmd_mention, "heartbeat": cmd_heartbeat, "doctor": cmd_doctor}[sys.argv[1]]())
