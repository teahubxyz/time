"""Wordmark motion, back to the earlier feel, ending each loop in the logo pose.

Loop (30 fps, 90 frames = 3 s):
  0-14   hold the logo pose (stone on the vertex, bands along the arms), tremble at the end
  15-17  release: the band snaps up to straight across the tips
  18-21  the stone flies up and out of the panel, getting smaller
  18-53  the band rings out around straight, then rests empty
  54-62  a new stone drops in; the band catches it in a shallow V near the top
  63-69  it settles
  70-84  pull back: the pouch slides down the arms until the stone sits on the vertex
  85-89  hold (wraps into frame 0)

Same glitch fixes as before: opaque, lossless frames the size of the panel."""
import math
import pathlib
import sys
from PIL import Image
from playwright.sync_api import sync_playwright
from kit import chromium
import final as F

OUT = pathlib.Path(__file__).parent / "out"
FPS, N = 30, 90
PANEL_W, PANEL_H, WORD_W = 1200, 400, 900
SCALE = 1.5

G = F.G
U = G["unit"]
CX = G["cx"]
Y_TIP = F.H
SHALLOW_P = Y_TIP - 0.10 * U
LIFT_SHALLOW = 0.45 * F.R_STONE
LIFT_DRAWN = G["vertex"][1] - G["apex"][1]   # stone sits below the band apex, on the vertex


def ease_io(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def panel_box():
    x0, y0, x1, y1 = F.static_box()
    w = (x1 - x0) * PANEL_W / WORD_W
    h = w * PANEL_H / PANEL_W
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def drawn_mix(k):
    """k=0: shallow (just reloaded), k=1: the logo pose."""
    py = SHALLOW_P + (G["apex"][1] - SHALLOW_P) * k
    lift = LIFT_SHALLOW + (LIFT_DRAWN - LIFT_SHALLOW) * k
    return py, py + lift


def ring(fr, start, amp=0.085):
    tau = (fr - start) / FPS
    return Y_TIP + amp * U * math.exp(-6.5 * tau) * math.sin(2 * math.pi * 3.0 * tau)


def state(fr, top_exit):
    if fr < 15 or fr >= 85:
        jx = 0.0
        if 10 <= fr < 15:
            jx = 4.0 * U / 1024 * math.sin((fr - 10) * 2.6)
        return dict(pouch=(CX + jx, G["apex"][1]), stone=(CX + jx, G["vertex"][1]))
    if fr < 18:  # snap up, stone still seated
        t = (fr - 14) / 3.4
        py = G["apex"][1] + (Y_TIP - G["apex"][1]) * t * t
        return dict(pouch=(CX, py), stone=(CX, py + LIFT_DRAWN))
    band_y = ring(fr, 18)
    out = dict(pouch=(CX, band_y), stone=False)
    if fr < 22:
        k = (fr - 18 + 1) / 4
        out.update(stone=(CX, Y_TIP + (top_exit - Y_TIP) * k), stone_scale=1.0 - 0.45 * k)
        return out
    if fr < 54:
        return out
    if fr < 63:  # reload: falls in, the band catches it
        t = (fr - 54 + 1) / 9
        rest = SHALLOW_P + LIFT_SHALLOW
        sy = top_exit + (rest - top_exit) * t * t
        py = min(band_y, sy - LIFT_SHALLOW)
        return dict(pouch=(CX, py), stone=(CX, sy))
    if fr < 70:  # settle into the shallow V
        tau = (fr - 62) / FPS
        dip = 0.04 * U * math.exp(-7 * tau) * math.sin(2 * math.pi * 2.6 * tau)
        py = SHALLOW_P - dip
        return dict(pouch=(CX, py), stone=(CX, py + LIFT_SHALLOW))
    k = ease_io((fr - 70) / 15)  # pull back into the logo pose
    py, sy = drawn_mix(k)
    return dict(pouch=(CX, py), stone=(CX, sy))


def render(tone="dark"):
    box = panel_box()
    top_exit = box[3] + F.R_STONE * 1.5
    bg = F.TONES[tone]["bg"]
    pw, ph = int(PANEL_W * SCALE), int(PANEL_H * SCALE)
    frames = []
    with sync_playwright() as p:
        b = chromium(p)
        pg = b.new_page(viewport={"width": pw, "height": ph})
        pg.set_content('<html><body style="margin:0"><div id="a"></div></body></html>')
        for fr in range(N):
            mk = F.pose(tone, **state(fr, top_exit))
            svg, _ = mk.svg(box=box, bg=bg, label="SLYNG")
            svg = svg.replace("<svg ", f'<svg width="{pw}" height="{ph}" style="display:block" ', 1)
            pg.evaluate("s => { document.getElementById('a').innerHTML = s; }", svg)
            path = OUT / f"_f{fr:03d}.png"
            pg.locator("#a svg").screenshot(path=str(path))
            frames.append(Image.open(path).convert("RGB"))
        b.close()
    name = f"wm-final-anim-{tone}.webp"
    frames[0].save(OUT / name, save_all=True, append_images=frames[1:], duration=int(1000 / FPS),
                   loop=0, lossless=True, method=6, quality=100)
    for fp in OUT.glob("_f*.png"):
        fp.unlink()
    return OUT / name


if __name__ == "__main__":
    for tone in sys.argv[1:] or ["dark", "light"]:
        out = render(tone)
        print(out, out.stat().st_size)
