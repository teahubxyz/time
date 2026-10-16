"""Chosen direction: the concept-5 app icon in concept 8's palette (ink, white, volt).

The icon is drawn in a 1024 box (y up). `icon_svg(state)` renders any moment of
the pull-and-release, so the static icon, the storyboard and the animation all
come from one geometry."""
import math
from kit import INK, WHITE, VOLT, BONE, Mark
from concepts import squircle, LEX, UNB, c1, c8
from sling import make_y, f

S = 1024
CX = S / 2
H_FRAME = S * 0.70
BASE = S * 0.14
R_STONE = S * 0.065
BAND_W = S * 0.045

Y = make_y(CX, H_FRAME, S * 0.15, S * 0.14, S * 0.30, H_FRAME * 0.40, base=0,
           r_u=S * 0.075, r_o=S * 0.04, tips="round", bottom="round")
_L, _R = Y.anchors()
L = (_L[0], _L[1] + BASE)
R = (_R[0], _R[1] + BASE)
UB = Y.geometry()["u_bottom"] + BASE           # top of the U, icon coords
P_REST = (CX, UB + R_STONE + S * 0.02)         # pouch when loaded
P_DRAWN = (CX, UB - S * 0.17)                  # pouch at full draw
TIP_Y = L[1]                                   # straight band height


PALETTES = {
    "zap": dict(ground=INK, frame=WHITE, band=VOLT, stone=VOLT, knock=INK),
    "volt": dict(ground=VOLT, frame=INK, band=INK, stone=INK, knock=VOLT),
}


def icon_svg(pouch=None, stone=None, stone_scale=1.0, palette="zap", knock=True,
             band_behind=False, size=None, label="SLYNG app icon", extra_stone=None):
    """pouch: band apex (None = loaded rest). stone: stone centre (None = in the
    pouch; False = no stone). extra_stone: (x, y, scale) for a second stone
    (the reload)."""
    c = PALETTES[palette]
    pouch = P_REST if pouch is None else pouch
    if stone is None:
        stone = pouch
    kw = S * 0.016 if knock else 0
    sq = squircle(S / 2, S / 2, S / 2)
    frame = f'<path transform="translate(0 {f(BASE)})" d="{Y.path()}" fill="{c["frame"]}"/>'
    d = f"M{f(L[0])} {f(L[1])} L{f(pouch[0])} {f(pouch[1])} L{f(R[0])} {f(R[1])}"
    band = ""
    if knock and not band_behind:
        band += (f'<path d="{d}" fill="none" stroke="{c["knock"]}" stroke-width="{f(BAND_W + 2 * kw)}" '
                 f'stroke-linejoin="round" stroke-linecap="round"/>')
    band += (f'<path d="{d}" fill="none" stroke="{c["band"]}" stroke-width="{f(BAND_W)}" '
             f'stroke-linejoin="round" stroke-linecap="round"/>')

    def stone_el(x, y, sc):
        r = R_STONE * sc
        s = ""
        if knock:
            s += f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r + kw)}" fill="{c["knock"]}"/>'
        return s + f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{c["stone"]}"/>'

    stones = ""
    if stone is not False:
        stones += stone_el(stone[0], stone[1], stone_scale)
    if extra_stone:
        stones += stone_el(*extra_stone)
    art = (band + frame) if band_behind else (frame + band)
    body = (f'<defs><clipPath id="sq"><path d="{sq}"/></clipPath></defs>'
            f'<path d="{sq}" fill="{c["ground"]}"/>'
            f'<g clip-path="url(#sq)">{art}{stones}</g>')
    size_attr = f' width="{size}" height="{size}"' if size else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {-S} {S} {S}"{size_attr} role="img" '
            f'aria-label="{label}"><g transform="scale(1 -1)">{body}</g></svg>')


def icon_mark_z(palette="zap", knock=True, band_behind=False):
    """The static icon as a Mark (for lockups)."""
    svg = icon_svg(palette=palette, knock=knock, band_behind=band_behind)
    inner = svg[svg.index('<g transform="scale(1 -1)">') + len('<g transform="scale(1 -1)">'):-len("</g></svg>")]
    # clip ids must be unique per document; rename for embedding
    inner = inner.replace('id="sq"', f'id="sq-{palette}"').replace("url(#sq)", f"url(#sq-{palette})")
    mk = Mark()
    mk.add(inner, (0, 0, S, S))
    return mk


# ---------------------------------------------------------------- wordmarks for lockups
from kit import word, ypath, y_box, band as band_fn, dot as dot_fn, glyph

WORDMARKS = {
    # face, outer half-width of the slingshot Y, kerning, handle/arm weights, crotch height, fillets
    "lexend": dict(face=LEX, outer=396, kern={"LY": -4, "YN": 22}, w_k=0.93, wa_k=0.82, yj=0.30, r_u=70, r_o=34,
                   bw=44, r_dot=64, lift=20),
    "unbounded": dict(face=UNB, outer=470, kern={"LY": -40, "YN": 14}, w_k=0.92, wa_k=0.82, yj=0.30, r_u=90,
                      r_o=40, bw=46, r_dot=70, lift=30),
}


