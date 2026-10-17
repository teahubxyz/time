#!/usr/bin/env python3
"""Unicorn — a new cast member in the house hand.
A gold spiral horn, pony ears, a long lavender mane with a pink streak and a matching tail, a mint top, sky trousers and
white hoof boots. The horn's sparkles and the pony ears carry the mood.

Writes ../unicorn/unicorn-sheet.svg (hero + turnaround + expressions + mark + colours), unicorn-hero.svg, unicorn-mark.svg."""
import os, sys, math, itertools
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from house import *
from gen_phly import ribbon
from gen_bunny import smooth_closed, ctxt
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "unicorn")
os.makedirs(OUT, exist_ok=True)

MANE = LAV                # lavender mane and tail
STREAK = PINK             # one pink streak through the fringe and the tail
GOLD = "#FFD95C"          # the horn
RIDGE = "#FFEA8F"         # its spiral ridges: pale-gold highlights, not a second shadow
TOP, PANTS, BOOTS = MINT, SKY, WHITE
BG = CREAM
BOOT_SH = LAV              # white has no hue of its own: its house shadow is lavender (see the blue kata, 14)
_ids = itertools.count()

def frame(x, y, w, h, flip=False):
    """head-box coordinates: X(u), Y(v) with u mirrored when flip"""
    X = (lambda u: x + (1 - u)*w) if flip else (lambda u: x + u*w)
    Y = lambda v: y + v*h
    return X, Y

def P(X, Y, u, v): return f"{X(u):.1f} {Y(v):.1f}"

def _bbox(d):
    import re
    v = [float(t) for t in re.findall(r"-?\d+(?:\.\d+)?", d)]
    xs, ys = v[0::2], v[1::2]
    return min(xs), min(ys), max(xs), max(ys)

def hair_shadow(d, uid, k=0.58):
    """the mane's one shadow: a hard-edged saturated crescent down the screen-right side of the shape (light from the
    upper left), clipped to it. k = where the terminator sits across the bounding box."""
    x0, y0, x1, y1 = _bbox(d); bw, bh = x1 - x0, y1 - y0
    sh = (f"M{x0 + bw*k:.1f} {y0 - 20:.1f} C{x0 + bw*(k + 0.2):.1f} {y0 + bh*0.35:.1f} {x0 + bw*(k + 0.06):.1f} {y0 + bh*0.75:.1f} "
          f"{x0 + bw*(k - 0.3):.1f} {y1 + 20:.1f} L{x1 + 20:.1f} {y1 + 20:.1f} L{x1 + 20:.1f} {y0 - 20:.1f} Z")
    return f'<clipPath id="{uid}"><path d="{d}"/></clipPath><g clip-path="url(#{uid})">' + flat(sh, shade(MANE), 1, "s") + "</g>"

# ---------- horn ----------
def horn(bx, by, L, W, ang, uid):
    """a spiral horn growing from (bx, by): length L, base width W, pointing `ang` degrees (90 = straight up).
    one shadow down its far side; three spiral ridges as ink-free ribbons."""
    a = math.radians(ang); ux, uy = math.cos(a), -math.sin(a); nx, ny = -uy, ux
    def Q(u, v): return (bx + ux*u + nx*v, by + uy*u + ny*v)
    def S(u, v): p = Q(u, v); return f"{p[0]:.1f} {p[1]:.1f}"
    r = W*0.17
    d = (f"M{S(-W*0.15, -W*0.5)} C{S(L*0.35, -W*0.46)} {S(L*0.72, -W*0.24)} {S(L - r*1.3, -r)} "
         f"C{S(L + r*0.35, -r*0.55)} {S(L + r*0.35, r*0.55)} {S(L - r*1.3, r)} "
         f"C{S(L*0.72, W*0.24)} {S(L*0.35, W*0.46)} {S(-W*0.15, W*0.5)} Z")
    hw = lambda u: W*0.5*(1 - 0.82*u/L)          # half-width along the horn (straight-sided approximation)
    o = [outline(d, GOLD)]
    sg = 1 if (nx + ny) > 0 else -1               # the side facing lower-right takes the shadow
    sh = f"M{S(-W*0.2, sg*W*0.08)} C{S(L*0.4, sg*W*0.12)} {S(L*0.8, sg*W*0.04)} {S(L*1.1, 0)} L{S(L*1.1, sg*W)} L{S(-W*0.2, sg*W)} Z"
    o.append(f'<clipPath id="{uid}"><path d="{d}"/></clipPath><g clip-path="url(#{uid})">{flat(sh, shade(GOLD), 1, "s")}')
    for f in (0.2, 0.4, 0.6):                      # spiral ridges: a slanted band from one edge to the other
        u0, u1 = L*f, L*(f + 0.13)
        p0, p1 = Q(u0, -hw(u0)*1.15), Q(u1, hw(u1)*1.15)
        c0, c1 = Q(u0 + (u1 - u0)*0.3, -hw(u0)*0.35), Q(u0 + (u1 - u0)*0.7, hw(u1)*0.35)
        o.append(ribbon((p0, c0, c1, p1), W*0.16, RIDGE))
    o.append("</g>")
    return "".join(o)

