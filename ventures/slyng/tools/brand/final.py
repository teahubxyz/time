"""Final SLYNG wordmark: Unbounded, the Y is Unbounded's own Y.

Logo pose: the stone sits on the vertex of the Y; the two bands run parallel
to the inner edges of the arms (a thin ink gap between band and arm) all the
way up to the tips, cut flush with the cap line.

`pose(...)` draws any moment of the motion: the bands always run from the
pouch to the anchors at the tips; when a band is steep its tip end is cut
flush with the cap line, when it is shallow (snapped straight, ringing) it
ends round."""
import math
from concepts import UNB
from kit import INK, WHITE, VOLT, BONE, Mark, word
from sling import f

FACE = UNB
H = FACE.cap
KERN = {"LY": -40, "YN": 0}
TONES = {
    "dark": dict(bg=INK, letters=WHITE, band=VOLT, stone=VOLT, knock=INK),
    "light": dict(bg=BONE, letters=INK, band=VOLT, stone=VOLT, knock=INK),
}
BW = 0.056 * H          # band width
KW = 0.022 * H          # ink gap / outline
R_STONE = 0.082 * H


def _geometry():
    mk = Mark()
    pos, _ = word(mk, FACE, "SLYNG", "#000", kern=KERN)
    yx = pos[2][1]
    m = FACE.measure_Y()
    cx = yx + m["cx"]
    y1, y2 = H * 0.96, H * 0.74
    e1 = (yx + FACE.hscan("Y", y1)[1], y1)
    e2 = (yx + FACE.hscan("Y", y2)[1], y2)
    dx, dy = e2[0] - e1[0], e2[1] - e1[1]
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L                 # down the left inner edge
    nx, ny = -uy, ux                        # into the fork
    if nx < 0:
        nx, ny = -nx, -ny
    # the left inner edge as x(y)
    x_in = lambda y: e1[0] + (y - e1[1]) * dx / dy
    vertex = (cx, e1[1] + (cx - e1[0]) * dy / dx)
    delta = KW + BW / 2
    x_off = lambda y: x_in(y) + delta / math.cos(math.atan(abs(dx / dy)))
    # band centrelines meet on the axis here (hidden under the stone)
    apex_y = e1[1] + (cx - x_off(e1[1])) * dy / dx
    anchor_L = (x_off(H), H)
    anchor_R = (2 * cx - anchor_L[0], H)
    return dict(cx=cx, vertex=vertex, apex=(cx, apex_y), L=anchor_L, R=anchor_R, unit=H / 0.70)


G = _geometry()


def _strip(p, t, hw, flush_y=None):
    """Polygon for a band of half-width hw from p (pouch end) to t (tip end).
    With flush_y the tip end is cut horizontally at that height."""
    dx, dy = t[0] - p[0], t[1] - p[1]
    L = math.hypot(dx, dy) or 1e-6
    ux, uy = dx / L, dy / L
    nx, ny = -uy * hw, ux * hw
    a = (p[0] + nx, p[1] + ny)
    b = (p[0] - nx, p[1] - ny)
    if flush_y is not None and uy > 0.35:
        # walk each long edge until it meets y = flush_y
        ka = (flush_y - a[1]) / uy
        kb = (flush_y - b[1]) / uy
        a2 = (a[0] + ux * ka, flush_y)
        b2 = (b[0] + ux * kb, flush_y)
        return f"M{f(a[0])} {f(a[1])} L{f(a2[0])} {f(a2[1])} L{f(b2[0])} {f(b2[1])} L{f(b[0])} {f(b[1])} Z", False
    a2 = (t[0] + nx, t[1] + ny)
    b2 = (t[0] - nx, t[1] - ny)
    return f"M{f(a[0])} {f(a[1])} L{f(a2[0])} {f(a2[1])} L{f(b2[0])} {f(b2[1])} L{f(b[0])} {f(b[1])} Z", True


def _band(pouch, color, hw, flush):
    out = []
    for t in (G["L"], G["R"]):
        d, round_end = _strip(pouch, t, hw, H if flush else None)
        out.append(f'<path d="{d}" fill="{color}"/>')
        if round_end:
            out.append(f'<circle cx="{f(t[0])}" cy="{f(t[1])}" r="{f(hw)}" fill="{color}"/>')
    out.append(f'<circle cx="{f(pouch[0])}" cy="{f(pouch[1])}" r="{f(hw)}" fill="{color}"/>')
    return "".join(out)


def pose(tone="dark", pouch=None, stone=None, stone_scale=1.0, flush=True):
    c = TONES[tone]
    pouch = G["apex"] if pouch is None else pouch
    if stone is None:
        stone = G["vertex"]
    mk = Mark()
    word(mk, FACE, "SLYNG", c["letters"], kern=KERN)
    mk.add(_band(pouch, c["knock"], BW / 2 + KW, flush) + _band(pouch, c["band"], BW / 2, flush))
    if stone is not False:
        r = R_STONE * stone_scale
        mk.add(f'<circle cx="{f(stone[0])}" cy="{f(stone[1])}" r="{f(r + KW)}" fill="{c["knock"]}"/>'
               f'<circle cx="{f(stone[0])}" cy="{f(stone[1])}" r="{f(r)}" fill="{c["stone"]}"/>')
    return mk


def static_box():
    return pose("dark").box
