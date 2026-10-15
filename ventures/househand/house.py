#!/usr/bin/env python3
"""house.py — the Teahub drawing hand as code. Everything the dojo has cleared so far, in one place.
Head (yellow), bean / tubes / hands / feet (green), garments + shadows + FX (blue), posed figures (brown).
House deviations from the field guide, set by the creative director: hands are 3 fingers + thumb (thumb 1.15×), feet have 4 toes."""
import math, colorsys, os

INK, LW = "#2B2135", 10
FONT = "font-family=\"system-ui,-apple-system,sans-serif\""
# field-guide pastels
PINK, YEL, ORANGE, MINT, SKY, CREAM, SKIN, SKIN_S, LAV, LAV_S = "#FFB3E6", "#FFE780", "#FFC897", "#B3FFC7", "#A1E9FF", "#FFEAD2", "#FFD0B8", "#E8A68B", "#C5C5FF", "#A4A4F4"
WHITE = "#FFFFFF"
# drawon.py replays a drawing stroke by stroke; with HOUSE_TAGS=1, figure() wraps each part in <g data-part> (and the
# whole figure in <g data-figure>) so the replay can draw a character the way an artist would: head first, feet last.
# Off by default: the output is byte-for-byte what it was.
TAGS = bool(os.environ.get("HOUSE_TAGS"))
def part(name, svg): return f'<g data-part="{name}">{svg}</g>' if TAGS and svg else svg

# ---------- colour ----------
def hex2rgb(h): h = h.lstrip("#"); return tuple(int(h[i:i+2], 16)/255 for i in (0, 2, 4))
def rgb2hex(r, g, b): return "#%02X%02X%02X" % tuple(max(0, min(255, round(c*255))) for c in (r, g, b))
def shade(hexcol, sat_up=0.28, val_down=0.10):
    """the house shadow: same hue, more saturated, a little darker (never grey)."""
    h, s, v = colorsys.rgb_to_hsv(*hex2rgb(hexcol))
    return rgb2hex(*colorsys.hsv_to_rgb(h, min(1, s + sat_up), max(0, v - val_down)))
def hsv(hexcol): return colorsys.rgb_to_hsv(*hex2rgb(hexcol))

# ---------- svg atoms ----------
def txt(x, y, s, size=22, w=650, op=1):
    return f'<text x="{x:.0f}" y="{y:.0f}" {FONT} font-size="{size}" font-weight="{w}" fill="{INK}" opacity="{op}">{s}</text>'
def outline(d, fill, lw=LW):
    return f'<path fill="{fill}" stroke="{INK}" stroke-width="{lw}" stroke-linecap="round" stroke-linejoin="round" d="{d}"/>'
def line(d, lw=LW, col=INK):
    return f'<path fill="none" stroke="{col}" stroke-width="{lw}" stroke-linecap="round" stroke-linejoin="round" d="{d}"/>'
def flat(d, fill, op=1, cls="fx"):
    return f'<path class="{cls}" fill="{fill}" opacity="{op}" d="{d}"/>'
def tube_ink(d, w):  return line(d, w + 2*LW)
def tube_fill(d, w, col): return line(d, w, col)
def tube(d, w, col):  return tube_ink(d, w) + tube_fill(d, w, col)
def circ(cx, cy, r, fill, op=1, cls="fx"):
    return f'<circle class="{cls}" cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" opacity="{op}"/>'
def ellipse_path(cx, cy, rx, ry, rot=0):
    k = 0.5523; c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    def P(x, y): return f"{cx + x*c - y*s:.1f} {cy + x*s + y*c:.1f}"
    return (f"M{P(-rx,0)} C{P(-rx,-ry*k)} {P(-rx*k,-ry)} {P(0,-ry)} C{P(rx*k,-ry)} {P(rx,-ry*k)} {P(rx,0)} "
            f"C{P(rx,ry*k)} {P(rx*k,ry)} {P(0,ry)} C{P(-rx*k,ry)} {P(-rx,ry*k)} {P(-rx,0)} Z")
def blob(cx, cy, rx, ry, fill, lw=LW): return outline(ellipse_path(cx, cy, rx, ry), fill, lw)

# ---------- bezier helpers ----------
def bez(p0, p1, p2, p3, t):
    u = 1-t
    return (u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
            u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1])
def bez_tan(p0, p1, p2, p3, t):
    u = 1-t
    x = 3*u*u*(p1[0]-p0[0]) + 6*u*t*(p2[0]-p1[0]) + 3*t*t*(p3[0]-p2[0])
    y = 3*u*u*(p1[1]-p0[1]) + 6*u*t*(p2[1]-p1[1]) + 3*t*t*(p3[1]-p2[1])
    L = math.hypot(x, y) or 1
    return (x/L, y/L)
def split(p0, p1, p2, p3, t):
    """de Casteljau: returns (first, second) cubic control tuples"""
    def lerp(a, b): return (a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t)
    a, b, c = lerp(p0, p1), lerp(p1, p2), lerp(p2, p3)
    d, e = lerp(a, b), lerp(b, c); m = lerp(d, e)
    return (p0, a, d, m), (m, e, c, p3)
def cpath(c): return f"M{c[0][0]:.1f} {c[0][1]:.1f} C{c[1][0]:.1f} {c[1][1]:.1f} {c[2][0]:.1f} {c[2][1]:.1f} {c[3][0]:.1f} {c[3][1]:.1f}"
def limb_curve(p, q, bow=0.0, lean=0.0):
    """one cubic from p to q bending as a single curve. bow = sideways bulge (fraction of length, signed);
    lean = how much the first handle leans along the chord (0.35 default)."""
    dx, dy = q[0]-p[0], q[1]-p[1]; L = math.hypot(dx, dy) or 1
    nx, ny = -dy/L, dx/L
    c1 = (p[0] + dx*0.33 + nx*bow*L, p[1] + dy*0.33 + ny*bow*L)
    c2 = (p[0] + dx*0.67 + nx*bow*L, p[1] + dy*0.67 + ny*bow*L)
    return (p, c1, c2, q)

# ---------- head ----------
_BASE = [("M",0,104),("C",-2,44,18,6,70,2),("C",90,1,110,1,130,2),("C",182,6,202,44,200,104),
         ("C",202,124,202,144,200,164),("C",198,218,178,238,130,240),("C",110,241,90,241,70,240),
         ("C",22,238,2,218,0,164),("C",-2,144,-2,124,0,104)]
