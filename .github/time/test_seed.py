#!/usr/bin/env python3
"""Tests for seed.py: a bundle lands only when it is what it says it is, and the ledger keeps its layout."""
import hashlib
import importlib.util
import io
import json
import sys
import tarfile
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("seed", Path(__file__).with_name("seed.py"))
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)

LEDGER = {"ventures": [{"slug": "mdecks", "name": ".mdeck", "one_liner": "Slides in plain text — fast.",
                        "launched": "2026-10-12", "signups": 0}], "refreshed": "2026-10-14"}


def tgz(files, links=()):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        for name, body in files.items():
            ti = tarfile.TarInfo(name)
            ti.size = len(body)
            tf.addfile(ti, io.BytesIO(body))
        for name, target in links:
            ti = tarfile.TarInfo(name)
            ti.type, ti.linkname = tarfile.SYMTYPE, target
            tf.addfile(ti)
    return buf.getvalue()


def pages_dir():
    d = Path(tempfile.mkdtemp())
    (d / "ventures").mkdir()
    (d / "ventures" / "ventures.json").write_text(json.dumps(LEDGER, indent=1), encoding="utf-8")
    return d


def refused(fn, *a, **kw):
    try:
        fn(*a, **kw)
    except seed.SeedError as e:
        return str(e)
    raise AssertionError("expected SeedError")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def test_lands_and_lists():
    p = pages_dir()
    b = tgz({"hh/index.html": b"<!doctype html>hi", "hh/plates/a.svg": b"<svg/>", "hh/shots/desktop.png": b"png"})
    assert seed.land(p, "hh", b, sha(b), "House Hand", "A drawing hand.", today="2026-10-15") == sha(b)
    assert (p / "ventures/hh/plates/a.svg").read_bytes() == b"<svg/>"
    text = (p / "ventures/ventures.json").read_text()
    assert text == json.dumps(json.loads(text), indent=1)          # same layout as the file it came from
    assert "\\u2014" in text                                          # ASCII escapes kept, like the original
    first = json.loads(text)["ventures"][0]
    assert first["slug"] == "hh" and first["launched"] == "2026-10-15" and first["shot"] == "hh/shots/desktop.png"
    assert first["url"] == "https://hh.yolopreneur.lol/" and json.loads(text)["refreshed"] == "2026-10-14"


def test_replaces_and_keeps_the_ledger_line():
    p = pages_dir()
    b1 = tgz({"hh/index.html": b"one", "hh/old.txt": b"stale"})
    seed.land(p, "hh", b1, sha(b1), "House Hand", "First line.", today="2026-10-15")
    b2 = tgz({"hh/index.html": b"two"})
    seed.land(p, "hh", b2, sha(b2), today="2026-10-20")              # no name or line given: keep them
    assert not (p / "ventures/hh/old.txt").exists() and (p / "ventures/hh/index.html").read_bytes() == b"two"
    vs = [v for v in json.loads((p / "ventures/ventures.json").read_text())["ventures"] if v["slug"] == "hh"]
    assert len(vs) == 1 and vs[0]["one_liner"] == "First line." and vs[0]["launched"] == "2026-10-15"


def test_refuses():
    p = pages_dir()
    good = tgz({"hh/index.html": b"x"})
    assert "mismatch" in refused(seed.land, p, "hh", good, "0" * 64, "n", "o")
    assert "bad slug" in refused(seed.land, p, "../etc", good, sha(good), "n", "o")
    assert "bad slug" in refused(seed.land, p, "ventures.json", good, sha(good), "n", "o")
    for bad, why in ((tgz({"hh/../../x": b"x", "hh/index.html": b"x"}), "unsafe"),
                     (tgz({"hh/index.html": b"x"}, links=[("hh/link", "/etc/passwd")]), "plain file"),
                     (tgz({"other/index.html": b"x"}), "under hh/"),
                     (tgz({"hh/readme.txt": b"x"}), "no hh/index.html")):
        assert why in refused(seed.land, p, "hh", bad, sha(bad), "n", "o"), why
    assert "needs a name" in refused(seed.land, p, "hh", good, sha(good))
    assert not (p / "ventures/hh").exists()                          # nothing half-landed
    assert "https" in refused(seed.fetch, ["http://example.com/x.tgz"])


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("ok", t.__name__)
    print(f"{len(tests)} seed tests passed")
    sys.exit(0)