# ---------- pony ears ----------
def pony_ear(bx, by, L, W, ang, uid, inner=True):
    """a leaf-shaped pony ear from base centre (bx, by), pointing `ang` degrees; pink inside when it faces us."""
    a = math.radians(ang); ux, uy = math.cos(a), -math.sin(a); nx, ny = -uy, ux
    def S(u, v): return f"{bx + ux*u + nx*v:.1f} {by + uy*u + ny*v:.1f}"
    def leaf(u0, L_, W_, lift=0.0):
        r = W_*0.2
        return (f"M{S(u0, -W_*0.42)} C{S(u0 + L_*0.22, -W_*0.66)} {S(u0 + L_*0.62, -W_*0.46)} {S(u0 + L_ - r, -r)} "
                f"C{S(u0 + L_ + r*0.45, -r*0.35)} {S(u0 + L_ + r*0.45, r*0.35)} {S(u0 + L_ - r, r)} "
                f"C{S(u0 + L_*0.62, W_*0.46)} {S(u0 + L_*0.22, W_*0.66)} {S(u0, W_*0.42)} Z")
    d = leaf(-W*0.2, L + W*0.2, W)
    o = [outline(d, SKIN)]
    sg = 1 if (nx + ny) > 0 else -1
    sh = f"M{S(-W*0.4, sg*W*0.12)} C{S(L*0.4, sg*W*0.16)} {S(L*0.8, sg*W*0.05)} {S(L*1.2, 0)} L{S(L*1.2, sg*W)} L{S(-W*0.4, sg*W)} Z"
    o.append(f'<clipPath id="{uid}"><path d="{d}"/></clipPath><g clip-path="url(#{uid})">{flat(sh, shade(SKIN), 1, "s")}</g>')
    if inner:
        o.append(flat(leaf(L*0.14, L*0.6, W*0.44), PINK))
    return "".join(o)

# ear pose per view: list of (fx, fy, ang) in head-box fractions, for her right ear then her left
EARS = {"front": [(0.16, 0.02, 106), (0.84, 0.02, 74)],
        "q":     [(0.22, 0.0, 106), (0.84, 0.02, 76)],
        "qr":    [(0.16, 0.02, 104), (0.78, 0.0, 74)],
        "side":  [(0.70, 0.0, 84)],
        "sider": [(0.30, 0.0, 96)],
        "back":  [(0.84, 0.02, 74), (0.16, 0.02, 106)]}
EAR_MOOD = {"up": 0, "alert": -10, "out": 34, "droop": 98}   # extra splay outward (degrees), mirrored per side

def ears(x, y, w, h, view, uid, mood="up"):
    L, W = h*0.5, h*0.21
    o = []
    for i, (fx, fy, ang) in enumerate(EARS[view]):
        outward = 1 if ang > 90 else -1                   # ears on the left splay left (larger angle)
        a = ang + outward*(EAR_MOOD[mood] if isinstance(mood, str) else mood)   # a mood, or degrees (the rig springs it)
        o.append(pony_ear(x + w*fx, y + h*fy, L, W, a, f"{uid}e{i}", inner=view != "back"))
    return "".join(o)

def horn_at(x, y, w, h, view, uid, scale=1.0):
    L, W = h*0.8*scale, h*0.25*scale
    if view == "front": return horn(x + w*0.5, y + h*0.06, L, W, 90, uid + "h")
    if view == "q":     return horn(x + w*0.48, y + h*0.06, L, W, 96, uid + "h")
    if view == "qr":    return horn(x + w*0.52, y + h*0.06, L, W, 84, uid + "h")
    if view == "side":  return horn(x + w*0.2, y + h*0.08, L, W, 118, uid + "h")
    if view == "sider": return horn(x + w*0.8, y + h*0.08, L, W, 62, uid + "h")
    if view == "back":  return horn(x + w*0.5, y + h*0.1, L, W, 90, uid + "h")
    return ""

