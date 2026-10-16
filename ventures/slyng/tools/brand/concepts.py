"""The SLYNG logo concepts. Each cN() returns a Mark (font units, y up)."""
import math
from kit import *
from sling import make_y, P, f

LEX = Face("Lexend.ttf", wght=800)
ARW = Face("Archivo.ttf", wght=900, wdth=125)
FRED = Face("Fredoka.ttf", wght=600, wdth=100)
SORA = Face("Sora.ttf", wght=800)
SORA_L = Face("Sora.ttf", wght=400)
UNB = Face("Unbounded.ttf", wght=800)
BSD = Face("BigShouldersDisplay.ttf", wght=900)
BSD8 = Face("BigShouldersDisplay.ttf", wght=800)


# ---------------------------------------------------------------- 1 Loaded
def c1(ink=INK, red=RED, ground=BONE):
    face = LEX
    H, stem = face.cap, face.stem("L")[0]
    outer = 396
    mk = Mark()
    pos, _ = word(mk, face, "SLYNG", ink, slot="Y", slot_adv=2 * outer + 34,
                  kern={"LY": -4, "YN": 22})
    cx = pos[2][1] + outer + 17
    Y = make_y(cx, H, stem * 0.93, stem * 0.82, outer, H * 0.30, r_u=70, r_o=34, tips="round")
    mk.add(ypath(Y, ink), y_box(Y))
    L, R = Y.anchors()
    ub = Y.geometry()["u_bottom"]
    Pt = (cx, ub + 64 + 20)
    mk.add(band(L, Pt, R, 44, red))
    mk.add(dot(Pt, 64, red))
    return mk


# ---------------------------------------------------------------- 2 Full draw
def c2(ink=INK, band_c=WHITE, ground=RED):
    face = ARW
    H, stem = face.cap, face.stem("L")[0]
    outer = 430
    mk = Mark()
    pos, _ = word(mk, face, "SLYNG", ink, slot="Y", slot_adv=2 * outer + 36, kern={"LY": -30})
    cx = pos[2][1] + outer + 18
    Y = make_y(cx, H, stem * 0.92, stem * 0.82, outer, H * 0.40, r_u=70, r_o=40, tips="round")
    L, R = Y.anchors()
    Pt = (cx, H * -0.5)
    # the band runs behind the frame: drawn first
    mk.add(band(L, Pt, R, 40, band_c) + dot(Pt, 62, band_c))
    mk.add(ypath(Y, ink), y_box(Y))
    mk.grow(cx - 100, Pt[1] - 62, cx + 100, H)
    return mk


# ---------------------------------------------------------------- 3 Pocket (lowercase)
def c3(ink=INK, red=RED, ground=PERI):
    face = FRED
    xh = face.xh
    stem = face.hscan("l", xh * 0.5)
    stem = stem[1] - stem[0]
    outer = 290
    mk = Mark()
    pos, _ = word(mk, face, "slyng", ink, slot="y", slot_adv=2 * outer + 24,
                  kern={"ly": 26, "yn": 14})
    cx = pos[2][1] + outer + 12
    Y = make_y(cx, xh, stem * 1.0, stem * 0.92, outer, xh * 0.06, base=-232,
               r_u=58, r_o=40, tips="round", bottom="round", tip_over=6)
    mk.add(ypath(Y, ink), y_box(Y))
    L, R = Y.anchors()
    ub = Y.geometry()["u_bottom"]
    Pt = (cx, ub + 46 + 16)
    mk.add(band(L, Pt, R, 34, red))
    mk.add(dot(Pt, 46, red))
    return mk


# ---------------------------------------------------------------- 4 Landing dot
def c4(suffix="app", ink=INK, red=RED, ground=WHITE, trail=True):
    face = SORA
    H, stem = face.cap, face.stem("L")[0]
    outer = 352
    mk = Mark()
    pos, x = word(mk, face, "SLYNG", ink, slot="Y", slot_adv=2 * outer + 30,
                  kern={"LY": -6, "YN": 20})
    cx = pos[2][1] + outer + 15
    Y = make_y(cx, H, stem * 0.93, stem * 0.84, outer, H * 0.30, r_u=62, r_o=30, tips="round")
    mk.add(ypath(Y, ink), y_box(Y))
    L, R = Y.anchors()
    # released band: straight across the tips, the pouch is empty
    mk.add(f'<path d="M{f(L[0])} {f(L[1])} L{f(R[0])} {f(R[1])}" fill="none" stroke="{red}" '
           f'stroke-width="40" stroke-linecap="round"/>')
    # the landed stone = the domain dot
    rd = stem * 0.56
    dx = x + 40 + rd
    D = (dx, rd)
    mk.add(dot(D, rd, red))
    mk.grow(dx - rd, 0, dx + rd, 2 * rd)
    sx = dx + rd + 36
    word(mk, SORA_L, suffix, ink, x0=sx)
    if trail:
        S0 = (cx, H + 70)
        C1 = (cx + 0.30 * (D[0] - cx), H * 2.05)
        C2 = (D[0] + 24, H * 1.95)
        pts = []
        n = 80
        for i in range(n + 1):
            t = i / n * 0.9
            mt = 1 - t
            bx = mt ** 3 * S0[0] + 3 * mt * mt * t * C1[0] + 3 * mt * t * t * C2[0] + t ** 3 * D[0]
            by = mt ** 3 * S0[1] + 3 * mt * mt * t * C1[1] + 3 * mt * t * t * C2[1] + t ** 3 * D[1]
            pts.append((bx, by))
        d = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts)
        mk.add(f'<path d="{d}" fill="none" stroke="{red}" stroke-width="26" stroke-linecap="round" '
               f'stroke-dasharray="0 64"/>')
        for a, b in pts:
            mk.grow(a - 13, b - 13, a + 13, b + 13)
    return mk


