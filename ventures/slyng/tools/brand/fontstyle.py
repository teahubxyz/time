"""SLYNG in Unbounded with the Y drawn as a slingshot two ways:
  font  - Unbounded's own Y glyph, untouched (flat cuts, same weight)
  round - the icon's rounded slingshot (for comparison)
In both, the band runs parallel to the inner edges of the arms (an inline that
follows the Y) and the stone sits in the fork, cradled where the band meets.

`sling_geom` returns everything the animation needs in the word's own units."""
import math
from concepts import UNB
from kit import INK, WHITE, VOLT, BONE, Mark, word
from sling import f
import direction as d
import slingy

FACE = UNB
H = FACE.cap
TONES = {
    "dark": dict(bg=INK, letters=WHITE, band=VOLT, stone=VOLT, knock=INK),
    "light": dict(bg=BONE, letters=INK, band=VOLT, stone=VOLT, knock=INK),
}
BW = 0.056 * H        # band width
KW = 0.022 * H        # ink outline around band and stone
R_STONE = 0.086 * H
KERN = {"LY": -40, "YN": 0}
ROUND_K = 1.12        # rounded slingshot height as a multiple of cap height


def _offset_line(p_top, p_bot, delta):
    """Shift the line through two points (left arm inner edge, top then bottom)
    by `delta` towards the fork interior (to its right)."""
    dx, dy = p_bot[0] - p_top[0], p_bot[1] - p_top[1]
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L          # pointing down the edge
    nx, ny = -uy, ux                 # rotate +90: points right-up for a down-right edge
    if nx < 0:
        nx, ny = -nx, -ny
    return (p_top[0] + nx * delta, p_top[1] + ny * delta), (ux, uy)


def sling_geom(style="font"):
    """Place SLYNG and compute the Y's sling geometry (word units, y up)."""
    mk = Mark()
    if style == "font":
        pos, x_end = word(mk, FACE, "SLYNG", "#000", kern=KERN)
        yx = pos[2][1]
        m = FACE.measure_Y()
        cx = yx + m["cx"]
        # inner edge of the left arm from two scanlines
        y1, y2 = H * 0.96, H * 0.74
        e1 = (yx + FACE.hscan("Y", y1)[1], y1)
        e2 = (yx + FACE.hscan("Y", y2)[1], y2)
        apex_y = m["y_v"]
        top_y = H
        info = dict(yx=yx)
    else:
        # rounded slingshot from the icon, scaled into the Y slot
        pos, _ = word(mk, FACE, "SL", "#000")
        lb = FACE.bounds("L")
        bx0, by0, bx1, by1 = slingy.BARE_BOX
        s = ROUND_K * H / (by1 - by0)
        gl, gr = slingy.GAPS["unbounded"]
        tx = pos[1][1] + lb[2] + gl * H - bx0 * s
        ty = H / 2 - ((by0 + by1) / 2) * s
        Yi = d.Y
        to_w = lambda p: (tx + p[0] * s, ty + (p[1] + d.BASE) * s)
        cx = tx + d.CX * s
        ya, yb = Yi.Hc * 0.92, Yi.Hc * 0.70
        e1 = to_w((Yi.x_in(ya), ya))
        e2 = to_w((Yi.x_in(yb), yb))
        g = Yi.geometry()
        apex_y = to_w((0, g["y_v"]))[1]
        top_y = to_w((0, Yi.Hc))[1]
        info = dict(tx=tx, ty=ty, s=s, x_n=tx + bx1 * s + gr * H)
    delta = KW + BW / 2
    o_top, (ux, uy) = _offset_line(e1, e2, delta)
    # where the offset line crosses the axis = pouch apex at rest
    t_axis = (cx - o_top[0]) / ux
    apex = (cx, o_top[1] + uy * t_axis)
    # top end of the band: on the offset line, just under the top of the arm
    y_top_end = top_y - BW / 2 - KW - (0 if style == "font" else 0)
    t_top = (y_top_end - o_top[1]) / uy
    Lp = (o_top[0] + ux * t_top, y_top_end)
    Rp = (2 * cx - Lp[0], Lp[1])
    # font Y has a sharp crotch: seat the stone low enough that its outline
    # covers the tip of the V; the rounded slingshot's U cradles it higher
    stone_lift = 0.08 * R_STONE if style == "font" else 0.6 * R_STONE
    return dict(style=style, cx=cx, L=Lp, R=Rp, apex=apex, apex_y=apex_y, top_y=top_y,
                stone_lift=stone_lift, unit=(top_y - 0) / 0.70 if style == "font" else (H * ROUND_K) / 0.70,
                **info)


GEOM = {s: sling_geom(s) for s in ("font", "round")}


def draw(style="font", tone="dark", pouch=None, stone=None, stone_scale=1.0, bg=False):
    """The whole wordmark at one moment. pouch: band apex; stone: stone centre
    (None = resting in the pouch, False = none)."""
    g = GEOM[style]
    c = TONES[tone]
    pouch = g["apex"] if pouch is None else pouch
    if stone is None:
        stone = (pouch[0], pouch[1] + g["stone_lift"])
    mk = Mark()
    if style == "font":
        word(mk, FACE, "SLYNG", c["letters"], kern=KERN)
    else:
        word(mk, FACE, "SL", c["letters"])
        frame = f'<path transform="translate({f(g["tx"])} {f(g["ty"])}) scale({g["s"]:.5f}) translate(0 {f(d.BASE)})" d="{d.Y.path()}" fill="{c["letters"]}"/>'
        bx0, by0, bx1, by1 = slingy.BARE_BOX
        s = g["s"]
        mk.add(frame, (g["tx"] + bx0 * s, g["ty"] + by0 * s, g["tx"] + bx1 * s, g["ty"] + by1 * s))
        nb = FACE.bounds("N")
        word(mk, FACE, "NG", c["letters"], x0=g["x_n"] - nb[0])
    Lp, Rp = g["L"], g["R"]
    dd = f"M{f(Lp[0])} {f(Lp[1])} L{f(pouch[0])} {f(pouch[1])} L{f(Rp[0])} {f(Rp[1])}"
    mk.add(f'<path d="{dd}" fill="none" stroke="{c["knock"]}" stroke-width="{f(BW + 2 * KW)}" '
           f'stroke-linejoin="round" stroke-linecap="round"/>'
           f'<path d="{dd}" fill="none" stroke="{c["band"]}" stroke-width="{f(BW)}" '
           f'stroke-linejoin="round" stroke-linecap="round"/>')
    if stone is not False:
        r = R_STONE * stone_scale
        mk.add(f'<circle cx="{f(stone[0])}" cy="{f(stone[1])}" r="{f(r + KW)}" fill="{c["knock"]}"/>'
               f'<circle cx="{f(stone[0])}" cy="{f(stone[1])}" r="{f(r)}" fill="{c["stone"]}"/>')
    return mk


def static_box(style):
    return draw(style, "dark").box
