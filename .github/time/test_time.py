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
    def __init__(self, cards, comments=None, prs=None, issues=None, gh_pr=None):
        self.cards, self.comments, self.prs = cards, comments or {}, prs or []
        self.posted, self.launched = [], []
        self.issues = issues or {}          # extra issues by number: {"state", "labels", "body", ...}
        self.gh_pr = gh_pr or {}            # number -> {"pr", "reviews", "files", "checks"}
        self.calls = []
        for c in cards:
            self.issues.setdefault(c["number"], {**c, "state": "open", "labels": c.get("labels", ["ready"])})

        self.files, self.writes, self.opened, self.turn = {"README.md": "hi", "app.py": "x = 1\n"}, [], [], 0

    def venice(self, body):
        """Scripted seat: list, read, write, open_pr."""
        self.turn += 1
        tc = lambda name, args: {"id": f"c{self.turn}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}
        script = [tc("list_files", {}), tc("read_file", {"path": "app.py"}),
                  tc("write_file", {"path": "app.py", "content": "x = 2\n"}),
                  tc("write_file", {"path": ".github/workflows/evil.yml", "content": "nope"}),
                  tc("open_pr", {"title": "Set x to 2", "summary": "Changed app.py; ran nothing."})]
        assert body["tools"] and body["messages"][0]["role"] == "system"
        if self.turn <= len(script):
            return {"choices": [{"message": {"role": "assistant", "content": None, "tool_calls": [script[self.turn - 1]]}}]}
        return {"choices": [{"message": {"role": "assistant", "content": "done"}}]}

    def labelled(self, name):
        return [i for i in self.issues.values() if i["state"] == "open" and name in i["labels"]]

    def http(self, method, url, token, body=None, timeout=0):
        if url.startswith(tm.CURSOR):
            assert token == "ck"
            if url.endswith("/v1/agents") and method == "POST":
                self.launched.append(body); return {"agent": {"id": f"a{len(self.launched)}", "url": "https://cursor.com/agents/x"}, "run": {"status": "RUNNING"}}
            if url.endswith("/v1/models"):
                return {"models": [{"id": "composer-2.5"}, {"id": "claude-sonnet-5-5"}]}
        if url.startswith(tm.VENICE):
            return self.venice(body)
        path = url.replace(tm.GH, "")
        self.calls.append((method, path, body))
        if "/git/ref/heads/" in path: return {"object": {"sha": "base"}}
        if path.endswith("/git/refs") and method == "POST": self.branches = getattr(self, "branches", []) + [body["ref"]]; return {}
        if "/git/trees/" in path: return {"tree": [{"path": k, "type": "blob"} for k in self.files]}
        if "/contents/" in path:
            fp = path.split("/contents/")[1].split("?")[0]
            if method == "GET":
                if fp not in self.files: raise RuntimeError(f"GET {path} -> 404: not found")
                import base64; return {"sha": "s", "content": base64.b64encode(self.files[fp].encode()).decode()}
            import base64; self.files[fp] = base64.b64decode(body["content"]).decode(); self.writes.append((fp, body.get("sha"))); return {}
        if path == "/repos/o/r/pulls" and method == "POST":
            self.opened.append(body); return {"number": 42}
        if method == "POST" and path == "/repos/o/r/issues":
            n = max([0, *self.issues]) + 1
            self.issues[n] = {"number": n, "title": body["title"], "body": body["body"], "state": "open", "labels": body["labels"]}
            return {"number": n}
        if path.startswith("/repos/o/r/issues/") and "/labels" in path:
            n = int(path.split("/")[5]); self.issues.setdefault(n, {"number": n, "state": "open", "labels": []})
            if method == "DELETE": self.issues[n]["labels"].remove(path.rsplit("/", 1)[1])
            else: self.issues[n]["labels"] += body["labels"]
            return {}
        if method == "PATCH": self.issues[int(path.split("/")[-1])].update(body); return {}
        if method == "PUT" and path.endswith("/merge"):
            self.gh_pr[int(path.split("/")[-2])]["pr"]["merged_at"] = iso(); return {"merged": True}
        if "/pulls/" in path:
            n = int(path.split("/")[5]); d = self.gh_pr[n]
            if path.endswith("/reviews?per_page=100"): return d.get("reviews", [])
            if path.endswith("/files?per_page=100"): return [{"filename": f} for f in d.get("files", ["src/x.py"])]
            return d["pr"]
        if "/check-runs" in path:
            return {"check_runs": next(d.get("checks", []) for d in self.gh_pr.values() if d["pr"]["head"]["sha"] in path)}
        if path.endswith("/status"):
            return {"statuses": next(d.get("statuses", []) for d in self.gh_pr.values() if d["pr"]["head"]["sha"] in path)}
        if "/statuses/" in path and method == "POST": self.statuses = getattr(self, "statuses", []) + [body]; return {}
        if "/issues?state=open" in path:
            lab = path.split("labels=")[1].split("&")[0]
            return [{"number": i["number"], "title": i.get("title", ""), "body": i.get("body", ""), "state": "open"}
                    for i in sorted(self.labelled(lab), key=lambda i: i["number"])]
        if method == "GET" and path.startswith("/repos/o/r/issues/") and path.count("/") == 5:
            return self.issues[int(path.split("/")[-1])]
        if method == "POST" and path.endswith("/comments"):
            n = int(path.split("/")[-2]); self.posted.append((n, body["body"]))
            self.comments.setdefault(n, []).append({"created_at": iso(), "user": {"login": "github-actions[bot]", "type": "Bot"}, "body": body["body"]})
            return {}
        if "/pulls?state=all" in path: return self.prs
        if "/issues/" in path and path.endswith("comments?per_page=100"): return self.comments.get(int(path.split("/")[-2]), [])
        if path == "/repos/o/r": return {"default_branch": "main"}
        if path.endswith("/labels?per_page=100"): return [{"name": "ready"}]
        raise AssertionError(f"unexpected {method} {path}")


def beat(state, h=0, **kw):
    return {"created_at": iso(h), "user": {"type": "Bot"}, "body": f"x\n\n{tm.MARK}{json.dumps({'beat': state, **kw})} -->"}


def run(world, env):
    for k in ("TIME_MODE", "CURSOR_API_KEY", "TIME_REVIEW", "TIME_DAILY_CAP", "TIME_CURSOR_MODEL", "TIME_AUTOMERGE",
              "TIME_REQUIRE_CHECKS", "VENICE_API_KEY"):
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

# ---------- planner, landing, next card ----------
K = {"TIME_MODE": "live", "CURSOR_API_KEY": "ck"}

# 12 spec lines -> queued cards with dependencies; the first one is promoted and dispatched in the same run
spec_body = "Build orbit v0\n\n- [ ] Add login page — DONE: PR open, tests green\n- Add logout | DONE: PR open\n- Docs -- DONE: README updated"
w = run(World([], issues={1: {"number": 1, "title": "spec", "body": spec_body, "state": "open", "labels": ["spec"]}}), K)
made = [n for n in w.issues if n != 1]
assert made == [2, 3, 4] and w.issues[1]["labels"] == ["planned"], w.issues
assert "Depends on #2" in w.issues[3]["body"] and "DONE: README updated" in w.issues[4]["body"]
assert w.issues[2]["labels"] == ["ready"] and w.issues[3]["labels"] == ["queued"] and len(w.launched) == 1
assert "Add login page" in w.launched[0]["prompt"]["text"]
# section-style spec also parses
assert [c["title"] for c in tm.parse_spec("intro\n### One\nchange a\nDONE: x\n### Two\nDONE: y")] == ["One", "Two"]
# unparseable spec without a key -> one helpful comment, spec label removed
w = run(World([], issues={1: {"number": 1, "title": "s", "body": "make it nice", "state": "open", "labels": ["spec"]}}), K)
assert "couldn't find cards" in w.posted[0][1] and w.issues[1]["labels"] == []

# 13 landing: Approve from a trusted reviewer + green checks -> squash merge, card closed, next card dispatched
def pr_world(verdict_body="**Approve** looks right", assoc="NONE", bot=True, checks=None, files=None, extra=None):
    prd = {"number": 7, "state": "open", "merged_at": None, "head": {"sha": "abc"}, "html_url": "u", "created_at": iso(2)}
    issues = {2: {"number": 2, "title": "next", "body": "Depends on #1\n\nDONE: d", "state": "open", "labels": ["queued"]}}
    cm = {1: [beat("pr", 1, pr=7)],
          7: [{"created_at": iso(), "author_association": assoc, "user": {"type": "Bot" if bot else "User"}, "body": verdict_body}]}
    return World([card(1, D)], cm, [], issues, {7: {"pr": prd, "checks": checks if checks is not None else
                                                     [{"status": "completed", "conclusion": "success"}], "files": files or ["src/a.py"]}})
w = run(pr_world(), {**K, "TIME_AUTOMERGE": "on"})
assert ("PUT", "/repos/o/r/pulls/7/merge", {"merge_method": "squash"}) in w.calls
assert w.issues[1]["state"] == "closed" and w.issues[2]["labels"] == ["ready"] and len(w.launched) == 1
# automerge off (default) -> never merges
w = run(pr_world(), K); assert not any(c[0] == "PUT" for c in w.calls) and w.launched == []
# a stranger's "Approve" comment on a public repo does nothing
w = run(pr_world(bot=False, assoc="NONE"), {**K, "TIME_AUTOMERGE": "on"}); assert not any(c[0] == "PUT" for c in w.calls)
# a collaborator's comment counts
w = run(pr_world(bot=False, assoc="COLLABORATOR"), {**K, "TIME_AUTOMERGE": "on"}); assert any(c[0] == "PUT" for c in w.calls)
# Object -> needs-human label, no merge
w = run(pr_world("**Object** missing tests"), {**K, "TIME_AUTOMERGE": "on"})
assert not any(c[0] == "PUT" for c in w.calls) and "objected" in w.posted[0][1]
# protected paths -> human merges
w = run(pr_world(files=[".github/workflows/ci.yml"]), {**K, "TIME_AUTOMERGE": "on"})
assert not any(c[0] == "PUT" for c in w.calls) and "protected paths" in w.posted[0][1]
# failing or missing checks block the merge even when approved
w = run(pr_world(checks=[{"status": "completed", "conclusion": "failure"}]), {**K, "TIME_AUTOMERGE": "on"})
assert not any(c[0] == "PUT" for c in w.calls) and "checks are failing" in w.posted[0][1]
w = run(pr_world(checks=[]), {**K, "TIME_AUTOMERGE": "on"})
assert not any(c[0] == "PUT" for c in w.calls) and "no checks" in w.posted[0][1]
w = run(pr_world(checks=[]), {**K, "TIME_AUTOMERGE": "on", "TIME_REQUIRE_CHECKS": "off"}); assert any(c[0] == "PUT" for c in w.calls)
# pending checks -> silent wait
w = run(pr_world(checks=[{"status": "in_progress", "conclusion": None}]), {**K, "TIME_AUTOMERGE": "on"})
assert w.posted == [] and not any(c[0] == "PUT" for c in w.calls)
# a human merged it by hand -> card closed, next card goes
wm = pr_world(); wm.gh_pr[7]["pr"]["merged_at"] = iso()
w = run(wm, K); assert w.issues[1]["state"] == "closed" and w.issues[2]["labels"] == ["ready"]
print("ALL OK 3")

# 14 TIME_WORKER=venice:kimi -> the seat edits on its branch, is refused on workflows, opens a PR that closes the card
w = run(World([card(1, D)], {1: [beat("would-dispatch")]}), {**K, "TIME_WORKER": "venice:kimi code", "VENICE_API_KEY": "vk"})
assert w.launched == [], "no Cursor launch"
assert w.branches == ["refs/heads/time/card-1"] and w.files["app.py"] == "x = 2\n" and w.writes == [("app.py", "s")]
assert ".github/workflows/evil.yml" not in w.files
assert len(w.opened) == 1 and w.opened[0]["head"] == "time/card-1" and "Closes #1" in w.opened[0]["body"]
assert "opened PR #42" in w.posted[-1][1] and "kimi-k2-7-code" in w.posted[-1][1]
# then the normal path links the PR and reviews it
w2 = run(World([card(1, D)], {1: [beat("dispatched", launched=True, worker="venice", pr=42)]},
         [{"number": 42, "title": "Set x to 2", "body": "Closes #1", "html_url": "u"}]), K)
assert "PR #42" in w2.posted[0][1]
# missing key -> blocked, no crash
w3 = run(World([card(1, D)], {1: [beat("would-dispatch")]}), {"TIME_MODE": "live", "TIME_WORKER": "venice:kimi"})
assert "VENICE_API_KEY" in w3.posted[-1][1]
print("ALL OK 4")

# 15 a commit status from the worker's own test run counts as the check
w = pr_world(checks=[]); w.gh_pr[7]["statuses"] = [{"state": "success", "context": "time/worker-run"}]
w = run(w, {**K, "TIME_AUTOMERGE": "on"}); assert any(c[0] == "PUT" for c in w.calls), "status should count as a green check"
w = pr_world(checks=[]); w.gh_pr[7]["statuses"] = [{"state": "failure", "context": "time/worker-run"}]
w = run(w, {**K, "TIME_AUTOMERGE": "on"}); assert not any(c[0] == "PUT" for c in w.calls)
# a verdict posted in the same run as the `pr` beat still counts (window starts at PR creation)
w = pr_world(); w.comments[1] = [beat("pr", 0, pr=7)]
w = run(w, {**K, "TIME_AUTOMERGE": "on"}); assert any(c[0] == "PUT" for c in w.calls)
print("ALL OK 5")

# ---------- venture loop (offline: scripted seats) ----------
vspec = importlib.util.spec_from_file_location("vt", Path(__file__).resolve().parent / "venture.py")
vt = importlib.util.module_from_spec(vspec); vspec.loader.exec_module(vt)
repos = [{"name": "a/b", "stars": 900, "desc": "a tiny thing", "lang": "Rust", "topics": ["cli"], "url": "u"}]
assert "a/b (900★, Rust): a tiny thing [cli]" in vt.radar(repos)
answers = {"qwen": '{"slug": "Star Checker!", "title": "Star checker", "one_liner": "x", "why_now": "a/b", "page": "p"}',
           "kimi": '{"slug": "other", "title": "Other", "one_liner": "y", "why_now": "a/b", "page": "q"}'}
vt.tm.think = lambda seat, model, effort, system, user: answers.get(seat, "not json")
ps = vt.pitch(repos, ["qwen", "kimi", "grok"])
assert [p["slug"] for p in ps] == ["star-checker", "other"] and ps[0]["by"] == "qwen"
votes = {"grok": '{"ranking": ["other", "other", "star-checker"], "reason": "r"}', "kimi": '{"ranking": ["star-checker"], "reason": "r"}',
         "qwen": '{"ranking": ["other"], "reason": "r"}'}
vt.tm.think = lambda seat, model, effort, system, user: votes[seat]
w, meta = vt.board(ps, ["grok", "kimi", "qwen"])
assert w == "other" and meta["score"] == {"star-checker": 5, "other": 6}, meta
print("ALL OK 6")
vt.tm.think = lambda *a: 'Sure! Here you go:\n```json\n{"slug": "x", "title": "T", "one_liner": "o", "why_now": "w", "page": "p {with braces}"}\n```'
assert vt.ask_json("q", "s", "u")["page"] == "p {with braces}"
vt.tm.think = lambda *a: "I would rather not."
assert vt.ask_json("q", "s", "u") is None
print("ALL OK 7")