# ---------------------------------------------------------------- 5 App icon
def squircle(cx, cy, r, n=5.0, k=240):
    pts = []
    for i in range(k):
        t = 2 * math.pi * i / k
        c, s = math.cos(t), math.sin(t)
        x = cx + r * math.copysign(abs(c) ** (2 / n), c)
        y = cy + r * math.copysign(abs(s) ** (2 / n), s)
        pts.append(f"{f(x)} {f(y)}")
    return "M" + " L".join(pts) + " Z"


def icon_mark(frame=WHITE, red=RED, ground=INK, size=1024, band_c=None):
    band_c = band_c or red
    mk = Mark()
    s = size
    mk.add(f'<path d="{squircle(s / 2, s / 2, s / 2)}" fill="{ground}"/>', (0, 0, s, s))
    H = s * 0.70
    base = s * 0.14
    cx = s / 2
    Y = make_y(cx, H, s * 0.15, s * 0.14, s * 0.30, H * 0.40, base=0,
               r_u=s * 0.075, r_o=s * 0.04, tips="round", bottom="round")
    g = f'<g transform="translate(0 {f(base)})">'
    g += ypath(Y, frame)
    L, R = Y.anchors()
    ub = Y.geometry()["u_bottom"]
    Pt = (cx, ub + s * 0.065 + s * 0.02)
    g += band(L, Pt, R, s * 0.045, band_c)
    g += dot(Pt, s * 0.065, band_c)
    g += "</g>"
    mk.add(g)
    return mk


# ---------------------------------------------------------------- 6 Price sticker
def hanging_tag(cx, top, w, h, fill, hole_fill, string=None, sw=0):
    """A price tag hanging point-up from (cx, top): the hole sits just under the point."""
    p = w / 2
    tip = w * 0.62
    pts = [(cx, top), (cx + p, top - tip), (cx + p, top - h), (cx - p, top - h), (cx - p, top - tip)]
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"
    r = w * 0.13
    return (f'<path d="{d}" fill="{fill}" stroke="{fill}" stroke-width="{f(w * 0.16)}" stroke-linejoin="round"/>'
            f'<circle cx="{f(cx)}" cy="{f(top - tip * 0.62)}" r="{f(r)}" fill="{hole_fill}"/>')


def star4(cx, cy, r, fill):
    k = 0.3
    pts = []
    for i in range(8):
        a = math.pi / 2 + i * math.pi / 4
        rr = r if i % 2 == 0 else r * k
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return '<path d="M' + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + f' Z" fill="{fill}"/>'


def arc_text(face, text, R, scale, fill, where="top", track=0):
    """Upright text along the top (clockwise, baseline radius R) or the bottom
    (counter-clockwise, baseline radius R, letters pointing inward) of a circle."""
    advs = [(face.adv(ch) + track) * scale for ch in text]
    total = sum(advs) - track * scale
    out = []
    if where == "top":
        th = math.pi / 2 + (total / R) / 2
        for ch, adv in zip(text, advs):
            gw = face.adv(ch) * scale
            mid = th - (gw / 2) / R
            c, s_ = math.cos(mid), math.sin(mid)
            tx, ty = s_, -c
            e = (R * c - (gw / 2) * tx, R * s_ - (gw / 2) * ty)
            out.append(f'<path transform="matrix({s_ * scale:.5f} {-c * scale:.5f} {c * scale:.5f} '
                       f'{s_ * scale:.5f} {e[0]:.1f} {e[1]:.1f})" d="{face.path(ch)}" fill="{fill}"/>')
            th -= adv / R
    else:
        th = 1.5 * math.pi - (total / R) / 2
        for ch, adv in zip(text, advs):
            gw = face.adv(ch) * scale
            mid = th + (gw / 2) / R
            c, s_ = math.cos(mid), math.sin(mid)
            tx, ty = -s_, c
            e = (R * c - (gw / 2) * tx, R * s_ - (gw / 2) * ty)
            out.append(f'<path transform="matrix({-s_ * scale:.5f} {c * scale:.5f} {-c * scale:.5f} '
                       f'{-s_ * scale:.5f} {e[0]:.1f} {e[1]:.1f})" d="{face.path(ch)}" fill="{fill}"/>')
            th += adv / R
    return "".join(out), total / R


