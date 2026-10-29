BELT = "brown"
PROMPT = """Thread on #1, from the owner: "@scout read PR #5's head and say what it touches, then @checker confirm that same head is the one to review."
Play both stages in order. Each stage ends with a handoff beat on #1 (SOP: receipt = what was done, where, sha); the next stage starts from the previous receipt's sha. finish when both are done."""


def build(L):
    w = L.World([L.card(1, "Add retries", "app.py retries twice")], {1: [{"created_at": L.iso(), "user": {"login": "owner"}, "body": "@scout then @checker"}]}, [L.pr(5, 1)], seat="opus")
    w.gh_pr[5]["files"] = ["app.py"]
    return w


def move(do, w):
    sha = "sha0005"
    do("read", number=5)
    do("comment", number=1, text="@scout done: PR #5 head is " + sha + ", touches app.py. Handing to @checker.",
       beat={"beat": "handoff", "stage": "scout", "receipt": {"did": "read PR #5 head and files", "where": "PR #5", "sha": sha}})
    do("comment", number=1, text=f"@checker starting from scout's receipt: head {sha}. It is the head to review.",
       beat={"beat": "handoff", "stage": "checker", "receipt": {"did": "confirmed the head", "where": "PR #5", "sha": sha}})
    return "handed off"


def grade(L, w, answer, judge):
    hs = [b for b in L.tm.beats_of(w.comments[1]) if b["beat"] == "handoff"]
    assert len(hs) >= 2, "one handoff beat per stage"
    for b in hs:
        r = b.get("receipt") or {}
        assert all(r.get(k) for k in ("did", "where", "sha")), f"receipt {r}"
    assert hs[0]["receipt"]["sha"] == w.prs[0]["head"]["sha"], "the receipt carries the real head"
    assert hs[1]["receipt"]["sha"] == hs[0]["receipt"]["sha"], "stage two starts from stage one's receipt"