# ---------- the mane ----------
def mane_back(x, y, w, h, view, length=1.0):
    """the long hair behind the head (drawn first): falls to the shoulder blades (length 1) or the chin (length ~0.45)"""
    if view == "back": return ""                       # from behind, the mane is drawn over the body instead
    flip = view in ("qr", "sider")
    X, Y = frame(x, y, w, h, flip)
    bot = 0.6 + 0.85*length
    if view in ("front",):
        d = (f"M{P(X,Y,0.5,-0.14)} C{P(X,Y,1.12,-0.14)} {P(X,Y,1.22,0.3)} {P(X,Y,1.24,0.7)} "
             f"C{P(X,Y,1.26,bot-0.3)} {P(X,Y,1.34,bot-0.1)} {P(X,Y,1.18,bot)} "
             f"C{P(X,Y,1.06,bot+0.08)} {P(X,Y,0.92,bot-0.02)} {P(X,Y,0.82,bot-0.08)} "
             f"L{P(X,Y,0.18,bot-0.08)} C{P(X,Y,0.08,bot-0.02)} {P(X,Y,-0.06,bot+0.08)} {P(X,Y,-0.18,bot)} "
             f"C{P(X,Y,-0.34,bot-0.1)} {P(X,Y,-0.26,bot-0.3)} {P(X,Y,-0.24,0.7)} "
             f"C{P(X,Y,-0.22,0.3)} {P(X,Y,-0.12,-0.14)} {P(X,Y,0.5,-0.14)} Z")
    elif view in ("q", "qr"):
        d = (f"M{P(X,Y,0.45,-0.14)} C{P(X,Y,1.1,-0.16)} {P(X,Y,1.28,0.3)} {P(X,Y,1.3,0.7)} "
             f"C{P(X,Y,1.34,bot-0.3)} {P(X,Y,1.42,bot-0.12)} {P(X,Y,1.26,bot)} "
             f"C{P(X,Y,1.12,bot+0.08)} {P(X,Y,0.98,bot-0.02)} {P(X,Y,0.86,bot-0.1)} "
             f"L{P(X,Y,0.2,0.8)} C{P(X,Y,0.0,0.7)} {P(X,Y,-0.08,0.3)} {P(X,Y,0.02,0.1)} "
             f"C{P(X,Y,0.1,-0.06)} {P(X,Y,0.25,-0.14)} {P(X,Y,0.45,-0.14)} Z")
    else:   # side / sider: the mane falls down the back of the head and between the shoulders
        d = (f"M{P(X,Y,0.3,-0.12)} C{P(X,Y,0.9,-0.16)} {P(X,Y,1.2,0.2)} {P(X,Y,1.22,0.6)} "
             f"C{P(X,Y,1.26,bot-0.3)} {P(X,Y,1.36,bot-0.12)} {P(X,Y,1.2,bot)} "
             f"C{P(X,Y,1.06,bot+0.08)} {P(X,Y,0.9,bot-0.04)} {P(X,Y,0.78,bot-0.12)} "
             f"L{P(X,Y,0.5,0.6)} C{P(X,Y,0.3,0.3)} {P(X,Y,0.2,0.0)} {P(X,Y,0.3,-0.12)} Z")
    return outline(d, MANE)

