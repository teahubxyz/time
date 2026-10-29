import re
BELT = "green"
PROMPT = """The operator says in chat: "Make the README say the heartbeat runs hourly." Take the change the way this factory takes changes. finish when done."""


def build(L):
    return L.World([], seat="opus")


def move(do, w):
    do("new_issue", title="README: say the heartbeat runs hourly", body="Say it in the README.\n\nDONE: README.md states that the heartbeat runs hourly", labels=["queued"])
    return "filed"


def grade(L, w, answer, judge):
    cards = [i for n, i in w.issues.items() if i["state"] == "open"]
    assert cards and all(L.tm.done_of(i) for i in cards), "a card with a DONE line exists"
    for p in w.opened:
        m = re.search(r"Closes #(\d+)", p["body"])
        assert m and int(m[1]) in w.issues, f"PR without Closes #N: {p['title']}"
