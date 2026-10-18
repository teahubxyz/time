"""Offline tests for steward.py: a fake forge, no network, no model. Run: python3 .github/time/test_steward.py
(test_time.py runs this file too, so the one CI command covers it.)"""
import datetime as dt, importlib.util, json, os, urllib.parse
from pathlib import Path

for _k in [k for k in os.environ if k.startswith("TIME_")] + ["ANTHROPIC_API_KEY", "VENICE_API_KEY", "CURSOR_API_KEY"]:
    os.environ.pop(_k, None)
os.environ.update(GITHUB_REPOSITORY="o/r", GITHUB_TOKEN="gh", GITHUB_SERVER_URL="https://forge.test", GITHUB_API_URL="https://forge.test/api/v1")
spec = importlib.util.spec_from_file_location("steward", Path(__file__).resolve().parent / "steward.py")
st = importlib.util.module_from_spec(spec); spec.loader.exec_module(st)
tm = st.tm

NOW = dt.datetime.now(dt.timezone.utc)
iso = lambda h=0: (NOW - dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")
BOT = {"login": "gitea-actions"}


class Forge:
    def __init__(self):
        self.prs, self.comments, self.reviews, self.files, self.statuses = {}, {}, {}, {}, {}
        self.issues = {57: {"number": 57, "title": "Astra log", "body": "", "state": "open", "labels": ["astra"], "created_at": iso(100)}}
        self.merged, self.dispatched, self.runs, self.ci, self.vars, self.chats = [], [], [], [], {}, 0
        self.trusted = {"rev"}

    def pr(self, n, card, files=("app.py",), status="success", approve=True, mergeable=True, body=None):
        self.prs[n] = {"number": n, "state": "open", "merged_at": None, "created_at": iso(3), "mergeable": mergeable, "body": body or f"Closes #{card}",
                       "head": {"ref": f"time/card-{card}", "sha": f"sha{n}"}}
        self.files[n] = list(files)
        self.statuses[f"sha{n}"] = [{"context": "ci / test", "status": status}] if status else []
        self.issues.setdefault(card, {"number": card, "title": f"card {card}", "body": "", "state": "open", "labels": [], "created_at": iso(5)})
        self.comments.setdefault(card, [])
        if approve:
            self.comments[n] = [{"body": "**Approve**\nlooks right", "user": {"login": "rev"}, "created_at": iso(1)}]

    def add_issue(self, n, title, body, labels, created=0):
        self.issues[n] = {"number": n, "title": title, "body": body, "state": "open", "labels": labels, "created_at": iso(created)}

    def gh(self, method, path, body=None, *, as_time=None):
        base = "/repos/o/r"
        p, _, q = path.partition("?")
        q = urllib.parse.parse_qs(q)
        seg = p[len(base):].strip("/").split("/")
        if method == "GET" and seg[0] == "pulls" and len(seg) == 1:
            return [dict(x) for x in self.prs.values() if x["state"] == "open"]
        if seg[0] == "pulls" and len(seg) == 2 and method == "GET":
            return dict(self.prs[int(seg[1])])
        if seg[0] == "pulls" and seg[-1] == "files":
            return [{"filename": f} for f in self.files[int(seg[1])]]
        if seg[0] == "pulls" and seg[-1] == "reviews":
            return self.reviews.get(int(seg[1]), [])
        if seg[0] == "pulls" and seg[-1] == "merge":
            n = int(seg[1]); assert body["Do"] == "squash"
            self.prs[n].update(merged_at=iso(), state="closed"); self.merged.append(n); return {}
        if seg[0] == "commits":
            return {"statuses": self.statuses[seg[1]]}
        if seg[0] == "collaborators":
            if seg[1] in self.trusted: return {}
            raise RuntimeError(f"GET {path} -> 404: no")
        if seg[0] == "issues" and len(seg) == 1 and method == "GET":
            out = [i for i in self.issues.values() if i["state"] == q.get("state", ["open"])[0]
                   and all(l in i["labels"] for l in q.get("labels", [""])[0].split(",") if l)]
            return [dict(i, labels=[{"name": l} for l in i["labels"]]) for i in out]
        if seg[0] == "issues" and len(seg) == 1 and method == "POST":
            n = max(self.issues) + 1
            self.add_issue(n, body["title"], body["body"], [f"label{l}" if isinstance(l, int) else l for l in body["labels"]])
            return {"number": n}
        if seg[0] == "issues" and seg[-1] == "comments":
            n = int(seg[1])
            if method == "POST":
                self.comments.setdefault(n, []).append({"body": body["body"], "user": BOT, "created_at": iso()}); return {}
            return self.comments.get(n, [])
        if seg[0] == "issues" and len(seg) == 2:
            n = int(seg[1])
            if method == "PATCH": self.issues[n].update(body); return {}
            return dict(self.issues[n])
        if seg[0] == "issues" and seg[2] == "labels":
            n = int(seg[1])
            if method == "POST": self.issues[n]["labels"] += [self.lname(l) for l in body["labels"]]
            else: self.issues[n]["labels"].remove(self.lname(int(seg[3])))
            return {}
        if seg[0] == "labels":
            if method == "POST": return {"id": 99}
            return [{"name": n, "id": i} for i, n in enumerate(["ready", "queued", "needs-human"], 1)]
        if seg[0] == "actions" and seg[1] == "runs":
            return {"workflow_runs": self.runs}
        if seg[0] == "actions" and seg[1] == "workflows":
            if seg[2] == "ci.yml": self.ci.append(body["ref"]); return {}
            self.dispatched.append(seg[2]); return {}
        if seg[0] == "actions" and seg[1] == "variables":
            self.vars[seg[2]] = body["value"]; return {}
        if p == base:
            return {"default_branch": "main"}
        raise AssertionError(f"unmocked {method} {path}")

    def lname(self, x):
        return x if isinstance(x, str) else {1: "ready", 2: "queued", 3: "needs-human"}.get(x, f"label{x}")

    def log(self):
        return [c["body"] for c in self.comments.get(57, [])]


def world(**env):
    f = Forge()
    tm.gh = f.gh
    tm._trust.clear(); tm._label_ids = None
    for k in [k for k in os.environ if k.startswith("TIME_")] + ["VENICE_API_KEY", "ANTHROPIC_API_KEY"]: os.environ.pop(k, None)
    os.environ.update({"TIME_AUTOMERGE": "on", **env})
    tm.budget = lambda: (1.0, 5.0, 10.0, 100.0)
    def no_model(body, timeout): f.chats += 1; raise AssertionError("the deterministic part must not call a model")
    tm.chat = no_model
    return f


def run():
    assert st.tick() == 0


def beat_of(comment):
    return json.loads(comment.split(tm.MARK, 1)[1].rsplit("-->", 1)[0])


# 1. a green, approved, unprotected card PR is merged without a model call; the log says so
f = world()
f.pr(59, 12)
run()
assert f.merged == [59] and f.chats == 0, (f.merged, f.chats)
assert f.issues[12]["state"] == "closed", "the card closes with its PR"
assert any(beat_of(c["body"])["beat"] == "merged" for c in f.comments[12]), "the card gets its merged beat, as land() writes it"
entry = f.log()
assert len(entry) == 1, "one entry per run"
assert "Merged:\n- PR #59 (card #12)" in entry[0] and "Fixed: none" in entry[0] and "Left: none" in entry[0], entry[0]
assert beat_of(entry[0]) == {"beat": "steward", "merged": 1, "fixed": 0, "left": 0, "escalated": 0}

# ... but not on a stranger's Approve, without an approval, on red checks, with TIME_AUTOMERGE off, or on a PR that closes no card
f = world(); f.pr(60, 13); f.comments[60] = [{"body": "Approve", "user": {"login": "stranger"}, "created_at": iso(1)}]; run()
assert f.merged == [] and "no trusted verdict yet" in f.log()[0]
f = world(); f.pr(60, 13, approve=False); run()
assert f.merged == [] and "no trusted verdict yet" in f.log()[0]
f = world(); f.pr(60, 13, status="failure"); f.chats = 0
tm.chat = lambda body, timeout: {"choices": [{"message": {"role": "assistant", "content": "Checks fail on #13; handed back."}}], "usage": {}}
run()
assert f.merged == [] and "checks are failing" in f.log()[0] and "handed back" in f.log()[0]
f = world(TIME_AUTOMERGE="off"); f.pr(60, 13); run()
assert f.merged == [] and "TIME_AUTOMERGE is not on" in f.log()[0]
f = world(); f.pr(61, 14, body="no link"); f.prs[61]["head"]["ref"] = "feature/x"; run()
assert f.merged == [] and "PR #61" not in f.log()[0], "only card PRs are the steward's"
f = world(); f.pr(60, 13, status="pending"); run()
assert f.merged == [] and "checks are pending" in f.log()[0] and f.chats == 0, "waiting on CI is not a block"

# no checks yet: one CI dispatch, then it waits (no second dispatch, no merge)
f = world(); f.pr(60, 13, status=None); run()
assert f.merged == [] and f.ci == ["time/card-13"] and "dispatched CI" in f.log()[0]

# 2. a protected PR is left, with the reason, and no model is asked
f = world(); f.pr(62, 15, files=("app.py", ".github/workflows/ci.yml")); run()
assert f.merged == [] and f.chats == 0
assert "Left:\n- PR #62 (card #15): approved, but it touches protected paths (.github/workflows/ci.yml): a human merges this one" in f.log()[0], f.log()[0]

# 3. andons: a healed daily cap closes, an unhealed monthly one does not
DAILY = "⏱️ Time stopped calling models: today's spend is $5.20 of the $5 cap; carrying on tomorrow.\n\n- Daily cap (`TIME_DAILY_USD`): $5.00\n- Monthly cap (`TIME_MONTHLY_USD`): $100.00"
MONTHLY = "⏱️ Time stopped calling models: this month's spend is $100.10 of the $100.00 cap; Time is back in dry-run until a human raises it.\n\n- Daily cap (`TIME_DAILY_USD`): $5.00\n- Monthly cap (`TIME_MONTHLY_USD`): $100.00"
f = world()
f.add_issue(70, "Spend cap reached: $5.20 today / $9.00 this month", DAILY, ["andon"], created=30)
f.add_issue(71, "Spend cap reached: $5.20 today / $100.10 this month", MONTHLY, ["andon"], created=30)
f.add_issue(72, "Spend cap reached: $5.20 today / $9.00 this month", DAILY, ["andon"], created=0)   # tripped today: not healed yet
run()
assert f.issues[70]["state"] == "closed" and f.issues[71]["state"] == "open" and f.issues[72]["state"] == "open", [f.issues[n]["state"] for n in (70, 71, 72)]
assert f.chats == 0
assert "closed andon #70" in f.log()[0] and "andon #71: the monthly cap is money" in f.log()[0] and "andon #72: a daily cap" in f.log()[0], f.log()[0]
# a daily andon from yesterday is not healed while today is over the cap again
f = world(); tm.budget = lambda: (5.5, 5.0, 10.0, 100.0)
f.add_issue(70, "Spend cap reached", DAILY, ["andon"], created=30); run()
assert f.issues[70]["state"] == "open"
# a missing key that is set now
f = world(VENICE_API_KEY="k")
f.add_issue(73, "Venice key missing", "Time can't go further: no VENICE_API_KEY secret on this repo yet.", ["andon"]); run()
assert f.issues[73]["state"] == "closed" and "VENICE_API_KEY is set now" in f.log()[0]
f = world(); f.add_issue(73, "Venice key missing", "no VENICE_API_KEY secret on this repo yet", ["andon"])
tm.chat = lambda body, timeout: {"choices": [{"message": {"role": "assistant", "content": "A key is a human-only step."}}], "usage": {}}
run(); assert f.issues[73]["state"] == "open"

# 4. the heartbeat: a failed latest run gets one dispatch; a green one, or another workflow's failure, none
HB = lambda i, c: {"id": i, "path": "heartbeat.yml@refs/heads/main", "name": "heartbeat", "status": c, "conclusion": c}
f = world(); f.runs = [HB(1, "success"), HB(2, "failure")]; run()
assert f.dispatched == ["heartbeat.yml"] and "dispatched it once" in f.log()[0] and f.chats == 0, f.dispatched
f = world(); f.runs = [HB(1, "failure"), HB(2, "success")]; run()
assert f.dispatched == [], "only the latest run counts"
f = world(); f.runs = [HB(1, "success"), {"id": 5, "path": "ci.yml@refs/heads/main", "status": "failure"}]; run()
assert f.dispatched == []
f = world(); f.runs = [HB(1, "cancelled")]; run()
assert f.dispatched == [], "a run the concurrency group cancelled is not a failure"

# 5. the log entry format
rep = st.Report(); rep.merged.append("PR #1 (card #2)"); rep.fixed.append("closed andon #3"); rep.leave("PR #4 (card #5)", "a reviewer objected")
text, meta = st.log_entry("claude:opus", (1.234, 5), rep, "Note.")
assert text.splitlines()[0] == "🧭 Steward (claude:opus), spend $1.23 of $5.00 today:"
assert text.splitlines()[2:] == ["Note.", "", "Merged:", "- PR #1 (card #2)", "Fixed:", "- closed andon #3", "Left:", "- PR #4 (card #5): a reviewer objected"], text.splitlines()
assert meta == {"beat": "steward", "merged": 1, "fixed": 1, "left": 1, "escalated": 0}

# 6. what is left and blocking: one model call, booked through tm.chat, with the charter; its tools are fenced
f = world(); f.pr(80, 20, approve=False); f.comments[80] = [{"body": "**Object**\nno test", "user": {"login": "rev"}, "created_at": iso(1)}]
f.add_issue(20, "card 20", "", ["ready"])
calls = []
def steward_model(body, timeout):
    calls.append(body)
    if len(calls) == 1:
        tc = lambda i, name, args: {"id": f"c{i}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}
        return {"choices": [{"message": {"role": "assistant", "content": None, "tool_calls": [
            tc(1, "comment", {"number": 20, "text": "The reviewer wants a test; please add one."}),
            tc(2, "set_variable", {"name": "TIME_AUTOMERGE", "value": "on"}),
            tc(3, "set_variable", {"name": "TIME_MODE", "value": "live"}),
            tc(4, "escalate", {"kind": "boredom", "title": "x", "reason": "y"}),
            tc(5, "label", {"number": 80, "name": "andon", "action": "add"})]}}], "usage": {}}
    return {"choices": [{"message": {"role": "assistant", "content": "PR #80 was objected to; I handed card #20 back with the reviewer's point."}}], "usage": {}}
tm.chat = steward_model
run()
assert len(calls) == 2 and calls[0]["model"] == "claude-opus-5-5"
assert "ONLY for money" in calls[0]["messages"][0]["content"] and "a reviewer objected" in calls[0]["messages"][1]["content"]
tool_results = [m["content"] for m in calls[1]["messages"] if m["role"] == "tool"]
assert tool_results[0] == "done" and tool_results[1].startswith("refused") and tool_results[2] == "done" and tool_results[3].startswith("refused") and tool_results[4].startswith("refused"), tool_results
assert f.vars == {"TIME_MODE": "live"}, f.vars
assert any('"steward":true' in c["body"] and "The reviewer wants a test" in c["body"] for c in f.comments[20])
assert "handed card #20 back" in f.log()[0] and "Left:\n- PR #80 (card #20): a reviewer objected" in f.log()[0]
# the steward has spoken on card #20 since its last beat: the next run does not ask again
tm.chat = lambda body, timeout: (_ for _ in ()).throw(AssertionError("asked twice"))
run(); assert "the steward has handed this back already" in f.log()[1]
# real money or a human-only step: one issue for the operator, once
f = world(); f.add_issue(75, "odd", "not a cap or a key", ["andon"])
def esc(body, timeout):
    if not any(m["role"] == "tool" for m in body["messages"]):
        return {"choices": [{"message": {"role": "assistant", "content": None, "tool_calls": [{"id": "e", "type": "function", "function": {"name": "escalate",
                "arguments": json.dumps({"kind": "human-only", "title": "Log in to the registrar", "reason": "Domain renewal needs a login."})}}]}}], "usage": {}}
    return {"choices": [{"message": {"role": "assistant", "content": "Needs a login."}}], "usage": {}}
tm.chat = esc; run()
assert any(i["title"] == "Steward: Log in to the registrar" and "needs-human" in i["labels"] for i in f.issues.values()) and "Escalated to the operator:" in f.log()[0]
# over the cap: the call is refused by the ledger's governor and the log says so
f = world(); f.add_issue(75, "odd", "not a cap or a key", ["andon"])
def capped(body, timeout): raise tm.Budget("today's spend is $5.00 of the $5.00 cap")
tm.chat = capped; run()
assert "No model call: today's spend" in f.log()[0]

# TIME_STEWARD=off disables the whole tick; a seat spec is read from it
f = world(TIME_STEWARD="off"); f.pr(59, 12); run()
assert f.merged == [] and f.log() == []
assert tm.worker_seat_model("claude:opus")[:2] == ("opus", "claude-opus-5-5")

print("ALL OK steward")
