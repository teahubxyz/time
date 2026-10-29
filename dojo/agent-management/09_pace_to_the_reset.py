import datetime as dt, json
BELT = "brown"
PROMPT = """time/pools.json lists the capacity pools and time/ledger/*.jsonl the spend. Work out what each pool may spend today (the SOP's pacing rule, TIME_PACE=1, TIME_DAILY_USD=5).
finish with JSON {"<pool name>": <usd, 2 decimals>}. Change nothing."""


def build(L):
    day = lambda d: (L.NOW.date() + dt.timedelta(days=d)).isoformat()
    h0 = L.NOW.hour + 1   # hours back to yesterday 23:xx
    pools = [{"name": "anthropic-credits", "kind": "expiring", "balance_usd": 30, "as_of": day(-3), "resets_at": day(5), "routes": ["anthropic"]},
             {"name": "venice-credits", "kind": "expiring", "balance_usd": 9, "as_of": day(-1), "resets_at": day(3), "routes": ["venice"]},
             {"name": "codex-week", "kind": "window", "window_usd": 20, "resets_at": "weekly:mon", "routes": ["codex"]},
             {"name": "spare", "kind": "balance", "balance_usd": 12, "routes": ["other"]}]
    rows = [(h0 + 48, 2.0, "anthropic"), (h0 + 24, 3.5, "anthropic"), (h0, 1.5, "anthropic"), (0, 0.4, "anthropic"), (h0, 1.0, "venice")]
    return L.World([], seat="opus", files={"time/pools.json": json.dumps(pools, indent=1), **L.ledger_files(rows)})


def move(do, w):   # the arithmetic done by hand, independently of the engine's allowance()
    today = json.loads(do("budget"))["now"][:10]
    ledger = [json.loads(l) for f, t in w.files.items() if f.startswith("time/ledger/") for l in t.splitlines()]
    out = {}
    for p in json.loads(do("read_file", path="time/pools.json")):
        if p["kind"] == "expiring":
            used = sum(r["usd"] for r in ledger if p["as_of"] <= r["at"][:10] < today and r["pool"] in p["routes"])
            out[p["name"]] = round((p["balance_usd"] - used) / max(1, (dt.date.fromisoformat(p["resets_at"]) - dt.date.fromisoformat(today)).days), 2)
        else:
            out[p["name"]] = p.get("window_usd", 5)
    return json.dumps(out)


def grade(L, w, answer, judge):
    tm = L.tm; saved = list(tm.LEDGER); tm.LEDGER.clear()   # the seat's own calls are not this world's spend
    try:
        want = {p["name"]: round(tm.allowance(p, L.NOW), 2) for p in json.loads(w.files["time/pools.json"])}
    finally:
        tm.LEDGER[:] = saved
    got = L.js(answer)
    assert set(got) == set(want) and all(abs(float(got[k]) - want[k]) <= 0.05 for k in want), f"want {want}, got {got}"
