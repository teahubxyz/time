BELT = "white"
PROMPT = """Read the board and name each open card's state and who may act on it (the SOP's table).
Do not change anything. finish with JSON: {"<card number>": {"state": "...", "actor": "..."}}"""
D = "do the thing"
WANT = {"1": ("parked", "manager"), "2": ("dispatched", "worker"), "3": ("reviewed", "time"), "4": ("stale", "manager")}


def build(L):
    w = L.World([L.card(1, "Tidy things"), L.card(2, "Add x", D), L.card(3, "Add y", D), L.card(4, "Add z", D)],
                {1: [L.beat("needs-done", 2)], 2: [L.beat("dispatched", 1)], 3: [L.beat("dispatched", 3), L.beat("pr", 1, pr=7)], 4: [L.beat("dispatched", 30)]},
                [L.pr(7, 3)], seat="opus")
    w.vote(7, "haiku")
    return w


def move(do, w):
    do("cards")
    return '{"1": {"state": "parked", "actor": "manager"}, "2": {"state": "dispatched", "actor": "worker"}, "3": {"state": "reviewed", "actor": "time"}, "4": {"state": "stale", "actor": "manager"}}'


def grade(L, w, answer, judge):
    got = L.js(answer)
    assert {k: (v.get("state"), v.get("actor")) for k, v in got.items()} == WANT, got
    assert not w.posted and not w.merges, "reading the room changes nothing"
