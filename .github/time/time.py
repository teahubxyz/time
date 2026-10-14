"""Time: the clock for a Gitea-native agent factory. stdlib only; runs on Gitea Actions (prod: teahub.xyz).

    python3 .github/time/time.py mention     # on issue/comment events: answer @seat [model] [effort]
    python3 .github/time/time.py heartbeat   # on schedule: plan specs, dispatch `ready` cards, merge approved PRs, pull the next card

Ledger = this Gitea repo. Brains = Venice (VENICE_API_KEY) or Claude (ANTHROPIC_API_KEY), per seat in .github/time/seats.json.
Spend = time/ledger/<YYYY-MM>.jsonl in the repo; TIME_DAILY_USD / TIME_MONTHLY_USD cap it before every call.
Loop guards: Time's own comments (author gitea-actions) never trigger replies or count as verdicts; the heartbeat
has a daily cap and a concurrency group. Unlike GitHub, Gitea does fire events for the Actions token's own writes,
so every event-driven workflow filters on the author.

Forge notes (Gitea 1.24 vs GitHub): `limit` not `per_page`; no `sort` on issues; the `pull_request` key is always
present (null on issues); labels are removed by id and set on creation by id; no `author_association` (trust = the
collaborator permission endpoint); no check-runs (commit statuses only); merge is POST .../merge {"Do": "squash"};
branches are made with POST .../branches; the diff is GET .../pulls/N.diff.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import atexit
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEATS = json.loads((HERE / "seats.json").read_text())
REPO = os.environ.get("GITHUB_REPOSITORY", "")
SERVER = (os.environ.get("GITHUB_SERVER_URL") or "https://teahub.xyz").rstrip("/")
GH = (os.environ.get("GITHUB_API_URL") or f"{SERVER}/api/v1").rstrip("/")
TIME_BOT = os.environ.get("TIME_BOT") or "gitea-actions"  # the Actions token's user; Time's own comments
VENICE = "https://api.venice.ai/api/v1"
ANTHROPIC = "https://api.anthropic.com/v1"
MARK = "<!-- time "
EFFORTS = {"low": "low", "med": "medium", "medium": "medium", "high": "high", "xhigh": "high", "max": "high"}


def http(method: str, url: str, token: str, body=None, timeout: float = 120.0):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                          "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            t = r.read()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {url.split('?')[0]} -> {e.code}: {e.read().decode(errors='replace')[:200]}") from None


def gh(method: str, path: str, body=None):
    for attempt in range(5):
        try:
            return http(method, f"{GH}{path}", os.environ["GITHUB_TOKEN"], body)
        except RuntimeError as e:
            # parallel writers on one branch: a contents PUT loses the race for the branch head with a 409; the file's own
            # sha is still right, so the same write goes through on a retry
            if method != "PUT" or "/contents/" not in path or "-> 409" not in str(e) or attempt == 4:
                raise
            time.sleep(0.5 * (attempt + 1))


def issues(query: str) -> list[dict]:
    """Open/closed issues (never PRs) of this repo; `query` is the Gitea query string without type/limit."""
    return [i for i in gh("GET", f"/repos/{REPO}/issues?type=issues&limit=50&{query}") if not i.get("pull_request")]


_label_ids: dict[str, int] | None = None


def label_id(name: str) -> int:
    global _label_ids
    if _label_ids is None or name not in _label_ids:
        _label_ids = {l["name"]: l["id"] for l in gh("GET", f"/repos/{REPO}/labels?limit=100")}
    if name not in _label_ids:
        _label_ids[name] = gh("POST", f"/repos/{REPO}/labels", {"name": name, "color": "#ededed"})["id"]
    return _label_ids[name]


def label(number: int, name: str) -> None:
    gh("POST", f"/repos/{REPO}/issues/{number}/labels", {"labels": [label_id(name)]})


def unlabel(number: int, name: str) -> None:
    gh("DELETE", f"/repos/{REPO}/issues/{number}/labels/{label_id(name)}")


def new_issue(title: str, body: str, labels: list[str]) -> dict:
    return gh("POST", f"/repos/{REPO}/issues", {"title": title, "body": body, "labels": [label_id(l) for l in labels]})


_trust: dict[str, bool] = {}


def trusted(login: str | None) -> bool:
    """May this login approve, object, retry or spend seat credits? Yes for the repo's owner, for anyone listed in
    TIME_TRUSTED (comma-separated logins; org owners go here, since the Actions token cannot read org membership),
    and for repo collaborators. Strangers on a public repo can comment; none of that counts. Time's own user never
    counts as a reviewer."""
    if not login or login == TIME_BOT:
        return False
    if login not in _trust:
        names = {n.strip() for n in (os.environ.get("TIME_TRUSTED") or "").split(",") if n.strip()}
        ok = login == REPO.split("/")[0] or login in names
        if not ok:
            try:
                gh("GET", f"/repos/{REPO}/collaborators/{login}")  # 204 when a collaborator, 404 otherwise
                ok = True
            except RuntimeError as e:
                if "-> 404" not in str(e):
                    print(f"trust({login}): {e}")
        _trust[login] = ok
    return _trust[login]


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
    if s.get("provider") == "anthropic":  # Venice's catalog may list Claude ids too; those would route to Venice
        return w if w == s["default"] else None
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


def provider_of(model: str) -> str:
    for s in SEATS.values():
        if model == s["default"] or model in s.get("aliases", {}).values():
            if s.get("provider") == "anthropic":
                return "anthropic"
    return "venice"


def price_of(model: str) -> list | None:
    return next((s["price"] for s in SEATS.values()
                 if s.get("price") and (model == s["default"] or model in s.get("aliases", {}).values())), None)


def _post(url: str, key: str, body: dict, timeout: float, who: str) -> dict:
    """One retry loop for every provider: brief overloads (429, 5xx, Anthropic's 529) and dropped connections back off."""
    for attempt in range(4):
        try:
            return http("POST", url, key, body, timeout=timeout)
        except (RuntimeError, OSError) as e:
            transient = isinstance(e, OSError) or re.search(r"-> (429|5\d\d)\b", str(e))
            if attempt == 3 or not transient:
                raise
            print(f"{who} busy ({str(e)[:80]}); retrying")
            time.sleep(int(os.environ.get("TIME_VENICE_BACKOFF") or 15) * (attempt + 1) ** 2)
    raise AssertionError("unreachable")


def venice_chat(body: dict, timeout: float) -> dict:
    """POST chat/completions to Venice."""
    key = os.environ.get("VENICE_API_KEY")
    if not key:
        raise LookupError("no VENICE_API_KEY secret on this repo yet")
    return _post(f"{VENICE}/chat/completions", key, body, timeout, "venice")


def anthropic_chat(body: dict, timeout: float) -> dict:
    """POST to Anthropic's OpenAI-compatible endpoint. Claude 5 rejects temperature<1 and ignores reasoning_effort
    (thinking is on by default), so those go; tools and role:"tool" messages pass through as they are."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise LookupError("no ANTHROPIC_API_KEY secret on this repo yet")
    body = {k: v for k, v in body.items() if k not in ("venice_parameters", "temperature", "top_p", "reasoning_effort")}
    return _post(f"{ANTHROPIC}/chat/completions", key, body, timeout, "anthropic")


def chat(body: dict, timeout: float) -> dict:
    """Every model call goes through here: the budget is checked first and the spend booked after."""
    budget_check()
    out = (anthropic_chat if provider_of(body["model"]) == "anthropic" else venice_chat)(body, timeout)
    book(body["model"], out.get("usage") or {})
    return out


# ---------- spend: a ledger in the repo, and a governor that reads it ----------
# Deterministic on purpose: arithmetic over usage numbers decides, never a model.

LEDGER: list[dict] = []
_ledger_files: dict[str, tuple[list[dict], str | None]] = {}  # month -> (lines, sha) as read this process


class Budget(RuntimeError):
    pass


def ledger_path(month: str) -> str:
    return f"time/ledger/{month}.jsonl"


def _read_ledger(month: str) -> tuple[list[dict], str | None]:
    try:
        f = gh("GET", f"/repos/{REPO}/contents/{ledger_path(month)}")
    except RuntimeError as e:
        if "-> 404" in str(e):
            return [], None
        raise
    text = base64.b64decode(f.get("content") or "").decode(errors="replace")
    return [json.loads(l) for l in text.splitlines() if l.strip()], f.get("sha")


def ledger_lines(month: str) -> list[dict]:
    if month not in _ledger_files:
        _ledger_files[month] = _read_ledger(month)
    return _ledger_files[month][0]


def book(model: str, usage: dict) -> None:
    p = price_of(model)
    i, o = int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0)
    if not LEDGER:  # first line: every entry point (heartbeat, mention, venture) flushes without remembering to
        atexit.register(flush_ledger)
    LEDGER.append({"at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "model": model, "in": i, "out": o,
                   "usd": round((i * p[0] + o * p[1]) / 1e6, 6) if p else None})


def flush_ledger() -> None:
    """Append this process's calls to the month's file: one commit per run. Never raises; a lost line costs accuracy,
    a crash here would cost the run's exit status."""
    if not LEDGER:
        return
    rows, LEDGER[:] = list(LEDGER), []
    usd = sum(r["usd"] or 0 for r in rows)
    for month in sorted({r["at"][:7] for r in rows}):
        mine = "".join(json.dumps(r, separators=(",", ":")) + "\n" for r in rows if r["at"].startswith(month))
        for attempt in range(2):
            try:
                old, sha = _ledger_files[month] if month in _ledger_files and attempt == 0 else _read_ledger(month)
                text = "".join(json.dumps(r, separators=(",", ":")) + "\n" for r in old) + mine
                body = {"message": f"ledger: {len(rows)} calls, ${usd:.2f}", "content": base64.b64encode(text.encode()).decode()}
                if sha:
                    body["sha"] = sha
                gh("PUT", f"/repos/{REPO}/contents/{ledger_path(month)}", body)
                _ledger_files.pop(month, None)
                break
            except Exception as e:  # noqa: BLE001
                if attempt == 0 and re.search(r"-> (409|422)\b", str(e)):
                    continue  # someone else committed the file first: re-read and append to theirs
                print(f"ledger flush failed: {str(e)[:200]}")
                break


def spend(prefix: str) -> float:
    """Dollars booked on a day ("2026-10-14") or month ("2026-10"): the repo's ledger plus this process's calls."""
    return sum(r.get("usd") or 0 for r in ledger_lines(prefix[:7]) + LEDGER if r.get("at", "").startswith(prefix))


def budget() -> tuple[float, float, float, float]:
    now = dt.datetime.now(dt.timezone.utc)
    return (spend(now.strftime("%Y-%m-%d")), float(os.environ.get("TIME_DAILY_USD") or 5),
            spend(now.strftime("%Y-%m")), float(os.environ.get("TIME_MONTHLY_USD") or 100))


def budget_check() -> None:
    today, day_cap, month, month_cap = budget()
    if month >= month_cap:
        raise Budget(f"this month's spend is ${month:.2f} of the ${month_cap:.2f} cap; Time is back in dry-run until a human raises it")
    if today >= day_cap:
        raise Budget(f"today's spend is ${today:.2f} of the ${day_cap:.2f} cap; carrying on tomorrow")


def andon(reason: str) -> None:
    """Pull the cord once: one open `andon` issue per breach. A monthly breach also flips TIME_MODE to dry-run; a daily
    one heals itself at midnight UTC, so the mode stays."""
    today, day_cap, month, month_cap = budget()
    monthly = month >= month_cap
    if any(i["title"].startswith("Spend cap") for i in issues("state=open&labels=andon")):
        return
    flipped = ""
    if monthly:
        try:
            gh("PUT", f"/repos/{REPO}/actions/variables/TIME_MODE", {"value": "dry-run"})
            flipped = "\n\nThe monthly cap tripped, so I set the Actions variable `TIME_MODE=dry-run`. Raise the cap, then set it back to `live`."
        except RuntimeError as e:
            try:
                if "-> 404" not in str(e):
                    raise
                gh("POST", f"/repos/{REPO}/actions/variables/TIME_MODE", {"value": "dry-run"})
                flipped = "\n\nThe monthly cap tripped, so I created the Actions variable `TIME_MODE=dry-run`. Raise the cap, then set it back to `live`."
            except RuntimeError as e2:
                flipped = f"\n\nThe monthly cap tripped, but I couldn't set `TIME_MODE=dry-run`: `{str(e2)[:200]}`. Please do it by hand."
    new_issue(f"Spend cap reached: ${today:.2f} today / ${month:.2f} this month",
              f"⏱️ Time stopped calling models: {reason}.\n\n- Daily cap (`TIME_DAILY_USD`): ${day_cap:.2f}\n"
              f"- Monthly cap (`TIME_MONTHLY_USD`): ${month_cap:.2f}\n- Ledger: `time/ledger/<YYYY-MM>.jsonl`"
              f"{flipped}\n\nClose this once it's handled.", ["andon"])


def think(seat: str, model: str | None, effort: str | None, system: str, user: str) -> str:
    body = {"model": model or SEATS[seat]["default"], "temperature": 0.4, "max_tokens": 4000,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "venice_parameters": {"include_venice_system_prompt": False}}
    if effort:
        body["reasoning_effort"] = effort
    out = chat(body, timeout=240)
    text = out["choices"][0]["message"]["content"] or ""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip() or "(empty reply)"


RULES = """You were @mentioned in an issue or PR thread of a small agent factory. Reply as yourself, in the thread.
Answer what was asked, concretely and briefly. You can't run code or browse; say so if the ask needs that.
Never invent links, numbers or results. If you are only mentioned in passing, reply with exactly NO_REPLY."""


def cmd_mention() -> int:
    ev = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    issue = ev["issue"]
    src = ev.get("comment") or issue
    author = src["user"]
    if author.get("login") == TIME_BOT or MARK in (src.get("body") or ""):
        print("skip: Time's own comment")
        return 0
    if not trusted(author.get("login")):  # public repo: strangers can comment, but must not spend the seats' credits
        print("skip: not a collaborator")
        return 0
    found = mentions(src.get("body") or "")
    if not found:
        print("no seat mentioned")
        return 0
    comments = gh("GET", f"/repos/{REPO}/issues/{issue['number']}/comments?limit=30")
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
# Time finds that PR on the forge, so tracking never depends on fields of Cursor's responses.

CURSOR = os.environ.get("CURSOR_API_BASE", "https://api.cursor.com")


def cursor(method: str, path: str, body=None):
    key = os.environ.get("CURSOR_API_KEY")
    if not key:
        raise LookupError("no CURSOR_API_KEY secret on this repo yet")
    return http(method, f"{CURSOR}{path}", key, body, timeout=60)


def repo_url() -> str:
    return f"{SERVER}/{REPO}"


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


# ---------- planner: a `spec` issue -> queued cards ----------
# Cascade: parse the spec deterministically first; only ask a seat when it isn't already card-shaped.

CARD_LINE = re.compile(r"^\s*[-*]\s*(?:\[ \]\s*)?(?P<title>.+?)\s+(?:—|--|-|\|)\s*DONE:\s*(?P<done>.+)$", re.I)
PLAN_PROMPT = """Split this spec into small cards, one pull request each, in build order.
Reply with ONLY a JSON list: [{"title": "...", "body": "what to change, as a short list", "done": "what finished means"}]"""


def parse_spec(body: str) -> list[dict]:
    """`- title — DONE: x` lines, or `### title` sections that contain a `DONE:` line."""
    cards = [{"title": m["title"].strip(), "body": "", "done": m["done"].strip()}
             for m in map(CARD_LINE.match, body.splitlines()) if m]
    if cards:
        return cards
    for sec in re.split(r"^#{2,3}\s+", body, flags=re.M)[1:]:
        title, _, rest = sec.partition("\n")
        m = re.search(r"^\s*DONE:\s*(.+)$", rest, re.M | re.I)
        if m:
            cards.append({"title": title.strip(), "body": rest[:m.start()].strip(), "done": m.group(1).strip()})
    return cards


def plan_spec(spec: dict) -> None:
    n = spec["number"]
    cards = parse_spec(spec.get("body") or "")
    if not cards and os.environ.get("VENICE_API_KEY"):
        seat = (os.environ.get("TIME_PLANNER") or "kimi").split()[0]
        raw = think(seat, None, None, PLAN_PROMPT, f"# {spec['title']}\n{(spec.get('body') or '')[:20000]}")
        try:
            cards = json.loads(raw[raw.index("["): raw.rindex("]") + 1])
        except ValueError:
            cards = []
    if not cards:
        comment(n, "⏱️ Time: I couldn't find cards in this spec. Write one line per card as `- title — DONE: what finished "
                "means` (or `### title` sections with a `DONE:` line), or add VENICE_API_KEY so a seat can split it.",
                {"beat": "plan-failed"})
        unlabel(n, "spec")
        return
    made, prev = [], None
    for i, c in enumerate(cards, 1):
        body = (c.get("body") or "").strip() + f"\n\nPart of #{n} (step {i}/{len(cards)})." + \
            (f" Depends on #{prev}." if prev else "") + f"\n\nDONE: {c['done']}"
        prev = new_issue(c["title"], body.strip(), ["queued"])["number"]
        made.append(prev)
    comment(n, "⏱️ Time: planned " + ", ".join(f"#{m}" for m in made) + ". They run one at a time: each starts when "
            "the one before it merges.", {"beat": "planned", "cards": made})
    unlabel(n, "spec")
    label(n, "planned")


def promote_next() -> int | None:
    """Label the oldest `queued` card whose dependencies are closed `ready`; at most TIME_PARALLEL cards in flight."""
    ready = issues("state=open&labels=ready")
    if len(ready) >= int(os.environ.get("TIME_PARALLEL") or 1):
        return None
    queued = issues("state=open&labels=queued")
    for card in sorted(queued, key=lambda i: i["number"]):
        deps = [int(d) for d in re.findall(r"Depends on #(\d+)", card.get("body") or "")]
        if all(gh("GET", f"/repos/{REPO}/issues/{d}")["state"] == "closed" for d in deps):
            try:
                unlabel(card["number"], "queued")
            except RuntimeError as e:
                if "404" in str(e):  # another beat promoted it first
                    continue
                raise
            label(card["number"], "ready")
            return card["number"]
    return None


# ---------- landing: verdict -> merge (TIME_AUTOMERGE=on) ----------

VERDICT = re.compile(r"^[\s*_>#]*(approve|object)\b", re.I)
DEFAULT_PROTECTED = ".github/,.gitea/,deploy,infra/,.env,secret"


def verdict(pr: dict, since: str) -> str | None:
    """Latest reviewer verdict after `since`: a comment starting Approve/Object, or a PR review."""
    found = []
    for c in gh("GET", f"/repos/{REPO}/issues/{pr['number']}/comments?limit=100"):
        m = VERDICT.match(c.get("body") or "")
        ok = is_time(c) or trusted((c.get("user") or {}).get("login"))  # public repos: strangers can comment
        if m and ok and c["created_at"] > since:
            found.append((c["created_at"], m.group(1).lower()))
    for r in gh("GET", f"/repos/{REPO}/pulls/{pr['number']}/reviews?limit=100"):
        state = {"APPROVED": "approve", "REQUEST_CHANGES": "object", "CHANGES_REQUESTED": "object"}.get(r.get("state"))
        if state and trusted((r.get("user") or {}).get("login")) and (r.get("submitted_at") or "") > since:
            found.append((r["submitted_at"], state))
    return max(found)[1] if found else None


def touches_protected(pr_number: int) -> list[str]:
    paths = [p.strip() for p in (os.environ.get("TIME_PROTECTED") or DEFAULT_PROTECTED).split(",") if p.strip()]
    paths = list(dict.fromkeys([".github/", ".gitea/", *paths]))  # workflows stay a human's merge whatever TIME_PROTECTED says
    files, page = [], 1
    while True:  # every file, not the first 100; a rename counts under both names
        batch = gh("GET", f"/repos/{REPO}/pulls/{pr_number}/files?limit=100&page={page}")
        for f in batch:
            files.append(f["filename"])
            if f.get("previous_filename"):
                files.append(f["previous_filename"])
        if len(batch) < 100:
            break
        page += 1
    return [f for f in files if any(f.startswith(p) or p in f for p in paths)]


WORKER_CONTEXT = "time/worker-run"


def checks(sha: str) -> str:
    """pass | pending | fail | none, over the commit statuses on the PR head (Gitea Actions report as statuses).

    The worker's own status (WORKER_CONTEXT) can fail or delay a merge but never earns one: a model that chose the
    command it ran is not a reviewer of it. Without any other check the answer is "none"."""
    states = gh("GET", f"/repos/{REPO}/commits/{sha}/status").get("statuses") or []
    latest: dict[str, str] = {}
    for st in states:  # one line per context, newest wins
        latest.setdefault(st.get("context") or "", (st.get("status") or st.get("state") or "").lower())
    if any(v == "pending" for v in latest.values()):
        return "pending"
    if not all(v in ("success", "skipped") for v in latest.values()):
        return "fail"
    if not any(ctx != WORKER_CONTEXT for ctx in latest):
        return "none"
    return "pass"


def dispatch_ci(pr: dict) -> bool:
    """Run the project's CI on the PR branch by hand when the push did not start it. TIME_CI_WORKFLOW (default
    ci.yml) must accept workflow_dispatch. Returns False when there is no such workflow."""
    wf = (os.environ.get("TIME_CI_WORKFLOW") or "ci.yml").strip()
    if wf == "off":
        return False
    try:
        gh("POST", f"/repos/{REPO}/actions/workflows/{wf}/dispatches", {"ref": pr["head"]["ref"]})
    except RuntimeError:
        return False
    return True


def land(card: dict, last: dict) -> None:
    """Move a card whose PR is up toward merged. Silent while nothing has changed."""
    n, pr = card["number"], gh("GET", f"/repos/{REPO}/pulls/{last['pr']}")
    since = pr["created_at"]  # any verdict after the PR exists counts; a stale beat time would hide same-run reviews
    if pr.get("merged_at"):
        if card.get("state", "open") == "open":
            gh("PATCH", f"/repos/{REPO}/issues/{n}", {"state": "closed"})
        comment(n, f"⏱️ Time: PR #{pr['number']} merged. Card done.", {"beat": "merged", "pr": pr["number"]})
        return
    if pr["state"] == "closed" or (os.environ.get("TIME_AUTOMERGE") or "off").strip() != "on":
        return
    v = verdict(pr, since)
    if v is None:
        return
    if v == "object":
        if last["beat"] != "needs-human":
            label(pr["number"], "needs-human")
            comment(n, f"⏱️ Time: the reviewer objected on PR #{pr['number']}. Over to a human (or comment `/time retry` "
                    "to send it back to the worker).", {"beat": "needs-human", "pr": pr["number"]})
        return
    if (hit := touches_protected(pr["number"])):
        if last["beat"] != "needs-human":
            label(pr["number"], "needs-human")
            comment(n, f"⏱️ Time: approved, but PR #{pr['number']} touches protected paths ({', '.join(hit[:5])}), so a "
                    "human merges this one.", {"beat": "needs-human", "pr": pr["number"]})
        return
    c = checks(pr["head"]["sha"])
    need = (os.environ.get("TIME_REQUIRE_CHECKS") or "on").strip() != "off"
    if c == "pending" or (c == "none" and need):
        if c == "none" and last["beat"] not in ("no-checks", "ci-dispatched"):
            if dispatch_ci(pr):
                comment(n, f"⏱️ Time: approved; running CI on PR #{pr['number']} before merging.",
                        {"beat": "ci-dispatched", "pr": pr["number"]})
            else:
                comment(n, f"⏱️ Time: approved, but PR #{pr['number']} has no checks, and I only merge on green. Add a CI "
                        "workflow that accepts workflow_dispatch (or set `TIME_REQUIRE_CHECKS=off`).", {"beat": "no-checks", "pr": pr["number"]})
        return
    if c == "fail":
        if last["beat"] != "checks-failed":
            comment(n, f"⏱️ Time: approved, but checks are failing on PR #{pr['number']}. Waiting for a fix.",
                    {"beat": "checks-failed", "pr": pr["number"]})
        return
    gh("POST", f"/repos/{REPO}/pulls/{pr['number']}/merge", {"Do": "squash", "delete_branch_after_merge": True})
    if gh("GET", f"/repos/{REPO}/issues/{n}")["state"] == "open":
        gh("PATCH", f"/repos/{REPO}/issues/{n}", {"state": "closed"})
    comment(n, f"⏱️ Time: approved and green, merged PR #{pr['number']}. Card done.", {"beat": "merged", "pr": pr["number"]})


# ---------- worker: a seat with hands ----------
# TIME_WORKER=claude:<seat> | venice:<seat> [model] [effort]. The seat edits the repo on its own branch through the contents
# API (the Actions token already has contents: write), runs shell steps on the runner's checkout, and opens the PR
# itself. Same contract as the Cursor worker: a PR whose body says "Closes #N".

import shutil
import subprocess
import tempfile

WORKER_TOOLS = [
    {"type": "function", "function": {"name": "list_files", "description": "List repository files (paths), optionally under a directory.",
     "parameters": {"type": "object", "properties": {"dir": {"type": "string"}}, "required": []}}},
    {"type": "function", "function": {"name": "read_file", "description": "Read one file from the branch.",
     "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "write_file", "description": "Create or replace one file on the branch with the full new content (commits it).",
     "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"},
                                                     "message": {"type": "string"}}, "required": ["path", "content"]}}},
    {"type": "function", "function": {"name": "run", "description": "Run a shell command on a fresh checkout of the branch (tests, checks, "
     "generators). Returns exit code and output. Whatever the command creates or changes is thrown away, except the paths "
     "listed in `keep`, which are committed to the branch afterwards.",
     "parameters": {"type": "object", "properties": {"command": {"type": "string"},
                    "keep": {"type": "array", "items": {"type": "string"},
                             "description": "Repo-relative paths the command created or changed that should land on the branch."}},
                    "required": ["command"]}}},
    {"type": "function", "function": {"name": "open_pr", "description": "Open the pull request when the work is done and checked. Call this exactly once, last.",
     "parameters": {"type": "object", "properties": {"title": {"type": "string"}, "summary": {"type": "string",
                    "description": "What changed and how you checked it."}}, "required": ["title", "summary"]}}},
]

