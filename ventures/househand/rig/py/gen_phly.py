#!/usr/bin/env python3
"""Phly — the phly.cloud mascot, rebuilt in the house hand (final test after the belt ladder).
A puffy cloud with fly wings, an aviator cap with goggles, a scarf, blush and a big open smile.
Reference: the phly.cloud placeholder render (cloud + wings + cap + goggles) and the Explorer variant (goggles + scarf).
Writes ../phly/phly-sheet.svg (hero + expressions + mark) and phly-mark.svg (square)."""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from house import *
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "phly")
os.makedirs(OUT, exist_ok=True)

BG = "#D9F3FF"

# ---------- a cloud silhouette as ONE path: a ring of discs, joined at their outer intersections ----------
def _isect(c1, c2, away):
    (x1, y1, r1), (x2, y2, r2) = c1, c2
    dx, dy = x2 - x1, y2 - y1; d = math.hypot(dx, dy)
    a = (r1*r1 - r2*r2 + d*d) / (2*d); h = math.sqrt(max(0.0, r1*r1 - a*a))
    mx, my = x1 + a*dx/d, y1 + a*dy/d
    p1 = (mx + h*dy/d, my - h*dx/d); p2 = (mx - h*dy/d, my + h*dx/d)
    return max((p1, p2), key=lambda p: math.hypot(p[0]-away[0], p[1]-away[1]))

def cloud_path(cx, cy, ring, s=1.0):
    """ring: [(dx, dy, r)] in clockwise order around the centre; returns a closed path of outward arcs."""
    cs = [(cx + dx*s, cy + dy*s, r*s) for dx, dy, r in ring]
    n = len(cs)
    pts = [_isect(cs[i], cs[(i+1) % n], (cx, cy)) for i in range(n)]     # exit point of disc i
    d = f"M{pts[-1][0]:.1f} {pts[-1][1]:.1f}"
    for i in range(n):
        x, y, r = cs[i]; ex, ey = pts[i]
        d += f" A{r:.1f} {r:.1f} 0 0 1 {ex:.1f} {ey:.1f}"
    return d + " Z"

def ribbon(c, w, col, n=12):
    """a strokeless dash: polygon offset ±w/2 along a cubic (ink-free marks: veins, seams, ticks)"""
    a, bq = [], []
    for k in range(n+1):
        t = k/n; x, y = bez(*c, t); tx, ty = bez_tan(*c, t); L = math.hypot(tx, ty) or 1
        nx, ny = -ty/L*w/2, tx/L*w/2
        a.append((x+nx, y+ny)); bq.append((x-nx, y-ny))
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in a) + " L" + " L".join(f"{x:.1f} {y:.1f}" for x, y in reversed(bq)) + " Z"
    return flat(d, col)

RING = [(-96, 6, 46), (-62, -40, 50), (-6, -62, 58), (54, -44, 50), (98, -4, 46), (74, 44, 40), (14, 58, 44), (-50, 46, 42)]

def wing(cx, cy, s, rot, rx, ry, flip=1):
    """one translucent wing: an outlined ellipse with two strokeless vein tints"""
    g = outline(ellipse_path(cx, cy, rx*s, ry*s, rot), SKY)
    # veins: two thin arcs of the shadow tone, strokeless feel kept by drawing them as thin shadow-colour lines
    c, sn = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    def P(x, y): return f"{cx + x*c - y*sn:.1f} {cy + x*sn + y*c:.1f}"
    def Q(x, y): return (cx + x*c - y*sn, cy + x*sn + y*c)
    g += ribbon((Q(-rx*s*0.6, ry*s*0.1), Q(-rx*s*0.2, -ry*s*0.3), Q(rx*s*0.3, -ry*s*0.3), Q(rx*s*0.75, -ry*s*0.1)), LW*0.5, shade(SKY))
    g += ribbon((Q(-rx*s*0.4, ry*s*0.5), Q(0, ry*s*0.1), Q(rx*s*0.3, ry*s*0.1), Q(rx*s*0.65, ry*s*0.4)), LW*0.5, shade(SKY))
    return g

