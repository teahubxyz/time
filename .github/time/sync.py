"""Sync: keep a repo's copies on other forges in step with its home (time/sync.json).

    python3 .github/time/sync.py       # every repo in time/sync.json; this forge is the home

One rule keeps it safe: each repo has one home, and every branch has one writer. Two writers on one branch is how work
gets lost, which is why neither of Gitea's own mirrors fits: a push mirror force-pushes every branch (it would delete a
cloud session's branch on the copy), and a pull mirror makes the receiving repo read-only.

- Out: the home's branches in `out` (default: main) are pushed to every copy, fast-forward only. A copy whose branch
  has commits of its own is reported (one issue on this repo), never overwritten. SYNC_FORCE=1 (the workflow's `force`
  input) force-pushes once, e.g. to replace an archived copy's old history.
- In: branches on a copy that match its `import` patterns (claude/* for cloud sessions on GitHub) are the copy's to
  write. They are pushed to the home under the same name and get a PR there, which Time's council reviews and lands
  like any other; the landed work then flows back out with main. A branch already in main, or one whose PR was closed
  at the same commit, is left alone.
- Back: Time itself commits to an imported branch in one case, merging the base into an approved PR that fell behind.
  When the home's branch is ahead of the copy's by Time's merges and nothing else, they go back to the copy
  fast-forward (and only if the copy's branch hasn't moved since it was read), so the copy's next session builds on
  them instead of overwriting them. Anything else ahead on the home (the copy rewound its own branch, or someone pushed
  to it at the home) is not sent out: the copy, the writer, wins, and Time merges the base again on a later beat.

time/sync.json:
    {"repos": [{"repo": "teahubxyz/time", "out": ["main"],
                "copies": [{"name": "github", "url": "git@github.com:teahubxyz/time.git",
                            "ssh_key": "SYNC_GITHUB_KEY", "import": ["claude/*"]}]}]}

`token` names a secret (an environment variable the workflow passes; Gitea refuses secret names starting GITHUB_ or
GITEA_), never the token itself; a copy whose token isn't set is skipped with a note. Or `ssh_key` names a secret holding an SSH private key (a GitHub deploy key: write access
to that one repo and nothing else) for an `ssh://` or `git@host:` URL; the host's keys are pinned (github.com's are
built in, others go in `known_hosts`), never learned on first use. The same script syncs Gitea with Gitea: it runs on the home, so a pair the home can't
reach (hb-5's local Gitea from prod) runs from the side that can reach both, with that side's own sync.json.
"""
from __future__ import annotations

import base64
import fnmatch
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("tm", HERE / "time.py")
tm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tm)
CONFIG = "time/sync.json"
SECRETS: list[str] = []   # every token used this run, scrubbed from anything printed or posted
# github.com's published SSH host keys (api.github.com/meta), pinned so a copy over SSH never trusts a key on first use
HOST_KEYS = {"github.com": ["github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl",
                            "github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxk"
                            "ZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg="]}
ENV: dict[str, str] = {}  # extra environment for the git calls to the copy being synced (its SSH command)


def scrub(text: str) -> str:
    for s in SECRETS:
        if s:
            text = text.replace(s, "***").replace(urllib.parse.quote(s, safe=""), "***")
    return text


def config() -> list[dict]:
    """time/sync.json on the default branch, through the API (the workflow checks out only .github/time)."""
    try:
        f = tm.gh("GET", f"/repos/{tm.REPO}/contents/{CONFIG}")
    except RuntimeError as e:
        if "-> 404" in str(e):
            return []
        raise
    data = json.loads(base64.b64decode(f.get("content") or "").decode() or "{}")
    return [r for r in data.get("repos") or [] if isinstance(r, dict)]


def authed(url: str, token: str, user: str = "x-access-token") -> str:
    """The URL with credentials, for https; file:// and the like as given."""
    p = urllib.parse.urlsplit(url)
    if p.scheme not in ("https", "http") or not token:
        return url
    SECRETS.append(token)
    cred = f"{urllib.parse.quote(user, safe='')}:{urllib.parse.quote(token, safe='')}"
    return urllib.parse.urlunsplit((p.scheme, f"{cred}@{p.netloc}", p.path, p.query, p.fragment))


def ssh_host(url: str) -> str:
    """The host of an ssh:// or scp-style (git@host:path) URL; '' for anything else."""
    if url.startswith("ssh://"):
        return (urllib.parse.urlsplit(url).hostname or "")
    if "://" not in url and "@" in url and ":" in url.split("@", 1)[1]:
        return url.split("@", 1)[1].split(":", 1)[0]
    return ""