_SHADOW = [("M",150,6),("C",190,24,204,100,200,164),("C",198,218,178,238,130,240),("C",170,226,184,190,180,140),("C",176,90,170,40,150,6)]
def _scale(seg, x, y, w, h, flip=1):
    sx, sy = w/200, h/240; out = []
    for s in seg:
        c = s[0]; n = s[1:]
        pts = []
        for i in range(0, len(n), 2):
            u = n[i] if flip == 1 else 200-n[i]
            pts.append(f"{x+u*sx:.1f} {y+n[i+1]*sy:.1f}")
        out.append(c + " ".join(pts))
    return " ".join(out) + " Z"
def head_path(x, y, w, h): return _scale(_BASE, x, y, w, h)
def head_shadow_path(x, y, w, h, side=1): return _scale(_SHADOW, x, y, w, h, side)

def ear(x, cy, h, side=1, fill=SKIN):
    r = h*0.06
    d = f"M{x} {cy-r} C{x+side*r*2.1} {cy-r*1.2} {x+side*r*2.1} {cy+r*1.2} {x} {cy+r} C{x-side*r*0.15} {cy+r*0.5} {x-side*r*0.15} {cy-r*0.5} {x} {cy-r} Z"
    return outline(d, fill)

def eye(cx, cy, s, kind="dot"):
    if kind == "dot":    return f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{s*0.5:.1f}" ry="{s*0.55:.1f}" fill="{INK}"/>'
    if kind == "far":    return f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{s*0.28:.1f}" ry="{s*0.55:.1f}" fill="{INK}"/>'
    if kind == "wide":   return f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{s*0.62:.1f}" ry="{s*0.7:.1f}" fill="{INK}"/>'
    if kind == "closed": return line(f"M{cx-s*0.55:.1f} {cy:.1f} C{cx-s*0.3:.1f} {cy+s*0.45:.1f} {cx+s*0.3:.1f} {cy+s*0.45:.1f} {cx+s*0.55:.1f} {cy:.1f}")
    if kind == "happy":  return line(f"M{cx-s*0.55:.1f} {cy+s*0.2:.1f} C{cx-s*0.3:.1f} {cy-s*0.35:.1f} {cx+s*0.3:.1f} {cy-s*0.35:.1f} {cx+s*0.55:.1f} {cy+s*0.2:.1f}")
    if kind == "flat":   return line(f"M{cx-s*0.55:.1f} {cy:.1f} C{cx-s*0.2:.1f} {cy+s*0.06:.1f} {cx+s*0.2:.1f} {cy+s*0.06:.1f} {cx+s*0.55:.1f} {cy:.1f}")
    raise ValueError(kind)

def mouth(cx, cy, w, kind="smile"):
    h = w*0.35
    if kind == "none":  return ""         # reduced marks: eyes only
    if kind == "smile": return line(f"M{cx-w/2:.1f} {cy:.1f} C{cx-w*0.25:.1f} {cy+h:.1f} {cx+w*0.25:.1f} {cy+h:.1f} {cx+w/2:.1f} {cy:.1f}")
    if kind == "flat":  return line(f"M{cx-w/2:.1f} {cy:.1f} C{cx-w*0.2:.1f} {cy+2:.1f} {cx+w*0.2:.1f} {cy+2:.1f} {cx+w/2:.1f} {cy:.1f}")
    if kind == "small": return line(f"M{cx-w*0.25:.1f} {cy:.1f} C{cx-w*0.1:.1f} {cy+h*0.4:.1f} {cx+w*0.1:.1f} {cy+h*0.4:.1f} {cx+w*0.25:.1f} {cy:.1f}")
    if kind == "o":     return f'<ellipse cx="{cx:.1f}" cy="{cy+h*0.4:.1f}" rx="{w*0.22:.1f}" ry="{w*0.3:.1f}" fill="{INK}"/>'
    if kind == "open":  return f'<path fill="{INK}" d="M{cx-w/2:.1f} {cy:.1f} C{cx-w*0.4:.1f} {cy+h*1.6:.1f} {cx+w*0.4:.1f} {cy+h*1.6:.1f} {cx+w/2:.1f} {cy:.1f} C{cx+w*0.2:.1f} {cy+3:.1f} {cx-w*0.2:.1f} {cy+3:.1f} {cx-w/2:.1f} {cy:.1f} Z"/>'
    if kind == "grin":  return line(f"M{cx-w*0.7:.1f} {cy-h*0.1:.1f} C{cx-w*0.3:.1f} {cy+h*0.9:.1f} {cx+w*0.3:.1f} {cy+h*0.9:.1f} {cx+w*0.7:.1f} {cy-h*0.1:.1f}")
    if kind == "smirk": return line(f"M{cx-w*0.4:.1f} {cy+h*0.2:.1f} C{cx-w*0.1:.1f} {cy+h*0.5:.1f} {cx+w*0.3:.1f} {cy+h*0.3:.1f} {cx+w*0.5:.1f} {cy-h*0.3:.1f}")
    if kind == "frown": return line(f"M{cx-w/2:.1f} {cy+h*0.6:.1f} C{cx-w*0.25:.1f} {cy-h*0.4:.1f} {cx+w*0.25:.1f} {cy-h*0.4:.1f} {cx+w/2:.1f} {cy+h*0.6:.1f}")
    raise ValueError(kind)

def head(x, y, w, h, fill=SKIN, view="front", eyes="dot", mouth_kind="smile", shadow=True, hair=None, uid="h", human_ears=True):
    """view: front | q (3/4 facing viewer-left) | qr (3/4 facing right) | side | sider | back.
    hair: (colour, kind) kind in tuft|cap|bob|bun|none. human_ears=False for characters whose ears live elsewhere
    (bunny ears are drawn behind the head by the caller). returns svg."""
    ear_ = ear if human_ears else (lambda *a: "")
    out = []
    hp = head_path(x, y, w, h)
    out.append(outline(hp, fill))
    if shadow:
        side = 1
        out.append(f'<clipPath id="{uid}"><path d="{hp}"/></clipPath><g clip-path="url(#{uid})">{flat(head_shadow_path(x, y, w, h, side), shade(fill), cls="s")}</g>')
    ey = y + h/3; s = h*0.085; my = ey + h*0.10
    if view == "front":
        gap = w*0.36
        out += [ear_(x+w, y+h/2, h, 1, fill), ear_(x, y+h/2, h, -1, fill), eye(x+w/2-gap/2, ey, s, eyes), eye(x+w/2+gap/2, ey, s, eyes), mouth(x+w/2, my, gap*0.9, mouth_kind)]
    elif view in ("q", "qr"):
        f = 1 if view == "q" else -1
        nx = x + w*(0.6 if f == 1 else 0.4); fx = x + w*(0.2 if f == 1 else 0.8)
        out += [ear_(x+w, y+h/2, h, 1, fill) if f == 1 else ear_(x, y+h/2, h, -1, fill), eye(nx, ey, s, eyes), eye(fx, ey, s, "far" if eyes == "dot" else eyes), mouth(x+w/2 - f*w*0.12, my, w*0.24, mouth_kind)]
    elif view in ("side", "sider"):
        f = 1 if view == "side" else -1
        ex = x + w*(0.2 if f == 1 else 0.8); e0 = x+3 if f == 1 else x+w-3; hm = w*0.16
        out += [ear_(x+w*0.5, y+h/2, h, f, fill), eye(ex, ey, s, eyes), line(f"M{e0:.1f} {my:.1f} C{e0+f*hm*0.4:.1f} {my+hm*0.5:.1f} {e0+f*hm*0.8:.1f} {my+hm*0.5:.1f} {e0+f*hm:.1f} {my+hm*0.1:.1f}")]
    elif view == "back":
        out += [ear_(x+w, y+h/2, h, 1, fill), ear_(x, y+h/2, h, -1, fill)]
    out = [o for o in out if o]
    if hair: out.append(hair_mass(x, y, w, h, hair[0], hair[1], view))
    return "\n".join(out)

