"""Venture loop on GitHub: scout trending repos -> seats pitch ideas -> board votes -> a seat builds -> Pages ships.

    python3 .github/time/venture.py tick      # advance today's venture card one stage (cron, or on demand)

One card per venture (label `venture`), stages as Time beats on it: scout -> pitch -> board -> build -> ship -> done.
Scout: GitHub search for repos that gathered the most stars recently (no notplanned, no scraping).
Pitch: each pitching seat proposes one small, shippable product idea per repo cluster.
Board: each voting seat ranks the pitches; Borda 3/2/1 picks. Build: the Venice worker writes
ventures/<slug>/index.html on branch gh-pages (served by GitHub Pages). Nothing leaves the repo.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("tm", HERE / "time.py")
tm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tm)
REPO = tm.REPO
PAGES_BRANCH = "gh-pages"


def env(name: str, default: str) -> str:
    return (os.environ.get(name) or default).strip()


# ---------- scout: trending repos ----------

def scout(days: int = 7, n: int = 12) -> list[dict]:
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).date().isoformat()
    q = urllib.parse.quote(f"created:>{since} stars:>50")
    out = tm.gh("GET", f"/search/repositories?q={q}&sort=stars&order=desc&per_page={n}")
    return [{"name": r["full_name"], "stars": r["stargazers_count"], "desc": (r.get("description") or "")[:200],
             "lang": r.get("language") or "", "topics": r.get("topics", [])[:6], "url": r["html_url"]}
            for r in out.get("items", [])]


def radar(repos: list[dict]) -> str:
    return "\n".join(f"- {r['name']} ({r['stars']}★, {r['lang']}): {r['desc']}" + (f" [{', '.join(r['topics'])}]" if r["topics"] else "")
                     for r in repos)


# ---------- pitch and board ----------

PITCH = """You are `{seat}` on the board of a tiny software venture studio run by agents. Below are the repos that gained the
most stars on GitHub this week. They tell you what builders care about right now.

{radar}

Pitch ONE small product the studio could ship as a single static web page today: a tool, calculator, explainer,
directory, checker, or playground that rides the same wave. It must be useful on its own, need no backend, and be
honest (no fake data, no fake testimonials). Reply with ONLY JSON:
{{"slug": "kebab-case", "title": "...", "one_liner": "...", "why_now": "which repo(s) and trend this rides", "page": "what the page does, concretely, in 3-5 sentences"}}"""

VOTE = """You are `{seat}`, voting on the board of an agent-run venture studio. Pitches:

{pitches}

Rank your top three by: would a real person use this page this week, can one agent build it as a static page in an
hour, is it honest. Reply with ONLY JSON: {{"ranking": ["slug1", "slug2", "slug3"], "reason": "one sentence"}}"""


def ask_json(seat: str, system: str, user: str) -> dict | None:
    text = tm.think(seat, None, None, system, user)
    try:
        return json.loads(text[text.index("{"): text.rindex("}") + 1])
    except ValueError:
        return None


def pitch(repos: list[dict], seats: list[str]) -> list[dict]:
    out = []
    for s in seats:
        p = ask_json(s, f"You are `{s}`.", PITCH.format(seat=s, radar=radar(repos)))
        if p and p.get("slug") and p.get("title"):
            p["slug"] = re.sub(r"[^a-z0-9-]", "-", p["slug"].lower())[:40].strip("-")
            p["by"] = s
            out.append(p)
    return out


def board(pitches: list[dict], seats: list[str]) -> tuple[str | None, dict]:
    text = "\n\n".join(f"### {p['slug']} (by {p['by']})\n{p['title']}: {p['one_liner']}\nWhy now: {p['why_now']}\n{p['page']}" for p in pitches)
    score, votes = {p["slug"]: 0 for p in pitches}, {}
    for s in seats:
        v = ask_json(s, f"You are `{s}`.", VOTE.format(seat=s, pitches=text))
        if not v:
            continue
        votes[s] = v
        for pts, slug in zip((3, 2, 1), v.get("ranking", [])):
            if slug in score:
                score[slug] += pts
    if not any(score.values()):
        return None, votes
    return max(score, key=lambda k: (score[k], -[p["slug"] for p in pitches].index(k))), {"votes": votes, "score": score}


# ---------- build and ship ----------

BUILD_BODY = """Build the venture **{title}** as one static page.

{page}

Why now: {why_now}

Write `ventures/{slug}/index.html`: a complete, self-contained page (inline CSS and JS, no build step, no external
calls except optional public CDNs). Make it genuinely usable, mobile-friendly, and honest: no invented numbers,
reviews or logos. Add a one-line footer "built by the Time venture loop" linking to the repo. Also add a row for it to
`ventures/index.html` (create that index if missing: a plain list of ventures with title, one-liner and link).

