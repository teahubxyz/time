BELT = "green"
PROMPT = "Card #1 has an `error` beat and no PR. Handle it. finish when done."


def build(L):
    return L.World([L.card(1, "Add x", "app.py sets x = 2")], {1: [L.beat("dispatched", 3), L.beat("error", 1)]}, seat="opus")


def move(do, w):
    do("read", number=1)
    do("comment", number=1, text="The worker call failed with an error and no PR exists, so nothing is lost by another try. /time retry")
    return "retried"


def grade(L, w, answer, judge):
    mine = [t for n, t in w.posted if n == 1]
    assert mine and any("/time retry" in t or L.tm.MARK in t for t in mine), "a retry or dispatch beat"
    assert any(("error" in t.lower() or "fail" in t.lower()) and len(t) > 30 for t in mine), "says why"
    assert "needs-human" not in w.issues[1]["labels"] and not w.escalated and not any("needs a human" in t.lower() for t in mine), "asks nobody"