def hair_mass(x, y, w, h, col, kind, view="front"):
    """hair as one closed mass sitting on the top of the oblong; the mass is the identity cue."""
    if kind == "none": return ""
    if kind == "tuft":
        tx = x + w*0.6
        return line(f"M{tx:.1f} {y+2:.1f} C{tx:.1f} {y-h*0.06:.1f} {tx+w*0.08:.1f} {y-h*0.08:.1f} {tx+w*0.1:.1f} {y-h*0.14:.1f}", LW+4, INK) + line(f"M{tx:.1f} {y+2:.1f} C{tx:.1f} {y-h*0.06:.1f} {tx+w*0.08:.1f} {y-h*0.08:.1f} {tx+w*0.1:.1f} {y-h*0.14:.1f}", LW-4, col)
    if kind == "cap":    # a beanie: dome + band
        d = f"M{x-6:.1f} {y+h*0.16:.1f} C{x-8:.1f} {y-h*0.5:.1f} {x+w+8:.1f} {y-h*0.5:.1f} {x+w+6:.1f} {y+h*0.16:.1f} C{x+w*0.7:.1f} {y+h*0.12:.1f} {x+w*0.3:.1f} {y+h*0.12:.1f} {x-6:.1f} {y+h*0.16:.1f} Z"
        band = f"M{x-8:.1f} {y+h*0.1:.1f} C{x+w*0.3:.1f} {y+h*0.18:.1f} {x+w*0.7:.1f} {y+h*0.18:.1f} {x+w+8:.1f} {y+h*0.1:.1f} C{x+w+8:.1f} {y+h*0.18:.1f} {x+w+8:.1f} {y+h*0.22:.1f} {x+w+6:.1f} {y+h*0.24:.1f} C{x+w*0.7:.1f} {y+h*0.3:.1f} {x+w*0.3:.1f} {y+h*0.3:.1f} {x-6:.1f} {y+h*0.24:.1f} C{x-8:.1f} {y+h*0.22:.1f} {x-8:.1f} {y+h*0.18:.1f} {x-8:.1f} {y+h*0.1:.1f} Z"
        return outline(d, col) + outline(band, shade(col, 0.2, 0.06))
    if kind == "bob":    # helmet of hair to the ears; bangs stay above the eye line
        d = (f"M{x-10:.1f} {y+h*0.5:.1f} C{x-14:.1f} {y+h*0.1:.1f} {x+w*0.2:.1f} {y-h*0.1:.1f} {x+w*0.5:.1f} {y-h*0.1:.1f} "
             f"C{x+w*0.8:.1f} {y-h*0.1:.1f} {x+w+14:.1f} {y+h*0.1:.1f} {x+w+10:.1f} {y+h*0.5:.1f} "
             f"C{x+w+2:.1f} {y+h*0.3:.1f} {x+w*0.96:.1f} {y+h*0.08:.1f} {x+w*0.75:.1f} {y+h*0.1:.1f} "
             f"C{x+w*0.4:.1f} {y+h*0.12:.1f} {x+w*0.1:.1f} {y+h*0.12:.1f} {x-10:.1f} {y+h*0.5:.1f} Z")
        return outline(d, col)
    if kind == "bun":    # swept mass + a ball on top
        d = f"M{x-4:.1f} {y+h*0.3:.1f} C{x-6:.1f} {y-h*0.04:.1f} {x+w*0.3:.1f} {y-h*0.1:.1f} {x+w*0.55:.1f} {y-h*0.08:.1f} C{x+w*0.85:.1f} {y-h*0.06:.1f} {x+w+6:.1f} {y+h*0.05:.1f} {x+w+4:.1f} {y+h*0.3:.1f} C{x+w*0.7:.1f} {y+h*0.18:.1f} {x+w*0.3:.1f} {y+h*0.18:.1f} {x-4:.1f} {y+h*0.3:.1f} Z"
        return outline(d, col) + blob(x+w*0.62, y-h*0.12, w*0.17, w*0.15, col)
    if kind == "spikes":  # three rounded spikes
        d = f"M{x+w*0.1:.1f} {y+h*0.12:.1f} C{x+w*0.12:.1f} {y-h*0.1:.1f} {x+w*0.26:.1f} {y-h*0.12:.1f} {x+w*0.3:.1f} {y+h*0.04:.1f} C{x+w*0.36:.1f} {y-h*0.18:.1f} {x+w*0.58:.1f} {y-h*0.2:.1f} {x+w*0.6:.1f} {y+h*0.02:.1f} C{x+w*0.68:.1f} {y-h*0.14:.1f} {x+w*0.9:.1f} {y-h*0.1:.1f} {x+w*0.9:.1f} {y+h*0.12:.1f} C{x+w*0.6:.1f} {y+h*0.06:.1f} {x+w*0.4:.1f} {y+h*0.06:.1f} {x+w*0.1:.1f} {y+h*0.12:.1f} Z"
        return outline(d, col)
    return ""

