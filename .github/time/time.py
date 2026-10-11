"""Time: the clock for a GitHub-native agent factory. stdlib only; runs on GitHub-hosted runners.

    python3 .github/time/time.py mention     # on issue/comment events: answer @seat [model] [effort]
    python3 .github/time/time.py heartbeat   # on schedule: plan specs, dispatch `ready` cards, merge approved PRs, pull the next card

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
        gh("DELETE", f"/repos/{REPO}/issues/{n}/labels/spec")
        return
    made, prev = [], None
    for i, c in enumerate(cards, 1):
        body = (c.get("body") or "").strip() + f"\n\nPart of #{n} (step {i}/{len(cards)})." + \
            (f" Depends on #{prev}." if prev else "") + f"\n\nDONE: {c['done']}"
        prev = gh("POST", f"/repos/{REPO}/issues", {"title": c["title"], "body": body.strip(), "labels": ["queued"]})["number"]
        made.append(prev)
    comment(n, "⏱️ Time: planned " + ", ".join(f"#{m}" for m in made) + ". They run one at a time: each starts when "
            "the one before it merges.", {"beat": "planned", "cards": made})
    gh("DELETE", f"/repos/{REPO}/issues/{n}/labels/spec")
    gh("POST", f"/repos/{REPO}/issues/{n}/labels", {"labels": ["planned"]})


def promote_next() -> int | None:
    """Label the oldest `queued` card whose dependencies are closed `ready`; at most TIME_PARALLEL cards in flight."""
    ready = [i for i in gh("GET", f"/repos/{REPO}/issues?state=open&labels=ready&per_page=50") if "pull_request" not in i]
    if len(ready) >= int(os.environ.get("TIME_PARALLEL") or 1):
        return None
    queued = [i for i in gh("GET", f"/repos/{REPO}/issues?state=open&labels=queued&per_page=50&sort=created&direction=asc")
              if "pull_request" not in i]
    for card in sorted(queued, key=lambda i: i["number"]):
        deps = [int(d) for d in re.findall(r"Depends on #(\d+)", card.get("body") or "")]
        if all(gh("GET", f"/repos/{REPO}/issues/{d}")["state"] == "closed" for d in deps):
            gh("DELETE", f"/repos/{REPO}/issues/{card['number']}/labels/queued")
            gh("POST", f"/repos/{REPO}/issues/{card['number']}/labels", {"labels": ["ready"]})
            return card["number"]
    return None


# ---------- landing: verdict -> merge (TIME_AUTOMERGE=on) ----------

TRUSTED = ("OWNER", "MEMBER", "COLLABORATOR")
VERDICT = re.compile(r"^[\s*_>#]*(approve|object)\b", re.I)
DEFAULT_PROTECTED = ".github/,deploy,infra/,.env,secret"


def verdict(pr: dict, since: str) -> str | None:
    """Latest reviewer verdict after `since`: a comment starting Approve/Object, or a GitHub review."""
    found = []
    for c in gh("GET", f"/repos/{REPO}/issues/{pr['number']}/comments?per_page=100"):
        m = VERDICT.match(c.get("body") or "")
        trusted = c["user"].get("type") == "Bot" or c.get("author_association") in TRUSTED  # public repos: strangers can comment
        if m and trusted and c["created_at"] > since:
            found.append((c["created_at"], m.group(1).lower()))
    for r in gh("GET", f"/repos/{REPO}/pulls/{pr['number']}/reviews?per_page=100"):
        state = {"APPROVED": "approve", "CHANGES_REQUESTED": "object"}.get(r.get("state"))
        if state and r.get("author_association") in TRUSTED and (r.get("submitted_at") or "") > since:
            found.append((r["submitted_at"], state))
    return max(found)[1] if found else None


def touches_protected(pr_number: int) -> list[str]:
    paths = [p.strip() for p in (os.environ.get("TIME_PROTECTED") or DEFAULT_PROTECTED).split(",") if p.strip()]
    files = [f["filename"] for f in gh("GET", f"/repos/{REPO}/pulls/{pr_number}/files?per_page=100")]
    return [f for f in files if any(f.startswith(p) or p in f for p in paths)]


def checks(sha: str) -> str:
    """pass | pending | fail | none, over every check run on the PR head."""
    runs = gh("GET", f"/repos/{REPO}/commits/{sha}/check-runs?per_page=100").get("check_runs", [])
    if not runs:
        return "none"
    if any(r["status"] != "completed" for r in runs):
        return "pending"
    return "pass" if all(r["conclusion"] in ("success", "neutral", "skipped") for r in runs) else "fail"


def land(card: dict, last: dict) -> None:
    """Move a card whose PR is up toward merged. Silent while nothing has changed."""
    n, pr = card["number"], gh("GET", f"/repos/{REPO}/pulls/{last['pr']}")
    if pr.get("merged_at"):
        if card.get("state", "open") == "open":
            gh("PATCH", f"/repos/{REPO}/issues/{n}", {"state": "closed"})
        comment(n, f"⏱️ Time: PR #{pr['number']} merged. Card done.", {"beat": "merged", "pr": pr["number"]})
        return
    if pr["state"] == "closed" or (os.environ.get("TIME_AUTOMERGE") or "off").strip() != "on":
        return
    v = verdict(pr, last["at"])
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
        if c == "none" and last["beat"] != "no-checks":
            comment(n, f"⏱️ Time: approved, but PR #{pr['number']} has no checks, and I only merge on green. Add a CI "
                    "workflow (or set `TIME_REQUIRE_CHECKS=off`).", {"beat": "no-checks", "pr": pr["number"]})
        return
    if c == "fail":
        if last["beat"] != "checks-failed":
            comment(n, f"⏱️ Time: approved, but checks are failing on PR #{pr['number']}. Waiting for a fix.",
                    {"beat": "checks-failed", "pr": pr["number"]})
        return
    gh("PUT", f"/repos/{REPO}/pulls/{pr['number']}/merge", {"merge_method": "squash"})
    if gh("GET", f"/repos/{REPO}/issues/{n}")["state"] == "open":
        gh("PATCH", f"/repos/{REPO}/issues/{n}", {"state": "closed"})
    comment(n, f"⏱️ Time: approved and green, merged PR #{pr['number']}. Card done.", {"beat": "merged", "pr": pr["number"]})


def label(number: int, name: str) -> None:
    gh("POST", f"/repos/{REPO}/issues/{number}/labels", {"labels": [name]})


# ---------- worker: a Venice seat with hands ----------
# TIME_WORKER=venice:<seat> [model] [effort]. The seat edits the repo on its own branch through the GitHub contents
# API (the Actions token already has contents: write), runs shell steps on the runner's checkout, and opens the PR
# itself. Same contract as the Cursor worker: a PR whose body says "Closes #N".

import base64
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
    {"type": "function", "function": {"name": "run", "description": "Run a shell command on a checkout of the branch (tests, lint). Returns exit code and output.",
     "parameters": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}}},
    {"type": "function", "function": {"name": "open_pr", "description": "Open the pull request when the work is done and checked. Call this exactly once, last.",
     "parameters": {"type": "object", "properties": {"title": {"type": "string"}, "summary": {"type": "string",
                    "description": "What changed and how you checked it."}}, "required": ["title", "summary"]}}},
]

WORKER_RULES = """You are the worker for card #{n} in {repo}: "{title}".

