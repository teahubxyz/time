"""Offline tests for delegate.py: fake forge + fake Anthropic, through time.py's real think/chat/budget/ledger.
Run: python3 .github/time/test_delegate.py"""
import base64, contextlib, importlib.util, io, json, os, sys, datetime as dt
from pathlib import Path

for _k in [k for k in os.environ if k.startswith(("TIME_", "DELEGATE_"))] + ["ANTHROPIC_API_KEY", "VENICE_API_KEY"]:
    os.environ.pop(_k, None)
os.environ.update(GITHUB_REPOSITORY="o/r", GITHUB_TOKEN="gh-token-secret", GITHUB_SERVER_URL="https://forge.test",
                  GITHUB_API_URL="https://forge.test/api/v1", TIME_VENICE_BACKOFF="0", TIME_TRUSTED="alice",
                  GITHUB_SHA="a" * 40, GITHUB_RUN_ID="77", GITHUB_WORKFLOW="delegate")
spec = importlib.util.spec_from_file_location("dg", Path(__file__).resolve().parent / "delegate.py")
dg = importlib.util.module_from_spec(spec); spec.loader.exec_module(dg)
tm = dg.tm
KEY = "ak-live-secret-value-9876"
NOW = dt.datetime.now(dt.timezone.utc)


class World:
    def __init__(self):
        self.files, self.sent, self.mode, self.pushes = {}, [], "ok", 0

    def gh(self, method, path, body=None, *, as_time=None):
        if path == "/repos/o/r":
            return {"default_branch": "main"}
        if path.startswith("/repos/o/r/collaborators/"):
            raise RuntimeError(f"GET {path} -> 404: no")
        if "/contents/" in path:
            fp = path.split("/contents/")[1].split("?")[0]
            if fp not in self.files:
                raise RuntimeError(f"GET {path} -> 404: not found")
            return {"content": base64.b64encode(self.files[fp].encode()).decode(), "sha": "s"}
        raise AssertionError(f"unexpected {method} {path}")

    def git_commit(self, branch, files, message, *, base=None, append=None):
        assert branch == "main"
        self.pushes += 1
        for fp, data in (files or {}).items():
            self.files[fp] = data.decode()
        for fp, data in (append or {}).items():
            self.files[fp] = self.files.get(fp, "") + data.decode()
        return "sha"

    def http(self, method, url, token, body=None, timeout=0):
        assert url.startswith(tm.ANTHROPIC) and token == KEY, url   # the existing client, the repo secret
        self.sent.append(body)
        if self.mode == "down":
            raise RuntimeError(f"POST {url} -> 500: upstream said {KEY} is bad")
        text = {"ok": "the answer", "leak": f"here: {KEY} and sk-abcdefghijklmnopqrstuvwx and gh-token-secret"}[self.mode]
        return {"choices": [{"message": {"content": text}}], "usage": {"prompt_tokens": 1000, "completion_tokens": 200}}

    def ledger(self, usd):
        self.files[f"time/ledger/{NOW:%Y-%m}.jsonl"] = json.dumps({"at": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), "model": "claude-opus-5-5", "usd": usd}) + "\n"


def dispatch(w, task="Summarize X", seat="sonnet", key="idem-key-0001", actor="alice", mode="ok"):
    """One workflow run: env in, receipt out. Returns (exit code, log text)."""
    tm.gh, tm.git_commit, tm.http = w.gh, w.git_commit, w.http
    tm._ledger_files.clear(); tm.LEDGER.clear()
    w.mode = mode
    os.environ.update(GITHUB_ACTOR=actor, DELEGATE_SEAT=seat, DELEGATE_KEY=key, DELEGATE_TASK=task, ANTHROPIC_API_KEY=KEY)
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = dg.run()
    return code, out.getvalue()


def last_receipt(log):
    lines = [l for l in log.splitlines() if l.startswith(dg.MARK)]
    return json.loads(lines[-1][len(dg.MARK):]) if lines else None


def fetch(w, cid):
    tm.gh = w.gh
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = dg.fetch(cid)
    return code, out.getvalue()


