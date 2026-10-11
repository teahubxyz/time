"""Offline tests for time.py: fake GitHub + fake Cursor, whole card lifecycle. Run: python3 .github/time/test_time.py"""
import importlib.util, json, os, sys, datetime as dt

os.environ.update(GITHUB_REPOSITORY="o/r", GITHUB_TOKEN="gh")
os.environ.pop("GITHUB_STEP_SUMMARY", None)  # keep fake doctor output out of the run summary
from pathlib import Path
spec = importlib.util.spec_from_file_location("tm", Path(__file__).resolve().parent / "time.py")
tm = importlib.util.module_from_spec(spec); spec.loader.exec_module(tm)

NOW = dt.datetime.now(dt.timezone.utc)
iso = lambda h=0: (NOW - dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")


class World:
    def __init__(self, cards, comments=None, prs=None):
        self.cards, self.comments, self.prs = cards, comments or {}, prs or []
        self.posted, self.launched = [], []

    def http(self, method, url, token, body=None, timeout=0):
        if url.startswith(tm.CURSOR):
            assert token == "ck"
            if url.endswith("/v1/agents") and method == "POST":
                self.launched.append(body); return {"agent": {"id": f"a{len(self.launched)}", "url": "https://cursor.com/agents/x"}, "run": {"status": "RUNNING"}}
            if url.endswith("/v1/models"):
                return {"models": [{"id": "composer-2.5"}, {"id": "claude-sonnet-5-5"}]}
        path = url.replace(tm.GH, "")
        if method == "POST" and path.endswith("/comments"):
            n = int(path.split("/")[-2]); self.posted.append((n, body["body"]))
            self.comments.setdefault(n, []).append({"created_at": iso(), "user": {"login": "github-actions[bot]", "type": "Bot"}, "body": body["body"]})
            return {}
        if "/issues?state=open" in path: return self.cards
        if "/pulls?state=all" in path: return self.prs
        if "/issues/" in path and path.endswith("comments?per_page=100"): return self.comments.get(int(path.split("/")[-2]), [])
        if path == "/repos/o/r": return {"default_branch": "main"}
        if "/labels" in path: return [{"name": "ready"}]
        raise AssertionError(f"unexpected {method} {path}")


def beat(state, h=0, **kw):
    return {"created_at": iso(h), "user": {"type": "Bot"}, "body": f"x\n\n{tm.MARK}{json.dumps({'beat': state, **kw})} -->"}


def run(world, env):
    for k in ("TIME_MODE", "CURSOR_API_KEY", "TIME_REVIEW", "TIME_DAILY_CAP", "TIME_CURSOR_MODEL"):
        os.environ.pop(k, None)
    os.environ.update(env)
    tm.http = world.http
    tm.cmd_heartbeat()
    return world


card = lambda n, body: {"number": n, "title": f"card {n}", "body": body}
D = "change x\n\nDONE: PR open, tests green"

# 1 dry-run: new card -> would-dispatch; no DONE -> needs-done; already announced -> silent
w = run(World([card(1, D), card(2, "vague"), card(3, D)], {3: [beat("would-dispatch")]}), {})
assert [p[0] for p in w.posted] == [1, 2] and "dry run" in w.posted[0][1] and "no `DONE:`" in w.posted[1][1], w.posted
# needs-done is not repeated
w = run(World([card(2, "vague")], {2: [beat("needs-done")]}), {}); assert w.posted == []

# 2 live without a key -> blocked once, then silent
w = run(World([card(1, D)], {1: [beat("would-dispatch")]}), {"TIME_MODE": "live"})
assert "CURSOR_API_KEY" in w.posted[0][1] and w.launched == []
w = run(World([card(1, D)], {1: [beat("would-dispatch"), beat("blocked")]}), {"TIME_MODE": "live"}); assert w.posted == [] and w.launched == []

# 3 live with key -> launch with the right shape
w = run(World([card(1, D)], {1: [beat("would-dispatch")]}), {"TIME_MODE": "live", "CURSOR_API_KEY": "ck", "TIME_CURSOR_MODEL": "composer-2.5"})
b = w.launched[0]
assert b["repos"] == [{"url": "https://github.com/o/r", "startingRef": "main"}] and b["autoCreatePR"] is True
assert b["model"] == {"id": "composer-2.5"} and "Closes #1" in b["prompt"]["text"] and "DONE: PR open" in b["prompt"]["text"]
assert '"beat": "dispatched"' not in w.posted[0][1] and '"launched":true' in w.posted[0][1].replace(" ", "")

# 4 dispatched + linked PR -> pr beat, no review by default
pr = {"number": 7, "title": "x", "body": "Summary\n\nCloses #1", "html_url": "https://github.com/o/r/pull/7"}
w = run(World([card(1, D)], {1: [beat("dispatched", launched=True)]}, [pr]), {"TIME_MODE": "live", "CURSOR_API_KEY": "ck"})
assert "PR #7" in w.posted[0][1] and "No reviewer" in w.posted[0][1]
# an unrelated PR mentioning #11 must not match card 1
w = run(World([card(1, D)], {1: [beat("dispatched", 1, launched=True)]}, [{**pr, "body": "Closes #11"}]), {"TIME_MODE": "live", "CURSOR_API_KEY": "ck"})
assert w.posted == []

# 5 stuck after TIME_STUCK_HOURS, once
w = run(World([card(1, D)], {1: [beat("dispatched", 7, launched=True, agent_url="https://cursor.com/agents/x")]}), {"TIME_MODE": "live", "CURSOR_API_KEY": "ck"})
assert "no PR closing #1" in w.posted[0][1] and "cursor.com/agents/x" in w.posted[0][1]
w = run(World([card(1, D)], {1: [beat("dispatched", 8, launched=True), beat("stuck", 1)]}), {"TIME_MODE": "live", "CURSOR_API_KEY": "ck"}); assert w.posted == []

# 6 daily cap counts today's launches
w = run(World([card(1, D), card(2, D)], {1: [beat("dispatched", 0, launched=True)], 2: [beat("would-dispatch")]}),
        {"TIME_MODE": "live", "CURSOR_API_KEY": "ck", "TIME_DAILY_CAP": "1"})
assert w.launched == []

# 7 /time retry after an error re-dispatches
human = {"created_at": iso(), "user": {"type": "User"}, "body": "/time retry"}
w = run(World([card(1, D)], {1: [beat("error", 1), human]}), {"TIME_MODE": "live", "CURSOR_API_KEY": "ck"})
assert len(w.launched) == 1

# 8 review via cursor -> second launch on the PR, no new PR
w = run(World([card(1, D)], {1: [beat("dispatched", launched=True)]}, [pr]), {"TIME_MODE": "live", "CURSOR_API_KEY": "ck", "TIME_REVIEW": "cursor:claude-sonnet-5-5"})
rb = w.launched[0]
assert rb["repos"][0]["prUrl"].endswith("/pull/7") and rb["autoCreatePR"] is False and rb["model"]["id"] == "claude-sonnet-5-5"
assert "Do NOT push" in rb["prompt"]["text"] and "A Cursor agent is reviewing" in w.posted[0][1]

# 9 review via a venice seat -> PR comment from the seat
tm.think = lambda seat, model, effort, system, user: f"**Approve** ({seat}) diff:{len(user)}"
tm.pr_diff = lambda n, limit=0: "diff --git a b"
w = run(World([card(1, D)], {1: [beat("dispatched", launched=True)]}, [pr]), {"TIME_MODE": "live", "CURSOR_API_KEY": "ck", "TIME_REVIEW": "venice:kimi"})
assert w.posted[0][0] == 7 and w.posted[0][1].startswith("**Approve** (kimi)") and "`kimi` reviewed" in w.posted[1][1]

# 10 doctor
for k in ("VENICE_API_KEY", "CURSOR_API_KEY"): os.environ.pop(k, None)
tm.http = World([]).http
assert tm.cmd_doctor() == 1
os.environ["CURSOR_API_KEY"] = "ck"
assert tm.cmd_doctor() == 0
print("ALL OK")

# 11 blocked, then the key is added -> resumes and launches
w = run(World([card(1, D)], {1: [beat("would-dispatch", 2), beat("blocked", 1)]}), {"TIME_MODE": "live", "CURSOR_API_KEY": "ck"})
assert len(w.launched) == 1, w.posted
print("ALL OK 2")