def phly(cx, cy, s=1.0, expr="happy", uid="p", wingbeat=0.0, scarf=True, cap=True, legs=True):
    """the mascot, facing screen-right. cy is the cloud centre. expr: happy | excited | chill | surprised"""
    o = []
    body = cloud_path(cx, cy, RING, s)
    # wings (behind the body) — one big swept-back, one small upright; wingbeat squashes them
    wb = 1 - 0.35*wingbeat
    o.append(wing(cx - 118*s, cy - 112*s, s, -42, 74*wb, 32))
    o.append(wing(cx - 10*s, cy - 160*s, s, -78, 48*wb, 24))
    # scarf tail, streaming back-left (behind the body)
    if scarf:
        tail = (f"M{cx-112*s:.1f} {cy+22*s:.1f} C{cx-146*s:.1f} {cy-6*s:.1f} {cx-176*s:.1f} {cy+40*s:.1f} {cx-242*s:.1f} {cy+2*s:.1f} "
                f"C{cx-230*s:.1f} {cy+16*s:.1f} {cx-222*s:.1f} {cy+22*s:.1f} {cx-214*s:.1f} {cy+26*s:.1f} "
                f"C{cx-226*s:.1f} {cy+34*s:.1f} {cx-238*s:.1f} {cy+44*s:.1f} {cx-246*s:.1f} {cy+58*s:.1f} "
                f"C{cx-200*s:.1f} {cy+44*s:.1f} {cx-160*s:.1f} {cy+66*s:.1f} {cx-112*s:.1f} {cy+50*s:.1f} Z")
        o.append(outline(tail, PINK))
        o.append(f'<clipPath id="sc{uid}"><path d="{tail}"/></clipPath>')
        o.append(f'<g clip-path="url(#sc{uid})">' + flat(f"M{cx-240*s:.1f} {cy+30*s:.1f} C{cx-190*s:.1f} {cy+44*s:.1f} {cx-150*s:.1f} {cy+30*s:.1f} {cx-100*s:.1f} {cy+40*s:.1f} L{cx-100*s:.1f} {cy+80*s:.1f} L{cx-240*s:.1f} {cy+80*s:.1f} Z", shade(PINK), 1, "s") + "</g>")
    # legs: three short ink curves under the body
    if legs:
        for i, lx in enumerate((-40, 4, 48)):
            x = cx + lx*s; y = cy + 84*s
            o.append(line(f"M{x:.1f} {y:.1f} C{x-4*s:.1f} {y+18*s:.1f} {x-12*s:.1f} {y+26*s:.1f} {x-24*s:.1f} {y+30*s:.1f}"))
    # body + one saturated shadow (clipped), lower-right
    o.append(outline(body, WHITE))
    o.append(f'<clipPath id="cb{uid}"><path d="{body}"/></clipPath>')
    o.append(f'<g clip-path="url(#cb{uid})">' + flat(f"M{cx-40*s:.1f} {cy+130*s:.1f} C{cx+20*s:.1f} {cy+70*s:.1f} {cx+80*s:.1f} {cy+40*s:.1f} {cx+160*s:.1f} {cy+10*s:.1f} L{cx+160*s:.1f} {cy+130*s:.1f} Z", SKY, 0.75, "s") + "</g>")
    # scarf knot: a soft band across the lower-left of the body
    if scarf:
        o.append(outline(ellipse_path(cx-122*s, cy+30*s, 20*s, 15*s, -25), PINK))
        o.append(outline(ellipse_path(cx-104*s, cy+46*s, 15*s, 11*s, -25), PINK))
    # aviator cap over the crown, with a strap down the left and a buckle
    if cap:
        capd = (f"M{cx-72*s:.1f} {cy-48*s:.1f} C{cx-66*s:.1f} {cy-108*s:.1f} {cx+20*s:.1f} {cy-130*s:.1f} {cx+84*s:.1f} {cy-84*s:.1f} "
                f"C{cx+96*s:.1f} {cy-72*s:.1f} {cx+100*s:.1f} {cy-56*s:.1f} {cx+96*s:.1f} {cy-44*s:.1f} "
                f"C{cx+50*s:.1f} {cy-66*s:.1f} {cx-20*s:.1f} {cy-66*s:.1f} {cx-72*s:.1f} {cy-48*s:.1f} Z")
        o.append(outline(capd, ORANGE))
        o.append(f'<clipPath id="cc{uid}"><path d="{capd}"/></clipPath>')
        o.append(f'<g clip-path="url(#cc{uid})">' + flat(f"M{cx+10*s:.1f} {cy-140*s:.1f} C{cx+60*s:.1f} {cy-120*s:.1f} {cx+80*s:.1f} {cy-80*s:.1f} {cx+110*s:.1f} {cy-30*s:.1f} L{cx+140*s:.1f} {cy-30*s:.1f} L{cx+140*s:.1f} {cy-150*s:.1f} Z", shade(ORANGE), 1, "s") + "</g>")
        o.append(ribbon(((cx-40*s, cy-104*s), (cx-10*s, cy-116*s), (cx+30*s, cy-112*s), (cx+58*s, cy-92*s)), LW*0.5, shade(ORANGE)))   # seam
        o.append(tube(f"M{cx-70*s:.1f} {cy-50*s:.1f} C{cx-80*s:.1f} {cy-30*s:.1f} {cx-80*s:.1f} {cy-10*s:.1f} {cx-70*s:.1f} {cy+10*s:.1f}", 14*s, ORANGE))   # strap
        o.append(outline(ellipse_path(cx-70*s, cy+12*s, 11*s, 9*s), YEL))                                                                                  # buckle
        # goggles: two brass rims with sky lenses, on the cap
        for gx, gy in ((-6, -96), (46, -84)):
            o.append(outline(ellipse_path(cx+gx*s, cy+gy*s, 22*s, 20*s), YEL))
            o.append(circ(cx+gx*s, cy+gy*s, 13*s, SKY))
            o.append(circ(cx+gx*s-4*s, cy+gy*s-5*s, 4*s, WHITE))
        o.append(line(f"M{cx+16*s:.1f} {cy-92*s:.1f} C{cx+20*s:.1f} {cy-90*s:.1f} {cx+22*s:.1f} {cy-90*s:.1f} {cx+24*s:.1f} {cy-90*s:.1f}", LW*0.9))   # bridge
    # face: two big eyes on the upper third of the cloud, blush, mouth
    ex1, ex2, ey = cx + 8*s, cx + 62*s, cy - 24*s
    if expr == "chill":
        o.append(eye(ex1, ey, 30*s, "closed")); o.append(eye(ex2, ey+2*s, 30*s, "closed"))
    elif expr == "excited":
        o.append(eye(ex1, ey, 30*s, "happy")); o.append(eye(ex2, ey+2*s, 30*s, "happy"))
    elif expr == "surprised":
        o.append(eye(ex1, ey, 32*s, "wide")); o.append(eye(ex2, ey+2*s, 32*s, "wide"))
    else:
        o.append(eye(ex1, ey, 30*s, "dot")); o.append(eye(ex2, ey+2*s, 30*s, "dot"))
        o.append(circ(ex1+4*s, ey-6*s, 4*s, WHITE)); o.append(circ(ex2+4*s, ey-4*s, 4*s, WHITE))
    o.append(flat(ellipse_path(cx-14*s, cy+6*s, 14*s, 8*s), PINK, 0.9))
    o.append(flat(ellipse_path(cx+90*s, cy+8*s, 12*s, 7*s), PINK, 0.9))
    mx, my = cx + 36*s, cy + 10*s
    if expr == "surprised":
        o.append(mouth(mx, my, 30*s, "o"))
    elif expr == "chill":
        o.append(mouth(mx, my+4*s, 26*s, "small"))
    else:
        w = 52*s if expr == "excited" else 44*s
        o.append(mouth(mx, my, w, "open"))
        o.append(flat(ellipse_path(mx, my + w*0.42, w*0.22, w*0.12), PINK))     # tongue
    return "".join(o)

