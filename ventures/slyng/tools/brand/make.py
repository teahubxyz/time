#!/usr/bin/env python3
"""tools/brand/make.py: every image on the brand page (branding/img/), made from scratch.

The logo, the icon, their motion, and every draft from the six rounds that found them, drawn from the fonts'
own outlines by the modules next to this file (one per round of work, kept as they were). Needs Python 3.10+,
fontTools, Pillow, and Playwright with Chromium (or CHROME=/path/to/chrome) for the animations.

    python3 tools/brand/make.py              # everything, into branding/img/
    python3 tools/brand/make.py --stills     # just the SVGs (seconds); the animations take Chrome a few minutes
    python3 tools/brand/make.py --out DIR

The fonts come from google/fonts at a fixed commit, checked against their sha256, into BRAND_FONTS (default
~/.cache/slyng-brand-fonts). With the same fontTools the SVGs come out byte for byte the same anywhere; the
WebPs and og.png depend on Chrome and libwebp. branding/img/MANIFEST ends up with every file's sha256, which is
how tools/brand/restore.sh brings the folder back on a refresh.
"""
import argparse
import hashlib
import os
import pathlib
import sys
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
COMMIT = "1d0e46c7933245c8180fe83e47917961c913bbdb"   # google/fonts
FONTS = {  # name here: (path in google/fonts, sha256)
    "Lexend.ttf": ("ofl/lexend/Lexend[wght].ttf",
                   "3add53e641fbc81da64da4bb254285e2831b52b029527bc0714e2b9610832ee6"),
    "Archivo.ttf": ("ofl/archivo/Archivo[wdth,wght].ttf",
                    "0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053"),
    "Fredoka.ttf": ("ofl/fredoka/Fredoka[wdth,wght].ttf",
                    "2ba02e68b152868aef9ba28e24b3648c7d457fe6f25c761f2c2c53fb61a73fc8"),
    "Sora.ttf": ("ofl/sora/Sora[wght].ttf",
                 "84ff7096ae3ec6c8be47d906d1a0ba4de7f2ce78c615275c77301964a316e16c"),
    "Unbounded.ttf": ("ofl/unbounded/Unbounded[wght].ttf",
                      "323b511be380c8d474ef030686b71aedde501f8d9cd46da558b7c40454372c3f"),
    "BigShouldersDisplay.ttf": ("ofl/bigshouldersdisplay/BigShouldersDisplay[wght].ttf",
                                "60e208dc276a1c35fc5b62e94f9fb959c40c11783a9eb7548175c14b1fbeb720"),
}


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def fetch_fonts(into):
    into.mkdir(parents=True, exist_ok=True)
    for name, (path, want) in FONTS.items():
        dest = into / name
        if dest.is_file() and sha256(dest) == want:
            continue
        url = f"https://raw.githubusercontent.com/google/fonts/{COMMIT}/{urllib.parse.quote(path)}"
        with urllib.request.urlopen(url, timeout=120) as r:
            data = r.read()
        got = hashlib.sha256(data).hexdigest()
        if got != want:
            sys.exit(f"{name}: {url} has sha256 {got}, expected {want}")
        dest.write_bytes(data)
        print(f"font {name} ({len(data)} bytes)")


