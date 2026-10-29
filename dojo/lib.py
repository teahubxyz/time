"""The dojo's offline forge and the manager's hands. The World is test_time.py's fake Gitea (pulled out of that file, not copied);
Dojo adds what a manager needs on top: authors by token, reviews, merge rules, variables, escalation counting."""
import ast, contextlib, datetime as dt, json, os, re
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
LABELS = ["ready", "queued", "spec", "planned", "needs-human", "signal", "signup", "venture", "venture-batch", "error", "andon", "astra", "parked", "money"]


def make_lib(tm):
    """-> namespace L with World (Dojo), card, pr, beat, iso, NOW, js, ledger_files, tm."""
    keep = [n for n in ast.parse((ROOT / ".github/time/test_time.py").read_text()).body
            if (isinstance(n, ast.ClassDef) and n.name == "World") or getattr(getattr(n, "targets", [None])[0], "id", "") in ("NOW", "iso")]
    ns = {"tm": tm, "json": json, "re": re, "dt": dt}
    exec(compile(ast.Module(keep, []), "test_time.py", "exec"), ns)
    iso, NOW = ns["iso"], ns["NOW"]

    class Dojo(ns["World"]):
        def __init__(s, cards, comments=None, prs=None, files=None, rule=0, seat="seat"):
            super().__init__(cards, comments, prs, None, {p["number"]: {"pr": p, "reviews": [], "files": ["app.py"], "diff": ""} for p in prs or []})
            s.label_ids = {n: i for i, n in enumerate(LABELS, 1)}
            s.files.update(files or {})
            s.rule, s.reviews, s.merges, s.vars, s.escalated, s.reviews_posted = {"required_approvals": rule}, [], [], [], [], []
            s.logins = {"gh": "gitea-actions", "time-tok": tm.TIME_USER, "seat-tok": seat}

        def vote(s, n, who, event="APPROVED"):
            s.gh_pr[n]["reviews"].append({"user": {"login": who}, "state": event, "body": event, "submitted_at": iso()})

        def http(s, method, url, token, body=None, timeout=0, headers=None):
            path, who = url.replace(tm.GH, ""), s.logins.get(token, token)
            if method == "POST" and path.endswith("/comments"):
                n = int(path.split("/")[-2]); s.posted.append((n, body["body"]))
                s.comments.setdefault(n, []).append({"created_at": iso(), "user": {"login": who}, "body": body["body"]})
                if "@owner" in body["body"]: s.escalated.append(n)
                return {}
            if method == "POST" and (m := re.search(r"/pulls/(\d+)/reviews$", path)):
                n = int(m[1])
                if s.gh_pr[n]["pr"]["user"]["login"] == who: raise RuntimeError(f"POST {path} -> 422: approve your own pull is not allowed")
                s.vote(n, who, body["event"]); s.gh_pr[n]["reviews"][-1]["body"] = body["body"]
                s.reviews.append((n, who, body["event"], body["body"])); return {}
            if method == "POST" and (m := re.search(r"/pulls/(\d+)/merge$", path)):
                n = int(m[1]); d = s.gh_pr[n]
                ok = sum(r["state"] == "APPROVED" and r["user"]["login"] != d["pr"]["user"]["login"] for r in d["reviews"])
                if ok < s.rule["required_approvals"]: raise RuntimeError(f"POST {path} -> 405: Does not have enough approvals yet. {ok} of {s.rule['required_approvals']} approvals granted")
                d["pr"].update(state="closed", merged_at=iso()); s.merges.append(n); return {}
            if "/branch_protections/" in path:
                if method != "GET": s.rule.update(body)
                return s.rule
            if "/actions/variables/" in path and method in ("PUT", "POST"):
                s.vars.append((path.rsplit("/", 1)[1], body)); return {}
            out = super().http(method, url, token, body, timeout)
            if method == "POST" and "/issues/" in path and path.endswith("/labels") and "needs-human" in [s.lname(l) for l in body["labels"]]:
                s.escalated.append(int(path.split("/")[5]))
            if method == "POST" and path == "/repos/o/r/issues" and "needs-human" in s.issues[out["number"]]["labels"]:
                s.escalated.append(out["number"])
            return out

    def card(n, title, done="", labels=("ready",)):
        return {"number": n, "title": title, "body": f"{title}\n\nDONE: {done}" if done else title, "labels": list(labels)}

    def pr(n, closes, user="time"):
        return {"number": n, "title": f"PR {n}", "body": f"Closes #{closes}", "state": "open", "user": {"login": user},
                "head": {"sha": f"sha{n:04d}"}, "html_url": f"https://forge.test/o/r/pulls/{n}", "merged_at": None}

    def beat(state, h=0, **kw):
        return {"created_at": iso(h), "user": {"login": tm.TIME_BOT}, "body": f"x\n\n{tm.MARK}{json.dumps({'beat': state, **kw})} -->"}

    def ledger_files(rows):  # rows: (hours ago, usd, pool) -> {path: jsonl}, one file per month
        out = {}
        for h, usd, pool in rows:
            at = (NOW - dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")
            out[f"time/ledger/{at[:7]}.jsonl"] = out.get(f"time/ledger/{at[:7]}.jsonl", "") + json.dumps({"at": at, "model": "m", "pool": pool, "in": 1, "out": 1, "usd": usd}) + "\n"
        return out

    def js(text):
        try: return json.loads(text[text.index("{"):text.rindex("}") + 1])
        except ValueError: raise AssertionError(f"no JSON object in the answer: {text[:80]!r}") from None
    return SimpleNamespace(tm=tm, World=Dojo, card=card, pr=pr, beat=beat, iso=iso, NOW=NOW, js=js, ledger_files=ledger_files)


@contextlib.contextmanager
def offline(L, w, seat):
    """Bind the engine to world `w`: forge calls hit the fake, model calls still go out. The seat's token is its own user."""
    tm, real, old = L.tm, L.tm.http, dict(os.environ)
    keep = (tm.REPO, tm.budget_check)
    os.environ.update(GITHUB_TOKEN="gh", TIME_TOKEN="time-tok", TIME_PACE="1", TIME_DAILY_USD="5", TIME_MONTHLY_USD="100", TIME_STUCK_HOURS="6",
                      **{f"TIME_SEAT_{seat.upper()}": "seat-tok"})
    tm._label_ids = tm._pools = None; tm._trust.clear(); tm._ledger_files.clear()
    tm.http = lambda m, u, t, b=None, timeout=0, headers=None: (real(m, u, t, b, timeout=timeout, **({"headers": headers} if headers else {}))
                                                                if u.startswith((tm.ANTHROPIC, tm.VENICE)) else w.http(m, u, t, b, timeout))
    tm.REPO, tm.budget_check = "o/r", lambda *a, **k: None   # the real budget is checked once, before the ladder, against the real repo
    try:
        yield
    finally:
        tm.http, (tm.REPO, tm.budget_check) = real, keep
        os.environ.clear(); os.environ.update(old); tm._pools = None; tm._ledger_files.clear()


def _t(name, desc, props=None, req=()):
    return {"type": "function", "function": {"name": name, "description": desc,
            "parameters": {"type": "object", "properties": {k: {"type": v} for k, v in (props or {}).items()}, "required": list(req)}}}


TOOLS = [
    _t("cards", "Every open card with its labels, Time's beats (state, hours ago), linked PRs, plus every PR with its reviews."),
    _t("read", "One issue or PR: body, labels, comments, and for a PR its diff and reviews.", {"number": "integer"}, ["number"]),
    _t("read_file", "A file in the repo (time/pools.json, time/ledger/YYYY-MM.jsonl, ...).", {"path": "string"}, ["path"]),
    _t("comment", "Comment on an issue as Time's voice. `beat` is an optional object written as a Time beat, e.g. {\"beat\": \"handoff\", ...}.",
       {"number": "integer", "text": "string", "beat": "object"}, ["number", "text"]),
    _t("label", "Add and/or remove labels on an issue.", {"number": "integer", "add": "array", "remove": "array"}, ["number"]),
    _t("new_issue", "File an issue (a card). Returns its number.", {"title": "string", "body": "string", "labels": "array"}, ["title", "body"]),
    _t("close", "Close an issue.", {"number": "integer"}, ["number"]),
    _t("review", "Post your review of a PR as yourself. Start the text with Approve or Object.", {"pr": "integer", "text": "string"}, ["pr", "text"]),
    _t("merge", "Squash-merge a PR as yourself.", {"pr": "integer"}, ["pr"]),
    _t("rule", "Read, or with required_approvals change, the branch protection rule of main.", {"required_approvals": "integer"}),
    _t("open_pr", "Open a pull request.", {"title": "string", "body": "string", "head": "string"}, ["title", "body", "head"]),
    _t("set_var", "Set an Actions variable (a cap, the mode).", {"name": "string", "value": "string"}, ["name", "value"]),
    _t("budget", "Spend from the ledger: today, yesterday, month, and the caps."),
    _t("finish", "End the kata with your answer (text; JSON when the task asks for it).", {"answer": "string"}, ["answer"]),
]


def act(L, w, seat, name, a):
    """Run one tool against world `w` (inside offline()). Returns the string the seat sees; errors are returned, not raised."""
    tm, n = L.tm, a.get("number")
    age = lambda at: round((L.NOW - dt.datetime.fromisoformat(at.replace("Z", "+00:00"))).total_seconds() / 3600, 1)
    try:
        if name == "cards":
            return json.dumps({"cards": [{"number": i["number"], "title": i.get("title"), "labels": i["labels"], "has_done": bool(tm.done_of(i)),
                "beats": [{"beat": b["beat"], "hours_ago": age(b["at"]), **({"pr": b["pr"]} if "pr" in b else {})} for b in tm.beats_of(w.comments.get(i["number"], []))],
                "prs": [p["number"] for p in tm.linked_prs(w.prs, i["number"])]}
                for i in sorted(w.issues.values(), key=lambda i: i["number"]) if i["state"] == "open"],
                "prs": [{"number": p["number"], "body": p["body"], "state": p["state"], "author": p["user"]["login"],
                         "reviews": [(r["user"]["login"], r["state"]) for r in w.gh_pr[p["number"]]["reviews"]]} for p in w.prs]})
        if name == "read":
            d = w.gh_pr.get(n); i = d["pr"] if d else w.issues[n]
            return json.dumps({"title": i.get("title"), "body": i.get("body"), "labels": i.get("labels"), "state": i.get("state"),
                               "comments": [{"by": c["user"]["login"], "body": c["body"]} for c in w.comments.get(n, [])],
                               **({"author": i["user"]["login"], "head_sha": i["head"]["sha"], "diff": d["diff"], "files": d["files"], "reviews": d["reviews"]} if d else {})})
        if name == "read_file": return w.files.get(a["path"], "not found")
        if name == "comment":
            return (tm.comment(n, a["text"], a["beat"]) if a.get("beat") else tm.gh("POST", f"/repos/o/r/issues/{n}/comments", {"body": a["text"]})) or "ok"
        if name == "label":
            [tm.label(n, l) for l in a.get("add") or []]; [tm.unlabel(n, l) for l in a.get("remove") or []]; return "ok"
        if name == "new_issue": return json.dumps({"number": tm.new_issue(a["title"], a["body"], a.get("labels") or [])["number"]})
        if name == "close": return tm.gh("PATCH", f"/repos/o/r/issues/{n}", {"state": "closed"}) or "ok"
        if name == "review": return tm.post_review(a["pr"], seat, None, a["text"])
        if name == "merge": return tm.http("POST", f"{tm.GH}/repos/o/r/pulls/{a['pr']}/merge", "seat-tok", {"Do": "squash"}) or "merged"
        if name == "rule":
            body = {"required_approvals": a["required_approvals"]} if "required_approvals" in a else None
            return json.dumps(tm.http("PATCH" if body else "GET", f"{tm.GH}/repos/o/r/branch_protections/main", "seat-tok", body))
        if name == "open_pr": return json.dumps(tm.http("POST", f"{tm.GH}/repos/o/r/pulls", "seat-tok", {"title": a["title"], "body": a["body"], "head": a["head"], "base": "main"}))
        if name == "set_var": return tm.http("PUT", f"{tm.GH}/repos/o/r/actions/variables/{a['name']}", "seat-tok", {"value": a["value"]}) or "ok"
        if name == "budget":
            day = lambda h: (L.NOW - dt.timedelta(hours=h)).strftime("%Y-%m-%d")
            rows = [json.loads(l) for f, t in w.files.items() if f.startswith("time/ledger/") for l in t.splitlines() if l.strip()]
            spent = lambda p: round(sum(r["usd"] or 0 for r in rows if r["at"].startswith(p)), 4)
            return json.dumps({"now": L.NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), "today_usd": spent(day(0)), "yesterday_usd": spent(day(24)), "month_usd": spent(day(0)[:7]),
                               "daily_cap": float(os.environ["TIME_DAILY_USD"]), "monthly_cap": float(os.environ["TIME_MONTHLY_USD"])})
        return f"unknown tool {name}"
    except Exception as e:  # noqa: BLE001  a refusal is information for the seat
        return f"error: {e}"