# ---------- body ----------
def bean_path(cx, y0, y1, r, sw, lean=0.0):
    """torso: belly circle radius r sitting on y1, shoulders width sw at y0; lean shifts the shoulders sideways
    (fraction of torso height) so the back is one arc — the line of action."""
    H = y1 - y0; dx = lean*H; sh = sw*0.14; k = 0.55
    return (f"M{cx-sw/2+dx:.1f} {y0+sh:.1f} C{cx-sw/2+dx:.1f} {y0:.1f} {cx+sw/2+dx:.1f} {y0:.1f} {cx+sw/2+dx:.1f} {y0+sh:.1f} "
            f"C{cx+sw/2+dx*0.6:.1f} {y0+H*0.42:.1f} {cx+r:.1f} {y1-r*1.55:.1f} {cx+r:.1f} {y1-r:.1f} "
            f"C{cx+r:.1f} {y1-r*(1-k):.1f} {cx+r*k:.1f} {y1:.1f} {cx:.1f} {y1:.1f} "
            f"C{cx-r*k:.1f} {y1:.1f} {cx-r:.1f} {y1-r*(1-k):.1f} {cx-r:.1f} {y1-r:.1f} "
            f"C{cx-r:.1f} {y1-r*1.55:.1f} {cx-sw/2+dx*0.6:.1f} {y0+H*0.42:.1f} {cx-sw/2+dx:.1f} {y0+sh:.1f} Z")

def shoe(x, y, w, h, flip=1, fill=YEL):
    """two masses: upper (one closed shape) + sole band ~18% of height, thicker at the heel, bowed. toe points toward +flip."""
    sole = h*0.18; heel = sole*1.35
    tx = x + flip*w; hx = x
    up = (f"M{hx:.1f} {y-heel:.1f} C{hx:.1f} {y-h:.1f} {hx+flip*w*0.25:.1f} {y-h:.1f} {hx+flip*w*0.45:.1f} {y-h*0.92:.1f} "
          f"C{hx+flip*w*0.75:.1f} {y-h*0.8:.1f} {tx:.1f} {y-h*0.55:.1f} {tx:.1f} {y-sole*0.9:.1f} "
          f"C{tx-flip*w*0.3:.1f} {y-sole*0.7:.1f} {hx+flip*w*0.3:.1f} {y-sole*0.8:.1f} {hx:.1f} {y-heel:.1f} Z")
    sl = (f"M{hx:.1f} {y-heel:.1f} C{hx+flip*w*0.3:.1f} {y-heel*0.9:.1f} {tx-flip*w*0.3:.1f} {y-sole*0.8:.1f} {tx:.1f} {y-sole*0.9:.1f} "
          f"C{tx+flip*2:.1f} {y-sole*0.3:.1f} {tx-flip*w*0.1:.1f} {y:.1f} {tx-flip*w*0.2:.1f} {y:.1f} "
          f"C{hx+flip*w*0.4:.1f} {y+2:.1f} {hx+flip*w*0.1:.1f} {y-2:.1f} {hx+flip*4:.1f} {y-heel*0.35:.1f} "
          f"C{hx-flip*2:.1f} {y-heel*0.6:.1f} {hx-flip*2:.1f} {y-heel*0.8:.1f} {hx:.1f} {y-heel:.1f} Z")
    return outline(up, fill) + outline(sl, WHITE) + line(f"M{hx+flip*w*0.42:.1f} {y-h*0.9:.1f} C{hx+flip*w*0.5:.1f} {y-h*0.7:.1f} {hx+flip*w*0.5:.1f} {y-h*0.55:.1f} {hx+flip*w*0.46:.1f} {y-h*0.42:.1f}")

def mitt(cx, cy, r, fill=SKIN): return blob(cx, cy, r, r*1.15, fill)

def finger_curve(p, q, bend=0.0):
    mx, my = (p[0]+q[0])/2, (p[1]+q[1])/2
    nx, ny = -(q[1]-p[1]), (q[0]-p[0]); L = math.hypot(nx, ny) or 1; nx, ny = nx/L, ny/L
    c = (mx + nx*bend*L, my + ny*bend*L)
    return f"M{p[0]:.1f} {p[1]:.1f} Q{c[0]:.1f} {c[1]:.1f} {q[0]:.1f} {q[1]:.1f}"

def hand(cx, cy, pose="open", fw=24, prop=None, rot=0, fill=SKIN, wrist=True, scale=1.0, palm=1.0):
    """house hand: 3 fingers + thumb. palm = soft disc r≈1.35·fw. thumb 1.15× finger width, shorter, low on the palm.
    rot rotates the whole hand (degrees, 0 = fingers up). grips draw far fingers → prop → palm + near fingers.
    palm < 1 shrinks only the disc (fingers keep their roots and reach): use it when scale > 1 makes the palm wider
    than the wrist, or the disc shows as a fifth lobe in the silhouette."""
    fw = fw*scale; R = fw*1.35; TW = fw*1.15; RP = R*palm
    def F(ang, length, bend=0.0, w=fw):
        a = math.radians(ang + rot)
        p = (cx + math.cos(a)*R*0.55, cy - math.sin(a)*R*0.55)
        q = (cx + math.cos(a)*(R*0.55+length), cy - math.sin(a)*(R*0.55+length))
        return (finger_curve(p, q, bend), w)
    fingers, far, near, thumb = [], [], [], None
    if pose == "open":      fingers = [F(a, fw*2.4) for a in (112, 84, 56)]; thumb = F(12, fw*1.7, 0, TW)
    elif pose == "point":   fingers = [F(96, fw*2.8)] + [F(a, fw*0.85) for a in (62, 36)]; thumb = F(140, fw*1.4, 0, TW)
    elif pose == "fist":    fingers = [F(a, fw*0.8) for a in (112, 78, 44)]; thumb = F(150, fw*1.1, 0, TW)
    elif pose == "peace":   fingers = [F(106, fw*2.7), F(74, fw*2.7), F(38, fw*0.85)]; thumb = F(160, fw*1.3, 0, TW)
    elif pose == "pinch":   fingers = [F(84, fw*2.3, -0.22), F(50, fw*0.85), F(26, fw*0.8)]; thumb = F(122, fw*2.1, 0.24, TW)
    elif pose == "thumbsup":fingers = [F(a, fw*0.85) for a in (22, -2, -26)]; thumb = F(95, fw*2.2, 0, TW)
    elif pose == "grip":    far = [F(118, fw*2.0, 0.22)]; near = [F(a, fw*2.0, 0.22) for a in (88, 58)]; thumb = F(150, fw*1.6, -0.15, TW)
    elif pose == "wave":    fingers = [F(a, fw*2.4, 0.08) for a in (120, 92, 64)]; thumb = F(20, fw*1.6, 0, TW)
    palm = outline(ellipse_path(cx, cy, RP, RP*1.15), fill)
    wr = tube(f"M{cx:.1f} {cy+R*0.6:.1f} C{cx:.1f} {cy+R*1.3:.1f} {cx-4:.1f} {cy+R*1.8:.1f} {cx-6:.1f} {cy+R*2.3:.1f}", R*1.5, fill) if wrist else ""
    def ink(fs):  return "".join(tube_ink(d, w) for d, w in fs)
    def fil(fs):  return "".join(tube_fill(d, w, fill) for d, w in fs)
    allf = fingers + ([thumb] if thumb else [])
    if pose != "grip":
        return "\n".join([wr, ink(allf), fil(allf), palm, fil(allf)])
    return "\n".join([wr, ink(far), fil(far), prop or "", ink(near + [thumb]), fil(near + [thumb]), palm, fil(near + [thumb])])

