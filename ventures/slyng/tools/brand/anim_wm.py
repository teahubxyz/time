"""Animated wordmark: the icon-Y does the pull-and-release inside SLYNG."""
import pathlib
from PIL import Image
from playwright.sync_api import sync_playwright
from kit import chromium
import direction as d
import anim

OUT = pathlib.Path(__file__).parent / "out"


def render(kind="unbounded", tone="dark", width=960):
    mk0 = d.wordmark_icon_y(kind, tone)
    box = mk0.box
    frames = []
    with sync_playwright() as p:
        b = chromium(p)
        pg = b.new_page(viewport={"width": width, "height": 400})
        pg.set_content(f'<html><body style="margin:0;background:transparent"><div id="a" style="width:{width}px"></div></body></html>')
        for fr in range(anim.N):
            mk = d.wordmark_icon_y(kind, tone, state=anim.state(fr), uid=f"f{fr}")
            svg, _ = mk.svg(pad=(24, 24, 24, 24), box=box, label="SLYNG")
            svg = svg.replace("<svg ", '<svg style="display:block;width:100%;height:auto" ', 1)
            pg.evaluate("s => { document.getElementById('a').innerHTML = s; }", svg)
            path = OUT / f"_wm{fr:03d}.png"
            pg.locator("#a svg").screenshot(path=str(path), omit_background=True)
            frames.append(Image.open(path).convert("RGBA"))
        b.close()
    name = f"wm-anim-{kind}-{tone}.webp"
    frames[0].save(OUT / name, save_all=True, append_images=frames[1:], duration=int(1000 / anim.FPS),
                   loop=0, quality=92, method=6)
    for fp in OUT.glob("_wm*.png"):
        fp.unlink()
    return OUT / name, frames[0].size


if __name__ == "__main__":
    for tone in ("dark", "light"):
        print(render("unbounded", tone))