def ssh_env(key: str, host: str, known: list[str] | None, folder: str) -> dict[str, str]:
    """GIT_SSH_COMMAND for one copy: its deploy key (written 0600 in the run's temp folder) and the host's pinned keys."""
    keys = known or HOST_KEYS.get(host)
    if not keys:
        raise RuntimeError(f"no pinned host key for {host}: put the host's keys in the copy's known_hosts")
    kf, hf = Path(folder, "sync_key"), Path(folder, "known_hosts")
    kf.write_text(key.strip() + "\n")
    kf.chmod(0o600)
    hf.write_text("\n".join(keys) + "\n")
    return {"GIT_SSH_COMMAND": f"ssh -i {kf} -o IdentitiesOnly=yes -o UserKnownHostsFile={hf} -o StrictHostKeyChecking=yes "
                               f"-o BatchMode=yes"}


def git(*args: str, cwd: str | None = None, check: bool = True) -> subprocess.CompletedProcess:
    p = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=300,
                       env={**os.environ, "GIT_TERMINAL_PROMPT": "0", **ENV})
    if check and p.returncode:
        raise RuntimeError(f"git {args[0]} failed: {scrub(p.stderr.strip())[-400:]}")
    return p


def heads(url: str, cwd: str) -> dict[str, str]:
    """{branch: sha} of a remote."""
    out = git("ls-remote", "--heads", url, cwd=cwd).stdout
    return {ref.split("refs/heads/", 1)[1]: sha for sha, ref in (line.split("\t") for line in out.splitlines() if "\t" in line)}


def push_out(work: str, home: dict[str, str], url: str, branch: str, force: bool) -> str:
    """One home branch to one copy: 'up to date', 'pushed', 'forced' or 'diverged' (the copy has commits of its own)."""
    if branch not in home:
        return "missing on the home"
    p = git("push", "--porcelain", url, f"{'+' if force else ''}refs/home/{branch}:refs/heads/{branch}", cwd=work, check=False)
    text = p.stdout + p.stderr
    if p.returncode == 0:
        return "up to date" if "[up to date]" in text else ("forced" if force else "pushed")
    if "[rejected]" in text or "non-fast-forward" in text or "fetch first" in text:
        return "diverged"
    raise RuntimeError(f"push {branch} failed: {scrub(text.strip())[-400:]}")


def landed(work: str, ref: str, base: str) -> bool:
    return git("merge-base", "--is-ancestor", ref, base, cwd=work, check=False).returncode == 0


def times_merges(work: str, copy_ref: str, home_ref: str) -> bool:
    """The home's branch is ahead of the copy's by update_branch's merges alone: every first-parent commit between them
    is a two-parent merge authored by Time. The copy rewinding its own branch leaves the home ahead too, by the
    copy's own withdrawn commits, and those must not go back; nor must a human's or a worker's push at the home."""
    if not landed(work, copy_ref, home_ref):
        return False
    rows = git("log", "--first-parent", "--format=%an%x09%P", f"{copy_ref}..{home_ref}", cwd=work).stdout.splitlines()
    return bool(rows) and all(r.split("\t")[0] == tm.TIME_GIT_NAME and len(r.split("\t")[1].split()) == 2 for r in rows)


CARD_BRANCH = re.compile(r"^claude/card-(\d+)(?:\b|-)")   # a cloud session building card N (router.py's cloud lane)


def card_of(branch: str) -> int | None:
    m = CARD_BRANCH.match(branch)
    return int(m.group(1)) if m else None


def hand_back(repo: str, card: int, pr: int) -> bool:
    """A cloud-lane card's branch came home as `pr`: the card goes from `cloud` to `ready`, so the heartbeat adopts the PR
    (it closes the card) and the council reviews and lands it like any card PR. Only a card on this repo still in the
    lane moves; the note carries no beat, so the card still reads as never dispatched and is adopted, not rebuilt."""
    if repo != tm.REPO:
        return False
    issue = tm.gh("GET", f"/repos/{repo}/issues/{card}")
    if issue.get("state") != "open" or not tm.has_label(issue, "cloud"):
        return False
    tm.unlabel(card, "cloud")
    tm.label(card, "ready")
    tm.comment(card, f"☁️ The cloud session's branch came home as PR #{pr}. The heartbeat reviews and lands it like any "
                     f"card PR.", {"cloud": "home", "pr": pr})
    return True


