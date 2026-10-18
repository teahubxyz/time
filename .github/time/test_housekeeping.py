#!/usr/bin/env python3
"""Offline tests for housekeeping.py: a fake forge (like test_time.py's World) that records every write."""
import datetime as dt
import importlib.util
import json
import os
import sys
import urllib.parse
from pathlib import Path

for _k in [k for k in os.environ if k.startswith("TIME_")] + ["ANTHROPIC_API_KEY", "VENICE_API_KEY", "CURSOR_API_KEY"]:
    os.environ.pop(_k, None)
os.environ.update(GITHUB_REPOSITORY="o/r", GITHUB_TOKEN="gh", GITHUB_SERVER_URL="https://forge.test", GITHUB_API_URL="https://forge.test/api/v1")

spec = importlib.util.spec_from_file_location("hk", Path(__file__).resolve().parent / "housekeeping.py")
hk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hk)
tm = hk.tm

NOW = dt.datetime.now(dt.timezone.utc)
iso = lambda days=0: (NOW - dt.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
LOG = 57


class Forge:
    def __init__(self, branches=(), prs=(), issues=(), milestones=(), reactions=None, comments=None, repo_labels=None):
        self.branches = [{"name": b} if isinstance(b, str) else b for b in branches]
        self.prs = list(prs)
        self.issues = {i["number"]: {"state": "open", "labels": [], "created_at": iso(0), "updated_at": iso(0), "body": "", **i} for i in issues}
        self.milestones = [dict(m) for m in milestones]
        self.reactions = reactions or {}
        self.cmts = comments or {}
        # the repo's labels; by default the ones its issues carry. Gitea ignores a filter on any other label.
        self.repo_labels = set(repo_labels) if repo_labels is not None else {l for i in self.issues.values() for l in i["labels"]}
        self.writes = []   # every non-GET call
        self.posted = []   # (issue, body)

    def page(self, rows, path):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(path).query)
        p, n = int(q.get("page", ["1"])[0]), int(q.get("limit", ["50"])[0])
        return rows[(p - 1) * n: p * n]

    def http(self, method, url, token, body=None, timeout=0):
        path = url.replace(tm.GH, "")
        route = path.split("?")[0]
        q = urllib.parse.parse_qs(urllib.parse.urlparse(path).query)
        if method != "GET":
            self.writes.append((method, route, body))
        if route == "/repos/o/r" and method == "GET":
            return {"default_branch": "main"}
        if route == "/repos/o/r/branches" and method == "GET":
            return self.page(self.branches, path)
        if route.startswith("/repos/o/r/branches/") and method == "DELETE":
            name = urllib.parse.unquote(route.split("/branches/")[1])
            self.branches = [b for b in self.branches if b["name"] != name]
            return {}
        if route == "/repos/o/r/pulls":
            want = q.get("state", ["open"])[0]
            return self.page([p for p in self.prs if p["state"] == want], path)
        if route == "/repos/o/r/milestones" and method == "GET":
            return self.page([m for m in self.milestones if m.get("state", "open") == "open"], path)
        if route.startswith("/repos/o/r/milestones/") and method == "PATCH":
            for m in self.milestones:
                if m["id"] == int(route.split("/")[-1]):
                    m.update(body)
            return {}
        if route.endswith("/reactions"):
            return self.page(self.reactions.get(int(route.split("/")[-2]), []), path)
        if route.endswith("/comments") and method == "GET":
            return self.page(self.cmts.get(int(route.split("/")[-2]), []), path)
        if route.endswith("/comments") and method == "POST":
            self.posted.append((int(route.split("/")[-2]), body["body"]))
            return {}
        if route == "/repos/o/r/issues" and method == "GET":
            rows = [i for i in self.issues.values()
                    if (q.get("state", ["open"])[0] in ("all", i["state"]))
                    and all(l in i["labels"] for l in q.get("labels", [""])[0].split(",") if l and l in self.repo_labels)]
            return self.page([{**i, "labels": [{"name": l} for l in i["labels"]]} for i in rows], path)
        if route.startswith("/repos/o/r/issues/") and method == "PATCH":
            self.issues[int(route.split("/")[-1])].update(body)
            return {}
        raise AssertionError(f"unexpected {method} {path}")

    def run(self, mode="live", env=None):
        os.environ.pop("TIME_MODE", None)
        os.environ.pop("TIME_VENTURE_MEASURE_DAYS", None)
        if mode:
            os.environ["TIME_MODE"] = mode
        os.environ.update(env or {})
        tm.http = self.http
        return hk.main()


