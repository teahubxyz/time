"""Compare AICharts brains on one fixed question set against the live demo.

    python3 bench.py https://aicharts.yolopreneur.lol [brain ...]      (default brains: llm jev clef)

Each question lists what a right chart must have; a spec scores 1 when it has all of it. Reports, per brain: right
answers, median and p90 latency (as the browser sees it), and how often a decision brain handed off to the LLM.
Uses the public API like a visitor, so it counts against the demo's daily AI limit (12 calls per brain).
"""
import json
import statistics
import sys
import time
import urllib.error
import urllib.request

Q = [
    ("total revenue by region", {"x": "region", "agg": ("sum", "amount")}),
    ("monthly revenue, web vs store", {"mark": {"line"}, "x": "month", "series": "channel", "agg": ("sum", "amount")}),
    ("share of units by product", {"mark": {"pie", "doughnut"}, "x": "product", "agg": ("sum", "units")}),
    ("top 3 products in the West by revenue", {"x": "product", "only": {"region": "West"}, "agg": ("sum", "amount"), "limit": 3}),
    ("average order amount by channel", {"x": "channel", "agg": ("avg", "amount")}),
    ("how did matcha units trend month by month?", {"mark": {"line"}, "x": "month", "only": {"product": "Matcha"}, "agg": ("sum", "units")}),
    ("how many orders per region", {"x": "region", "agg": ("count", None)}),
    ("biggest single order amount for each product", {"x": "product", "agg": ("max", "amount")}),
    ("store revenue by region", {"x": "region", "only": {"channel": "store"}, "agg": ("sum", "amount")}),
    ("teapot units by month in the North", {"x": "month", "only": {"product": "Teapot", "region": "North"}, "agg": ("sum", "units")}),
    ("which region sells the most hojicha?", {"x": "region", "only": {"product": "Hojicha"}, "sorted_desc": True}),
    ("revenue by product, split by channel", {"x": {"product", "channel"}, "series": {"product", "channel"}, "agg": ("sum", "amount")}),
]


def facts(spec):
    f = {"mark": spec.get("mark"), "x": spec.get("x"), "series": spec.get("series"), "only": {}, "limit": None, "sorted_desc": False}
    for s in spec.get("transform") or []:
        if s.get("op") == "filter":
            if "eq" in s:
                f["only"][s["field"]] = s["eq"]
            elif isinstance(s.get("in"), list) and len(s["in"]) == 1:
                f["only"][s["field"]] = s["in"][0]
        elif s.get("op") == "group":
            f["agg"] = (s.get("agg"), None if s.get("agg") == "count" else s.get("field"))
        elif s.get("op") == "limit":
            f["limit"] = s.get("n")
        elif s.get("op") == "sort" and s.get("order") == "desc" and s.get("field") not in ("month", "date", f["x"]):
            f["sorted_desc"] = True
    return f


def misses(spec, want):
    f, out = facts(spec), []
    for k, v in want.items():
        got = f.get(k)
        if k == "only":
            if {a: str(b).lower() for a, b in got.items()} != {a: b.lower() for a, b in v.items()}:
                out.append(f"only {got} != {v}")
        elif isinstance(v, set):
            if got not in v:
                out.append(f"{k} {got} not in {sorted(v)}")
        elif k == "agg":
            if got is None or got[0] != v[0] or (v[1] and got[1] != v[1]):
                out.append(f"agg {got} != {v}")
        elif got != v:
            out.append(f"{k} {got} != {v}")
    if "x" in want and "series" in want and f["x"] == f["series"]:
        out.append("x == series")
    return out


def ask(url, prompt, brain):
    body = json.dumps({"dataset": "orders", "prompt": prompt, "brain": brain}).encode()
    req = urllib.request.Request(url.rstrip("/") + "/api/spec", data=body, headers={"content-type": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            out = json.loads(r.read())
    except urllib.error.HTTPError as e:
        out = json.loads(e.read() or b"{}")
    return out, int((time.time() - t0) * 1000)


def main():
    url, brains = sys.argv[1], sys.argv[2:] or ["llm", "jev", "clef"]
    report = {}
    for brain in brains:
        rows = []
        for prompt, want in Q:
            out, ms = ask(url, prompt, brain)
            m = misses(out["spec"], want) if out.get("spec") else [out.get("error", "no spec")]
            rows.append({"q": prompt, "ok": not m, "ms": ms, "via": out.get("brain"), "handoff": (out.get("handoff") or {}).get("reason"),
                         "confidence": out.get("confidence"), "misses": m})
            print(f"[{brain}] {'ok ' if not m else 'MISS'} {ms:>6} ms via {out.get('brain')}: {prompt}" + (f"  -- {'; '.join(m)}" if m else "")
                  + (f"  (handoff: {rows[-1]['handoff']})" if rows[-1]["handoff"] else ""), flush=True)
        lat = sorted(r["ms"] for r in rows)
        report[brain] = {"right": sum(r["ok"] for r in rows), "of": len(rows), "median_ms": int(statistics.median(lat)),
                         "p90_ms": lat[int(0.9 * (len(lat) - 1))], "handoffs": sum(1 for r in rows if r["handoff"]), "rows": rows}
    print(json.dumps({b: {k: v for k, v in r.items() if k != "rows"} for b, r in report.items()}, indent=1))
    json.dump(report, open("bench.json", "w"), indent=1)


if __name__ == "__main__":
    main()