REVIEWING = ("pr", "needs-human", "no-checks", "checks-failed")   # a card whose PR is being or has been reviewed


def revised(repo: str, branch: str, before: str | None) -> list[int]:
    """The copy pushed new commits to a branch whose PR is open and already reviewed (a cloud session answering the
    review): each card the PR closes gets a `dispatched` beat marked `revised`, so the heartbeat reviews the new head
    and a verdict from before the push no longer counts, and the PR loses `needs-human`. A card not yet reviewed (the
    heartbeat hasn't adopted the PR) gets nothing: its first review sees the new head anyway. `before` is the home's
    head of the branch before this import; a branch new to the home is never a revision."""
    if repo != tm.REPO or not before:
        return []
    pr = next((p for p in tm.gh("GET", f"/repos/{repo}/pulls?state=open&limit=50") or []
               if (p.get("head") or {}).get("ref") == branch), None)
    if not pr:
        return []
    cards = {card_of(branch)} | {int(x) for x in re.findall(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b", pr.get("body") or "", re.I)}
    done = []
    for c in sorted(x for x in cards if x):
        beats = [b for b in tm.beats_of(tm.gh("GET", f"/repos/{repo}/issues/{c}/comments?limit=100") or [])
                 if b["beat"] not in ("blocked", "capped")]
        if not beats or beats[-1]["beat"] not in REVIEWING:
            continue
        tm.comment(c, f"☁️ The cloud session pushed a revision to PR #{pr['number']}. The heartbeat reviews it again; "
                      f"a verdict from before the push no longer counts.",
                   {"beat": "dispatched", "pr": pr["number"], "revised": True, "cloud": True})
        done.append(c)
    if done and tm.has_label(pr, "needs-human"):
        tm.unlabel(pr["number"], "needs-human")
    return done


def ensure_pr(repo: str, work: str, branch: str, base: str, copy: str, where: str) -> int | None:
    """A PR on the home for an imported branch, unless one is open for it, it is already in the base, or a PR for it
    was closed at this same commit (a human or the council said no; a new push brings it back)."""
    ref = f"refs/copy/{branch}"
    if landed(work, ref, f"refs/home/{base}"):
        return None
    tip = git("rev-parse", ref, cwd=work).stdout.strip()
    for p in tm.gh("GET", f"/repos/{repo}/pulls?state=all&limit=50") or []:
        head = p.get("head") or {}
        if head.get("ref") == branch and (p.get("state") == "open" or head.get("sha") == tip):
            return None
    log = git("log", "--reverse", "--format=%s%n%n%b%n---", f"refs/home/{base}..{ref}", cwd=work).stdout.strip()
    title = (log.splitlines() or [branch])[0][:200]
    card = card_of(branch)
    closes = f"Closes #{card}\n\n" if card and not re.search(rf"\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#{card}\b", log, re.I) else ""
    body = (f"{closes}From {copy}: `{branch}` ({where}), {tm.IMPORTED}. Time's council reviews it like any PR.\n\n"
            f"Commits:\n\n{log[:6000]}\n\n<sub>sync.py: edit this branch on {copy}; it is the copy's to write, and the "
            f"next sync brings the change here.</sub>")
    n = tm.gh("POST", f"/repos/{repo}/pulls", {"head": branch, "base": base, "title": title, "body": body})["number"]
    # the card the branch is named for, and any the commits close (a cloud session may name its own branch)
    named = {card} if card else set()
    for c in sorted(named | {int(x) for x in re.findall(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b", log, re.I)}):
        try:
            hand_back(repo, c, n)
        except Exception as e:  # noqa: BLE001  the PR is home either way; a human can relabel the card
            print(f"hand_back #{c}: {scrub(str(e))[:200]}")
    return n


def sync_repo(entry: dict, home_url: str, force: bool = False) -> dict:
    repo = entry.get("repo") or tm.REPO
    out = [b for b in entry.get("out") or ["main"] if isinstance(b, str)]
    base = out[0]
    report: dict = {"repo": repo, "copies": []}
    with tempfile.TemporaryDirectory() as work:
        git("init", "--bare", "-q", work)
        home = heads(home_url, work)
        wanted = [b for b in out if b in home]
        if wanted:
            git("fetch", "-q", home_url, *[f"+refs/heads/{b}:refs/home/{b}" for b in wanted], cwd=work)
        for c in entry.get("copies") or []:
            name, where = str(c.get("name") or c.get("url")), str(c.get("url") or "")
            secret = str(c.get("ssh_key") or c.get("token") or "")
            token = os.environ.get(secret, "") if secret else ""
            r: dict = {"copy": name, "out": {}, "imported": [], "prs": [], "note": ""}
            report["copies"].append(r)
            if secret and not token:
                r["note"] = f"skipped: the secret {secret} isn't set"
                continue
            ENV.clear()
            if c.get("ssh_key"):
                SECRETS.append(token)
                ENV.update(ssh_env(token, ssh_host(where), c.get("known_hosts"), work))
                url = where
            else:
                url = authed(where, token, str(c.get("user") or "x-access-token"))
            for b in out:
                r["out"][b] = push_out(work, home, url, b, force)
            pats = [p for p in c.get("import") or [] if isinstance(p, str)]
            if not pats:
                continue
            theirs = heads(url, work)
            mine = heads(home_url, work)
            for branch, sha in sorted(theirs.items()):
                if branch in out or not any(fnmatch.fnmatch(branch, p) for p in pats):
                    continue
                git("fetch", "-q", url, f"+refs/heads/{branch}:refs/copy/{branch}", cwd=work)
                moved = mine.get(branch) != sha
                if moved and mine.get(branch):   # the home's branch may be ahead by Time's merge of the base
                    got = git("fetch", "-q", home_url, f"+refs/heads/{branch}:refs/back/{branch}", cwd=work, check=False)
                    if got.returncode == 0 and times_merges(work, f"refs/copy/{branch}", f"refs/back/{branch}"):
                        read = git("rev-parse", f"refs/copy/{branch}", cwd=work).stdout.strip()
                        p = git("push", "-q", f"--force-with-lease=refs/heads/{branch}:{read}", url,
                                f"refs/back/{branch}:refs/heads/{branch}", cwd=work, check=False)
                        if p.returncode == 0:
                            r.setdefault("back", []).append(branch)
                        else:   # the copy moved meanwhile: the next run sorts it out
                            print(f"back {branch}: {scrub((p.stderr or '').strip())[-200:]}")
                        continue
                if moved:   # the copy writes this branch: the home takes it as it is
                    git("push", "-q", "--force", home_url, f"refs/copy/{branch}:refs/heads/{branch}", cwd=work)
                    r["imported"].append(branch)
                n = ensure_pr(repo, work, branch, base, name, where)
                if n:
                    r["prs"].append(n)
                elif moved:
                    try:
                        r.setdefault("revised", []).extend(revised(repo, branch, mine.get(branch)))
                    except Exception as e:  # noqa: BLE001  the commits are home either way; the next review sees them
                        print(f"revised {branch}: {scrub(str(e))[:200]}")
        ENV.clear()
    return report


def flag(repo: str, copy: str, branch: str) -> None:
    """One open issue per diverged copy branch, labelled needs-human: whether to force is a human's (or the CEO's)
    call, so neither the worker nor the router takes it."""
    title = f"Sync: {copy}'s {branch} has commits of its own ({repo})"
    if any(i.get("title") == title for i in tm.issues("state=open")):
        return
    tm.new_issue(title, f"sync.py pushes `{branch}` from the home to {copy} fast-forward only, and {copy}'s `{branch}` has "
                 f"commits the home doesn't. Nothing was overwritten. Either bring those commits to the home (a branch "
                 f"and a PR), or replace {copy}'s history: Actions → sync → Run workflow with `force`.\n\n"
                 f"DONE: {copy}'s `{branch}` follows the home again and this sync run is green.", ["needs-human"])


def main() -> int:
    entries = config()
    if not entries:
        print(f"sync: no {CONFIG}, nothing to sync")
        return 0
    force = (os.environ.get("SYNC_FORCE") or "").lower() in ("1", "true", "yes")
    token = os.environ.get("TIME_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
    for e in entries:
        repo = e.get("repo") or tm.REPO
        rep = sync_repo(e, authed(f"{tm.SERVER}/{repo}.git", token), force)
        for c in rep["copies"]:
            print(f"sync {repo} -> {c['copy']}: out {c['out']} imported {c['imported']} prs {c['prs']} "
                  f"revised {c.get('revised', [])} back {c.get('back', [])} {c['note']}".rstrip())
            for b, state in c["out"].items():
                if state == "diverged" and repo == tm.REPO:
                    flag(repo, c["copy"], b)
    return 0


if __name__ == "__main__":
    sys.exit(main())