def pr(n, head, state="open", merged=False, base="main", idle=0, merged_days=1):
    return {"number": n, "title": f"pr {n}", "state": state, "merged": merged, "merged_at": iso(merged_days) if merged else None,
            "base": {"ref": base}, "head": {"ref": head, "repo": {"full_name": "o/r"}}, "created_at": iso(idle), "updated_at": iso(idle)}


deleted = lambda f: [urllib.parse.unquote(w[1].split("/branches/")[1]) for w in f.writes if w[0] == "DELETE"]


def test_branches():
    f = Forge(branches=["main", "gh-pages", "time/card-53", "ceo/protected-paths", "labs/aicharts-fast", "time/card-90", "feature/open", "feature/closed-unmerged"],
              prs=[pr(1, "time/card-53", "closed", True), pr(2, "ceo/protected-paths", "closed", True), pr(3, "labs/aicharts-fast", "closed", True),
                   pr(4, "main", "closed", True), pr(5, "gh-pages", "closed", True),
                   pr(6, "feature/open", "open"), pr(7, "feature/open", "closed", True),   # merged once, reopened as a new PR: keep
                   pr(8, "feature/closed-unmerged", "closed", False)])
    assert f.run() == 0
    assert sorted(deleted(f)) == ["ceo/protected-paths", "labs/aicharts-fast", "time/card-53"], deleted(f)
    kept = {b["name"] for b in f.branches}
    assert {"main", "gh-pages", "time/card-90", "feature/open", "feature/closed-unmerged"} <= kept
    assert any("3 branch(es) deleted" in b for _, b in f.posted), f.posted   # the summary line on the Astra log
    # idempotent: a second run has nothing to do
    f.writes.clear(); f.posted.clear()
    f.run()
    assert deleted(f) == [] and any("0 branch(es) deleted" in b for _, b in f.posted)
    # a branch with commits after its merge is kept
    f = Forge(branches=[{"name": "time/card-9", "commit": {"timestamp": iso(0)}}], prs=[pr(9, "time/card-9", "closed", True, merged_days=2)])
    f.run(); assert deleted(f) == []


def sig(n, venture, age):
    return {"number": n, "title": f"{venture}: want the next version?", "labels": ["signal"], "created_at": iso(age),
            "body": f"Join: https://forge.test/o/r/issues/new?template=early-access.yml&title=x&venture={venture}"}


def test_signals():
    f = Forge(issues=[sig(10, "spent", 8), sig(11, "fresh", 2), sig(12, "wanted", 9), sig(13, "asked", 9),
                      {"number": 20, "labels": ["signup"], "user": {"login": "ann"}, "body": "### Venture\n\nasked\n\n### Plan\n\nFree"}],
              reactions={12: [{"content": "+1", "user": {"login": "bob"}}, {"content": "+1", "user": {"login": "owner"}}]})
    f.run()
    st = {n: f.issues[n]["state"] for n in (10, 11, 12, 13)}
    assert st == {10: "closed", 11: "open", 12: "open", 13: "open"}, st
    closing = [b for n, b in f.posted if n == 10]
    assert closing and "0 signups" in closing[0] and not [b for n, b in f.posted if n in (11, 12, 13)]
    assert any("1 signal issue(s) closed" in b for _, b in f.posted)
    # the window is TIME_VENTURE_MEASURE_DAYS
    f = Forge(issues=[sig(10, "spent", 8)]); f.run(env={"TIME_VENTURE_MEASURE_DAYS": "10"})
    assert f.issues[10]["state"] == "open"