CID = dg.correlation_id("alice", "idem-key-0001")

# the correlation id is stable, caller-scoped, and computable before dispatching
assert CID == dg.correlation_id("ALICE", "idem-key-0001") and CID != dg.correlation_id("o", "idem-key-0001") and dg.ID_RE.match(CID)

# ---- success: queued -> running -> succeeded, source and cost on the receipt, result fetched back by id
w = World()
code, log = dispatch(w)
r = last_receipt(log)
assert code == 0 and r["state"] == "succeeded" and r["result"] == "the answer" and r["id"] == CID, log
assert [h["state"] for h in r["history"]] == ["queued", "running", "succeeded"]
assert [json.loads(l[len(dg.MARK):])["state"] for l in log.splitlines() if l.startswith(dg.MARK)] == ["queued", "running", "succeeded"]
assert r["source"] == {"sha": "a" * 40, "run_id": "77", "run_url": "https://forge.test/o/r/actions/runs/77", "workflow": "delegate"}
assert r["usage"] == {"in": 1000, "out": 200, "usd": 0.004} and r["model"] == "claude-sonnet-5-5" and r["attempt"] == 1
assert len(w.sent) == 1 and w.sent[0]["model"] == "claude-sonnet-5-5" and w.sent[0]["messages"][1]["content"] == "Summarize X"
assert "Summarize X" not in w.files[dg.receipt_path(CID)], "the task is stored as a hash only"
assert json.loads(w.files[dg.receipt_path(CID)]) == r or json.loads(w.files[dg.receipt_path(CID)])["state"] == "succeeded"
# the spend landed in the ledger the governor reads
assert json.loads(w.files[f"time/ledger/{NOW:%Y-%m}.jsonl"].splitlines()[-1])["usd"] == 0.004
code, text = fetch(w, CID)
assert code == 0 and json.loads(text)["result"] == "the answer"
assert fetch(w, "dlg-" + "0" * 20)[0] == 3 and fetch(w, "../x")[0] == 2
# a tampered result fails verification
good = w.files[dg.receipt_path(CID)]
w.files[dg.receipt_path(CID)] = good.replace("the answer", "forged")
assert fetch(w, CID)[0] == 1
w.files[dg.receipt_path(CID)] = good

# ---- duplicate key: same request replays, spends nothing, writes nothing
pushes = w.pushes
code, log = dispatch(w)
assert code == 0 and last_receipt(log)["replayed"] is True and last_receipt(log)["result"] == "the answer"
assert len(w.sent) == 1 and w.pushes == pushes
# same key, different task or seat: refused
for kw in ({"task": "Something else"}, {"seat": "opus"}):
    code, log = dispatch(w, **kw)
    assert code == 2 and "different request" in last_receipt(log)["reason"] and len(w.sent) == 1
# another caller's identical key is a separate job
code, log = dispatch(w, actor="o")
assert code == 0 and last_receipt(log)["id"] != CID and len(w.sent) == 2

# ---- rejected inputs: unauthorized, unsupported, oversized; no model call, no file
w = World()
for kw, why in (({"actor": "mallory"}, "unauthorized"), ({"seat": "haiku"}, "unsupported seat"), ({"seat": "kimi"}, "unsupported seat"),
                ({"task": "x" * (dg.MAX_TASK + 1)}, "cap is"), ({"task": "  "}, "empty"), ({"key": "short"}, "invalid idempotency key"),
                ({"key": "bad key with spaces"}, "invalid idempotency key")):
    code, log = dispatch(w, **kw)
    assert code == 2 and why in last_receipt(log)["reason"] and last_receipt(log)["state"] == "rejected", (kw, log)
assert w.sent == [] and w.files == {} and w.pushes == 0
code, log = dispatch(w, seat="opus", task="y" * dg.MAX_TASK)   # exactly at the cap is fine, and opus is allowed
assert code == 0 and last_receipt(log)["model"] == "claude-opus-5-5"

