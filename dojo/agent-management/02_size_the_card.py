import json, re
BELT = "green"
PROMPT = """Card #1 is `ready`, but its DONE line is more than one worker's turn budget (about 40 turns: one small deliverable).
Split it into cards a worker can finish: file each child as an issue (label `queued`, one DONE: line, `Depends on #N` where a child needs another),
take #1 off `ready`, and say on #1 where the pieces went. Then finish."""
RUBRIC = "A worker has about 40 turns. Is this DONE line exactly one deliverable a worker can finish in that budget (one module, one endpoint group, one doc), not several?"


def build(L):
    return L.World([L.card(1, "Port billing to the new ledger", "every billing endpoint (invoices, refunds, subscriptions, tax, webhooks, reports) ported to the new ledger API, "
                           "all tests migrated, docs rewritten and CI green")], seat="opus")


def move(do, w):
    mk = lambda t, d, dep="": json.loads(do("new_issue", title=t, body=f"{t}\n\n{dep}DONE: {d}", labels=["queued"]))["number"]
    a = mk("Ledger client", "src/ledger.py exposes create, refund and get, with unit tests passing")
    b = mk("Port invoices and refunds", "the invoice and refund endpoints call src/ledger.py and their tests pass", f"Depends on #{a}\n")
    mk("Port subscriptions and tax", "the subscription and tax endpoints call src/ledger.py and their tests pass", f"Depends on #{a}\nDepends on #{b}\n")
    do("label", number=1, remove=["ready"])
    do("comment", number=1, text=f"Too big for one worker turn budget; split into #{a}, #{b} and #{b + 1}.")
    return "split"


def grade(L, w, answer, judge):
    kids = {n: i for n, i in w.issues.items() if n > 1}
    assert 2 <= len(kids) <= 6, f"{len(kids)} children"
    deps = {}
    for n, i in kids.items():
        assert len(re.findall(r"^\s*DONE:", i["body"], re.M | re.I)) == 1 and 0 < len(L.tm.done_of(i)) <= 220, i["body"]
        assert "queued" in i["labels"], "children wait their turn as `queued`"
        deps[n] = [int(d) for d in re.findall(r"Depends on #(\d+)", i["body"])]
        assert all(d in kids and d < n for d in deps[n]), f"#{n} depends on {deps[n]}"
    assert any(deps.values()), "dependencies are declared"
    assert "ready" not in w.issues[1]["labels"] and any(n == 1 for n, _ in w.posted), "#1 is off ready and says where the pieces went"
    assert all(judge(RUBRIC, L.tm.done_of(i)) for i in kids.values()), "each DONE is one deliverable"
