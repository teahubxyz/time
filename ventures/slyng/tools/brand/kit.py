"""Shared drawing kit for the SLYNG concepts (font units, y up)."""
import math
import os
from fontkit import Face
from sling import make_y, f

INK = "#111014"
BONE = "#F1F0EC"
WHITE = "#FFFFFF"
RED = "#FF3D2E"      # band vermilion
VOLT = "#D9FF3D"     # zap lime
COBALT = "#2340FF"
PERI = "#C9C6FF"     # periwinkle
DAYGLO = "#FFE229"   # price-sticker yellow
CONCRETE = "#D7D5CF"


class Mark:
    """Collects SVG snippets drawn in font units with y up."""

    def __init__(self):
        self.parts = []
        self.box = [1e9, 1e9, -1e9, -1e9]

    def add(self, s, box=None):
        self.parts.append(s)
        if box:
            self.grow(*box)

    def grow(self, x0, y0, x1, y1):
        b = self.box
        self.box = [min(b[0], x0), min(b[1], y0), max(b[2], x1), max(b[3], y1)]

    def svg(self, pad=(0, 0, 0, 0), bg=None, box=None, label="SLYNG logo"):
        """pad = (left, bottom, right, top) in font units."""
        x0, y0, x1, y1 = box or self.box
        l, b, r, t = pad
        vx, vy = x0 - l, -(y1 + t)
        W, H = (x1 + r) - vx, (y1 + t) - (y0 - b)
        rect = f'<rect x="{f(vx)}" y="{f(vy)}" width="{f(W)}" height="{f(H)}" fill="{bg}"/>' if bg else ""
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{f(vx)} {f(vy)} {f(W)} {f(H)}" '
                f'role="img" aria-label="{label}">{rect}'
                f'<g transform="scale(1 -1)">{"".join(self.parts)}</g></svg>'), (W, H)


def glyph(face, ch, x, fill, y=0, sx=1.0):
    tr = f"translate({f(x)} {f(y)})" + (f" scale({sx} 1)" if sx != 1 else "")
    return f'<path transform="{tr}" d="{face.path(ch)}" fill="{fill}"/>'


def word(mark, face, text, fill, kern=None, track=0, x0=0, y0=0, slot=None, slot_adv=None):
    """Place `text`; the character `slot` (e.g. 'Y') is left empty and its
    origin returned so a custom glyph can go there. Returns (positions, end x)."""
    kern = kern or {}
    x = x0
    pos = {}
    prev = None
    for i, ch in enumerate(text):
        if prev is not None:
            x += kern.get(prev + ch, 0) + track
        pos[i] = (ch, x)
        if ch != slot:
            mark.add(glyph(face, ch, x, fill, y0))
            b = face.bounds(ch)
            if b:
                mark.grow(x + b[0], y0 + b[1], x + b[2], y0 + b[3])
        adv = slot_adv if (ch == slot and slot_adv) else face.adv(ch)
        x += adv
        prev = ch
    return pos, x


def band(L, P, R, width, color, knock=None, kw=0, join="round"):
    d = f"M{f(L[0])} {f(L[1])} L{f(P[0])} {f(P[1])} L{f(R[0])} {f(R[1])}"
    s = ""
    if knock:
        s += (f'<path d="{d}" fill="none" stroke="{knock}" stroke-width="{f(width + 2 * kw)}" '
              f'stroke-linejoin="{join}" stroke-linecap="round"/>')
    s += (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(width)}" '
          f'stroke-linejoin="{join}" stroke-linecap="round"/>')
    return s


def dot(c, r, color, knock=None, kw=0):
    s = ""
    if knock:
        s += f'<circle cx="{f(c[0])}" cy="{f(c[1])}" r="{f(r + kw)}" fill="{knock}"/>'
    return s + f'<circle cx="{f(c[0])}" cy="{f(c[1])}" r="{f(r)}" fill="{color}"/>'


def ypath(Y, fill):
    return f'<path d="{Y.path()}" fill="{fill}"/>'


def y_box(Y):
    if Y.tips == "round":
        half = Y.a + Y.wa / 2
    else:
        half = Y.cx - Y.x_out(Y.H)
    return (Y.cx - half, Y.base, Y.cx + half, Y.H + Y.tip_over)


def chromium(p):
    """Chromium for the animations: Playwright's own, or the one at CHROME=/path/to/chrome."""
    return p.chromium.launch(executable_path=os.environ.get("CHROME") or None)
