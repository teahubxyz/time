#!/usr/bin/env python3
"""Bunny — a new cast member in the house hand.
Long lilac ears (her right one flops), a bob with a fringe, a pink dress with puff sleeves (the skirt seen from a little
above, the legs coming out under its hem), a white cotton tail, yellow shoes and bow, and a carrot. The ears are the
expression device.

Writes ../bunny/bunny-sheet.svg (hero + turnaround + ear expressions + colours), bunny-hero.svg, bunny-mark.svg."""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from house import *
from gen_phly import cloud_path, ribbon
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bunny")
os.makedirs(OUT, exist_ok=True)

HAIR = "#9190FE"          # lilac — hair, ears
DRESS = PINK
LEGS = WHITE              # tights
BG = CREAM

# ---------- smooth closed outline through points (Catmull-Rom → cubic) ----------
def smooth_closed(pts):
    n = len(pts); d = f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"
    for i in range(n):
        p0, p1, p2, p3 = pts[(i-1) % n], pts[i], pts[(i+1) % n], pts[(i+2) % n]
        c1 = (p1[0] + (p2[0]-p0[0])/6, p1[1] + (p2[1]-p0[1])/6)
        c2 = (p2[0] - (p3[0]-p1[0])/6, p2[1] - (p3[1]-p1[1])/6)
        d += f" C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}"
    return d + " Z"

# ---------- ears: a spine (one cubic) + a width profile ----------
def ear_spine(B, L, kind, side=1, tilt=0.0, bend=0.0):
    """kind: up | flop (folds over at ~half length toward `side`) | droop (hangs down toward `side`).
    tilt in degrees (+ leans right). side: -1 left, +1 right (screen)."""
    t = math.radians(tilt)
    up = (math.sin(t), -math.cos(t)); nr = (math.cos(t), math.sin(t))
    def A(u, v): return (B[0] + up[0]*u + nr[0]*v, B[1] + up[1]*u + nr[1]*v)
    if kind == "up":    return (B, A(0.36*L, side*bend*L), A(0.72*L, side*bend*L), A(L, side*bend*L*0.4))
    if kind == "flop":  return (B, A(0.62*L, 0), A(0.72*L, side*0.40*L), A(0.40*L, side*0.66*L))
    if kind == "droop": return (B, A(0.34*L, side*0.08*L), A(0.30*L, side*0.44*L), A(-0.12*L, side*0.58*L))
    if kind == "hang":  return (B, A(0.34*L, side*0.10*L), A(0.18*L, side*0.44*L), A(-0.46*L, side*0.40*L))
    raise ValueError(kind)

def _frame(spine, t):
    p = bez(*spine, t); dx, dy = bez_tan(*spine, t); m = math.hypot(dx, dy) or 1
    d = (dx/m, dy/m); return p, d, (-d[1], d[0])

def _width(t, W):
    return W*(0.55 + 0.45*math.sin(math.pi*min(1.0, 0.1 + 0.9*t)))

def _ribbon_pts(spine, t0, t1, wf, W, off=0.0, N=8):
    """points round a rounded strip along the spine from t0 to t1, half-width wf·width(t)/2, shifted `off`·W across."""
    left, right = [], []
    for i in range(N+1):
        t = t0 + (t1-t0)*i/N; p, d, n = _frame(spine, t); w = _width(t, W)*wf/2; c = (p[0] + n[0]*off*W, p[1] + n[1]*off*W)
        left.append((c[0] + n[0]*w, c[1] + n[1]*w)); right.append((c[0] - n[0]*w, c[1] - n[1]*w))
    def cap(t, sgn):
        p, d, n = _frame(spine, t); w = _width(t, W)*wf/2; c = (p[0] + n[0]*off*W, p[1] + n[1]*off*W)
        return [(c[0] + (n[0]*math.cos(a)*sgn + d[0]*math.sin(a)*sgn)*w, c[1] + (n[1]*math.cos(a)*sgn + d[1]*math.sin(a)*sgn)*w) for a in (math.pi/3, 2*math.pi/3)]
    return left + cap(t1, 1) + right[::-1] + cap(t0, -1)