WORKER_RULES = """You are the worker for card #{n} in {repo}: "{title}".

{body}

You have hands: list_files, read_file, write_file (one file per call, full content), run (shell on a fresh checkout of
your branch), open_pr. Work on the branch `{branch}`. Only two things reach it: write_file, and files a run lists in
`keep` (for generated files, e.g. a sample built by a script). Anything else a run does is thrown away. Keep the change small and focused.
Read before you write. Always `run` the project's tests or checks before opening the PR (that run is the PR's check). When it is done and checked, call open_pr once
with a short summary; the PR must close the card, and Time adds that line for you. Do not touch .github/workflows or .gitea/workflows.
The card's finish line is: DONE: {done}"""


_DOCKER: bool | None = None


def docker_ok() -> bool:
    """Is a docker daemon reachable? Checked once per process."""
    global _DOCKER
    if _DOCKER is None:
        try:
            _DOCKER = bool(shutil.which("docker")) and subprocess.run(
                ["docker", "version", "--format", "{{.Server.Version}}"], capture_output=True, timeout=15).returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            _DOCKER = False
    return _DOCKER


class Hands:
    def __init__(self, n: int, branch: str):
        self.n, self.branch, self.pr, self.steps = n, branch, None, 0
        self.label = "a seat"  # venice_work names the seat for the PR footer
        try:
            gh("POST", f"/repos/{REPO}/branches", {"new_branch_name": branch, "old_branch_name": default_branch()})
        except RuntimeError as e:
            if "409" not in str(e):  # already there: resume on it
                raise
        self.checkout = None

    def _checkout(self) -> str:
        d = tempfile.mkdtemp(prefix="time-worker-")
        url = SERVER.replace("://", f"://x-access-token:{os.environ['GITHUB_TOKEN']}@", 1) + f"/{REPO}.git"
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--branch", self.branch, url, d], check=True, capture_output=True)
        # the token must not stay in .git/config, where a `run` command could read it
        subprocess.run(["git", "remote", "set-url", "origin", f"{SERVER}/{REPO}.git"], cwd=d, check=True, capture_output=True)
        return d

    def call(self, name: str, a: dict) -> str:
        self.steps += 1
        if name == "list_files":
            tree = gh("GET", f"/repos/{REPO}/git/trees/{self.branch}?recursive=true&per_page=1000").get("tree") or []
            d = (a.get("dir") or "").strip("/")
            paths = [t["path"] for t in tree if t["type"] == "blob" and (not d or t["path"].startswith(d + "/"))]
            return "\n".join(paths[:400]) or "(empty)"
        if name == "read_file":
            try:
                f = gh("GET", f"/repos/{REPO}/contents/{a['path']}?ref={self.branch}")
            except RuntimeError as e:
                return f"error: {e}"
            return base64.b64decode(f["content"]).decode(errors="replace")[:60000]
        if name == "write_file":
            if a["path"].startswith((".github/workflows", ".gitea/workflows")):
                return "refused: workflow files are a human's to change"
            body = {"message": a.get("message") or f"card #{self.n}: update {a['path']}", "branch": self.branch,
                    "content": base64.b64encode(a["content"].encode()).decode()}
            try:
                body["sha"] = gh("GET", f"/repos/{REPO}/contents/{a['path']}?ref={self.branch}")["sha"]
            except RuntimeError:
                pass
            gh("PUT", f"/repos/{REPO}/contents/{a['path']}", body)
            self.checkout = None
            return f"wrote {a['path']}"
        if name == "run":
            self.checkout = self._checkout()  # fresh: see the latest writes
            # Cards and venture inputs can carry third-party text, so the shell the model drives sees no secrets.
            clean = {k: v for k, v in os.environ.items() if not re.search(r"TOKEN|KEY|SECRET|PASSWORD|ACTIONS_", k, re.I)}
            limit = int(os.environ.get("TIME_RUN_TIMEOUT") or 180)
            # A scrubbed env is not enough: the same uid can read the orchestrator's /proc/<pid>/environ. So the model's
            # command runs in a container (the checkout mounted, nothing else) when TIME_RUN_IMAGE names an image and a
            # docker daemon exists; the workflows set it on hosted runners. Unset (local runs, tests) means the host shell.
            image = (os.environ.get("TIME_RUN_IMAGE") or "off").strip()
            cmd = (["docker", "run", "--rm", "-v", f"{self.checkout}:/work", "-w", "/work", "-e", "HOME=/tmp", image,
                    "bash", "-lc", a["command"]] if image != "off" and docker_ok()
                   else ["bash", "-lc", a["command"]])
            try:
                p = subprocess.run(cmd, cwd=self.checkout, capture_output=True, text=True, timeout=limit, env=clean)
            except subprocess.TimeoutExpired:  # a server or watcher never exits: tell the model, don't crash the card
                return (f"timed out after {limit}s and was stopped. Servers and watchers never exit; run one-shot commands "
                        f"(a parser, a test script, node -e '...') instead")
            kept = []
            root = os.path.realpath(self.checkout)
            for rel in (a.get("keep") or [])[:10]:
                full = os.path.realpath(os.path.join(root, str(rel)))
                rel = os.path.relpath(full, root)
                if not full.startswith(root + os.sep) or rel.startswith((".github/workflows", ".gitea/workflows")) or not os.path.isfile(full):
                    kept.append(f"{rel}: refused or missing")
                    continue
                data = open(full, "rb").read()
                if len(data) > 2_000_000:
                    kept.append(f"{rel}: too big to keep")
                    continue
                body = {"message": f"card #{self.n}: {rel} (generated)", "branch": self.branch, "content": base64.b64encode(data).decode()}
                try:
                    body["sha"] = gh("GET", f"/repos/{REPO}/contents/{rel}?ref={self.branch}")["sha"]
                except RuntimeError:
                    pass
                gh("PUT", f"/repos/{REPO}/contents/{rel}", body)
                kept.append(f"{rel}: kept")
            sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.checkout, capture_output=True, text=True).stdout.strip()
            # the worker's own test run is recorded as a commit status; land() sees it but never merges on it alone.
            gh("POST", f"/repos/{REPO}/statuses/{sha}", {"state": "success" if p.returncode == 0 else "failure",
               "context": "time/worker-run", "description": a["command"][:100]})
            self.checkout = None if kept else self.checkout
            note = ("\n" + "; ".join(kept)) if kept else ""
            return f"exit {p.returncode}\n{(p.stdout + p.stderr)[-6000:]}{note}"
        if name == "open_pr":
            pr = gh("POST", f"/repos/{REPO}/pulls", {"title": a["title"][:200], "head": self.branch, "base": default_branch(),
                    "body": f"{a['summary']}\n\nCloses #{self.n}\n\n<sub>worker: {self.label} via Time</sub>"})
            self.pr = pr["number"]
            return f"opened PR #{self.pr}"
        return f"unknown tool {name}"