{body}

You have hands: list_files, read_file, write_file (one file per call, full content), run (shell on a checkout of your
branch), open_pr. Work on the branch `{branch}`; everything you write lands there. Keep the change small and focused.
Read before you write. Run the project's tests or checks if any exist. When it is done and checked, call open_pr once
with a short summary; the PR must close the card, and Time adds that line for you. Do not touch .github/workflows.
The card's finish line is: DONE: {done}"""


class Hands:
    def __init__(self, n: int, branch: str):
        self.n, self.branch, self.pr, self.steps = n, branch, None, 0
        base = gh("GET", f"/repos/{REPO}/git/ref/heads/{default_branch()}")["object"]["sha"]
        try:
            gh("POST", f"/repos/{REPO}/git/refs", {"ref": f"refs/heads/{branch}", "sha": base})
        except RuntimeError as e:
            if "422" not in str(e):
                raise
        self.checkout = None

    def _checkout(self) -> str:
        d = tempfile.mkdtemp(prefix="time-worker-")
        url = f"https://x-access-token:{os.environ['GITHUB_TOKEN']}@github.com/{REPO}"
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--branch", self.branch, url, d], check=True, capture_output=True)
        return d

    def call(self, name: str, a: dict) -> str:
        self.steps += 1
        if name == "list_files":
            tree = gh("GET", f"/repos/{REPO}/git/trees/{self.branch}?recursive=1").get("tree", [])
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
            if a["path"].startswith(".github/workflows"):
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
            self.checkout = self.checkout or self._checkout()
            p = subprocess.run(["bash", "-lc", a["command"]], cwd=self.checkout, capture_output=True, text=True, timeout=600)
            return f"exit {p.returncode}\n{(p.stdout + p.stderr)[-6000:]}"
        if name == "open_pr":
            pr = gh("POST", f"/repos/{REPO}/pulls", {"title": a["title"][:200], "head": self.branch, "base": default_branch(),
                    "body": f"{a['summary']}\n\nCloses #{self.n}\n\n<sub>worker: Venice seat via Time</sub>"})
            self.pr = pr["number"]
            return f"opened PR #{self.pr}"
        return f"unknown tool {name}"