def _side_strip(spine, W, sg, k_in=0.34, N=12):
    inner, outer = [], []
    for i in range(N+1):
        t = -0.05 + 1.15*i/N; p, d, n = _frame(spine, min(max(t, 0.0), 1.0)); p = bez(*spine, t)
        w = _width(min(max(t, 0.0), 1.0), W)/2
        inner.append((p[0] + n[0]*sg*k_in*w, p[1] + n[1]*sg*k_in*w)); outer.append((p[0] + n[0]*sg*w*2.4, p[1] + n[1]*sg*w*2.4))
    return smooth_closed(inner + outer[::-1])

def bunny_ear(B, L, W, kind, side, tilt, uid, front=True, bend=0.0):
    spine = ear_spine(B, L, kind, side, tilt, bend)
    d = smooth_closed(_ribbon_pts(spine, 0.0, 1.0, 1.0, W))
    o = [outline(d, HAIR)]
    # one saturated shadow along the side that faces away from the light (upper-left)
    p, dd, n = _frame(spine, 0.5); sg = 1 if (n[0] + n[1]) > 0 else -1
    strip = _side_strip(spine, W, sg)
    o.append(f'<clipPath id="{uid}"><path d="{d}"/></clipPath><g clip-path="url(#{uid})">{flat(strip, shade(HAIR), 1, "s")}</g>')
    if front:   # the inside of the ear: pink, and only on the part that still faces us
        t1 = 0.84 if kind == "up" else (0.36 if kind == "hang" else 0.42)
        o.append(flat(smooth_closed(_ribbon_pts(spine, 0.13, t1, 0.46, W, N=6)), PINK))
    return "".join(o)

# ear placement per view, in head-box fractions: (fx, kind, side, tilt) for her right ear R, then her left ear L
EARS = {
    "front": [(0.30, "flop", -1, -6), (0.70, "up", 1, 8)],
    "back":  [(0.70, "flop", 1, 6),   (0.30, "up", -1, -8)],
    "q":     [(0.34, "flop", -1, -4), (0.72, "up", 1, 12)],
    "qr":    [(0.30, "flop", -1, -6), (0.66, "up", 1, 6)],
    "side":  [(0.64, "flop", 1, 6),   (0.42, "up", 1, -2)],     # profile: the far (flopped) ear sits back and folds
    "sider": [(0.36, "flop", -1, -6), (0.58, "up", -1, 2)],     # backwards, clear of the near ear standing in front
}
def ears(hx, hy, hw, hh, view, uid, pose=None):
    """pose overrides the default pair: list of two (kind, side, tilt) or (kind, side, tilt, bend), or None.
    bend curls a standing ear sideways (a fraction of its length; the rig springs it)."""
    L, W = hh*1.15, hh*0.27
    spec = EARS[view]
    out = []
    for i, (fx, kind, side, tilt) in enumerate(spec):
        bend = 0.0
        if pose: kind, side, tilt = pose[i][:3]; bend = pose[i][3] if len(pose[i]) > 3 else 0.0
        out.append(bunny_ear((hx + hw*fx, hy + hh*0.1), L, W, kind, side, tilt, f"{uid}e{i}", front=view not in ("back",),
                             bend=bend))
    return "".join(out)

def ear_base(hx, hy, hw, hh, view, which=1):
    fx = EARS[view][which][0]; return hx + hw*fx, hy + hh*0.1