def bare_foot(cx, cy, view="side", flip=1, fill=SKIN):
    """house foot: 4 toes, big toe ~1.6×. ankle = continuous tube."""
    out = []
    def lobe(x, y, r): return blob(x, y, r, r*1.2, fill)
    if view == "side":
        L, H = 200, 70; hx, tx = cx-L*0.4, cx+L*0.5
        out.append(tube(f"M{hx+42:.1f} {cy-H*0.9:.1f} C{hx+40:.1f} {cy-H*1.6:.1f} {hx+36:.1f} {cy-H*2.2:.1f} {hx+34:.1f} {cy-H*2.9:.1f}", 54, fill))
        out.append(outline(f"M{hx:.1f} {cy-H:.1f} C{hx-16:.1f} {cy-H*0.6:.1f} {hx-10:.1f} {cy-6:.1f} {hx+30:.1f} {cy:.1f} C{cx:.1f} {cy+2:.1f} {cx+40:.1f} {cy:.1f} {tx-40:.1f} {cy:.1f} C{tx-10:.1f} {cy+2:.1f} {tx+4:.1f} {cy-10:.1f} {tx:.1f} {cy-22:.1f} C{tx-10:.1f} {cy-44:.1f} {cx+30:.1f} {cy-H*0.75:.1f} {cx-10:.1f} {cy-H*0.95:.1f} Z", fill))
        for dx, dy, r in ((-86,-30,13),(-62,-27,15),(-38,-24,17)): out.append(lobe(tx+dx, cy+dy, r))
        out.append(lobe(tx, cy-20, 26))
    elif view == "front":
        W = 140
        out.append(tube(f"M{cx:.1f} {cy-50:.1f} C{cx:.1f} {cy-110:.1f} {cx-2:.1f} {cy-160:.1f} {cx-4:.1f} {cy-220:.1f}", 56, fill))
        out.append(outline(f"M{cx-W/2:.1f} {cy-40:.1f} C{cx-W/2-6:.1f} {cy-80:.1f} {cx+W/2+6:.1f} {cy-80:.1f} {cx+W/2:.1f} {cy-40:.1f} C{cx+W/2+4:.1f} {cy-10:.1f} {cx+W/2:.1f} {cy+4:.1f} {cx+W/2-20:.1f} {cy+6:.1f} L{cx-W/2+20:.1f} {cy+6:.1f} C{cx-W/2:.1f} {cy+4:.1f} {cx-W/2-4:.1f} {cy-10:.1f} {cx-W/2:.1f} {cy-40:.1f} Z", fill))
        for dx, r in ((46, 13), (22, 14), (-6, 15), (-42, 24)): out.append(lobe(cx+dx, cy+4, r))
    return "\n".join(out)

# ---------- garments ----------
def opening(cx, cy, rx, ry, fill, rot=0, lw=LW):
    """an ellipse with a lip: the opening of a tube (cuff, hem, collar). the lip is a second contour inside."""
    return outline(ellipse_path(cx, cy, rx, ry, rot), shade(fill), lw) + line(_arc_inner(cx, cy, rx*0.72, ry*0.55, rot), lw)
def _arc_inner(cx, cy, rx, ry, rot):
    k = 0.5523; c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    def P(x, y): return f"{cx + x*c - y*s:.1f} {cy + x*s + y*c:.1f}"
    return f"M{P(-rx,0)} C{P(-rx*k,ry)} {P(rx*k,ry)} {P(rx,0)}"

def sleeve(curve, limb_w, col, frac=0.55, ratio=1.7, cuff_ry=0.3, tuck=False):
    """garment over the first `frac` of a limb curve: a tube ratio× the limb width ending in a cuff (ellipse + lip).
    cuff_ry: the opening's minor axis as a fraction of the sleeve width; on small figures a rounder cuff (~0.42) keeps
    the lip readable inside the constant line weight. tuck: end the tube just short of the opening's centre, so its
    round end of ink stays inside the opening instead of showing as a crescent below it (small figures)."""
    a, b = split(*curve, frac)
    w = limb_w*ratio
    end = a[3]; tx, ty = bez_tan(*curve, frac)
    rot = math.degrees(math.atan2(ty, tx)) + 90
    if tuck:
        d = max(0.0, w/2 + LW*0.5 - w*cuff_ry)     # ink cap radius (w/2 + LW) minus the opening's reach (ry + LW/2)
        lo, hi = 0.0, frac
        for _ in range(30):
            m = (lo + hi)/2
            if math.dist(bez(*curve, m), end) > d: lo = m
            else: hi = m
        a = split(*curve, lo)[0]
    return tube(cpath(a), w, col) + band(a, w*0.08, w*0.46, shade(col)) + opening(end[0], end[1], w/2 + LW*0.4, w*cuff_ry, col, rot)

def band(c, inner, outer, col, n=14, t0=0.06, t1=0.94):
    """a strokeless shadow band along the right-hand side of a cubic tube: polygon between two normal offsets."""
    pts_o, pts_i = [], []
    for k in range(n+1):
        t = t0 + (t1-t0)*k/n
        x, y = bez(*c, t); tx, ty = bez_tan(*c, t)
        nx, ny = -ty, tx
        if nx < 0: nx, ny = -nx, -ny          # the side facing +x (screen right)
        pts_o.append((x + nx*outer, y + ny*outer)); pts_i.append((x + nx*inner, y + ny*inner))
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts_o) + " L" + " L".join(f"{x:.1f} {y:.1f}" for x, y in reversed(pts_i)) + " Z"
    return flat(d, col, 1, "s")

def fold(p, q, bow=0.12):
    """one curved round-capped dash that touches neither contour"""
    return line(finger_curve(p, q, bow))

# ---------- FX (strokeless) ----------
def lobes(cx, cy, pts, fill, op=1):
    """a cloud/plume built from overlapping discs; pts = [(dx, dy, r)]"""
    return "".join(circ(cx+dx, cy+dy, r, fill, op) for dx, dy, r in pts)