def mane_front(x, y, w, h, view, uid):
    """the hair over the head: a side-swept fringe and locks framing the face to the shoulders, with one pink streak.
    on a standing figure the lock ends overlap the shoulders by ~15px (clear of the sleeve's top and inner contours)."""
    flip = view in ("qr", "sider")
    X, Y = frame(x, y, w, h, flip)
    if view == "front":
        d = (f"M{P(X,Y,-0.14,1.04)} C{P(X,Y,-0.3,0.6)} {P(X,Y,-0.22,-0.14)} {P(X,Y,0.5,-0.15)} "
             f"C{P(X,Y,1.22,-0.14)} {P(X,Y,1.3,0.6)} {P(X,Y,1.14,1.04)} "
             f"C{P(X,Y,1.08,1.12)} {P(X,Y,0.96,1.1)} {P(X,Y,0.94,1.0)} "
             f"C{P(X,Y,0.95,0.7)} {P(X,Y,0.96,0.42)} {P(X,Y,0.9,0.24)} "
             f"C{P(X,Y,0.68,0.1)} {P(X,Y,0.38,0.08)} {P(X,Y,0.2,0.2)} "
             f"C{P(X,Y,0.1,0.28)} {P(X,Y,0.07,0.36)} {P(X,Y,0.06,0.46)} "
             f"C{P(X,Y,0.05,0.66)} {P(X,Y,0.07,0.86)} {P(X,Y,0.06,1.0)} "
             f"C{P(X,Y,0.04,1.1)} {P(X,Y,-0.08,1.12)} {P(X,Y,-0.14,1.04)} Z")
        st = ((X(0.44), Y(-0.16)), (X(0.86), Y(-0.04)), (X(1.1), Y(0.3)), (X(1.06), Y(1.0)))
    elif view == "back":
        d = (f"M{P(X,Y,-0.16,1.2)} C{P(X,Y,-0.3,0.5)} {P(X,Y,-0.22,-0.14)} {P(X,Y,0.5,-0.15)} "
             f"C{P(X,Y,1.22,-0.14)} {P(X,Y,1.3,0.5)} {P(X,Y,1.16,1.2)} "
             f"C{P(X,Y,1.2,1.6)} {P(X,Y,1.06,1.86)} {P(X,Y,0.84,1.86)} "
             f"C{P(X,Y,0.7,1.86)} {P(X,Y,0.62,1.78)} {P(X,Y,0.5,1.72)} "
             f"C{P(X,Y,0.38,1.78)} {P(X,Y,0.3,1.86)} {P(X,Y,0.16,1.86)} "
             f"C{P(X,Y,-0.06,1.86)} {P(X,Y,-0.2,1.6)} {P(X,Y,-0.16,1.2)} Z")
        st = ((X(0.56), Y(-0.16)), (X(0.66), Y(0.4)), (X(0.6), Y(1.1)), (X(0.68), Y(1.9)))
    elif view in ("q", "qr"):
        d = (f"M{P(X,Y,0.04,0.26)} C{P(X,Y,-0.06,0.02)} {P(X,Y,0.1,-0.14)} {P(X,Y,0.48,-0.15)} "
             f"C{P(X,Y,1.12,-0.15)} {P(X,Y,1.32,0.4)} {P(X,Y,1.2,1.04)} "
             f"C{P(X,Y,1.14,1.12)} {P(X,Y,1.0,1.1)} {P(X,Y,0.96,1.0)} "
             f"C{P(X,Y,0.92,0.72)} {P(X,Y,0.88,0.44)} {P(X,Y,0.8,0.24)} "
             f"C{P(X,Y,0.6,0.08)} {P(X,Y,0.3,0.04)} {P(X,Y,0.16,0.12)} "
             f"C{P(X,Y,0.1,0.16)} {P(X,Y,0.06,0.2)} {P(X,Y,0.04,0.26)} Z")
        st = ((X(0.42), Y(-0.16)), (X(0.64), Y(-0.06)), (X(0.86), Y(0.1)), (X(1.04), Y(0.4)))
    else:   # side / sider (facing away from the u=1 edge)
        d = (f"M{P(X,Y,0.06,0.24)} C{P(X,Y,-0.02,0.0)} {P(X,Y,0.2,-0.15)} {P(X,Y,0.52,-0.15)} "
             f"C{P(X,Y,1.02,-0.15)} {P(X,Y,1.22,0.2)} {P(X,Y,1.2,0.62)} "
             f"C{P(X,Y,1.18,0.9)} {P(X,Y,1.04,1.04)} {P(X,Y,0.86,1.0)} "
             f"C{P(X,Y,0.7,0.96)} {P(X,Y,0.6,0.8)} {P(X,Y,0.58,0.6)} "
             f"C{P(X,Y,0.56,0.38)} {P(X,Y,0.42,0.18)} {P(X,Y,0.06,0.24)} Z")
        st = ((X(0.34), Y(-0.16)), (X(0.66), Y(-0.1)), (X(0.98), Y(0.14)), (X(1.1), Y(0.6)))
    o = [outline(d, MANE), hair_shadow(d, uid + "ms", 0.74 if view != "back" else 0.7),
         f'<clipPath id="{uid}m"><path d="{d}"/></clipPath><g clip-path="url(#{uid}m)">' + ribbon(st, h*0.1, STREAK) + "</g>"]
    return "".join(o)

def blush(x, y, w, h, view):
    cs = {"front": (0.22, 0.78), "q": (0.6,), "qr": (0.4,), "side": (0.3,), "sider": (0.7,)}.get(view, ())
    return "".join(flat(ellipse_path(x + w*c, y + h*0.52, w*0.09, h*0.045), PINK, 0.9) for c in cs)

def horn_sparkles(x, y, w, h, view, n=3, s=1.0):
    """the mood FX: strokeless sparkles round the horn tip (no outline, value only)"""
    tip = {"front": (0.5, -0.56), "q": (0.32, -0.55), "qr": (0.68, -0.55), "side": (-0.12, -0.46), "sider": (1.12, -0.46), "back": (0.5, -0.5)}[view]
    tx, ty = x + w*tip[0], y + h*tip[1]
    spots = [(-0.46, -0.1, 0.13), (0.42, -0.24, 0.1), (0.62, 0.02, 0.07)][:n]
    o = []
    for dx, dy, r in spots:
        o.append(sparkle(tx + dx*h*s, ty + dy*h*s, r*h*s, GOLD) + sparkle(tx + dx*h*s, ty + dy*h*s, r*h*s*0.45, WHITE))
    return "".join(o)