# ---------- hair: a bob with a fringe, in every view ----------
def bob(x, y, w, h, view):
    if view == "front":
        d = (f"M{x-0.06*w:.1f} {y+0.66*h:.1f} C{x-0.15*w:.1f} {y+0.34*h:.1f} {x-0.08*w:.1f} {y-0.09*h:.1f} {x+0.5*w:.1f} {y-0.1*h:.1f} "
             f"C{x+1.08*w:.1f} {y-0.09*h:.1f} {x+1.15*w:.1f} {y+0.34*h:.1f} {x+1.06*w:.1f} {y+0.66*h:.1f} "
             f"C{x+0.99*w:.1f} {y+0.58*h:.1f} {x+0.95*w:.1f} {y+0.38*h:.1f} {x+0.92*w:.1f} {y+0.22*h:.1f} "
             f"C{x+0.7*w:.1f} {y+0.12*h:.1f} {x+0.3*w:.1f} {y+0.12*h:.1f} {x+0.08*w:.1f} {y+0.22*h:.1f} "
             f"C{x+0.05*w:.1f} {y+0.38*h:.1f} {x+0.01*w:.1f} {y+0.58*h:.1f} {x-0.06*w:.1f} {y+0.66*h:.1f} Z")
    elif view == "back":       # all hair down to the nape and onto the back: a band of skin below it read as a chin
        d = (f"M{x-0.08*w:.1f} {y+0.94*h:.1f} C{x-0.16*w:.1f} {y+0.36*h:.1f} {x-0.06*w:.1f} {y-0.1*h:.1f} {x+0.5*w:.1f} {y-0.1*h:.1f} "
             f"C{x+1.06*w:.1f} {y-0.1*h:.1f} {x+1.16*w:.1f} {y+0.36*h:.1f} {x+1.08*w:.1f} {y+0.94*h:.1f} "
             f"C{x+0.8*w:.1f} {y+1.1*h:.1f} {x+0.2*w:.1f} {y+1.1*h:.1f} {x-0.08*w:.1f} {y+0.94*h:.1f} Z")
    elif view in ("q", "qr"):
        f = 1 if view == "q" else -1
        X = (lambda u: x + u*w) if f == 1 else (lambda u: x + (1-u)*w)
        d = (f"M{X(0.0):.1f} {y+0.46*h:.1f} C{X(-0.1):.1f} {y+0.14*h:.1f} {X(0.1):.1f} {y-0.1*h:.1f} {X(0.5):.1f} {y-0.1*h:.1f} "
             f"C{X(1.0):.1f} {y-0.1*h:.1f} {X(1.15):.1f} {y+0.26*h:.1f} {X(1.08):.1f} {y+0.7*h:.1f} "
             f"C{X(0.98):.1f} {y+0.74*h:.1f} {X(0.84):.1f} {y+0.66*h:.1f} {X(0.82):.1f} {y+0.5*h:.1f} "
             f"C{X(0.8):.1f} {y+0.36*h:.1f} {X(0.8):.1f} {y+0.24*h:.1f} {X(0.76):.1f} {y+0.19*h:.1f} "
             f"C{X(0.56):.1f} {y+0.11*h:.1f} {X(0.24):.1f} {y+0.12*h:.1f} {X(0.07):.1f} {y+0.24*h:.1f} "
             f"C{X(0.05):.1f} {y+0.32*h:.1f} {X(0.03):.1f} {y+0.4*h:.1f} {X(0.0):.1f} {y+0.46*h:.1f} Z")
    else:   # side / sider
        f = 1 if view == "side" else -1
        X = (lambda u: x + u*w) if f == 1 else (lambda u: x + (1-u)*w)
        d = (f"M{X(0.06):.1f} {y+0.22*h:.1f} C{X(0.0):.1f} {y+0.02*h:.1f} {X(0.2):.1f} {y-0.1*h:.1f} {X(0.5):.1f} {y-0.1*h:.1f} "
             f"C{X(0.95):.1f} {y-0.1*h:.1f} {X(1.14):.1f} {y+0.2*h:.1f} {X(1.1):.1f} {y+0.5*h:.1f} "
             f"C{X(1.08):.1f} {y+0.64*h:.1f} {X(1.0):.1f} {y+0.72*h:.1f} {X(0.86):.1f} {y+0.72*h:.1f} "
             f"C{X(0.66):.1f} {y+0.72*h:.1f} {X(0.52):.1f} {y+0.62*h:.1f} {X(0.5):.1f} {y+0.46*h:.1f} "
             f"C{X(0.48):.1f} {y+0.3*h:.1f} {X(0.36):.1f} {y+0.16*h:.1f} {X(0.06):.1f} {y+0.22*h:.1f} Z")
    return outline(d, HAIR)

def bow(bx, by, s):
    """two rounded loops and a knot. never smaller than 21px: below that the loops are all ink, and without the knot
    two yellow loops on the back of the head read as a pair of eyes"""
    s = max(s, 21)
    lobe = lambda sg: (f"M{bx:.1f} {by:.1f} C{bx+sg*s*0.5:.1f} {by-s*0.75:.1f} {bx+sg*s*1.25:.1f} {by-s*0.55:.1f} {bx+sg*s*1.15:.1f} {by:.1f} "
                       f"C{bx+sg*s*1.25:.1f} {by+s*0.55:.1f} {bx+sg*s*0.5:.1f} {by+s*0.75:.1f} {bx:.1f} {by:.1f} Z")
    return outline(lobe(-1), YEL) + outline(lobe(1), YEL) + blob(bx, by, s*0.32, s*0.32, YEL)