# ---- budget exhaustion: failed with a clear kind, no API call, still a durable receipt
w = World(); w.ledger(6)
code, log = dispatch(w)
r = last_receipt(log)
assert code == 1 and r["state"] == "failed" and r["error"]["kind"] == "budget_exhausted" and "cap" in r["error"]["message"] and w.sent == []
assert json.loads(w.files[dg.receipt_path(CID)])["state"] == "failed"
assert "result" not in r and fetch(w, CID)[0] == 0

# ---- API failure then retry: failed, then the same key re-dispatched succeeds as attempt 2
w = World()
code, log = dispatch(w, mode="down")
r = last_receipt(log)
assert code == 1 and r["state"] == "failed" and r["error"]["kind"] == "api_error" and KEY not in log and KEY not in json.dumps(w.files)
assert len(w.sent) == 4, "time.py's own retry loop ran before giving up"
code, log = dispatch(w)
r = last_receipt(log)
assert code == 0 and r["state"] == "succeeded" and r["attempt"] == 2 and r["previous"]["state"] == "failed" and r["created_at"]
assert [h["state"] for h in r["history"]] == ["queued", "running", "succeeded"]
# a budget failure is retryable too, once the cap is raised
w = World(); w.ledger(6); dispatch(w); w.files.pop(f"time/ledger/{NOW:%Y-%m}.jsonl")
assert dispatch(w)[0] == 0 and last_receipt(dispatch(w)[1])["attempt"] == 2
# retries are bounded
w = World()
for _ in range(dg.MAX_ATTEMPTS):
    dispatch(w, mode="down")
n = len(w.sent)
code, log = dispatch(w)
assert code == 1 and "attempts exhausted" in last_receipt(log)["note"] and len(w.sent) == n

# ---- an in-flight run is not duplicated; a stale one is taken over
w = World()
dispatch(w, mode="down")
live = json.loads(w.files[dg.receipt_path(CID)])
live.update(state="running", updated_at=dg.now())
w.files[dg.receipt_path(CID)] = json.dumps(live)
n = len(w.sent)
code, log = dispatch(w)
assert code == 0 and last_receipt(log)["state"] == "running" and last_receipt(log)["replayed"] and len(w.sent) == n
live["updated_at"] = (NOW - dt.timedelta(minutes=dg.STALE_MIN + 1)).strftime("%Y-%m-%dT%H:%M:%SZ")
w.files[dg.receipt_path(CID)] = json.dumps(live)
code, log = dispatch(w)
assert code == 0 and last_receipt(log)["state"] == "succeeded" and last_receipt(log)["previous"]["state"] == "running"

# ---- no secret leakage: a model that echoes secrets, and every place they could land
w = World()
code, log = dispatch(w, mode="leak")
blob = log + json.dumps(w.files) + json.dumps(fetch(w, CID))
for secret in (KEY, "gh-token-secret", "sk-abcdefghijklmnopqrstuvwx"):
    assert secret not in blob, secret
assert "[redacted]" in last_receipt(log)["result"] and last_receipt(log)["state"] == "succeeded"
assert dg.sha(last_receipt(log)["result"]) == last_receipt(log)["result_sha256"] and fetch(w, CID)[0] == 0
assert "x-access-token:[redacted]" in dg.redact("https://x-access-token:abc123@forge.test/o/r.git") or "abc123" not in dg.redact("https://x-access-token:abc123@forge.test/o/r.git")
assert "abc123" not in dg.redact("https://u:abc123@h/x") and "Bearer" not in dg.redact("Authorization: Bearer abcdefghijklmnop12345").replace("Authorization: ", "")
# a missing key is a failed receipt that names the secret, never its value
w = World(); tm.gh, tm.git_commit, tm.http = w.gh, w.git_commit, w.http
tm._ledger_files.clear(); tm.LEDGER.clear()
os.environ.update(GITHUB_ACTOR="alice", DELEGATE_SEAT="sonnet", DELEGATE_KEY="idem-key-0002", DELEGATE_TASK="t")
os.environ.pop("ANTHROPIC_API_KEY")
out = io.StringIO()
with contextlib.redirect_stdout(out):
    assert dg.run() == 1
assert last_receipt(out.getvalue())["error"]["kind"] == "not_configured" and w.sent == []

print("ALL OK delegate")