def test_milestones():
    f = Forge(milestones=[{"id": 1, "title": "done batch", "open_issues": 0, "closed_issues": 3},
                          {"id": 2, "title": "in progress", "open_issues": 1, "closed_issues": 2},
                          {"id": 3, "title": "never used", "open_issues": 0, "closed_issues": 0}])
    f.run()
    st = {m["id"]: m.get("state", "open") for m in f.milestones}
    assert st == {1: "closed", 2: "open", 3: "open"}, st
    assert any("1 milestone(s) closed" in b for _, b in f.posted)


def test_stale():
    ready_err = {"created_at": iso(5), "user": {"login": "gitea-actions"}, "body": f"x\n\n{tm.MARK}{json.dumps({'beat': 'error'})} -->"}
    f = Forge(issues=[{"number": 30, "title": "old human card", "labels": ["needs-human"], "updated_at": iso(4)},
                      {"number": 31, "title": "fresh human card", "labels": ["needs-human"], "updated_at": iso(1)},
                      {"number": 32, "title": "errored card", "labels": ["ready"], "updated_at": iso(5)},
                      {"number": 33, "title": "fresh error", "labels": ["ready"], "updated_at": iso(0)}],
              comments={32: [ready_err], 33: [{**ready_err, "created_at": iso(0)}]},
              prs=[pr(40, "feature/idle", "open", idle=7), pr(41, "feature/new", "open", idle=1)])
    f.run()
    texts = [b for n, b in f.posted if n == LOG and "stale list" in b]
    assert len(texts) == 1, f.posted
    t = texts[0]
    assert "#30" in t and "#40" in t and "#32" in t, t
    assert "#31" not in t and "#41" not in t and "#33" not in t, t
    assert any("3 stale" in b for _, b in f.posted), f.posted   # #30, #32, #40: exactly three
    # an empty list posts no stale comment, only the one summary line
    f = Forge(); f.run()
    assert [b for _, b in f.posted if "stale list" in b] == [] and len(f.posted) == 1 and "0 stale" in f.posted[0][1]


def test_unknown_label():
    """No `parked` label in the repo: Gitea answers `labels=parked` with every open issue. None of them is stale, and
    a `signal` filter answered with everything must not close an old issue that only looks like a signal."""
    f = Forge(issues=[{"number": 57, "title": "Astra log", "labels": ["astra"], "updated_at": iso(9)},
                      {"number": 72, "title": "a parent", "labels": ["planned"], "updated_at": iso(9)},
                      {"number": 96, "title": "queued card", "labels": ["queued"], "updated_at": iso(9)},
                      {"number": 99, "title": "old note", "labels": [], "created_at": iso(30), "body": "see ?venture=spent"}],
              repo_labels={"astra", "planned", "queued"})
    f.run()
    assert [b for _, b in f.posted if "stale list" in b] == [], f.posted
    assert any("0 stale" in b for _, b in f.posted) and f.issues[99]["state"] == "open", f.posted
    assert [n for n, _ in f.posted] == [LOG], "the summary goes to the Astra log, found by its own label"


def test_dry_run():
    f = Forge(branches=["main", "time/card-53"], prs=[pr(1, "time/card-53", "closed", True)],
              issues=[sig(10, "spent", 8), {"number": 30, "labels": ["needs-human"], "updated_at": iso(9)}],
              milestones=[{"id": 1, "title": "done batch", "open_issues": 0, "closed_issues": 3}])
    for mode in ("dry-run", None):   # explicit and unset
        assert f.run(mode) == 0
        assert f.writes == [] and f.posted == [], (f.writes, f.posted)
    assert {b["name"] for b in f.branches} == {"main", "time/card-53"} and f.issues[10]["state"] == "open"


if __name__ == "__main__":
    tests = [test_branches, test_signals, test_milestones, test_stale, test_unknown_label, test_dry_run]
    for t in tests:
        t()
        print("ok", t.__name__)
    print(f"{len(tests)} housekeeping tests passed")