def sparkle(cx, cy, r, fill=WHITE, op=1):
    """four-pointed, concave sides"""
    k = r*0.18
    return flat(f"M{cx:.1f} {cy-r:.1f} Q{cx+k:.1f} {cy-k:.1f} {cx+r:.1f} {cy:.1f} Q{cx+k:.1f} {cy+k:.1f} {cx:.1f} {cy+r:.1f} Q{cx-k:.1f} {cy+k:.1f} {cx-r:.1f} {cy:.1f} Q{cx-k:.1f} {cy-k:.1f} {cx:.1f} {cy-r:.1f} Z", fill, op)

def drop(cx, cy, r, fill, op=1, tilt=0):
    """a droplet: round bottom, soft point up"""
    c, s = math.cos(math.radians(tilt)), math.sin(math.radians(tilt))
    def P(x, y): return f"{cx + x*c - y*s:.1f} {cy + x*s + y*c:.1f}"
    return flat(f"M{P(0,-r*1.6)} C{P(r*0.5,-r*0.6)} {P(r,-r*0.2)} {P(r,r*0.3)} C{P(r,r*0.9)} {P(r*0.55,r*1.3)} {P(0,r*1.3)} C{P(-r*0.55,r*1.3)} {P(-r,r*0.9)} {P(-r,r*0.3)} C{P(-r,-r*0.2)} {P(-r*0.5,-r*0.6)} {P(0,-r*1.6)} Z", fill, op)

def flame(cx, cy, w, h, cols):
    """fire: stacked values, each inner shape echoing the outer silhouette at ~50-60% scale, bottom-aligned"""
    out = []
    for i, col in enumerate(cols):
        sc = 1 - i*0.42
        ww, hh = w*sc, h*sc
        out.append(flat(f"M{cx:.1f} {cy-hh:.1f} C{cx+ww*0.2:.1f} {cy-hh*0.75:.1f} {cx+ww*0.55:.1f} {cy-hh*0.55:.1f} {cx+ww*0.5:.1f} {cy-hh*0.25:.1f} C{cx+ww*0.48:.1f} {cy-hh*0.05:.1f} {cx+ww*0.3:.1f} {cy:.1f} {cx:.1f} {cy:.1f} C{cx-ww*0.3:.1f} {cy:.1f} {cx-ww*0.48:.1f} {cy-hh*0.05:.1f} {cx-ww*0.5:.1f} {cy-hh*0.25:.1f} C{cx-ww*0.55:.1f} {cy-hh*0.55:.1f} {cx-ww*0.2:.1f} {cy-hh*0.75:.1f} {cx:.1f} {cy-hh:.1f} Z", col))
    return "".join(out)

def splash(cx, cy, r, fill, hi=None):
    """main mass + detached droplets at descending sizes"""
    out = [flat(f"M{cx-r:.1f} {cy:.1f} C{cx-r*0.9:.1f} {cy-r*0.9:.1f} {cx-r*0.3:.1f} {cy-r*1.1:.1f} {cx-r*0.1:.1f} {cy-r*0.6:.1f} C{cx+r*0.1:.1f} {cy-r*1.0:.1f} {cx+r*0.7:.1f} {cy-r*1.0:.1f} {cx+r*0.6:.1f} {cy-r*0.4:.1f} C{cx+r*1.1:.1f} {cy-r*0.4:.1f} {cx+r*1.1:.1f} {cy+r*0.3:.1f} {cx+r*0.7:.1f} {cy+r*0.3:.1f} C{cx+r*0.3:.1f} {cy+r*0.5:.1f} {cx-r*0.5:.1f} {cy+r*0.5:.1f} {cx-r:.1f} {cy:.1f} Z", fill)]
    for dx, dy, rr, t in ((-1.25, -0.9, 0.22, -30), (-0.2, -1.5, 0.17, 0), (0.9, -1.3, 0.13, 20), (1.4, -0.3, 0.1, 60)):
        out.append(drop(cx+dx*r, cy+dy*r, rr*r, fill, 1, t))
    if hi: out.append(flat(ellipse_path(cx-r*0.3, cy-r*0.15, r*0.3, r*0.14, -20), hi))
    return "".join(out)

