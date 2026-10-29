"""The agent-management dojo: katas from real intervention moments, run against the offline World.

    python3 dojo/run.py --seat claude:opus --belt brown     # real model calls, booked to the ledger, one result row per kata
    python3 dojo/run.py --selftest                          # no model: each kata's reference move passes, doing nothing fails (CI)

A kata (dojo/agent-management/NN_name.py) has BELT, PROMPT, build(L) -> World, move(do, w) -> answer (the reference move)
and grade(L, w, answer, judge) -> asserts. `judge(question, text)` is a yes/no model call for what code cannot grade; it is
never the seat under test (haiku is judged by sonnet). Belts: white < green < brown < black, per seat x skill, in dojo/results/belts.json.
Information only: no permission hangs on a belt yet."""
import argparse, importlib.util, json, os, sys, datetime as dt
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from lib import ROOT, TOOLS, act, make_lib, offline  # noqa: E402

BELTS = ["white", "green", "brown", "black"]
SKILL = "agent-management"


def katas():
    out = []
    for p in sorted((HERE / SKILL).glob("[0-9]*.py")):
        s = importlib.util.spec_from_file_location(p.stem, p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
        m.NAME = p.stem; out.append(m)
    return out


def load_tm():
    s = importlib.util.spec_from_file_location("tm", ROOT / ".github/time/time.py"); tm = importlib.util.module_from_spec(s); s.loader.exec_module(tm)
    return tm


def selftest(tm):
    """CI: the reference move passes every kata, and an empty move fails it. Returns the number of katas."""
    L = make_lib(tm); ks = katas()
    for k in ks:
        w = k.build(L)
        with offline(L, w, "opus"):
            k.grade(L, w, k.move(lambda name, **a: act(L, w, "opus", name, a), w), lambda q, t: True)
        w = k.build(L)
        try:
            with offline(L, w, "opus"): k.grade(L, w, "", lambda q, t: True)
        except AssertionError: continue
        raise AssertionError(f"{k.NAME}: doing nothing passes")
    return len(ks)


def play(L, w, spec, kata, turns, spent, cap):
    """The seat under test works the kata through the tools. Returns (answer, turns); `spent` collects ledger rows."""
    tm = L.tm; seat, model, effort = tm.worker_seat_model(spec)
    sop = (ROOT / f".agents/skills/{SKILL}/SKILL.md").read_text()
    msgs = [{"role": "system", "content": f"You are @{seat}, the manager seat of the factory in repo o/r. Now: {L.NOW:%Y-%m-%dT%H:%M:%SZ}. "
             f"Work with the tools; when the situation is handled call finish(answer). Your SOP:\n\n{sop}"},
            {"role": "user", "content": kata.PROMPT}]
    answer = None
    for t in range(turns):
        body = {"model": model, "temperature": 0.2, "max_tokens": 4000, "messages": msgs, "tools": TOOLS, "venice_parameters": {"include_venice_system_prompt": False}}
        if effort: body["reasoning_effort"] = effort
        msg = tm.chat(body, timeout=300)["choices"][0]["message"]
        spent += tm.LEDGER; tm.LEDGER.clear()
        if sum(r["usd"] or 0 for r in spent) > cap: raise RuntimeError(f"over the dojo's ${cap} cap")
        msgs.append({k: v for k, v in msg.items() if k in ("role", "content", "tool_calls")})
        calls = msg.get("tool_calls") or []
        if not calls:
            answer = msg.get("content") or ""; break
        for c in calls:
            try: a = json.loads(c["function"].get("arguments") or "{}")
            except ValueError: a = {}
            if c["function"]["name"] == "finish": answer = str(a.get("answer", "")); break
            msgs.append({"role": "tool", "tool_call_id": c["id"], "content": act(L, w, seat, c["function"]["name"], a)})
        if answer is not None: return answer, t + 1
    return answer or "", turns


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--seat"); ap.add_argument("--belt", default="white", choices=BELTS)
    ap.add_argument("--turns", type=int, default=14); ap.add_argument("--max-usd", type=float, default=3.0); ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--results", default=str(HERE / "results"))
    args = ap.parse_args(); tm = load_tm()
    if args.selftest: print(f"{selftest(tm)} katas: reference passes, empty move fails"); return 0
    if not args.seat: ap.error("--seat is required (e.g. claude:opus)")
    seat = tm.worker_seat_model(args.seat)[0]; judge_spec = "sonnet" if seat == "haiku" else "haiku"
    tm.budget_check(tm.provider_of(tm.SEATS[seat]["default"]))   # the real caps, against the real repo, before any spend
    L, spent, rows = make_lib(tm), [], []

    def judge(question, text):
        out = tm.think(judge_spec, None, None, "Answer with one word: YES or NO.", f"{question}\n\n{text}")
        spent.extend(tm.LEDGER); tm.LEDGER.clear(); return out.strip().upper().startswith("YES")

    for k in [k for k in katas() if BELTS.index(k.BELT) <= BELTS.index(args.belt)]:
        w, mark, err, turns = k.build(L), len(spent), "", 0
        try:
            with offline(L, w, seat):
                answer, turns = play(L, w, args.seat, k, args.turns, spent, args.max_usd)
                k.grade(L, w, answer, judge)
        except (AssertionError, RuntimeError, LookupError, ValueError, KeyError) as e:
            err = f"{type(e).__name__}: {e}"[:300]
        row = {"at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "seat": args.seat, "skill": SKILL, "kata": k.NAME, "belt": k.BELT,
               "pass": not err, "cost": round(sum(r["usd"] or 0 for r in spent[mark:]), 4), "turns": turns, **({"error": err} if err else {})}
        rows.append(row); print(json.dumps(row))
        if err.startswith("RuntimeError: over the dojo"): break
    out = Path(args.results); out.mkdir(parents=True, exist_ok=True)
    with open(out / f"{SKILL}.jsonl", "a") as f: f.writelines(json.dumps(r) + "\n" for r in rows)
    earned = "none"
    for b in BELTS:   # a belt is earned when every kata of its tier and the tiers below passed
        if rows and all(r["pass"] for r in rows if BELTS.index(r["belt"]) <= BELTS.index(b)) and any(r["belt"] == b for r in rows): earned = b
        else: break
    bf = out / "belts.json"; belts = json.loads(bf.read_text()) if bf.exists() else {}
    cur = belts.get(args.seat, {}).get(SKILL, "none")
    if earned != "none" and (cur == "none" or BELTS.index(earned) > BELTS.index(cur)):
        belts.setdefault(args.seat, {})[SKILL] = earned; bf.write_text(json.dumps(belts, indent=1, sort_keys=True) + "\n")
    print(f"{args.seat}: {sum(r['pass'] for r in rows)}/{len(rows)} passed, ${sum(r['cost'] for r in rows):.4f}, belt {earned}")
    tm.LEDGER.extend(spent); tm.flush_ledger()   # book the seat's calls to the real ledger (one commit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