def blush(x, y, w, h, view):
    if view == "front": cs = (0.22, 0.78)
    elif view == "q":   cs = (0.6,)
    elif view == "qr":  cs = (0.4,)
    elif view == "side":  cs = (0.3,)
    elif view == "sider": cs = (0.7,)
    else: return ""
    return "".join(flat(ellipse_path(x + w*c, y + h*0.52, w*0.09, h*0.045), PINK, 0.9) for c in cs)

# ---------- cotton tail ----------
def tail(cx, cy, R, uid):
    ring = [(math.cos(a)*R*0.5, math.sin(a)*R*0.5, R*0.56) for a in [i*math.pi/3.5 for i in range(7)]]
    d = cloud_path(cx, cy, ring)
    return (outline(d, WHITE) + f'<clipPath id="{uid}"><path d="{d}"/></clipPath><g clip-path="url(#{uid})">'
            + flat(ellipse_path(cx + R*0.55, cy + R*0.5, R*0.9, R*0.75), LAV, 1, "s") + "</g>")

TAIL = {"q": (1.12, 0.5), "qr": (-1.12, 0.5), "side": (1.24, 0.0), "sider": (-1.24, 0.0), "back": (0.0, 0.12)}
def tail_at(g):
    """the tail sits on the back of the skirt at the rump. ¾ and side: drawn in figure(mid=…) — over the skirt and the
    far arm, under the bodice. back: drawn last, on the skirt below the bodice line."""
    if g["view"] not in TAIL: return ""
    fx, fy = TAIL[g["view"]]; r = g["r"]
    return tail(g["cx"] + r*fx, g["y1"] + r*fy, r*0.42, g["uid"] + "tl")

# ---------- carrot ----------
def carrot(x, y, ang, fw, uid, size=11.0):
    """a carrot through the fist at (x, y); `ang` = direction of the leafy end (degrees, 0 right, 90 up)."""
    L = fw*size; Rw = fw*1.4
    ax, ay = math.cos(math.radians(ang)), -math.sin(math.radians(ang)); nx, ny = -ay, ax
    def P(u, v): return f"{x + ax*u + nx*v:.1f} {y + ay*u + ny*v:.1f}"
    top, tip = 0.24*L, -0.76*L
    body = (f"M{P(top, -Rw)} C{P(top + Rw*0.5, -Rw)} {P(top + Rw*0.5, Rw)} {P(top, Rw)} "
            f"C{P(0.0, Rw*0.98)} {P(tip*0.55, Rw*0.5)} {P(tip*0.96, Rw*0.14)} "
            f"C{P(tip*1.02, Rw*0.06)} {P(tip*1.02, -Rw*0.06)} {P(tip*0.96, -Rw*0.14)} "
            f"C{P(tip*0.55, -Rw*0.5)} {P(0.0, -Rw*0.98)} {P(top, -Rw)} Z")
    o = []
    for a, ln in ((-28, 0.42), (0, 0.5), (28, 0.42)):        # leaves first, so the body covers their stems
        aa = math.radians(ang + a); lx, ly = math.cos(aa), -math.sin(aa)
        cxl, cyl = x + ax*(top + Rw*0.2) + lx*L*ln*0.5, y + ay*(top + Rw*0.2) + ly*L*ln*0.5
        o.append(outline(ellipse_path(cxl, cyl, L*ln*0.5, Rw*0.62, -(ang + a)), MINT))
    o.append(outline(body, ORANGE))
    sg = 1 if (nx + ny) > 0 else -1
    o.append(f'<clipPath id="{uid}"><path d="{body}"/></clipPath><g clip-path="url(#{uid})">'
             + flat(f"M{P(top + Rw, sg*Rw*0.35)} C{P(0.0, sg*Rw*0.4)} {P(tip*0.6, sg*Rw*0.1)} {P(tip*1.1, sg*Rw*0.0)} L{P(tip*1.1, sg*Rw*2)} L{P(top + Rw, sg*Rw*2)} Z", shade(ORANGE), 1, "s") + "</g>")
    for u in (-0.2, -0.42):                                     # two ridge marks, ink-free
        o.append(ribbon(((x + ax*u*L - nx*Rw*0.55, y + ay*u*L - ny*Rw*0.55), (x + ax*(u*L + 2) - nx*Rw*0.2, y + ay*(u*L + 2) - ny*Rw*0.2),
                         (x + ax*(u*L + 2) + nx*Rw*0.05, y + ay*(u*L + 2) + ny*Rw*0.05), (x + ax*u*L + nx*Rw*0.25, y + ay*u*L + ny*Rw*0.25)), LW*0.5, shade(ORANGE)))
    return "".join(o)