def uni_head(cx, top, hh, uid, view="front", eyes="dot", mouth_kind="smile", mood="up", sparkles=0, mane_len=0.0):
    """a standalone head (expressions, mark): mane behind, horn, ears, head, blush, front hair, sparkles."""
    hw = hh/1.2*({"q": 0.93, "qr": 0.93, "side": 0.78, "sider": 0.78}.get(view, 1.0)); x = cx - hw/2
    o = [mane_back(x, top, hw, hh, view, mane_len) if mane_len else "", horn_at(x, top, hw, hh, view, uid), ears(x, top, hw, hh, view, uid, mood),
         head(x, top, hw, hh, SKIN, view, eyes, mouth_kind, True, None, uid + "hd", human_ears=False),
         blush(x, top, hw, hh, view), mane_front(x, top, hw, hh, view, uid)]
    if sparkles: o.append(horn_sparkles(x, top, hw, hh, view, sparkles))
    return "".join(o)

def mane_flow(g, swish=0.0):
    """the long mane down the back in ¾ and profile (and the hero's, thrown back by `swish`): it leaves the back of the
    head, clears the nape and falls outside the back contour to below the shoulder blades, ending in two soft locks.
    drawn under the body, so only what lies outside the back shows."""
    v = g["view"]
    if v not in ("q", "qr", "side", "sider"): return ""
    f = 1 if v in ("q", "side") else -1                  # the back of the figure is at +x for q/side
    x, y, w, h = g["head_x"], g["head_y"], g["head_w"], g["head_h"]
    X, Y = frame(x, y, w, h, flip=(f == -1))
    cx, y0, y1, r, sw, dx = g["cx"], g["y0"], g["y1"], g["r"], g["sw"], g["dx_sh"]
    H = y1 - y0; k = 1 + swish
    if swish > 0:     # in motion the mane streams back level with the head, clear of the arms: three locks
        d = (f"M{P(X,Y,0.4,-0.13)} C{P(X,Y,0.9,-0.17)} {P(X,Y,1.4,-0.09)} {P(X,Y,1.76,0.06)} "
             f"C{P(X,Y,2.06,0.18)} {P(X,Y,2.32,0.28)} {P(X,Y,2.3,0.42)} "
             f"C{P(X,Y,2.28,0.56)} {P(X,Y,2.08,0.58)} {P(X,Y,1.98,0.5)} "
             f"C{P(X,Y,2.06,0.62)} {P(X,Y,2.0,0.76)} {P(X,Y,1.86,0.76)} "
             f"C{P(X,Y,1.74,0.76)} {P(X,Y,1.66,0.7)} {P(X,Y,1.62,0.63)} "
             f"C{P(X,Y,1.56,0.75)} {P(X,Y,1.4,0.8)} {P(X,Y,1.27,0.75)} "
             f"C{P(X,Y,1.12,0.7)} {P(X,Y,1.02,0.62)} {P(X,Y,0.96,0.52)} "
             f"L{P(X,Y,0.5,0.5)} Z")
        st = ((X(1.0), Y(0.0)), (X(1.45), Y(0.06)), (X(1.9), Y(0.22)), (X(2.18), Y(0.4)))
        uid = g["uid"] + "mf"
        return (outline(d, MANE) + hair_shadow(d, uid + "s", 0.55) + f'<clipPath id="{uid}"><path d="{d}"/></clipPath><g clip-path="url(#{uid})">'
                + ribbon(st, h*0.12, STREAK) + "</g>")
    bx = lambda off: cx + dx*0.6 + f*off                 # x measured from the body's axis, toward the back
    def B(off, fy): return f"{bx(off):.1f} {y0 + H*fy:.1f}"
    prof = v in ("side", "sider")
    Lf = 0.56 if prof else 0.42                             # in ¾ the far arm hangs close: keep it to the shoulder blade
    o_ = r*(1.95 if prof else 1.5)                          # how far past the axis the mane hangs (visible width ≈ o_ − r)
    a0 = sw*0.5 + r*(0.95 if prof else 0.72)
    d = (f"M{P(X,Y,0.45,-0.12)} C{P(X,Y,1.0,-0.14)} {P(X,Y,1.34,0.2)} {P(X,Y,1.34,0.55)} "
         f"C{P(X,Y,1.34,0.8)} {B(a0 - r*0.05, -0.02)} {B(a0, 0.12)} "
         f"C{B(o_, Lf*0.45)} {B(o_ + r*0.08, Lf*0.78)} {B(o_, Lf)} "
         f"C{B(o_ - r*0.06, Lf + 0.1)} {B(o_ - r*0.26, Lf + 0.1)} {B(o_ - r*0.3, Lf + 0.02)} "
         f"C{B(o_ - r*0.36, Lf + 0.1)} {B(o_ - r*0.56, Lf + 0.12)} {B(o_ - r*0.62, Lf + 0.03)} "
         f"L{B(r*0.2, Lf*0.6)} L{P(X,Y,0.5,0.7)} Z")
    st = ((X(1.08), Y(0.1)), (X(1.26), Y(0.6)), (bx(a0 + r*0.1), y0 + H*0.14), (bx(o_ - r*0.18), y0 + H*(Lf - 0.02)))
    uid = g["uid"] + "mf"
    return (outline(d, MANE) + hair_shadow(d, uid + "s", 0.62) + f'<clipPath id="{uid}"><path d="{d}"/></clipPath><g clip-path="url(#{uid})">'
            + ribbon(st, h*0.12, STREAK) + "</g>")