def speed_ticks(cx, cy, s):
    return "".join(ribbon(((cx+dx*s, cy+dy*s), (cx+(dx+14)*s, cy+(dy-4)*s), (cx+(dx+26)*s, cy+(dy-8)*s), (cx+(dx+38)*s, cy+(dy-12)*s)), LW*0.7, YEL) for dx, dy in ((150, -40), (158, -4), (150, 32)))

def main():
    b = [f'<rect width="1600" height="1000" fill="{BG}"/>']
    b.append(txt(60, 60, "Phly — the phly.cloud mascot, in the house hand", 22, 650))
    b.append(txt(60, 88, "a cloud with fly wings · aviator cap + goggles · scarf · one saturated shadow per form · wings and ticks as strokeless-feel tints", 15, 500, .6))
    # background sparkles and wisps (strokeless FX)
    for x, y, r in ((300, 160, 22), (1360, 140, 16), (1480, 420, 12)):
        b.append(sparkle(x, y, r, YEL)); b.append(sparkle(x, y, r*0.45, WHITE))
    b.append(lobes(150, 580, [(0, 0, 34), (40, -10, 40), (84, 4, 30), (44, 18, 30)], WHITE, 0.7))
    # hero
    b.append(phly(620, 520, 1.5, "happy", "hero", wingbeat=0.2))
    b.append(speed_ticks(620, 520, 1.5))
    # expressions, small
    for i, (ex, lab) in enumerate((("excited", "excited"), ("chill", "chill"), ("surprised", "surprised"))):
        x = 1150 + (i % 2) * 300; y = 300 + (i // 2) * 290
        if i == 2: x = 1300
        b.append(phly(x, y, 0.62, ex, f"e{i}", wingbeat=0.5 * (i % 2)))
        b.append(txt(x - 30, y + 150, lab, 15))
    # the mark: wings + cloud + eyes only, favicon-sized, no cap/scarf/legs
    b.append(phly(1200, 860, 0.4, "happy", "mark", scarf=False, cap=False, legs=False))
    b.append(txt(1140, 960, "mark · cloud, wings, eyes only", 15))
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">\n' + "\n".join(b) + "\n</svg>\n"
    open(os.path.join(OUT, "phly-sheet.svg"), "w").write(svg); print("wrote phly-sheet.svg")
    # square mark on its own
    m = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" rx="96" fill="{BG}"/>' + phly(256, 270, 1.0, "happy", "m", scarf=False, cap=False, legs=False) + "</svg>\n"
    open(os.path.join(OUT, "phly-mark.svg"), "w").write(m); print("wrote phly-mark.svg")
    # hero alone (transparent-friendly sky)
    h = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800" width="1000" height="800"><rect width="1000" height="800" fill="{BG}"/>' + phly(520, 400, 1.6, "happy", "solo", wingbeat=0.2) + speed_ticks(520, 400, 1.6) + "</svg>\n"
    open(os.path.join(OUT, "phly-hero.svg"), "w").write(h); print("wrote phly-hero.svg")


if __name__ == "__main__":
    main()