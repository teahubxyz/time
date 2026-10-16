"""Pull-and-release loop for the chosen icon -> animated WebP (+ storyboard SVGs).

Timeline at 30 fps, 90 frames (3 s): rest, pull back, hold, release (stone flies
up and away while the band snaps past straight and rings down), empty, reload
(a new stone drops in and the band catches it), rest."""
import math
import pathlib
import sys
from PIL import Image
from playwright.sync_api import sync_playwright
from kit import chromium
import direction as d

FPS = 30
N = 90
OUT = pathlib.Path(__file__).parent / "out"
DRAW = d.S * 0.12


def ease_io(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def state(fr):
    """Return kwargs for icon_svg at frame fr."""
    cx = d.CX
    y_rest, y_draw, y_tip = d.P_REST[1], d.UB - DRAW, d.TIP_Y
    if fr < 12:
        return dict()
    if fr < 30:
        u = ease_io((fr - 12) / 18)
        y = y_rest + (y_draw - y_rest) * u
        return dict(pouch=(cx, y), stone_scale=1 + 0.1 * u)
    if fr < 36:
        jx = 4.0 * math.sin((fr - 30) * 2.6)
        return dict(pouch=(cx + jx, y_draw), stone=(cx + jx, y_draw), stone_scale=1.1)
    if fr < 39:
        t = (fr - 35) / 4  # 0.25..0.75
        y = y_draw + (y_tip - y_draw) * t * t
        return dict(pouch=(cx, y), stone=(cx, y), stone_scale=1.1)
    # band rings down around straight
    tau = (fr - 39) / FPS
    band_y = y_tip + d.S * 0.085 * math.exp(-6.5 * tau) * math.sin(2 * math.pi * 3.0 * tau)
    out = dict(pouch=(cx, band_y), stone=False)
    if fr < 43:
        k = (fr - 39 + 1) / 4
        sy = y_tip + (d.S + 140 - y_tip) * k
        out.update(stone=(cx, sy), stone_scale=1.1 - 0.55 * k)
        return out
    if fr < 66:
        return out
    # reload: a new stone falls in and the band catches it
    if fr < 75:
        t = (fr - 66 + 1) / 9
        y0 = d.S + 90
        sy = y0 + (y_rest - y0) * t * t
        py = min(band_y, sy) if sy < y_tip else band_y
        return dict(pouch=(cx, py), stone=(cx, sy))
    tau = (fr - 74) / FPS
    sy = y_rest - d.S * 0.05 * math.exp(-7 * tau) * math.sin(2 * math.pi * 2.6 * tau)
    return dict(pouch=(cx, sy), stone=(cx, sy))


def render(px=512, out_name="icon-pull-release.webp"):
    frames = []
    with sync_playwright() as p:
        b = chromium(p)
        pg = b.new_page(viewport={"width": px, "height": px})
        pg.set_content('<html><body style="margin:0;background:transparent"><div id="a"></div></body></html>')
        for fr in range(N):
            svg = d.icon_svg(size=px, **state(fr))
            pg.evaluate("s => { document.getElementById('a').innerHTML = s; }", svg)
            path = OUT / f"_frame{fr:03d}.png"
            pg.locator("svg").screenshot(path=str(path), omit_background=True)
            frames.append(Image.open(path).convert("RGBA"))
        b.close()
    frames[0].save(OUT / out_name, save_all=True, append_images=frames[1:], duration=int(1000 / FPS),
                   loop=0, quality=92, method=6)
    for fp in OUT.glob("_frame*.png"):
        fp.unlink()
    return OUT / out_name


def storyboard():
    y_draw = d.UB - DRAW
    keys = {
        "story-1-loaded": dict(),
        "story-2-drawn": dict(pouch=(d.CX, y_draw), stone_scale=1.1),
        "story-3-release": dict(pouch=(d.CX, d.TIP_Y + d.S * 0.06), stone=(d.CX, d.S * 0.95), stone_scale=0.62),
        "story-4-empty": dict(pouch=(d.CX, d.TIP_Y), stone=False),
        "story-5-reload": dict(pouch=(d.CX, d.TIP_Y), stone=(d.CX, d.S * 0.9)),
    }
    for name, kw in keys.items():
        (OUT / f"{name}.svg").write_text(d.icon_svg(label=f"SLYNG icon, {name.split('-')[-1]}", **kw))
    return list(keys)


if __name__ == "__main__":
    from PIL import features
    print("webp anim:", features.check("webp_anim"))
    print(storyboard())
    print(render())