def seat_worker(spec: str) -> bool:
    return spec.startswith(("venice:", "claude:"))


def worker_seat_model(spec: str) -> tuple[str, str, str | None]:
    """'qwen coder', 'venice:kimi code high' or 'claude:sonnet' -> (seat, model id, effort)."""
    spec = spec.split(":", 1)[1] if seat_worker(spec) else spec
    words = spec.split()
    seat = words[0] if words and words[0] in SEATS else "kimi"
    model, effort = mentions(f"@{spec}").get(seat, (None, None)) if seat in SEATS else (None, None)
    return seat, model or SEATS[seat].get("aliases", {}).get("code") or SEATS[seat]["default"], effort


def venice_work(card: dict, done: str, spec: str, hands_cls=None) -> dict:
    """Run one card with a seat (Venice or Claude) as the worker. Returns {pr, steps, seat, model}. The name is
    historical; venture.py and the tests call it. TIME_WORKER_FALLBACK (default `grok build` for a Venice worker,
    `off` for Claude, since a fallback should not silently cross providers) takes over if the model stays overloaded."""
    seat, model, effort = worker_seat_model(spec)
    fallback = (os.environ.get("TIME_WORKER_FALLBACK") or ("grok build" if provider_of(model) == "venice" else "off")).strip()
    fb_model = worker_seat_model(fallback)[1] if fallback.lower() != "off" else None
    hands = (hands_cls or Hands)(card["number"], f"time/card-{card['number']}")
    hands.label = SEATS[seat]["label"]
    msgs = [{"role": "system", "content": WORKER_RULES.format(n=card["number"], repo=REPO, title=card["title"],
             body=(card.get("body") or "")[:20000], branch=hands.branch, done=done)},
            {"role": "user", "content": "Begin. Look at the repository first."}]
    for _ in range(int(os.environ.get("TIME_WORKER_STEPS") or 40)):
        body = {"model": model, "temperature": 0.2, "max_tokens": int(os.environ.get("TIME_WORKER_MAX_TOKENS") or 16000),
                "messages": msgs, "tools": WORKER_TOOLS,
                "venice_parameters": {"include_venice_system_prompt": False}}
        if effort:
            body["reasoning_effort"] = effort
        try:
            msg = chat(body, timeout=300)["choices"][0]["message"]
        except RuntimeError as e:
            if isinstance(e, Budget) or not fb_model or model == fb_model or not re.search(r"-> (429|5\d\d)\b", str(e)):
                raise
            print(f"{model} stays overloaded; the fallback {fb_model} takes over")
            model = body["model"] = fb_model
            msg = chat(body, timeout=300)["choices"][0]["message"]
        msgs.append({k: v for k, v in msg.items() if k in ("role", "content", "tool_calls")})
        calls = msg.get("tool_calls") or []
        if not calls:
            if hands.pr:
                break
            msgs.append({"role": "user", "content": "You have not opened the PR. Finish the work and call open_pr, or explain what blocks you."})
            continue
        for c in calls:
            try:
                args = json.loads(c["function"].get("arguments") or "{}")
            except ValueError:
                args = {}
            out = hands.call(c["function"]["name"], args)
            msgs.append({"role": "tool", "tool_call_id": c["id"], "content": out})
        if hands.pr:
            break
    if not hands.pr:
        last = next((m.get("content") for m in reversed(msgs) if m.get("role") == "assistant" and m.get("content")), "")
        raise RuntimeError(f"{seat} stopped without a PR after {hands.steps} steps: {(last or '')[:200]}")
    return {"pr": hands.pr, "steps": hands.steps, "seat": seat, "model": model}