def stills(out):
    """Every SVG: the drafts in the order they were made, then the files the page adds."""
    import anim
    import concepts as c
    import direction as d
    import final as F
    import fontstyle as fs
    import motion3 as m3
    import slingy
    from kit import INK, WHITE, BONE, VOLT, RED, PERI, Mark, word
    from sling import f

    made = []

    def save(name, svg):
        (out / f"{name}.svg").write_text(svg)
        made.append(name)

    # Round 1: eight concepts (concepts.py)
    def lockup():   # app icon + Loaded wordmark side by side
        word_mk = c.c1()
        ic = c.icon_mark()
        H = c.LEX.cap
        s = 1.3 * H / 1024
        gap = 230
        x0 = -(1024 * s + gap)
        y0 = H / 2 - 512 * s
        mk = Mark()
        mk.add(f'<g transform="translate({f(x0)} {f(y0)}) scale({s:.5f})">{"".join(ic.parts)}</g>',
               (x0, y0, x0 + 1024 * s, y0 + 1024 * s))
        mk.parts += word_mk.parts
        mk.grow(*word_mk.box)
        return mk

    word_pad, none = (40, 40, 40, 40), (0, 0, 0, 0)
    round1 = [
        ("c1-main", c.c1(), word_pad, "SLYNG wordmark, Loaded"),
        ("c1-inv", c.c1(ink=BONE), word_pad, "SLYNG wordmark, Loaded, reversed"),
        ("c2-main", c.c2(), word_pad, "SLYNG wordmark, Full draw"),
        ("c2-inv", c.c2(ink=WHITE, band_c=RED, ground=INK), word_pad, "SLYNG wordmark, Full draw, reversed"),
        ("c3-main", c.c3(), word_pad, "slyng wordmark, Pocket"),
        ("c3-inv", c.c3(ink=PERI), word_pad, "slyng wordmark, Pocket, reversed"),
        ("c4-app", c.c4("app"), word_pad, "SLYNG.app lockup"),
        ("c4-money", c.c4("money"), word_pad, "SLYNG.money lockup"),
        ("c4-ing", c.c4("ing"), word_pad, "SLYNG.ing lockup"),
        ("c4-inv", c.c4("app", ink=WHITE), word_pad, "SLYNG.app lockup, reversed"),
        ("c5-ink", c.icon_mark(), none, "SLYNG app icon, ink"),
        ("c5-red", c.icon_mark(frame=INK, ground=RED, band_c=WHITE), none, "SLYNG app icon, vermilion"),
        ("c5-lockup", lockup(), word_pad, "SLYNG app icon with wordmark"),
        ("c6-yellow", c.c6(), none, "SLYNG price sticker, yellow"),
        ("c6-orange", c.c6(sticker="#FF8A1F", rot=7), none, "SLYNG price sticker, orange"),
        ("c6-green", c.c6(sticker="#7CFF5B", rot=-15), none, "SLYNG price sticker, green"),
        ("c7-construct", c.c7(), (170, 120, 170, 120), "SLYNG monoline wordmark with construction"),
        ("c7-clean", c.c7(construct=False), word_pad, "SLYNG monoline wordmark"),
        ("c8-main", c.c8(), word_pad, "SLYNG wordmark, Zap"),
        ("c8-inv", c.c8(ink=INK, volt=INK, ground=VOLT), word_pad, "SLYNG wordmark, Zap, on volt"),
    ]
    for name, mk, pad, label in round1:
        save(name, mk.svg(pad=pad, label=label)[0])

    # Round 2: concept 5 in Zap's colours (direction.py), its lockups, and the motion storyboard (anim.py)
    save("dir-icon-zap", d.icon_svg(label="SLYNG app icon: white slingshot, volt band and stone, on ink"))
    save("dir-icon-volt", d.icon_svg(palette="volt", label="SLYNG app icon reversed: ink slingshot on volt"))
    p30, p24 = (30, 30, 30, 30), (24, 24, 24, 24)
    for kind in ("lexend", "unbounded"):
        save(f"dir-lockup-{kind}-light", d.lockup_z(kind, "frame", ink=INK).svg(
            pad=p30, label=f"SLYNG icon and wordmark lockup ({kind}, light ground)")[0])
        save(f"dir-lockup-{kind}-dark", d.lockup_dark(kind).svg(
            pad=p30, label=f"SLYNG slingshot mark and wordmark lockup ({kind}, ink ground)")[0])
    anim.OUT = out
    made += anim.storyboard()

    # Round 3: the icon as the Y
    for kind in ("unbounded", "lexend"):
        for tone in ("light", "dark"):
            save(f"wm-icony-{kind}-{tone}", d.wordmark_icon_y(kind, tone).svg(
                pad=p24, label=f"SLYNG wordmark where the Y is the app icon ({kind}, {tone} ground)")[0])

    # Round 4: the bare slingshot as the Y (slingy.py)
    for kind in ("unbounded", "lexend"):
        for tone, ground in (("dark", "ink"), ("light-volt", "light")):
            save(f"wm-sling-{kind}-{tone}", slingy.bare_wordmark(kind, tone).svg(
                pad=p24, label=f"SLYNG wordmark with the slingshot as the Y ({kind}, {ground} ground)")[0])

    # Round 5: Unbounded's own Y, and a rounded slingshot drawn to match (fontstyle.py)
    round5 = {
        ("font", "dark"): "SLYNG in white Unbounded on ink; the Y is Unbounded's own Y with a volt band along its "
                          "arms and a volt stone in the fork",
        ("font", "light"): "SLYNG in ink Unbounded on bone; the Y is Unbounded's own Y with an ink-outlined volt "
                           "band along its arms and a stone in the fork",
        ("round", "dark"): "SLYNG in white Unbounded on ink; the Y is the rounded slingshot with the band along its arms",
        ("round", "light"): "SLYNG in ink Unbounded on bone; the Y is the rounded slingshot with the band along its arms",
    }
    for (style, tone), label in round5.items():
        save(f"wm-final-{style}-{tone}", fs.draw(style, tone).svg(pad=p24, label=label)[0])

    # Round 6: the logo (final.py)
    logo = {
        "dark": "SLYNG in white Unbounded on ink; a volt stone sits on the vertex of the Y and volt bands run up "
                "the inside of its arms to the tips",
        "light": "SLYNG in ink Unbounded on bone; a volt stone sits on the vertex of the Y and ink-outlined volt "
                 "bands run up the inside of its arms to the tips",
    }
    for tone, label in logo.items():
        save(f"wm-logo-{tone}", F.pose(tone).svg(pad=p24, label=label)[0])

    # For the page: the first frame of each loop (the logo pose, framed like the animation, ground included),
    # a close-up of the Y, and Unbounded ExtraBold set out
    for tone, label in logo.items():
        save(f"wm-final-still-{tone}", F.pose(tone).svg(box=m3.panel_box(), bg=F.TONES[tone]["bg"], label=label)[0])
    H = F.H
    y_only = F.pose("dark")
    y_only.parts = [y_only.parts[2]] + y_only.parts[5:]    # the Y, its bands and its stone; not S, L, N, G
    pos, _ = word(Mark(), F.FACE, "SLYNG", INK, kern=F.KERN)
    yb = F.FACE.bounds("Y")
    pad = 0.07 * H
    save("wm-logo-y", y_only.svg(
        box=(pos[2][1] + yb[0] - pad, -pad, pos[2][1] + yb[2] + pad, H + pad),
        label="Close-up of the Y in the SLYNG logo: the stone on the vertex, the bands inside the arms, "
              "cut flush with the tips")[0])
    spec = Mark()
    step = 1.42 * c.UNB.cap
    for i, text in enumerate(["ABCDEFGHIJKLM", "NOPQRSTUVWXYZ", "0123456789"]):
        word(spec, c.UNB, text, INK, y0=-i * step)
    save("type-unbounded", spec.svg(pad=(20, 20, 20, 20), label="Unbounded ExtraBold: A to Z and 0 to 9")[0])
    return made