def venice_work(card: dict, done: str, spec: str) -> dict:
    """Run one card with a Venice seat as the worker. Returns {pr, steps, seat, model}."""
    words = spec.split()
    seat = words[0] if words and words[0] in SEATS else "kimi"
    model, effort = mentions(f"@{spec}").get(seat, (None, None)) if seat in SEATS else (None, None)
    model = model or SEATS[seat].get("aliases", {}).get("code") or SEATS[seat]["default"]
    key = os.environ.get("VENICE_API_KEY")
    if not key:
        raise LookupError("no VENICE_API_KEY secret on this repo yet")
    hands = Hands(card["number"], f"time/card-{card['number']}")
    msgs = [{"role": "system", "content": WORKER_RULES.format(n=card["number"], repo=REPO, title=card["title"],
             body=(card.get("body") or "")[:20000], branch=hands.branch, done=done)},
            {"role": "user", "content": "Begin. Look at the repository first."}]
    for _ in range(int(os.environ.get("TIME_WORKER_STEPS") or 40)):
        body = {"model": model, "temperature": 0.2, "max_tokens": 6000, "messages": msgs, "tools": WORKER_TOOLS,
                "venice_parameters": {"include_venice_system_prompt": False}}
        if effort:
            body["reasoning_effort"] = effort
        msg = http("POST", f"{VENICE}/chat/completions", key, body, timeout=300)["choices"][0]["message"]
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
    for spec in [i for i in gh("GET", f"/repos/{REPO}/issues?state=open&labels=spec&per_page=10") if "pull_request" not in i]:
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
    worker_name = f"Venice seat `{worker.split(':', 1)[1].split()[0]}`" if worker.startswith("venice:") else \
        f"Cursor cloud agent{f' ({worker_model})' if worker_model else ''}"
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
                        f"- Worker: {worker_name}, opens a PR that closes #{n}\n"
                        "- Goes for real once `TIME_MODE=live`", {"beat": "would-dispatch", "mode": mode})
                continue
            if state in (None, "needs-done", "would-dispatch") and mode == "live":
                if launches_today >= cap:
                    print(f"#{n}: daily cap reached")
                    continue
                if worker.startswith("venice:"):
                    comment(n, f"⏱️ Time: {worker_name} is working on this now, on branch `time/card-{n}`.",
                            {"beat": "dispatched", "launched": True, "worker": "venice"})
                    launches_today += 1
                    r = venice_work(card, done, worker.split(":", 1)[1])
                    comment(n, f"⏱️ Time: `{r['seat']}` opened PR #{r['pr']} ({r['steps']} steps, {r['model']}). "
                            "Review and landing follow on the next beat.", {"beat": "dispatched", "worker": "venice", **r})
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
        except LookupError as e:  # a key is missing: say so once, plainly
            if not blocked:
                comment(n, f"⏱️ Time: can't go further on this card: {e}. I'll carry on once it's added.", {"beat": "blocked"})
        except Exception as e:  # noqa: BLE001  one card must not stop the others
            print(f"#{n}: {type(e).__name__}: {e}")
            comment(n, f"⏱️ Time: the worker call failed: `{str(e)[:300]}`. Comment `/time retry` to try again.",
                    {"beat": "error"})


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
    row("TIME_WORKER", True, os.environ.get("TIME_WORKER") or "cursor (default); or venice:<seat> for a seat with hands")
    row("TIME_REVIEW", True, os.environ.get("TIME_REVIEW") or "off (default)")
    row("TIME_AUTOMERGE", True, (os.environ.get("TIME_AUTOMERGE") or "off (default)") + "; merges on Approve + green checks")
    for name in ("queued", "spec", "needs-human"):
        row(f"(optional) label `{name}`", name in labels, "exists" if name in labels else f"missing: `gh label create {name}`")
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