def c6(ink=INK, sticker=DAYGLO, ground=CONCRETE, rot=-8):
    face = BSD
    H, stem = face.cap, face.stem("L")[0]
    Rs = 2700
    outer = 640
    wordmk = Mark()
    pos, x = word(wordmk, face, "SLYNG", ink, slot="Y", slot_adv=2 * outer + 40,
                  kern={"LY": -60, "YN": 10})
    cx = pos[2][1] + outer + 20
    Y = make_y(cx, H, stem * 0.9, stem * 0.76, outer, H * 0.34, r_u=130, r_o=50, tips="round")
    wordmk.add(ypath(Y, ink), y_box(Y))
    L, R = Y.anchors()
    ub = Y.geometry()["u_bottom"]
    knot = (cx, ub + 560)
    wordmk.add(band(L, knot, R, 66, ink))
    wordmk.add(hanging_tag(cx, knot[1] + 20, 300, 500, ink, sticker))
    wb = wordmk.box
    ww = wb[2] - wb[0]
    sc = (Rs * 1.30) / ww
    tx = -(wb[0] + ww / 2) * sc
    ty = -(H / 2) * sc
    ring_out, ring_in = Rs - 120, Rs - 700
    cap_s = 0.24
    capu = BSD8.cap * cap_s
    mid_r = (ring_out + ring_in) / 2
    body = f'<circle cx="0" cy="0" r="{Rs}" fill="{sticker}"/>'
    body += f'<circle cx="0" cy="0" r="{ring_out}" fill="none" stroke="{ink}" stroke-width="36"/>'
    body += f'<circle cx="0" cy="0" r="{ring_in}" fill="none" stroke="{ink}" stroke-width="22"/>'
    body += f'<g transform="translate({f(tx)} {f(ty)}) scale({sc:.5f})">{"".join(wordmk.parts)}</g>'
    top, _ = arc_text(BSD8, "LOCAL GOODS", mid_r - capu / 2, cap_s, ink, "top", track=90)
    bot, _ = arc_text(BSD8, "DIGITAL GOODS", mid_r + capu / 2, cap_s, ink, "bottom", track=90)
    body += top + bot
    body += star4(-mid_r, 0, 110, ink) + star4(mid_r, 0, 110, ink)
    shadow = f'<circle cx="46" cy="-80" r="{Rs}" fill="#000" opacity="0.14"/>'
    mk = Mark()
    mk.add(f'<g transform="rotate({-rot})">{shadow}{body}</g>', (-Rs - 80, -Rs - 130, Rs + 130, Rs + 40))
    return mk