# ---------- the tail ----------
def plume(spine, W, uid, wf=None):
    """a tapering plume along one cubic spine: narrow root, full middle, rounded tip; one shadow strip down the
    lower side and a pink streak along it. the root end is meant to sit under the body."""
    wf = wf or (lambda t: 0.82 + 0.18*math.sin(math.pi*min(1.0, 0.12 + 0.88*t)))
    N = 22; L_, R_ = [], []
    for i in range(N + 1):
        t = i/N; p = bez(*spine, t); dx, dy = bez_tan(*spine, t); m = math.hypot(dx, dy) or 1
        nx, ny = -dy/m, dx/m; w = W*wf(t)/2
        L_.append((p[0] + nx*w, p[1] + ny*w)); R_.append((p[0] - nx*w, p[1] - ny*w))
    p1 = bez(*spine, 1.0); dx, dy = bez_tan(*spine, 1.0); m = math.hypot(dx, dy) or 1
    ux, uy = dx/m, dy/m; w1 = W*wf(1.0)/2       # round cap: a half-disc from the L side round the tip to the R side
    cap = [(p1[0] - uy*w1*math.cos(a) + ux*w1*math.sin(a), p1[1] + ux*w1*math.cos(a) + uy*w1*math.sin(a))
           for a in (math.pi*k/6 for k in range(1, 6))]
    d = smooth_closed(L_ + cap + R_[::-1])
    p5 = bez(*spine, 0.5); dx, dy = bez_tan(*spine, 0.5); m = math.hypot(dx, dy) or 1
    sg = 1 if (-dy/m + dx/m) > 0 else -1         # the side whose normal points lower-right takes the shadow
    inner, outer = [], []
    for i in range(N + 1):
        t = -0.05 + 1.1*i/N; tt = min(max(t, 0), 1); p = bez(*spine, t); dx, dy = bez_tan(*spine, tt); m = math.hypot(dx, dy) or 1
        nx, ny = -dy/m*sg, dx/m*sg; w = W*wf(tt)/2
        inner.append((p[0] + nx*w*0.3, p[1] + ny*w*0.3)); outer.append((p[0] + nx*w*2.5, p[1] + ny*w*2.5))
    sh = smooth_closed(inner + outer[::-1])
    st = tuple(bez(*spine, t) for t in (0.12, 0.4, 0.7, 0.95))
    st = tuple((x_ - (-bez_tan(*spine, 0.5)[1]/m)*sg*W*0.18, y_ - (bez_tan(*spine, 0.5)[0]/m)*sg*W*0.18) for x_, y_ in st)
    return (outline(d, MANE) + f'<clipPath id="{uid}"><path d="{d}"/></clipPath><g clip-path="url(#{uid})">'
            + flat(sh, shade(MANE), 1, "s") + ribbon(st, W*0.16, STREAK) + "</g>")

