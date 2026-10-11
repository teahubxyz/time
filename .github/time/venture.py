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

Pitch ONE venture the studio could launch today as a single static web page: a tool, calculator, explainer, directory,
checker or playground that rides the same wave. It must work on its own with no backend, be honest (no fake data,
no fake testimonials), and be a *venture*, not just a tool: it has a name, a specific person it is for, a reason to
come back, and a next version worth paying for. Reply with ONLY JSON:
{{"slug": "kebab-case", "name": "a brand name, one or two words", "title": "...", "one_liner": "...",
  "for_whom": "the specific person this is for, in one sentence", "why_now": "which repo(s) and trend this rides",
  "page": "what the free page does, concretely, in 3-5 sentences",
  "next": "what the paid or bigger version would be, in one sentence",
  "cta": "the one thing a visitor should do to say they want more (vote, star, join a list, request a feature)"}}"""

VOTE = """You are `{seat}`, voting on the board of an agent-run venture studio. Pitches:

{pitches}

Rank up to three by: would the named person use this page this week, can one agent build it as a static page in an
hour, is there a believable next version someone would pay for, is it honest. If none is worth a day of the studio,
rank nothing. Reply with ONLY JSON: {{"ranking": ["slug1", "slug2"], "reason": "one sentence"}} (ranking may be [])."""


def ask_json(seat: str, system: str, user: str) -> dict | None:
    text = tm.think(seat, None, None, system, user)
    text = re.sub(r"```(?:json)?", "", text)
    # the outermost {...} may contain prose braces; try the widest span first, then each balanced candidate
    starts = [m.start() for m in re.finditer(r"\{", text)]
    for a in starts:
        depth = 0
        for b, ch in enumerate(text[a:], a):
            depth += ch == "{"
            depth -= ch == "}"
            if depth == 0:
                try:
                    out = json.loads(text[a:b + 1])
                    if isinstance(out, dict):
                        return out
                except ValueError:
                    pass
                break
    print(f"{seat}: no JSON in reply: {text[:160]!r}")
    return None


def pitch(repos: list[dict], seats: list[str]) -> list[dict]:
    out = []
    for s in seats:
        p = None
        for _ in range(2):  # a seat that answers in prose gets one more go
            p = ask_json(s, f"You are `{s}`. Reply with JSON only.", PITCH.format(seat=s, radar=radar(repos)))
            if p and p.get("slug") and p.get("title"):
                break
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
        seen: list[str] = []
        for slug in v.get("ranking", []):  # a seat listing the same slug thrice gets one vote for it
            if slug in score and slug not in seen:
                seen.append(slug)
        for pts, slug in zip((3, 2, 1), seen):
            score[slug] += pts
    if not any(score.values()):
        return None, {"votes": votes, "score": score}
    winner = max(score, key=lambda k: (score[k], -[p["slug"] for p in pitches].index(k)))
    if sum(1 for v in votes.values() if winner in v.get("ranking", [])) < 2:
        return None, {"votes": votes, "score": score}  # no quorum: at least two seats must want it
    return winner, {"votes": votes, "score": score}


# ---------- build and ship ----------

BUILD_BODY = """Build the venture **{name}** ({title}) as one static page.

For: {for_whom}
What the free page does: {page}
Why now: {why_now}
Next version (not built today, but the page should point at it): {next}

Write `ventures/{slug}/index.html`: a complete, self-contained page (inline CSS and JS, no build step, no external
calls except optional public CDNs). Genuinely usable, mobile-friendly, honest: no invented numbers, reviews or logos.
Brand it as **{name}** (title, header, page <title>). The tool is the hero; keep the page focused on using it.

End the page with a short "Want more?" section, exactly this shape:
- one sentence on what the next version would do ({next});
- a primary button "{cta_label}" linking to {cta_url} (opens in a new tab);
- the line: "Built by an agent-run venture studio. If this is useful, say so: that is how it gets a next version."
No email forms (there is no backend). Also add or update `ventures/index.html`: a plain list of ventures with name,
one-liner, who it is for, and link.

