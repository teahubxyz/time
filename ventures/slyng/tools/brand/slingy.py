"""The icon's slingshot rebuilt as a letter: same shape language (round tips,
round handle, U crotch, ink-outlined band and stone), weights matched to the
typeface so it sits in the word as the Y."""
import math
import direction as d
from kit import INK, WHITE, VOLT, BONE, Mark, word
from sling import make_y, f

FIT = {
    # outer half-width, handle and arm weights as a fraction of the font's stem
    "unbounded": dict(outer=400, w_k=0.93, wa_k=0.84, over=0.03, gl=0.10, gr=0.12),
    "lexend": dict(outer=356, w_k=0.93, wa_k=0.84, over=0.03, gl=0.12, gr=0.15),
}
TONES = {
    "dark": dict(letters=WHITE, frame=WHITE, band=VOLT, stone=VOLT, knock=INK),
    "light": dict(letters=INK, frame=INK, band=INK, stone=INK, knock=BONE),
    "volt": dict(letters=INK, frame=INK, band=INK, stone=INK, knock=VOLT),
}


class SlingLetter:
    def __init__(self, kind, cx, outer=None):
        p = FIT[kind]
        face = d.WORDMARKS[kind]["face"]
        H, stem = face.cap, face.stem("L")[0]
        over = p["over"] * H
        self.top, self.base = H + over, -over
        hf = self.top - self.base
        self.hf = hf
        self.cx = cx
        outer = outer or p["outer"]
        self.Y = make_y(cx, self.top, stem * p["w_k"], stem * p["wa_k"], outer, self.base + 0.40 * hf,
                        base=self.base, r_u=0.107 * hf, r_o=0.057 * hf, tips="round", bottom="round")
        self.L, self.R = self.Y.anchors()
        self.ub = self.Y.geometry()["u_bottom"]
        self.r_stone = 0.093 * hf
        self.band_w = 0.064 * hf
        self.kw = 0.023 * hf
        self.p_rest = (cx, self.ub + self.r_stone + 0.029 * hf)
        self.tip_y = self.L[1]
        self.outer = outer

    def box(self):
        return (self.cx - self.outer, self.base, self.cx + self.outer, self.top)

    def draw(self, tone="dark", pouch=None, stone=None, stone_scale=1.0, extra_stone=None, **_):
        c = TONES[tone]
        pouch = self.p_rest if pouch is None else pouch
        if stone is None:
            stone = pouch
        frame = f'<path d="{self.Y.path()}" fill="{c["frame"]}"/>'
        dd = f"M{f(self.L[0])} {f(self.L[1])} L{f(pouch[0])} {f(pouch[1])} L{f(self.R[0])} {f(self.R[1])}"
        band = (f'<path d="{dd}" fill="none" stroke="{c["knock"]}" stroke-width="{f(self.band_w + 2 * self.kw)}" '
                f'stroke-linejoin="round" stroke-linecap="round"/>'
                f'<path d="{dd}" fill="none" stroke="{c["band"]}" stroke-width="{f(self.band_w)}" '
                f'stroke-linejoin="round" stroke-linecap="round"/>')

        def st(x, y, sc):
            r = self.r_stone * sc
            return (f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r + self.kw)}" fill="{c["knock"]}"/>'
                    f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{c["stone"]}"/>')

        s = frame + band
        if stone is not False:
            s += st(stone[0], stone[1], stone_scale)
        if extra_stone:
            s += st(*extra_stone)
        return s


def wordmark(kind="unbounded", tone="dark", outer=None, state=None):
    p = FIT[kind]
    face = d.WORDMARKS[kind]["face"]
    H = face.cap
    c = TONES[tone]
    mk = Mark()
    pos, _ = word(mk, face, "SL", c["letters"])
    lb = face.bounds("L")
    outer = outer or p["outer"]
    cx = pos[1][1] + lb[2] + p["gl"] * H + outer
    sl = SlingLetter(kind, cx, outer)
    mk.add(sl.draw(tone, **(state or {})), sl.box())
    nb = face.bounds("N")
    word(mk, face, "NG", c["letters"], x0=cx + outer + p["gr"] * H - nb[0])
    return mk, sl


# ---------------------------------------------------------------- the exact clean slingshot as the Y
BARE = {
    "dark": dict(letters=WHITE, frame=WHITE, band=VOLT, stone=VOLT, knock=INK),
    "light-volt": dict(letters=INK, frame=INK, band=VOLT, stone=VOLT, knock=INK),
    "light-mono": dict(letters=INK, frame=INK, band=INK, stone=INK, knock=BONE),
}
GAPS = {"unbounded": (0.10, 0.12), "lexend": (0.11, 0.14)}


def bare_draw(tone="dark", pouch=None, stone=None, stone_scale=1.0, extra_stone=None, **_):
    """The icon's slingshot without its square, in icon units (0..1024, y up)."""
    c = BARE[tone]
    kw = d.S * 0.016
    pouch = d.P_REST if pouch is None else pouch
    if stone is None:
        stone = pouch
    frame = f'<path transform="translate(0 {f(d.BASE)})" d="{d.Y.path()}" fill="{c["frame"]}"/>'
    dd = f"M{f(d.L[0])} {f(d.L[1])} L{f(pouch[0])} {f(pouch[1])} L{f(d.R[0])} {f(d.R[1])}"
    s = (frame +
         f'<path d="{dd}" fill="none" stroke="{c["knock"]}" stroke-width="{f(d.BAND_W + 2 * kw)}" '
         f'stroke-linejoin="round" stroke-linecap="round"/>'
         f'<path d="{dd}" fill="none" stroke="{c["band"]}" stroke-width="{f(d.BAND_W)}" '
         f'stroke-linejoin="round" stroke-linecap="round"/>')

    def st(x, y, sc):
        r = d.R_STONE * sc
        return (f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r + kw)}" fill="{c["knock"]}"/>'
                f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{c["stone"]}"/>')

    if stone is not False:
        s += st(stone[0], stone[1], stone_scale)
    if extra_stone:
        s += st(*extra_stone)
    return s


BARE_BOX = (d.CX - d.S * 0.30, d.BASE, d.CX + d.S * 0.30, d.BASE + d.H_FRAME)


def bare_wordmark(kind="unbounded", tone="dark", k=1.12, state=None):
    face = d.WORDMARKS[kind]["face"]
    H = face.cap
    c = BARE[tone]
    gl, gr = GAPS[kind]
    mk = Mark()
    pos, _ = word(mk, face, "SL", c["letters"])
    lb = face.bounds("L")
    bx0, by0, bx1, by1 = BARE_BOX
    s = k * H / (by1 - by0)
    tx = pos[1][1] + lb[2] + gl * H - bx0 * s
    ty = H / 2 - ((by0 + by1) / 2) * s
    mk.add(f'<g transform="translate({f(tx)} {f(ty)}) scale({s:.5f})">{bare_draw(tone, **(state or {}))}</g>',
           (tx + bx0 * s, ty + by0 * s, tx + bx1 * s, ty + by1 * s))
    nb = face.bounds("N")
    word(mk, face, "NG", c["letters"], x0=tx + bx1 * s + gr * H - nb[0])
    return mk