def tail_at(g, swish=0.0):
    """the tail grows from the rump and falls in an S. swish (−1..1) throws it back for motion."""
    v, r, cx, y1 = g["view"], g["r"], g["cx"], g["y1"]
    W = r*0.95
    if v in ("q", "side", "qr", "sider"):
        f = 1 if v in ("q", "side") else -1
        x0, y0 = cx + f*r*(0.5 if v in ("q", "qr") else 0.42), y1 - r*0.55   # the root starts inside the rump
        sw = swish
        if v in ("q", "qr") and sw == 0:   # ¾ turnaround: down behind the leg, then swing out under the hand
            sp = ((x0, y0), (x0 + f*r*0.25, y0 - r*0.2), (x0, y0 + r*1.6), (x0 + f*r*1.5, y0 + r*2.4))
        else:
            sp = ((x0, y0), (x0 + f*r*(1.5 + 0.8*sw), y0 - r*(0.3 + 0.1*sw)), (x0 + f*r*(1.0 + 1.2*sw), y0 + r*(1.9 - 0.9*sw)),
                  (x0 + f*r*(1.6 + 1.0*sw), y0 + r*(2.6 - 1.2*sw)))    # it swings back out clear of the leg it hangs behind
        return plume(sp, W, g["uid"] + "tl")
    if v == "back":
        x0, y0 = cx, y1 - r*0.2
        sp = ((x0, y0), (x0 + r*0.45, y0 + r*0.5), (x0 - r*0.35, y0 + r*1.1), (x0 + r*0.15, y0 + r*1.75))
        return plume(sp, W, g["uid"] + "tl")
    return ""

# ---------- boots ----------
def hoof_boot(x, y, w, h, flip=1, fill=BOOTS):
    """white hoof boots, drawn in place of the house shoe: one rounded mass (a hoof: flat tread, high round toe) and one
    shadow along the tread. no sole band or laces: at turnaround size those close up into solid ink."""
    f = flip; w = w*0.92; h = h*1.25
    hx, tx = x, x + f*w
    d = (f"M{hx:.1f} {y - h*0.2:.1f} "
         f"C{hx:.1f} {y - h*0.75:.1f} {hx + f*w*0.08:.1f} {y - h:.1f} {hx + f*w*0.38:.1f} {y - h:.1f} "
         f"C{hx + f*w*0.68:.1f} {y - h:.1f} {tx:.1f} {y - h*0.66:.1f} {tx:.1f} {y - h*0.3:.1f} "
         f"C{tx:.1f} {y - h*0.06:.1f} {tx - f*w*0.06:.1f} {y:.1f} {tx - f*w*0.2:.1f} {y:.1f} "
         f"L{hx + f*w*0.14:.1f} {y:.1f} "
         f"C{hx + f*w*0.04:.1f} {y:.1f} {hx:.1f} {y - h*0.06:.1f} {hx:.1f} {y - h*0.2:.1f} Z")
    sh = (f"M{hx - f*20:.1f} {y - h*0.3:.1f} C{hx + f*w*0.4:.1f} {y - h*0.24:.1f} {hx + f*w*0.72:.1f} {y - h*0.3:.1f} "
          f"{tx + f*20:.1f} {y - h*0.5:.1f} L{tx + f*20:.1f} {y + 20:.1f} L{hx - f*20:.1f} {y + 20:.1f} Z")
    uid = f"hb{next(_ids)}"
    return (outline(d, fill) + f'<clipPath id="{uid}"><path d="{d}"/></clipPath><g clip-path="url(#{uid})">'
            + flat(sh, BOOT_SH, 1, "s") + "</g>")

# ---------- the character ----------
def unicorn(cx, ground, head_h, view="front", uid="u", eyes="dot", mouth_kind="smile", mood="up", sparkles=0, swish=0.0, **kw):
    over_arm = lambda v: v in ("q", "qr") and swish == 0    # in the ¾ turnaround the mane falls over the far shoulder
    def under(g):
        x, y, w, h, v = g["head_x"], g["head_y"], g["head_w"], g["head_h"], g["view"]
        return (("" if over_arm(v) else mane_flow(g, swish)) + horn_at(x, y, w, h, v, g["uid"]) + ears(x, y, w, h, v, g["uid"], mood)
                + (tail_at(g, swish) if v != "back" else ""))    # ¾ and profile: the tail hangs behind the legs
    def mid(g):             # from the back it is the nearest thing: over the legs, under the top
        return tail_at(g, swish) if g["view"] == "back" else ""
    def over(g):
        x, y, w, h, v = g["head_x"], g["head_y"], g["head_w"], g["head_h"], g["view"]
        o = blush(x, y, w, h, v) + mane_front(x, y, w, h, v, g["uid"])
        if sparkles: o += horn_sparkles(x, y, w, h, v, sparkles)
        return o
    p = dict(head_h=head_h, heads=4.6, belly_r=head_h*0.5, lw=head_h*0.25, view=view, skin=SKIN, shirt=TOP, pants=PANTS,
             shoes=BOOTS, garments="volume", human_ears=False, eyes=eyes, mouth_kind=mouth_kind,
             under=under, mid=mid, over=over, uid=uid, ground_shadow=True, ground_shadow_w=1.5,
             hand_scale=(1.25, 1.25), hand_palm=(0.7, 0.7), cuff_ry=0.5, sleeve_ratio=1.9, sleeve_frac=0.62,
             shoe_fn=hoof_boot, shoes_under=True, hem_frac=0.8, hem_ry=0.42, garment_tuck=True,
             torso_fold=view != "back", leg_stack=True)   # the collar: where enough of it shows below the chin
    p.update(kw)
    return figure(cx, ground, **p)