DONE: ventures/{slug}/index.html renders with the Want-more section and ventures/index.html links to it"""


def signal_issue(w: dict) -> dict:
    """One issue per venture where interest is counted: 👍 reactions and comments are the signal."""
    title = f"{w['name']}: want the next version?"
    for i in tm.gh("GET", f"/repos/{REPO}/issues?state=open&labels=signal&per_page=50"):
        if i["title"] == title:
            return i
    body = (f"**{w['name']}**: {w['one_liner']}\n\nFor: {w['for_whom']}\n\nFree page: {w.get('url', '(shipping)')}\n\n"
            f"Next version: {w['next']}\n\n👍 this issue if you would use the next version. Comment with what it must do. "
            f"That is the whole signup: the studio reads the count and decides whether to build it.")
    return tm.gh("POST", f"/repos/{REPO}/issues", {"title": title, "body": body, "labels": ["signal"]})


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
    if stage == "launched":
        age_h = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(st["at"].replace("Z", "+00:00"))).total_seconds() / 3600
        if age_h < float(env("TIME_VENTURE_MEASURE_HOURS", "24")):
            print(f"venture #{n}: launched {age_h:.1f}h ago, measuring at 24h")
            return 0
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
            w = dict(st["winner"])
            w.setdefault("name", w["title"]); w.setdefault("for_whom", "builders"); w.setdefault("next", "a fuller version")
            w.setdefault("cta", "vote for the next version")
            site = ensure_pages()
            w["url"] = f"{site.rstrip('/')}/ventures/{w['slug']}/"
            sig = signal_issue(w)
            w["signal"] = sig["number"]
            spec = env("TIME_WORKER", "venice:qwen coder")
            if not spec.startswith("venice:"):
                spec = "venice:qwen coder"
            fake = {"number": n, "title": w["title"], "body": BUILD_BODY.format(**w, cta_label=f"👍 I want this", cta_url=sig["html_url"])}
            r = _build_on_pages(fake, spec)
            say(f"🔨 `{r['seat']}` built **{w['name']}** in {r['steps']} steps ({r['model']}). Shipping to {w['url']} · signal: #{sig['number']}",
                {"beat": "built", "winner": w, "url": w["url"], **r})
        elif stage == "built":
            w, url = st["winner"], st["url"]
            draft = tm.think(env("TIME_VENTURE_LAUNCH", "grok"), None, None,
                             "You write launch posts for a tiny agent-run venture studio. Plain, specific, no hype, no emoji. "
                             "Never invent numbers or users.",
                             f"Draft two posts for **{w['name']}** ({w['one_liner']}; for {w['for_whom']}; page {url}; "
                             f"signal issue https://github.com/{REPO}/issues/{w['signal']}):\n"
                             f"1. an X post under 280 characters\n2. a Show HN title and first comment (3-5 sentences)\n"
                             f"Why now: {w['why_now']}")
            say(f"🚀 Shipped: {url}\n\nSignal: 👍 on #{w['signal']} means someone wants the next version.\n\n"
                f"📣 Launch drafts (nothing is sent; the chair posts what they like):\n\n{draft}",
                {"beat": "launched", "winner": w, "url": url})
        elif stage == "launched":
            w = st["winner"]
            sig = tm.gh("GET", f"/repos/{REPO}/issues/{w['signal']}")
            ups, comments = sig.get("reactions", {}).get("+1", 0), sig.get("comments", 0)
            threshold = int(env("TIME_VENTURE_SIGNAL", "3"))
            if ups + comments >= threshold:
                tm.gh("POST", f"/repos/{REPO}/issues", {"title": f"Iterate {w['name']}: build the next version",
                      "body": f"{ups} 👍 and {comments} comments on #{w['signal']}. Next version: {w['next']}\n\nDONE: PR open, tests green",
                      "labels": ["queued"]})
                say(f"📈 Measure: {ups} 👍, {comments} comments on #{w['signal']} (threshold {threshold}). Queued an iterate card.",
                    {"beat": "done", "url": st["url"], "signal": ups + comments})
            else:
                say(f"📉 Measure: {ups} 👍, {comments} comments on #{w['signal']} (threshold {threshold}). Parked; the signal issue "
                    f"stays open, and the loop re-checks it weekly.", {"beat": "done", "url": st["url"], "signal": ups + comments})
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
