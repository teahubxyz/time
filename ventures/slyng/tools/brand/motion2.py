"""Pull-and-release for the font-style Y, rendered as full panels.

Fixes for the glitchy dark version: every frame is opaque (the ground is baked
in, so there are no semi-transparent edges to fringe on dark), frames are
encoded losslessly (no per-frame compression shimmer on the white letters), and
each image is the whole 1200x400 panel, so the stone leaves through the panel's
real top edge instead of being cut off mid-air at an inner image boundary."""
import math
import pathlib
import sys
from PIL import Image
from playwright.sync_api import sync_playwright
from kit import chromium
import fontstyle as fs
from sling import f

OUT = pathlib.Path(__file__).parent / "out"
FPS, N = 30, 90
PANEL_W, PANEL_H, WORD_W = 1200, 400, 900     # CSS px on the artboard
SCALE = 1.5                                   # render density


def ease_io(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def panel_box(style):
    x0, y0, x1, y1 = fs.static_box(style)
    w = (x1 - x0) * PANEL_W / WORD_W
    h = w * PANEL_H / PANEL_W
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def state(fr, style, top_exit):
    g = fs.GEOM[style]
    u = g["unit"]
    cx = g["cx"]
    lift = g["stone_lift"]
    y_rest = g["apex"][1]
    y_draw = y_rest - 0.12 * u
    y_tip = g["L"][1]
    if fr < 12:
        return dict()
    if fr < 30:
        k = ease_io((fr - 12) / 18)
        y = y_rest + (y_draw - y_rest) * k
        return dict(pouch=(cx, y), stone=(cx, y + lift), stone_scale=1 + 0.1 * k)
    if fr < 36:
        jx = 4.0 * u / 1024 * math.sin((fr - 30) * 2.6)
        return dict(pouch=(cx + jx, y_draw), stone=(cx + jx, y_draw + lift), stone_scale=1.1)
    if fr < 39:
        t = (fr - 35) / 4
        y = y_draw + (y_tip - y_draw) * t * t
        return dict(pouch=(cx, y), stone=(cx, y + lift), stone_scale=1.1)
    tau = (fr - 39) / FPS
    band_y = y_tip + 0.085 * u * math.exp(-6.5 * tau) * math.sin(2 * math.pi * 3.0 * tau)
    out = dict(pouch=(cx, band_y), stone=False)
    if fr < 43:
        k = (fr - 39 + 1) / 4
        out.update(stone=(cx, y_tip + lift + (top_exit - y_tip - lift) * k), stone_scale=1.1 - 0.5 * k)
        return out
    if fr < 66:
        return out
    if fr < 75:
        t = (fr - 66 + 1) / 9
        rest_stone = y_rest + lift
        sy = top_exit + (rest_stone - top_exit) * t * t
        py = min(band_y, sy - lift) if sy - lift < y_tip else band_y
        return dict(pouch=(cx, py), stone=(cx, sy))
    tau = (fr - 74) / FPS
    sy = (y_rest + lift) - 0.05 * u * math.exp(-7 * tau) * math.sin(2 * math.pi * 2.6 * tau)
    return dict(pouch=(cx, sy - lift), stone=(cx, sy))


def render(style="font", tone="dark"):
    box = panel_box(style)
    top_exit = box[3] + fs.R_STONE * 1.4
    bg = fs.TONES[tone]["bg"]
    pw, ph = int(PANEL_W * SCALE), int(PANEL_H * SCALE)
    frames = []
    with sync_playwright() as p:
        b = chromium(p)
        pg = b.new_page(viewport={"width": pw, "height": ph})
        pg.set_content('<html><body style="margin:0"><div id="a"></div></body></html>')
        for fr in range(N):
            mk = fs.draw(style, tone, **state(fr, style, top_exit))
            svg, _ = mk.svg(box=box, bg=bg, label="SLYNG")
            svg = svg.replace("<svg ", f'<svg width="{pw}" height="{ph}" style="display:block" ', 1)
            pg.evaluate("s => { document.getElementById('a').innerHTML = s; }", svg)
            path = OUT / f"_m{fr:03d}.png"
            pg.locator("#a svg").screenshot(path=str(path))
            frames.append(Image.open(path).convert("RGB"))
        b.close()
    name = f"wm-font-anim-{style}-{tone}.webp"
    frames[0].save(OUT / name, save_all=True, append_images=frames[1:], duration=int(1000 / FPS),
                   loop=0, lossless=True, method=6, quality=100)
    for fp in OUT.glob("_m*.png"):
        fp.unlink()
    return OUT / name


if __name__ == "__main__":
    style = sys.argv[1] if len(sys.argv) > 1 else "font"
    for tone in sys.argv[2:] or ["dark", "light"]:
        out = render(style, tone)
        print(out, out.stat().st_size)