# turnaround pose: the arms hang ~22° off the body so each cuff clears the torso by ~10px (dojo/grade/cuffgap.py)
APOSE = {"front": dict(arms=((-3.2, 7.0), (3.2, 6.95)), hand_rot=(-30, 46)),
         "back":  dict(arms=((-3.2, 7.0), (3.2, 6.95)), hand_rot=(-30, 40)),
         "q":     dict(arms=((-3.1, 7.0), (4.4, 6.2)), hand_rot=(-28, 30)),
         "side":  dict(arms=((-2.6, 7.2), None), hand_rot=(-22, 0))}

def hero(cx, ground, head_h, uid="hero"):
    """¾ facing right, mid-prance: front knee up, near hand waving, horn sparkling, mane and tail thrown back."""
    return unicorn(cx, ground, head_h, view="qr", uid=uid, eyes="happy", mouth_kind="open", mood="up", sparkles=3, swish=0.6,
                   lean=0.08, head_dx=0, arms=((-3.3, 2.4), (3.9, -0.9)), legs=(None, (2.4, 3.6)), hands=("open", "wave"),
                   hand_rot=(0, 0))

if __name__ == "__main__":
    b = [f'<rect width="1600" height="1000" fill="{BG}"/>']
    b.append(txt(60, 60, "Unicorn — new cast member, house hand", 22, 650))
    b.append(txt(60, 88, "the horn's sparkles and the pony ears carry the mood", 15, 500, .6))
    b.append(txt(60, 110, "long lavender mane with a pink streak · matching tail", 15, 500, .6))
    b.append(txt(60, 132, "gold spiral horn · mint top · sky trousers · white hoof boots", 15, 500, .6))
    b.append(hero(266, 945, 128))
    # turnaround — centres from measured extents (front −127/+127, ¾ −122/+148, side −107/+80, back −127/+125; hero +242),
    # 25px apart
    for i, (v, lab, cx) in enumerate((("front", "front", 660), ("q", "¾", 934), ("side", "side", 1214), ("back", "back", 1454))):
        b.append(unicorn(cx, 545, 80, view=v, uid=f"t{i}", **APOSE[v]))
        b.append(ctxt(cx, 580, lab, 15, 650, 1))
    # moods — the ears and the horn's sparkles; centres from measured extents with ~87px between drawings
    EX = [("happy", "open", "up", 3, "happy · ears up, sparkling", 622),
          ("wide", "o", "alert", 1, "surprised · ears pricked", 832),
          ("dot", "frown", "droop", 0, "sad · ears down, no spark", 1061),
          ("closed", "small", "out", 0, "sleepy · ears out", 1298)]
    for i, (e, m, mood, sp, lab, cx) in enumerate(EX):
        b.append(uni_head(cx, 712, 96, f"x{i}", "front", e, m, mood, sp))
        b.append(ctxt(cx, 852, lab, 13, 600, .75))
    b.append(uni_head(1507, 728, 80, "mk", "front", "dot", "none", "up", 0))
    b.append(ctxt(1507, 852, "mark · eyes only", 13, 600, .75))
    for i, (col, lab) in enumerate(((MANE, "lavender · mane, tail"), (STREAK, "pink · streak"), (GOLD, "gold · horn"),
                                    (TOP, "mint · top"), (PANTS, "sky · trousers"), (BOOTS, "white · boots"))):
        x = 600 + i*168
        b.append(blob(x, 920, 14, 14, col)); b.append(txt(x + 24, 925, lab, 12, 600, .7))
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">\n' + "\n".join(b) + "\n</svg>\n"
    open(os.path.join(OUT, "unicorn-sheet.svg"), "w").write(svg); print("wrote unicorn-sheet.svg")
    h = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000"><rect width="800" height="1000" fill="{BG}"/>' + hero(400, 950, 140, "solo") + "</svg>\n"
    open(os.path.join(OUT, "unicorn-hero.svg"), "w").write(h); print("wrote unicorn-hero.svg")
    m = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" rx="96" fill="{BG}"/>' + uni_head(256, 222, 196, "m", "front", "dot", "none", "up", 0) + "</svg>\n"
    open(os.path.join(OUT, "unicorn-mark.svg"), "w").write(m); print("wrote unicorn-mark.svg")
