#!/usr/bin/env python3
"""Seed a venture on demand: land a site built elsewhere on gh-pages at ventures/<slug>/, which Teahub pages serves at
<slug>.yolopreneur.lol, and keep the venture's line in the ledger (ventures/ventures.json).

Run by .github/workflows/seed.yml (Actions -> seed -> Run workflow). Its inputs arrive in the environment:

    SLUG    the folder and the subdomain
    BUNDLE  one or more https URLs, space-separated. Downloaded in order and joined, they make one .tgz whose
            top-level folder is <slug>/ (a big bundle can come as parts, e.g. Boring blob download links)
    SHA     sha256 of the joined .tgz: nothing lands unless it matches
    NAME, ONE_LINER   the ledger line; a venture already in the ledger keeps whatever is left empty

Nothing in the bundle runs. It is checked (paths, file types, size, an index.html) and copied over ventures/<slug>/,
replacing what was there, in one commit pushed to gh-pages by the Actions identity.

    python3 seed.py PAGES_DIR      # PAGES_DIR: a checkout of gh-pages
"""
import datetime as dt
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

MAX_BYTES = 64 * 1024 * 1024
SLUG = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?")
RESERVED = {"index.html", "ventures.json", "backlog.json", "shots", "assets", "www"}
SITE = "https://{slug}.yolopreneur.lol/"


class SeedError(Exception):
    pass


def fetch(urls):
    """the bundle: every URL in order, joined"""
    data = bytearray()
    for u in urls:
        if not u.startswith("https://"):
            raise SeedError(f"not an https URL: {u[:60]}")
        with urllib.request.urlopen(u, timeout=120) as r:
            data += r.read(MAX_BYTES + 1 - len(data))
        if len(data) > MAX_BYTES:
            raise SeedError(f"bundle is over {MAX_BYTES // 2**20} MB")
    return bytes(data)


def unpack(data, slug, into):
    """write the bundle's <slug>/ tree under `into`, refusing anything that isn't a plain file or folder inside it"""
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
        members = tf.getmembers()
        for m in members:
            parts = Path(m.name).parts
            if m.name.startswith("/") or ".." in parts:
                raise SeedError(f"unsafe path in bundle: {m.name}")
            if not (m.isfile() or m.isdir()):
                raise SeedError(f"not a plain file or folder: {m.name}")
            if not parts or parts[0] != slug:
                raise SeedError(f"everything in the bundle must sit under {slug}/: {m.name}")
        for m in members:
            target = into / m.name
            if m.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(tf.extractfile(m).read())
    if not (into / slug / "index.html").is_file():
        raise SeedError(f"the bundle has no {slug}/index.html")


def ledger_line(data, slug, name, one_liner, today):
    """the venture's line in the ledger, added (at the top) or refreshed; raises before anything is written"""
    vs = data.setdefault("ventures", [])
    v = next((v for v in vs if v.get("slug") == slug), None)
    if v is None:
        if not name or not one_liner:
            raise SeedError("a new venture needs a name and a one-liner for the ledger")
        v = {"slug": slug, "name": name, "one_liner": one_liner, "url": SITE.format(slug=slug),
             "pages": SITE.format(slug=slug), "launched": today, "signups": 0, "source": "yolopreneur"}
        vs.insert(0, v)
    else:
        if name:
            v["name"] = name
        if one_liner:
            v["one_liner"] = one_liner
    return v


def land(pages, slug, data, want, name="", one_liner="", today=None):
    """check the bundle and put it at ventures/<slug>/ in the gh-pages checkout `pages`; returns the bundle's sha256.
    Every check runs before anything is written, so a refused bundle leaves the checkout as it was."""
    if not SLUG.fullmatch(slug or "") or slug in RESERVED:
        raise SeedError(f"bad slug: {slug!r}")
    if not re.fullmatch(r"[0-9a-f]{64}", (want or "").lower()):
        raise SeedError("sha256 must be 64 hex characters")
    got = hashlib.sha256(data).hexdigest()
    if got != want.lower():
        raise SeedError(f"sha256 mismatch: the bundle is {got}")
    path = pages / "ventures" / "ventures.json"
    book = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"ventures": []}
    line = ledger_line(book, slug, name, one_liner, today or dt.date.today().isoformat())
    with tempfile.TemporaryDirectory() as tmp:
        unpack(data, slug, Path(tmp))
        dest = pages / "ventures" / slug
        shutil.rmtree(dest, ignore_errors=True)
        shutil.copytree(Path(tmp) / slug, dest)
    if (dest / "shots" / "desktop.png").is_file():
        line["shot"] = f"{slug}/shots/desktop.png"       # the card on the yolopreneur.lol index
    path.write_text(json.dumps(book, indent=1), encoding="utf-8")   # the ledger's own layout: indent 1, ASCII
    return got


def commit(pages, slug, sha):
    git = ["git", "-C", str(pages), "-c", "user.name=github-actions[bot]",
           "-c", "user.email=github-actions[bot]@users.noreply.teahub.xyz"]
    subprocess.run(git + ["add", "--all", f"ventures/{slug}", "ventures/ventures.json"], check=True)
    if subprocess.run(git + ["diff", "--cached", "--quiet"]).returncode == 0:
        print("nothing changed: ventures/" + slug + " is already this bundle")
        return False
    subprocess.run(git + ["commit", "-q", "-m", f"ventures: seed {slug} (bundle {sha[:12]})"], check=True)
    if subprocess.run(git + ["push", "-q", "origin", "HEAD:gh-pages"]).returncode != 0:
        # gh-pages moved under us (the venture loop writes there too): replay this one commit on top, push again
        subprocess.run(git + ["pull", "-q", "--rebase", "origin", "gh-pages"], check=True)
        subprocess.run(git + ["push", "-q", "origin", "HEAD:gh-pages"], check=True)
    return True


def main():
    pages = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    slug = os.environ.get("SLUG", "").strip()
    try:
        data = fetch(os.environ.get("BUNDLE", "").split())
        sha = land(pages, slug, data, os.environ.get("SHA", "").strip(), os.environ.get("NAME", "").strip(),
                   os.environ.get("ONE_LINER", "").strip())
    except (SeedError, OSError, tarfile.TarError) as e:
        print(f"::error::seed {slug}: {e}")
        sys.exit(1)
    pushed = commit(pages, slug, sha)
    print(f"{'landed' if pushed else 'unchanged'}: ventures/{slug}/ ({len(data)} bytes, sha256 {sha[:12]}) -> "
          + SITE.format(slug=slug))


if __name__ == "__main__":
    main()