def ctxt(cx, y, s, size=13, w=600, op=.75):
    """a label centred on cx"""
    return txt(cx, y, s, size, w, op).replace("<text ", '<text text-anchor="middle" ', 1)

# ---------- the character ----------
def bunny(cx, ground, head_h, view="front", uid="b", eyes="dot", mouth_kind="smile", ear_pose=None, mid_extra=None, **kw):
    def under(g):
        return ears(g["head_x"], g["head_y"], g["head_w"], g["head_h"], g["view"], g["uid"], ear_pose)
    def mid(g):   # under the bodice and the near arm: the tail, and anything held behind the near hand
        return (tail_at(g) if g["view"] != "back" else "") + (mid_extra(g) if mid_extra else "")
    def over(g):
        x, y, w, h, v = g["head_x"], g["head_y"], g["head_w"], g["head_h"], g["view"]
        o = blush(x, y, w, h, v) + bob(x, y, w, h, v)
        bx, by = ear_base(x, y, w, h, v, 1)
        o += bow(bx, by - h*0.16, w*0.26)     # astride the hairline at the left ear's root: the contour runs behind it
        if v == "back": o += tail_at(g)
        return o
    p = dict(head_h=head_h, heads=4.6, belly_r=head_h*0.5, lw=head_h*0.25, view=view, skin=SKIN, shirt=DRESS, pants=DRESS,
             shoes=YEL, garments="volume", skirt=DRESS, legwear=LEGS, human_ears=False, eyes=eyes, mouth_kind=mouth_kind,
             under=under, over=over, mid=mid, uid=uid, ground_shadow=True, ground_shadow_w=1.5,
             sleeve_frac=0.42, sleeve_ratio=1.6, skirt_len=0.46, skirt_flare=1.5,
             hand_scale=(1.25, 1.25),       # mitten-big hands: at the constant line weight a finger narrower than ~10px is all ink
             hand_palm=(0.7, 0.7),          # ...but the palm stays wrist-wide, or its disc reads as a fifth finger
             skirt_fold=view not in ("qr", "sider"))    # facing right the tail sits where the fold starts: it read as a stalk
    p.update(kw)
    return figure(cx, ground, **p)

def bunny_head(cx, top, hh, uid, eyes="dot", mouth_kind="smile", ear_pose=None):
    """a floating head for the expression row (front view): ears behind, head, blush, bob, bow."""
    hw = hh/1.2; x = cx - hw/2
    o = [ears(x, top, hw, hh, "front", uid, ear_pose), head(x, top, hw, hh, SKIN, "front", eyes, mouth_kind, True, None, uid + "h", human_ears=False),
         blush(x, top, hw, hh, "front"), bob(x, top, hw, hh, "front")]
    bx, by = ear_base(x, top, hw, hh, "front", 1)
    o.append(bow(bx, by - hh*0.16, hw*0.26))
    return "".join(o)

def hero(cx, ground, head_h, uid="hero"):
    """¾ view facing right, presenting a carrot, back foot kicked up. the carrot is drawn first and the fist closes
    over it (knuckles forward, thumb on top), so it reads as held: leaves above the fist, the body below."""
    cap = {}
    common = dict(view="qr", uid=uid, eyes="happy", mouth_kind="open", lean=0.06, head_dx=6,
                  arms=((-2.8, 2.0), (2.5, -1.6)), legs=((-2.6, 5.6), None), hands=("open", "fist"))
    def probe(x, y, rot, fw): cap.update(x=x, y=y, rot=rot, fw=fw); return ""
    bunny(cx, ground, head_h, props=(None, probe), **common)
    hr = -84 - cap["rot"]                        # local "up" of the fist points forward: knuckles forward, thumb on top
    held = lambda g: carrot(cap["x"], cap["y"] + cap["fw"]*0.2, 84, cap["fw"], uid + "c")
    return bunny(cx, ground, head_h, hand_rot=(0, hr), mid_extra=held, hand_palm=(0.7, 1.0), **common)   # the fist keeps a full palm to cover the carrot