# ---------- the figure ----------
def figure(cx, ground, head_h=110, heads=4.7, belly_r=62, sw_f=0.72, lw=30, view="front",
           skin=SKIN, shirt=LAV, pants=SKY, shoes=YEL, hair=None, garments="volume",
           lean=0.0, head_dx=0.0, head_dy=0.0, arms=None, legs=None, hands=("open", "open"), hand_rot=(0, 0),
           eyes="dot", mouth_kind="smile", uid="f", shadow=True, ground_shadow=False, hip_dx=0.0, labels=False,
           hand_scale=(1.0, 1.0), props=(None, None), accessories=(), ground_shadow_w=2.2,
           human_ears=True, skirt=None, legwear=None, under=None, over=None, mid=None, hand_palm=(1.0, 1.0),
           sleeve_frac=0.55, sleeve_ratio=1.7, skirt_len=0.36, skirt_flare=1.32, cuff_ry=0.3,
           shoe_fn=None, shoes_under=False, torso_fold=True, leg_stack=False, hem_frac=0.86, hem_ry=None,
           garment_tuck=False, collar=True, skirt_fold=True):
    """a whole on-model character. heads = height in heads. lean = torso lean (fraction, +right).
    arms/legs = ((dx,dy),(dx,dy)) hand/foot targets relative to the shoulder/hip, in units of lw; None = hanging.
    garments: 'volume' (sleeves/trousers 1.7×, cuffs with lips) | 'skin' (same width as limb, no openings) | 'none'.
    skirt: a colour → flared skirt from the waist with a hem opening (ellipse + lip); legs come out of the hem in
    `legwear` (default skin) instead of trousers. under/over: callables(g) → svg drawn first / last, where g is the
    figure's geometry (head box, shoulders, hips, view) — for parts that live behind or on top of everything
    (bunny ears, tails, custom hair). mid: callable(g) drawn just under the torso — above the skirt and the
    far arm of a ¾ view (a tail that belongs to the body, not behind the arm). props: svg strings, or callables(x, y, rot, fw) placed at the hand.
    shoe_fn: callable(x, y, w, h, flip, fill) drawn instead of shoe(). shoes_under: draw the shoes before the trousers, so
    each hem opening sits over its boot top. torso_fold: False drops the shirt's fold dash (a back view whose hair covers
    it). leg_stack: in profile, put both legs on one line so the far leg hides exactly behind the near one instead of
    peeking out as a sliver of solid ink. hem_frac / hem_ry: where the trouser hems sit along the leg and their opening's
    minor axis (default: cuff_ry) — a higher, flatter hem leaves more of the boot below it. garment_tuck: end sleeves
    and trouser legs inside their openings (see sleeve()). collar=False drops the neck opening: on a small figure the
    head hides its upper half and what shows below the chin (outline + lip) closes up into a lens of solid ink.
    skirt_fold=False drops the skirt's fold dash (when a tail or prop sits where it would start)."""
    H = head_h*heads; head_w = head_h/1.2
    legs_len = H*0.48
    hip_y = ground - legs_len
    head_y = ground - H + head_dy
    y0 = head_y + head_h*0.88 - head_dy
    vw = {"front": 1.0, "back": 1.0, "q": 0.93, "qr": 0.93, "qb": 0.93, "qbr": 0.93, "side": 0.78, "sider": 0.78}.get(view, 1.0)
    r = belly_r*vw; y1 = hip_y + r*0.3
    sw = min(2*r*sw_f, 2*r)
    head_w = head_w*vw
    hview = {"qb": "back", "qbr": "back"}.get(view, view)
    dx_sh = lean*(y1 - y0)                     # shoulder shift from lean
    g = dict(cx=cx, ground=ground, view=view, head_x=cx + dx_sh + head_dx - head_w/2, head_y=head_y, head_w=head_w,
             head_h=head_h, y0=y0, y1=y1, r=r, sw=sw, hip_y=hip_y, lw=lw, dx_sh=dx_sh, legs_len=legs_len, uid=uid)
    out = []
    if ground_shadow:
        out.append(part("ground", flat(ellipse_path(cx, ground+6, r*ground_shadow_w, lw*0.55), shade(CREAM, 0.25, 0.08), 0.9, "s")))
    if under:
        out.append(part("under", under(g)))
    # ---- legs ----
    leg_pts = []
    for i, s in enumerate((-1, 1)):
        sx = 1 if (leg_stack and vw <= 0.8) else s       # stacked profile: both legs take the near leg's line
        hx = cx + hip_dx + sx*r*(0.45 if vw > 0.8 else 0.18); hy = y1 - r*0.5
        if legs and legs[i]:
            fx, fy = hx + legs[i][0]*lw, hy + legs[i][1]*lw
        else:
            fx, fy = cx + hip_dx + sx*((r*0.55+lw*0.3) if vw > 0.8 else lw*0.35), ground - lw*0.9
        bow = 0.09*sx if not (legs and legs[i]) else 0.16*sx
        leg_pts.append((limb_curve((hx, hy), (fx, fy), bow), s, fx, fy))
    if skirt:
        hem_y = (y1 - r*0.5) + (ground - (y1 - r*0.5))*skirt_len
        a, b = r*0.86, r*skirt_flare; ry = b*0.2; y_w = y1 - r*1.1; k = 0.5523
        body = (f"M{cx-a:.1f} {y_w:.1f} C{cx-a-r*0.1:.1f} {y_w+(hem_y-y_w)*0.45:.1f} {cx-b+r*0.04:.1f} {hem_y-(hem_y-y_w)*0.25:.1f} {cx-b:.1f} {hem_y:.1f} "
                f"C{cx-b:.1f} {hem_y+ry*k:.1f} {cx-b*k:.1f} {hem_y+ry:.1f} {cx:.1f} {hem_y+ry:.1f} "
                f"C{cx+b*k:.1f} {hem_y+ry:.1f} {cx+b:.1f} {hem_y+ry*k:.1f} {cx+b:.1f} {hem_y:.1f} "
                f"C{cx+b-r*0.04:.1f} {hem_y-(hem_y-y_w)*0.25:.1f} {cx+a+r*0.1:.1f} {y_w+(hem_y-y_w)*0.45:.1f} {cx+a:.1f} {y_w:.1f} Z")
        out.append(part("skirt", outline(body, skirt)))
        if shadow:
            out.append(part("skirt", f'<clipPath id="{uid}k"><path d="{body}"/></clipPath><g clip-path="url(#{uid}k)">'
                       + flat(f"M{cx+a*0.3:.1f} {y_w:.1f} C{cx+b*0.62:.1f} {y_w+(hem_y-y_w)*0.4:.1f} {cx+b*0.58:.1f} {hem_y-ry:.1f} {cx+b*0.5:.1f} {hem_y+ry*2:.1f} L{cx+b+30:.1f} {hem_y+ry*2:.1f} L{cx+b+30:.1f} {y_w:.1f} Z", shade(skirt), 1, "s") + "</g>"))
        if view != "back" and skirt_fold:     # the back view keeps at most one fold line (the bodice's)
            out.append(part("skirt", fold((cx-b*0.62, hem_y-(hem_y-y_w)*0.42), (cx-b*0.74, hem_y-ry*1.4), 0.12)))
        g.update(hem_y=hem_y, hem_rx=b)
        for cur, s, fx, fy in leg_pts:            # the legs come out of the hem: start them inside it...
            lo, hi = 0.0, 1.0
            for _ in range(30):
                m = (lo + hi)/2
                if bez(*cur, m)[1] < hem_y - ry + lw*0.5 + LW*0.5 + 2: lo = m   # the round top stays inside the opening
                else: hi = m
            out.append(part("legs", tube(cpath(split(*cur, lo)[1]), lw, legwear or skin)))
        out.append(part("skirt", opening(cx, hem_y, b, ry, skirt)))  # ...and lay the opening over their tops, as a cuff sits over a wrist
    def draw_shoes():
        for cur, s, fx, fy in leg_pts:
            if view in ("front", "back", "q", "qr"):
                flip = s if view in ("front", "back") else (1 if view == "qr" else -1)
            else:
                flip = 1 if view == "sider" else -1
            out.append(part("shoes", (shoe_fn or shoe)(fx - flip*lw*0.7, fy + lw*0.9, lw*2.4, lw*1.5, flip, shoes)))
    if not skirt:
        for cur, s, fx, fy in leg_pts:
            out.append(part("legs", tube(cpath(cur), lw, pants if garments == "skin" else skin)))
        if shoes_under: draw_shoes()
        if garments == "volume":
            for cur, s, fx, fy in leg_pts:
                out.append(part("legs", sleeve(cur, lw, pants, frac=hem_frac, ratio=1.6, cuff_ry=cuff_ry if hem_ry is None else hem_ry, tuck=garment_tuck)))
    if skirt or not shoes_under: draw_shoes()
    if mid:
        out.append(part("mid", mid(g)))
    # ---- torso ----
    bp = bean_path(cx, y0, y1, r, sw, lean)
    out.append(part("torso", outline(bp, shirt if garments != "none" else skin)))
    if shadow:
        out.append(part("torso", f'<clipPath id="{uid}t"><path d="{bp}"/></clipPath><g clip-path="url(#{uid}t)">'
                   + flat(f"M{cx+r*0.3:.1f} {y0:.1f} C{cx+r*1.2:.1f} {y0+(y1-y0)*0.3:.1f} {cx+r*1.1:.1f} {y1-r*0.4:.1f} {cx:.1f} {y1+4:.1f} L{cx+r+20:.1f} {y1+4:.1f} L{cx+r+20:.1f} {y0-20:.1f} Z", shade(shirt if garments != "none" else skin), 1, "s") + "</g>"))
    if garments == "volume":
        # collar: ellipse with a lip at the shoulders, and one hem lip at the bean bottom
        out.append(part("torso", line(f"M{cx-r*0.55:.1f} {y1-r*0.12:.1f} C{cx-r*0.2:.1f} {y1+r*0.02:.1f} {cx+r*0.2:.1f} {y1+r*0.02:.1f} {cx+r*0.55:.1f} {y1-r*0.12:.1f}")))
        if torso_fold: out.append(part("torso", fold((cx-r*0.5+dx_sh*0.5, y0+(y1-y0)*0.45), (cx-r*0.2, y1-r*0.6), 0.1)))
    # ---- arms ----
    arm_len = (y1 + legs_len*0.22) - (y0 + sw*0.1)
    arm_pts = []
    for i, s in enumerate((-1, 1)):
        ax = cx + dx_sh + s*(sw/2 - lw*0.3); ay = y0 + sw*0.12
        if arms and arms[i]:
            hx, hy = ax + arms[i][0]*lw, ay + arms[i][1]*lw
            bow = -0.2*s
        else:
            hx, hy = cx + s*(r + lw*0.7), ay + arm_len
            bow = 0.1*s
        arm_pts.append((limb_curve((ax, ay), (hx, hy), bow), s, hx, hy))
    def draw_arm(i):
        cur, s, hx, hy = arm_pts[i]
        o = [tube(cpath(cur), lw, skin)]
        if garments == "skin": o.append(tube_fill(cpath(split(*cur, 0.55)[0]), lw, shirt))
        if garments == "volume": o.append(sleeve(cur, lw, shirt, frac=sleeve_frac, ratio=sleeve_ratio, cuff_ry=cuff_ry, tuck=garment_tuck))
        tx, ty = bez_tan(*cur, 1.0)
        rot = math.degrees(math.atan2(-ty, tx)) - 90   # fingers continue along the limb
        px, py = hx + tx*lw*0.12, hy + ty*lw*0.12
        pr = props[i](px, py, rot + hand_rot[i], lw*0.38*hand_scale[i]) if callable(props[i]) else props[i]
        o.append(hand(px, py, hands[i], fw=lw*0.38, rot=rot + hand_rot[i], fill=skin, wrist=False, scale=hand_scale[i], prop=pr, palm=hand_palm[i]))
        return "\n".join(o)
    near = {"q": 0, "qb": 1, "side": 0, "qr": 1, "qbr": 0, "sider": 1}.get(view)
    far_first = view in ("q", "qr", "qb", "qbr")
    if far_first:
        # far arm goes behind the torso: re-insert before the torso block
        torso_idx = len(out) - (3 if garments == "volume" else 1) - (1 if shadow else 0) - (1 if mid else 0)
        out.insert(torso_idx, part("arm-far", draw_arm(1 - near)))
        out.append(part("arm-near", draw_arm(near)))
    elif view in ("side", "sider"):
        out.append(part("arm-near", draw_arm(near)))
    else:
        out.append(part("arm", draw_arm(0))); out.append(part("arm", draw_arm(1)))
    if garments == "volume" and collar:
        out.append(part("collar", opening(cx + dx_sh, y0 + sw*0.16, head_w*0.66, sw*0.13, shirt)))
    # ---- head ----
    hx0 = cx + dx_sh + head_dx - head_w/2
    out.append(part("head", head(hx0, head_y, head_w, head_h, skin, hview, eyes, mouth_kind, shadow, hair, uid + "h", human_ears)))
    for acc in accessories:
        out.append(part("accessory", accessory(acc, hx0, head_y, head_w, head_h, cx + dx_sh, y0, sw, hview)))
    if over:
        out.append(part("over", over(g)))
    return f'<g data-figure="{uid}">' + "\n".join(out) + "</g>" if TAGS else "\n".join(out)