# ---------- heartbeat ----------


def is_time(c: dict) -> bool:
    """A comment Time itself wrote (through the Actions token). Anyone can paste the marker; only this author counts."""
    u = c.get("user") or {}
    return u.get("login") == TIME_BOT


def beats_of(comments: list[dict]) -> list[dict]:
    """Time's own state comments on a card, oldest first, as {meta..., at}."""
    out = []
    for c in comments:
        b = c.get("body") or ""
        if is_time(c) and MARK in b and '"beat":' in b:
            try:
                meta = json.loads(b.split(MARK, 1)[1].rsplit("-->", 1)[0])
            except ValueError:
                continue
            out.append({**meta, "at": c["created_at"]})
    return out


def retry_requested(comments: list[dict], since: str) -> bool:
    # >=: a retry typed in the same second as the beat still counts; strangers on a public repo can't re-spend
    return any(c["created_at"] >= since and "/time retry" in (c.get("body") or "") and trusted((c.get("user") or {}).get("login"))
               for c in comments)


def linked_prs(prs: list[dict], n: int) -> list[dict]:
    pat = re.compile(rf"\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#{n}\b", re.I)
    return [p for p in prs if pat.search(p.get("body") or "")]


def pr_diff(number: int, limit: int = 100_000) -> str:
    req = urllib.request.Request(f"{GH}/repos/{REPO}/pulls/{number}.diff",
                                 headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode(errors="replace")[:limit]


def review(card: dict, pr: dict, done: str) -> dict:
    """TIME_REVIEW: off | venice:<seat> | claude:<seat> [model] [effort] | cursor[:<model id>]"""
    spec = (os.environ.get("TIME_REVIEW") or "off").strip()
    if spec in ("", "off"):
        return {"review": "off"}
    kind, _, rest = spec.partition(":")
    if kind == "cursor":
        r = cursor_launch(REVIEW_PROMPT.format(pr=pr["number"], repo=REPO, n=card["number"], title=card["title"], done=done),
                          model=rest.strip() or None, pr_url=pr["html_url"], create_pr=False)
        return {"review": "cursor", **r}
    if kind in ("venice", "claude"):
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
    for spec in issues("state=open&labels=spec"):
        try:
            plan_spec(spec)
        except Exception as e:  # noqa: BLE001
            print(f"spec #{spec['number']}: {type(e).__name__}: {e}")
    for _ in range(3):  # a merge can free the slot for the next card; dispatch it in the same run
        tick()
        if promote_next() is None:
            break
    return 0


def tick() -> None:
    mode = (os.environ.get("TIME_MODE") or "dry-run").strip()
    cap = int(os.environ.get("TIME_DAILY_CAP") or 5)
    stuck_h = float(os.environ.get("TIME_STUCK_HOURS") or 6)
    worker_model = (os.environ.get("TIME_CURSOR_MODEL") or "").strip() or None
    worker = (os.environ.get("TIME_WORKER") or "cursor").strip()
    worker_name = SEATS[worker_seat_model(worker)[0]]["label"] if seat_worker(worker) else \
        f"Cursor cloud agent{f' ({worker_model})' if worker_model else ''}"
    now = dt.datetime.now(dt.timezone.utc)
    today = now.date().isoformat()
    cards = issues("state=open&labels=ready")
    prs = gh("GET", f"/repos/{REPO}/pulls?state=all&sort=recentupdate&limit=50")
    launches_today = 0
    plan = []
    for card in cards:
        cs = gh("GET", f"/repos/{REPO}/issues/{card['number']}/comments?limit=100")
        beats = beats_of(cs)
        launches_today += sum(1 for b in beats if b.get("launched") and b["at"].startswith(today))
        # "blocked" = a key was missing, "capped" = out of budget; neither is progress, resume once it's fixed
        real = [b for b in beats if b["beat"] not in ("blocked", "capped")]
        last = real[-1] if real else None
        blocked = any(b["beat"] == "blocked" and (not last or b["at"] >= last["at"]) for b in beats)
        if last and retry_requested(cs, last["at"]):
            last = None
        m = re.search(r"^\s*DONE:\s*(.+)$", card.get("body") or "", re.M | re.I)
        capped = any(b["beat"] == "capped" and (not last or b["at"] >= last["at"]) for b in beats)
        plan.append((card, last, m.group(1).strip() if m else None, blocked, capped))
    print(f"tick {now:%Y-%m-%dT%H:%MZ} mode={mode} cards={len(cards)} launches_today={launches_today}/{cap}")

    tripped = None
    for card, last, done, blocked, capped in plan:
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
                        f"- Worker: {worker_name}, opens a PR that closes #{n}\n"
                        "- Goes for real once `TIME_MODE=live`", {"beat": "would-dispatch", "mode": mode})
                continue
            if state in (None, "needs-done", "would-dispatch") and mode == "live":
                if launches_today >= cap:
                    print(f"#{n}: daily cap reached")
                    continue
                # out of budget: skip like the launches cap, but through the Budget handler so the card says why
                budget_check()  # and before the "working on this" beat, so a capped card never looks dispatched
                if seat_worker(worker):
                    prov = provider_of(worker_seat_model(worker)[1])
                    comment(n, f"⏱️ Time: {worker_name} is working on this now, on branch `time/card-{n}`.",
                            {"beat": "dispatched", "launched": True, "worker": prov})
                    launches_today += 1
                    r = venice_work(card, done, worker.split(":", 1)[1])
                    comment(n, f"⏱️ Time: `{r['seat']}` opened PR #{r['pr']} ({r['steps']} steps, {r['model']}). "
                            "Review and landing follow on the next beat.", {"beat": "dispatched", "worker": prov, **r})
                    continue
                r = cursor_launch(BUILD_PROMPT.format(n=n, repo=REPO, title=card["title"], body=(card.get("body") or "")[:20000],
                                                      base=default_branch(), done=done), model=worker_model)
                launches_today += 1
                link = f" ([agent]({r['agent_url']}))" if r.get("agent_url") else ""
                comment(n, f"⏱️ Time: dispatched to a Cursor cloud agent{link}. It will open a PR that closes #{n}; "
                        "I'll link it here when it appears.", {"beat": "dispatched", "launched": True, **r, "model": worker_model})
                continue
            if state in ("pr", "needs-human", "no-checks", "checks-failed"):
                land(card, last)
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
        except Budget as e:  # out of money: say so once per card, pull the andon cord once per tick
            print(f"#{n}: spend cap reached: {e}")
            tripped = tripped or str(e)
            if not capped:
                comment(n, f"⏱️ Time: {e}. Nothing is lost; this card resumes once there is budget.", {"beat": "capped"})
        except LookupError as e:  # a key is missing: say so once, plainly
            if not blocked:
                comment(n, f"⏱️ Time: can't go further on this card: {e}. I'll carry on once it's added.", {"beat": "blocked"})
        except Exception as e:  # noqa: BLE001  one card must not stop the others
            print(f"#{n}: {type(e).__name__}: {e}")
            comment(n, f"⏱️ Time: the worker call failed: `{str(e)[:300]}`. Comment `/time retry` to try again.",
                    {"beat": "error"})
    if tripped:
        andon(tripped)