def motion(out):
    """The animations, and og.png for link previews. Minutes of Chrome."""
    import anim
    import anim_wm
    import anim_wm2
    import motion2
    import motion3
    import final as F
    from playwright.sync_api import sync_playwright
    from kit import chromium, INK

    for m in (anim, anim_wm, anim_wm2, motion2, motion3):
        m.OUT = out
    jobs = [
        ("icon-pull-release.webp", lambda: anim.render()),
        ("wm-anim-unbounded-dark.webp", lambda: anim_wm.render("unbounded", "dark")),
        ("wm-anim-unbounded-light.webp", lambda: anim_wm.render("unbounded", "light")),
        ("wm-sling-anim-unbounded-dark.webp", lambda: anim_wm2.render("unbounded", "dark")),
        ("wm-sling-anim-unbounded-light-volt.webp", lambda: anim_wm2.render("unbounded", "light-volt")),
        ("wm-font-anim-font-dark.webp", lambda: motion2.render("font", "dark")),
        ("wm-font-anim-font-light.webp", lambda: motion2.render("font", "light")),
        ("wm-final-anim-dark.webp", lambda: motion3.render("dark")),
        ("wm-final-anim-light.webp", lambda: motion3.render("light")),
    ]
    for name, job in jobs:
        job()
        print(f"{name} ({(out / name).stat().st_size} bytes)", flush=True)

    # og.png: the logo on ink, 1200x630
    x0, y0, x1, y1 = F.static_box()
    w = (x1 - x0) / 0.62
    h = w * 630 / 1200
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    svg = F.pose("dark").svg(box=(mx - w / 2, my - h / 2, mx + w / 2, my + h / 2), bg=INK, label="SLYNG")[0]
    svg = svg.replace("<svg ", '<svg width="1200" height="630" style="display:block" ', 1)
    with sync_playwright() as p:
        b = chromium(p)
        pg = b.new_page(viewport={"width": 1200, "height": 630})
        pg.set_content(f'<html><body style="margin:0">{svg}</body></html>')
        pg.locator("svg").screenshot(path=str(out / "og.png"))
        b.close()
    print(f"og.png ({(out / 'og.png').stat().st_size} bytes)")


def manifest(out):
    names = sorted(p.name for p in out.iterdir() if p.is_file() and p.name != "MANIFEST")
    (out / "MANIFEST").write_text("".join(f"{sha256(out / n)}  {n}\n" for n in names))
    return len(names)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=str(HERE.parent.parent / "branding" / "img"))
    ap.add_argument("--stills", action="store_true", help="only the SVGs")
    a = ap.parse_args()
    fonts = pathlib.Path(os.environ.get("BRAND_FONTS") or pathlib.Path.home() / ".cache" / "slyng-brand-fonts")
    fetch_fonts(fonts)
    os.environ["BRAND_FONTS"] = str(fonts)
    sys.path.insert(0, str(HERE))
    out = pathlib.Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    made = stills(out)
    print(f"{len(made)} SVGs in {out}", flush=True)
    if not a.stills:
        motion(out)
    print(f"MANIFEST: {manifest(out)} files")


if __name__ == "__main__":
    main()