def wordmark_z(kind="lexend", mode="full", ink=WHITE, band_c=VOLT, knock=INK, kw=16):
    """mode: full = slingshot Y with band and stone, frame = slingshot Y only,
    plain = the typeface's own Y."""
    p = WORDMARKS[kind]
    face = p["face"]
    H, stem = face.cap, face.stem("L")[0]
    mk = Mark()
    if mode == "plain":
        word(mk, face, "SLYNG", ink, kern={"LY": -40 if kind == "unbounded" else -30})
        return mk
    outer = p["outer"]
    pos, _ = word(mk, face, "SLYNG", ink, slot="Y", slot_adv=2 * outer + 34, kern=p["kern"])
    cx = pos[2][1] + outer + 17
    Yw = make_y(cx, H, stem * p["w_k"], stem * p["wa_k"], outer, H * p["yj"], r_u=p["r_u"], r_o=p["r_o"],
                tips="round")
    mk.add(ypath(Yw, ink), y_box(Yw))
    if mode == "full":
        Lw, Rw = Yw.anchors()
        ub = Yw.geometry()["u_bottom"]
        Pt = (cx, ub + p["r_dot"] + p["lift"])
        mk.add(band_fn(Lw, Pt, Rw, p["bw"], band_c, knock=knock, kw=kw))
        mk.add(dot_fn(Pt, p["r_dot"], band_c, knock=knock, kw=kw))
    return mk


def lockup_z(kind="lexend", mode="full", palette="zap", ink=WHITE, band_c=VOLT, knock=INK):
    wm = wordmark_z(kind, mode, ink, band_c, knock)
    H = WORDMARKS[kind]["face"].cap
    ic = icon_mark_z(palette)
    s = 1.3 * H / S
    gap = 0.33 * H
    x0 = wm.box[0] - (S * s + gap)
    y0 = H / 2 - (S / 2) * s
    mk = Mark()
    mk.add(f'<g transform="translate({f(x0)} {f(y0)}) scale({s:.5f})">{"".join(ic.parts)}</g>',
           (x0, y0, x0 + S * s, y0 + S * s))
    mk.parts += wm.parts
    mk.grow(*wm.box)
    return mk


def mark_bare(palette="zap"):
    """The slingshot without its squircle (what the icon reads as on an ink ground)."""
    c = PALETTES[palette]
    kw = S * 0.016
    frame = f'<path transform="translate(0 {f(BASE)})" d="{Y.path()}" fill="{c["frame"]}"/>'
    P = P_REST
    dd = f"M{f(L[0])} {f(L[1])} L{f(P[0])} {f(P[1])} L{f(R[0])} {f(R[1])}"
    band = (f'<path d="{dd}" fill="none" stroke="{c["knock"]}" stroke-width="{f(BAND_W + 2 * kw)}" '
            f'stroke-linejoin="round" stroke-linecap="round"/>'
            f'<path d="{dd}" fill="none" stroke="{c["band"]}" stroke-width="{f(BAND_W)}" '
            f'stroke-linejoin="round" stroke-linecap="round"/>')
    stone = (f'<circle cx="{f(P[0])}" cy="{f(P[1])}" r="{f(R_STONE + kw)}" fill="{c["knock"]}"/>'
             f'<circle cx="{f(P[0])}" cy="{f(P[1])}" r="{f(R_STONE)}" fill="{c["stone"]}"/>')
    mk = Mark()
    half = S * 0.30
    mk.add(frame + band + stone, (CX - half, BASE, CX + half, BASE + H_FRAME))
    return mk


def lockup_dark(kind="lexend"):
    """Ink-ground lockup: the bare slingshot sized to the wordmark, white type."""
    wm = wordmark_z(kind, "frame", ink=WHITE)
    H = WORDMARKS[kind]["face"].cap
    bm = mark_bare()
    s = 1.24 * H / H_FRAME
    gap = 0.42 * H
    bx0, by0, bx1, by1 = bm.box
    x_right = wm.box[0] - gap
    tx = x_right - bx1 * s
    ty = (H / 2) - ((by0 + by1) / 2) * s
    mk = Mark()
    mk.add(f'<g transform="translate({f(tx)} {f(ty)}) scale({s:.5f})">{"".join(bm.parts)}</g>',
           (tx + bx0 * s, ty + by0 * s, tx + bx1 * s, ty + by1 * s))
    mk.parts += wm.parts
    mk.grow(*wm.box)
    return mk


def icon_inner(palette="zap", uid="i", **state):
    """The icon's drawing (y up, 0..S) for nesting inside another mark."""
    svg = icon_svg(palette=palette, **state)
    head = '<g transform="scale(1 -1)">'
    inner = svg[svg.index(head) + len(head):-len("</g></svg>")]
    return inner.replace('id="sq"', f'id="sq-{uid}"').replace("url(#sq)", f"url(#sq-{uid})")


GAPS = {"unbounded": (0.095, 0.115), "lexend": (0.12, 0.15)}


def wordmark_icon_y(kind="unbounded", tone="light", k=1.08, state=None, uid=None):
    """SLYNG where the Y is the app icon itself. Light: ink letters with the
    ink icon; dark: white letters with the volt icon. `state` animates the icon."""
    face = WORDMARKS[kind]["face"]
    H = face.cap
    ink = INK if tone == "light" else WHITE
    palette = "zap" if tone == "light" else "volt"
    size = H * k
    gl, gr = GAPS[kind]
    mk = Mark()
    pos, x = word(mk, face, "SL", ink)
    lb = face.bounds("L")
    x_icon = pos[1][1] + lb[2] + H * gl
    y_icon = H / 2 - size / 2
    s = size / S
    inner = icon_inner(palette, uid or f"{kind}-{tone}", **(state or {}))
    mk.add(f'<g transform="translate({f(x_icon)} {f(y_icon)}) scale({s:.5f})">{inner}</g>',
           (x_icon, y_icon, x_icon + size, y_icon + size))
    nb = face.bounds("N")
    x_n = x_icon + size + H * gr - nb[0]
    word(mk, face, "NG", ink, x0=x_n)
    return mk
