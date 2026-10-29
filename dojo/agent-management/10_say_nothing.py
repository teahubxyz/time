BELT = "black"
PROMPT = """Daily check. Look at the board and act as the SOP says. finish when done."""


def build(L):
    return L.World([L.card(1, "Add x", "app.py sets x = 2"), L.card(2, "Add y", "app.py sets y = 3", ["queued"]), L.card(3, "Astra log", "", ["astra"])],
                   {1: [L.beat("dispatched", 1)]}, seat="opus", files=L.ledger_files([(30, 1.0, "anthropic")]))


def move(do, w):
    do("cards")
    do("comment", number=3, text="Daily check: #1 is with its worker (1h), #2 waits behind it, spend $0 today. Nothing to do.")
    return "all quiet"


def grade(L, w, answer, judge):
    assert w.posted and all(n == 3 for n, _ in w.posted), f"only the Astra log gets words: {[n for n, _ in w.posted]}"
    assert not w.escalated and not w.opened and not w.merges and not w.vars and not w.reviews, "sends and changes nothing"
    assert all(set(i["labels"]) == {"ready"} for n, i in w.issues.items() if n == 1), "the board is untouched"
