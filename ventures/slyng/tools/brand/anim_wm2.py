"""Animated wordmark with the bare slingshot as the Y (same motion as the icon loop).

Without the icon's square to clip it, the stone flies out through the top edge
of the image and the reload drops in through the same edge, so the image gets
headroom above the word."""
import math
import pathlib
from PIL import Image
from playwright.sync_api import sync_playwright
from kit import chromium
import direction as d
import anim
import slingy

OUT = pathlib.Path(__file__).parent / "out"
TOP_Y = d.S + 300  # icon units: where the stone leaves / re-enters (beyond the image top)


def state2(fr):
    st = anim.state(fr)
    cx = d.CX
    y_tip, y_rest = d.TIP_Y, d.P_REST[1]
    if 39 <= fr < 43:  # flight: same timing, but out past the image top
        k = (fr - 39 + 1) / 4
        st["stone"] = (cx, y_tip + (TOP_Y - y_tip) * k)
        st["stone_scale"] = 1.1 - 0.5 * k
    if 66 <= fr < 75:  # reload: fall from beyond the image top
        t = (fr - 66 + 1) / 9
        sy = TOP_Y + (y_rest - TOP_Y) * t * t
        tau = (fr - 39) / anim.FPS
        band_y = y_tip + d.S * 0.085 * math.exp(-6.5 * tau) * math.sin(2 * math.pi * 3.0 * tau)
        py = min(band_y, sy) if sy < y_tip else band_y
        st = dict(pouch=(cx, py), stone=(cx, sy))
    return st


def render(kind="unbounded", tone="dark", width=960):
    face = d.WORDMARKS[kind]["face"]
    H = face.cap
    box = slingy.bare_wordmark(kind, tone).box
    pad = (24, 0.5 * H, 24, 0.5 * H)  # headroom above for the stone, same below so the word stays centred
    frames = []
    with sync_playwright() as p:
        b = chromium(p)
        pg = b.new_page(viewport={"width": width, "height": 500})
        pg.set_content(f'<html><body style="margin:0;background:transparent"><div id="a" style="width:{width}px"></div></body></html>')
        for fr in range(anim.N):
            mk = slingy.bare_wordmark(kind, tone, state=state2(fr))
            svg, _ = mk.svg(pad=pad, box=box, label="SLYNG")
            svg = svg.replace("<svg ", '<svg style="display:block;width:100%;height:auto" ', 1)
            pg.evaluate("s => { document.getElementById('a').innerHTML = s; }", svg)
            path = OUT / f"_wb{fr:03d}.png"
            pg.locator("#a svg").screenshot(path=str(path), omit_background=True)
            frames.append(Image.open(path).convert("RGBA"))
        b.close()
    name = f"wm-sling-anim-{kind}-{tone}.webp"
    frames[0].save(OUT / name, save_all=True, append_images=frames[1:], duration=int(1000 / anim.FPS),
                   loop=0, quality=92, method=6)
    for fp in OUT.glob("_wb*.png"):
        fp.unlink()
    return OUT / name, frames[0].size


if __name__ == "__main__":
    for tone in ("dark", "light-volt"):
        print(render("unbounded", tone))