def accessory(kind, hx, hy, hw, hh, scx, sy0, sw, view):
    """small identity props: glasses | scarf | bow | badge"""
    ey = hy + hh/3
    if kind == "glasses" and view in ("front", "q", "qr"):
        g = hw*0.36; r = hw*0.115
        if view == "front": xs = (hx+hw/2-g/2, hx+hw/2+g/2)
        else: xs = (hx+hw*0.6, hx+hw*0.2) if view == "q" else (hx+hw*0.4, hx+hw*0.8)
        return line(ellipse_path(xs[0], ey, r, r*0.85)) + line(ellipse_path(xs[1], ey, r if view == "front" else r*0.7, r*0.85)) + line(f"M{min(xs)+r*0.9:.1f} {ey:.1f} L{max(xs)-r*0.9:.1f} {ey:.1f}")
    if kind == "scarf":
        return outline(ellipse_path(scx, sy0 + sw*0.2, sw*0.46, sw*0.14), PINK) + outline(f"M{scx+hw*0.2:.1f} {sy0+sw*0.26:.1f} C{scx+hw*0.5:.1f} {sy0+sw*0.6:.1f} {scx+hw*0.5:.1f} {sy0+sw*0.9:.1f} {scx+hw*0.3:.1f} {sy0+sw*1.1:.1f} C{scx+hw*0.15:.1f} {sy0+sw*0.9:.1f} {scx+hw*0.1:.1f} {sy0+sw*0.6:.1f} {scx+hw*0.2:.1f} {sy0+sw*0.26:.1f} Z", PINK)
    if kind == "bow":
        bx, by = hx + hw*0.78, hy - hh*0.02
        return outline(f"M{bx:.1f} {by:.1f} C{bx-hw*0.3:.1f} {by-hh*0.18:.1f} {bx-hw*0.3:.1f} {by+hh*0.1:.1f} {bx:.1f} {by:.1f} C{bx+hw*0.3:.1f} {by-hh*0.18:.1f} {bx+hw*0.3:.1f} {by+hh*0.1:.1f} {bx:.1f} {by:.1f} Z", YEL) + blob(bx, by, hw*0.06, hw*0.06, YEL)
    if kind == "badge":
        return blob(scx - sw*0.22, sy0 + sw*0.55, sw*0.1, sw*0.1, YEL)
    return ""
