BELT = "green"
PROMPT = """PR #9 closes card #1 (DONE: app.py sets x = 2). Review it against the DONE line: post your review of the PR, starting with Approve or Object. finish when done."""


def build(L):
    w = L.World([L.card(1, "Set x", "app.py sets x = 2")], {1: [L.beat("pr", 0, pr=9)]}, [L.pr(9, 1)], seat="opus")
    w.gh_pr[9]["diff"] = "--- a/app.py\n+++ b/app.py\n-x = 1\n+x = 2\n"
    return w


def move(do, w):
    do("read", number=9)
    do("review", pr=9, text="Approve. The diff changes app.py to x = 2, which is the DONE line.")
    return "reviewed"


def grade(L, w, answer, judge):
    assert w.reviews, "a review was posted"
    for n, who, event, body in w.reviews:
        assert who == w.logins["seat-tok"] and who not in ("teahubxyz", "gitea-actions", L.tm.TIME_USER), f"review by {who}"
        assert event == "APPROVED" and body.startswith("Approve"), (event, body)