# ---------- doctor ----------

def cmd_doctor() -> int:
    lines, ok = [], True

    def row(name: str, good: bool, detail: str) -> None:
        nonlocal ok
        ok &= good or name.startswith("(optional)")
        lines.append(f"| {'✅' if good else '⚠️'} | {name} | {detail} |")

    labels = [l["name"] for l in gh("GET", f"/repos/{REPO}/labels?limit=100")]
    row("label `ready`", "ready" in labels, "exists" if "ready" in labels else "missing (Time creates labels it needs on first use)")
    row("TIME_MODE", True, os.environ.get("TIME_MODE") or "dry-run (default)")
    row("TIME_DAILY_CAP", True, os.environ.get("TIME_DAILY_CAP") or "5 (default)")
    row("TIME_WORKER", True, os.environ.get("TIME_WORKER") or "cursor (default); or claude:<seat> / venice:<seat> for a seat with hands")
    row("TIME_REVIEW", True, os.environ.get("TIME_REVIEW") or "off (default)")
    today, day_cap, month, month_cap = budget()
    row("TIME_DAILY_USD", True, os.environ.get("TIME_DAILY_USD") or "5 (default)")
    row("TIME_MONTHLY_USD", True, os.environ.get("TIME_MONTHLY_USD") or "100 (default)")
    row("spend", today < day_cap and month < month_cap, f"${today:.2f} today, ${month:.2f} this month ({ledger_path(dt.datetime.now(dt.timezone.utc).strftime('%Y-%m'))})")
    row("(optional) ANTHROPIC_API_KEY (Claude seats)", bool(os.environ.get("ANTHROPIC_API_KEY")),
        "set" if os.environ.get("ANTHROPIC_API_KEY") else "not set")
    row("TIME_AUTOMERGE", True, (os.environ.get("TIME_AUTOMERGE") or "off (default)") + "; merges on Approve + green checks")
    for name in ("queued", "spec", "needs-human"):
        row(f"(optional) label `{name}`", name in labels, "exists" if name in labels else "missing (created on first use)")
    try:
        ids = [m["id"] for m in http("GET", f"{VENICE}/models?type=text", os.environ["VENICE_API_KEY"])["data"]] \
            if os.environ.get("VENICE_API_KEY") else None
        row("(optional) VENICE_API_KEY (seats)", ids is not None, f"works, {len(ids)} models" if ids else "not set")
    except Exception as e:  # noqa: BLE001
        row("(optional) VENICE_API_KEY (seats)", False, f"set but failing: {str(e)[:120]}")
    cfs = importlib.util.spec_from_file_location("cfb", Path(__file__).resolve().parent / "cloudflare.py")
    cfb = importlib.util.module_from_spec(cfs)
    cfs.loader.exec_module(cfb)
    good, detail = cfb.check()
    row("(optional) CLOUDFLARE_API_TOKEN (venture backends)", good, detail)
    try:
        models = cursor("GET", "/v1/models")
        items = models.get("models") or models.get("data") or models.get("items") or (models if isinstance(models, list) else [])
        names = [m.get("id") if isinstance(m, dict) else str(m) for m in items]
        row("CURSOR_API_KEY (worker)", True, f"works; models: {', '.join(n for n in names[:12] if n) or 'listed'}")
    except LookupError:
        row("CURSOR_API_KEY (worker)", False, "not set (repo/org Actions secret)")
    except Exception as e:  # noqa: BLE001
        row("CURSOR_API_KEY (worker)", False, f"set but failing: {str(e)[:160]}")
    report = "## Time doctor\n\n| | check | detail |\n|---|---|---|\n" + "\n".join(lines) + \
        "\n\nCursor cloud agents need a GitHub-hosted repo; on Gitea use TIME_WORKER=claude:sonnet (or venice:<seat>)."
    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        Path(os.environ["GITHUB_STEP_SUMMARY"]).write_text(report)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit({"mention": cmd_mention, "heartbeat": cmd_heartbeat, "doctor": cmd_doctor}[sys.argv[1]]())