# turnaround pose: arms ~25° off the body so no hand touches the skirt; hands flared ~30° so the fingers point away
# from it (both house hands share one chirality, so the right thumb points at the body: it gets a little more turn and
# room); in ¾ the far arm swings wider so the tail has its own space at the rump; in profile the arm swings a little forward
# so the hand sits in clear space in front of the skirt and the tail keeps the back (the big house hand has no room
# between the two)
APOSE = {"front": dict(arms=((-3.3, 6.9), (3.95, 6.65)), hand_rot=(-34, 54)),
         "back":  dict(arms=((-3.3, 6.9), (3.7, 6.75)), hand_rot=(-34, 44)),
         "q":     dict(arms=((-3.3, 6.9), (4.4, 6.1)), hand_rot=(-30, 30)),
         "side":  dict(arms=((-2.9, 7.1), None), hand_rot=(-25, 0))}

if __name__ == "__main__":
    b = [f'<rect width="1600" height="1000" fill="{BG}"/>']
    b.append(txt(60, 60, "Bunny — new cast member, house hand", 22, 650))
    b.append(txt(60, 88, "the ears carry the mood · her right ear flops", 15, 500, .6))
    b.append(txt(60, 110, "bob with a fringe · pink dress with puff sleeves", 15, 500, .6))
    b.append(txt(60, 132, "cotton tail · yellow shoes and bow · carrot", 15, 500, .6))
    b.append(hero(300, 945, 128))
    b.append(sparkle(512, 300, 15, YEL) + sparkle(512, 300, 6, WHITE) + sparkle(532, 240, 9, YEL) + sparkle(532, 240, 4, WHITE))
    # turnaround
    # centres from measured extents (front −130/+145, ¾ −127/+148, side −113/+57, back −130/+138) with 20px between hands
    for i, (v, lab, cx) in enumerate((("front", "front", 660), ("q", "¾", 952), ("side", "side", 1233), ("back", "back", 1440))):
        b.append(bunny(cx, 530, 80, view=v, uid=f"t{i}", **APOSE[v]))
        b.append(ctxt(cx, 566, lab, 15, 650, 1))
    # ear expressions
    # centres from measured extents at head 96 (happy −106/+52, surprised −55/+54, sad −75/+74, sleepy −91/+90;
    # mark at head 80 −89/+44) with 60px between drawings
    EX = [("happy", "happy", "open", None, "happy · one up, one flops", 666),
          ("surprised", "wide", "o", [("up", -1, -14), ("up", 1, 14)], "surprised · both up", 833),
          ("sad", "dot", "frown", [("hang", -1, 0), ("hang", 1, 0)], "sad · both hang", 1022),
          ("sleepy", "closed", "small", [("droop", -1, -6), ("droop", 1, 6)], "sleepy · both droop", 1247)]
    for i, (k, e, m, pose, lab, cx) in enumerate(EX):
        b.append(bunny_head(cx, 710, 96, f"x{i}", e, m, pose))
        b.append(ctxt(cx, 852, lab, 13, 600, .75))
    # the mark, reduced to head, bob, ears, bow and eyes — drawn at the house line weight, not scaled
    b.append(bunny_head(1486, 726, 80, "mk", "dot", "none"))
    b.append(ctxt(1486, 852, "mark · eyes only", 13, 600, .75))
    # colour callouts
    for i, (col, lab) in enumerate(((HAIR, "lilac · hair, ears"), (PINK, "pink · dress"), (WHITE, "white · tail, tights"),
                                    (YEL, "yellow · shoes, bow"), (ORANGE, "orange · carrot"), (MINT, "mint · leaves"))):
        x = 600 + i*168
        b.append(blob(x, 920, 14, 14, col)); b.append(txt(x + 24, 925, lab, 12, 600, .7))
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">\n' + "\n".join(b) + "\n</svg>\n"
    open(os.path.join(OUT, "bunny-sheet.svg"), "w").write(svg); print("wrote bunny-sheet.svg")
    h = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000"><rect width="800" height="1000" fill="{BG}"/>' + hero(392, 948, 146, "solo") + "</svg>\n"
    open(os.path.join(OUT, "bunny-hero.svg"), "w").write(h); print("wrote bunny-hero.svg")
    m = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" rx="96" fill="{BG}"/>' + bunny_head(256, 262, 178, "m", "dot", "none") + "</svg>\n"
    open(os.path.join(OUT, "bunny-mark.svg"), "w").write(m); print("wrote bunny-mark.svg")