# ---------------------------------------------------------------- 7 Monoline
def c7(line=WHITE, accent=VOLT, ground=COBALT, construct=True):
    H = 700
    t = 62
    lo, hi = t / 2, H - t / 2
    gap = 74
    mk = Mark()
    strokes = []
    guides = []
    st = lambda d, w=t, c=line: (f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{f(w)}" '
                                 f'stroke-linecap="round" stroke-linejoin="round"/>')
    x = 0
    # S: two stacked circles, the lower one slightly larger
    rr = (H - t) / 2
    r1 = rr * 0.48
    r2 = rr - r1
    cxs = x + r2 + t / 2
    yU, yL = hi - r1, lo + r2
    sweep = math.radians(236)
    a_top = math.pi * 1.5 - sweep
    p = P()
    p.M((cxs + r1 * math.cos(a_top), yU + r1 * math.sin(a_top)))
    p.arc((cxs, yU), r1, a_top, 1.5 * math.pi)
    p.arc((cxs, yL), r2, math.pi / 2, math.pi / 2 - sweep)
    strokes.append(st(p.s()))
    guides += [(cxs, yU, r1), (cxs, yL, r2)]
    x = cxs + r2 + t / 2 + gap
    # L
    xl = x + t / 2
    wl = 290
    strokes.append(st(f"M{f(xl)} {f(hi)} L{f(xl)} {f(lo)} L{f(xl + wl)} {f(lo)}"))
    x = xl + wl + t / 2 + gap * 0.55
    # Y slingshot: straight arms tangent to a U, then the handle
    a = 245
    cxy = x + a + t / 2
    rU = 116
    yu_c = 336
    tip = (cxy - a, hi)
    dxv, dyv = tip[0] - cxy, tip[1] - yu_c
    dist = math.hypot(dxv, dyv)
    tang_ang = math.atan2(dyv, dxv) + math.acos(rU / dist)
    TLp = (cxy + rU * math.cos(tang_ang), yu_c + rU * math.sin(tang_ang))
    p = P().M(tip).L(TLp)
    a0, a1 = tang_ang, math.pi - tang_ang
    while a1 < a0:
        a1 += 2 * math.pi
    p.arc((cxy, yu_c), rU, a0, a1)
    p.L((2 * cxy - tip[0], hi))
    strokes.append(st(p.s()))
    ubot = yu_c - rU
    strokes.append(st(f"M{f(cxy)} {f(ubot)} L{f(cxy)} {f(lo)}"))
    guides += [(cxy, yu_c, rU)]
    Pt = (cxy, yu_c + 30)
    band_s = st(f"M{f(tip[0])} {f(hi)} L{f(Pt[0])} {f(Pt[1])} L{f(2 * cxy - tip[0])} {f(hi)}", w=t * 0.36, c=accent)
    stone = f'<circle cx="{f(Pt[0])}" cy="{f(Pt[1])}" r="{f(t * 0.78)}" fill="{accent}"/>'
    x = cxy + a + t / 2 + gap * 0.55
    # N
    xn = x + t / 2
    wn = 400
    strokes.append(st(f"M{f(xn)} {f(lo)} L{f(xn)} {f(hi)} L{f(xn + wn)} {f(lo)} L{f(xn + wn)} {f(hi)}"))
    x = xn + wn + t / 2 + gap
    # G: open circle with a bar at the centre line
    rg = (H - t) / 2
    cg = (x + rg + t / 2, H / 2)
    p = P()
    g0 = math.radians(44)
    p.M((cg[0] + rg * math.cos(g0), cg[1] + rg * math.sin(g0)))
    p.arc(cg, rg, g0, 2 * math.pi)
    p.L((cg[0] + rg * 0.30, cg[1]))
    strokes.append(st(p.s()))
    guides += [(cg[0], cg[1], rg)]
    x_end = cg[0] + rg + t / 2
    if construct:
        gl = []
        for gx, gy, gr in guides:
            gl.append(f'<circle cx="{f(gx)}" cy="{f(gy)}" r="{f(gr)}" fill="none" stroke="{line}" '
                      f'stroke-width="3" opacity="0.34"/>')
            gl.append(f'<circle cx="{f(gx)}" cy="{f(gy)}" r="8" fill="{line}" opacity="0.5"/>')
        for gy in (lo, hi, H / 2):
            gl.append(f'<line x1="-140" y1="{f(gy)}" x2="{f(x_end + 140)}" y2="{f(gy)}" stroke="{line}" '
                      f'stroke-width="3" opacity="0.22"/>')
        # the band's geometry: tip-to-stone lines extended
        mk.add("".join(gl))
    mk.add("".join(strokes) + band_s + stone, (0, 0, x_end, H))
    return mk


# ---------------------------------------------------------------- 8 Zap
def bolt(cx, cy, h, fill, knock=None, kw=0):
    w = h * 0.58
    pts = [(0.16, 0.5), (-0.5, -0.06), (-0.04, -0.06), (-0.2, -0.5), (0.5, 0.1), (0.04, 0.1)]
    pts = [(cx + px * w, cy + py * h) for px, py in pts]
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"
    s = ""
    if knock:
        s += (f'<path d="{d}" fill="{knock}" stroke="{knock}" stroke-width="{f(2 * kw + h * 0.05)}" '
              f'stroke-linejoin="round"/>')
    return s + (f'<path d="{d}" fill="{fill}" stroke="{fill}" stroke-width="{f(h * 0.05)}" '
                f'stroke-linejoin="round"/>')


def c8(ink=WHITE, volt=VOLT, ground=INK):
    face = UNB
    H, stem = face.cap, face.stem("L")[0]
    outer = 470
    mk = Mark()
    pos, _ = word(mk, face, "SLYNG", ink, slot="Y", slot_adv=2 * outer + 36,
                  kern={"LY": -40, "YN": 14})
    cx = pos[2][1] + outer + 18
    Y = make_y(cx, H, stem * 0.92, stem * 0.82, outer, H * 0.30, r_u=90, r_o=40, tips="round")
    mk.add(ypath(Y, ink), y_box(Y))
    L, R = Y.anchors()
    ub = Y.geometry()["u_bottom"]
    Pt = (cx, ub + 150)
    mk.add(band(L, Pt, R, 42, volt))
    mk.add(bolt(Pt[0], Pt[1] + 22, 236, volt, knock=ground, kw=16))
    return mk