DONE: ventures/{slug}/index.html renders and ventures/index.html links to it"""


def ensure_pages() -> str:
    """gh-pages branch exists and Pages serves it. Returns the site URL."""
    try:
        tm.gh("GET", f"/repos/{REPO}/git/ref/heads/{PAGES_BRANCH}")
    except RuntimeError:
        base = tm.gh("GET", f"/repos/{REPO}/git/ref/heads/{tm.default_branch()}")["object"]["sha"]
        tm.gh("POST", f"/repos/{REPO}/git/refs", {"ref": f"refs/heads/{PAGES_BRANCH}", "sha": base})
    try:
        p = tm.gh("GET", f"/repos/{REPO}/pages")
    except RuntimeError:
        p = tm.gh("POST", f"/repos/{REPO}/pages", {"source": {"branch": PAGES_BRANCH, "path": "/"}})
    return p.get("html_url") or f"https://{REPO.split('/')[0]}.github.io/{REPO.split('/')[1]}/"


# ---------- the card ----------

def venture_cards() -> list[dict]:
    return [i for i in tm.gh("GET", f"/repos/{REPO}/issues?state=open&labels=venture&per_page=10") if "pull_request" not in i]


def new_card(today: str) -> dict:
    body = ("The venture loop runs by itself: scout trending repos → seats pitch → board votes → a seat builds a static page → "
            "GitHub Pages ships it. Progress is posted here.\n\nDONE: a shipped page linked from this card, or a digest saying where it stuck.")
    return tm.gh("POST", f"/repos/{REPO}/issues", {"title": f"Venture {today}", "body": body, "labels": ["venture"]})


def state_of(card: dict) -> dict:
    beats = tm.beats_of(tm.gh("GET", f"/repos/{REPO}/issues/{card['number']}/comments?per_page=100"))
    return beats[-1] if beats else {"beat": "new"}


def tick() -> int:
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    pitchers = env("TIME_VENTURE_PITCH", "qwen,kimi,grok").split(",")
    voters = env("TIME_VENTURE_BOARD", "grok,kimi,qwen").split(",")
    cards = venture_cards()
    card = cards[0] if cards else (new_card(today) if env("TIME_VENTURE", "off") == "on" else None)
    if not card:
        print("venture loop off (TIME_VENTURE=on to start)")
        return 0
    n, st = card["number"], state_of(card)
    stage = st["beat"]
    print(f"venture #{n} stage={stage}")
    say = lambda text, meta: tm.comment(n, text, {"venture": True, **meta})
    try:
        if stage == "new":
            repos = scout()
            say("🔭 Scout: the repos that gained the most stars this week.\n\n" + radar(repos), {"beat": "scouted", "repos": repos})
        elif stage == "scouted":
            pitches = pitch(st["repos"], pitchers)
            if not pitches:
                raise RuntimeError("no seat produced a pitch")
            text = "\n\n".join(f"**{p['slug']}** by `{p['by']}`: {p['title']}. {p['one_liner']}\n_{p['why_now']}_" for p in pitches)
            say("💡 Pitches:\n\n" + text, {"beat": "pitched", "pitches": pitches})
        elif stage == "pitched":
            winner, meta = board(st["pitches"], voters)
            if not winner:
                raise RuntimeError("the board returned no usable votes")
            w = next(p for p in st["pitches"] if p["slug"] == winner)
            reasons = "\n".join(f"- `{s}`: {v.get('ranking')} ({v.get('reason', '')})" for s, v in meta["votes"].items())
            say(f"🗳️ Board picks **{w['title']}** (`{winner}`) with Borda {meta['score']}.\n\n{reasons}", {"beat": "picked", "winner": w})
        elif stage == "picked":
            w = st["winner"]
            site = ensure_pages()
            spec = env("TIME_WORKER", "venice:qwen coder")
            if not spec.startswith("venice:"):
                spec = "venice:qwen coder"
            fake = {"number": n, "title": w["title"], "body": BUILD_BODY.format(**w)}
            # build straight onto gh-pages: the worker's branch is the Pages branch for ventures
            r = _build_on_pages(fake, spec)
            url = f"{site.rstrip('/')}/ventures/{w['slug']}/"
            say(f"🔨 `{r['seat']}` built it in {r['steps']} steps ({r['model']}). Shipping to {url}", {"beat": "built", "winner": w, "url": url, **r})
        elif stage == "built":
            url = st["url"]
            say(f"🚀 Shipped: {url}\n\nPages can take a minute to publish. This card is done; tomorrow's loop starts a new one.", {"beat": "done", "url": url})
            tm.gh("PATCH", f"/repos/{REPO}/issues/{n}", {"state": "closed"})
    except Exception as e:  # noqa: BLE001
        errs = int(st.get("errors", 0)) + 1
        if errs >= 3:
            say(f"🧭 Digest: stuck at `{stage}` after 3 tries: {str(e)[:300]}. Closing; tomorrow starts fresh.", {"beat": "done", "stuck": stage})
            tm.gh("PATCH", f"/repos/{REPO}/issues/{n}", {"state": "closed"})
        else:
            say(f"⚠️ {stage} failed ({errs}/3): `{str(e)[:300]}`. Retrying next tick.", {**st, "errors": errs})
    return 0


def _build_on_pages(card: dict, spec: str) -> dict:
    """venice_work, but the hands work on gh-pages and never open a PR: ventures ship by landing on the Pages branch."""
    hands_cls = tm.Hands
    orig_init = hands_cls.__init__

    def init(self, n, branch):
        orig_init(self, n, PAGES_BRANCH)
    hands_cls.__init__ = init
    orig_call = hands_cls.call

    def call(self, name, a):
        if name == "open_pr":
            self.pr = -1  # truthy sentinel: nothing to open, the page is live on the branch
            return "done: the page is on the Pages branch, no PR needed"
        return orig_call(self, name, a)
    hands_cls.call = call
    try:
        r = tm.venice_work(card, "the page is on gh-pages", spec)
    finally:
        hands_cls.__init__, hands_cls.call = orig_init, orig_call
    return r


if __name__ == "__main__":
    sys.exit({"tick": tick}[sys.argv[1] if len(sys.argv) > 1 else "tick"]())
