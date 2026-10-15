"""Make a drawing draw itself: an animated SVG (SMIL, no script) that replays how the sheet is built.

    python3 drawon.py IN.svg OUT.svg [--budget 12] [--preview OUT.mp4]

Four passes, the way an illustrator works:
  1. inks    every ink line is traced with stroke-dashoffset by one pen. A tube (an ink stroke with its colour core on
             the same path) grows as an outlined noodle; a closed shape fills with paper the moment its outline closes,
             so from then on it hides what is behind it. Labels and solid ink marks appear in their turn.
  2. flats   each paper fill and each tube core floods to its colour, in the same order.
  3. shading the saturated shadows (class "s", and the clip groups that hold them) fade in.
  4. fx      strokeless matter (class "fx": blush, inner ears, sparkles, confetti) appears last.

Order: document order, except inside a character drawn by house.figure() with HOUSE_TAGS=1, whose parts are drawn the
way an artist would: head, hair, ears, torso, arms, tail, skirt, legs, shoes. The last frame is the original drawing.
How long the line work takes grows with the square root of the number of strokes (--budget caps it, in seconds).

No browser needed to build: path lengths are measured here (lines, cubic/quadratic Béziers, arcs, transforms).
--preview renders an MP4 (and a GIF next to it) by seeking the SMIL clock in Chromium; that part needs Playwright.
Import it to use from Python: animate(svg_text) -> (animated_svg_text, seconds).
"""
import argparse
import math
import os
import re
import xml.etree.ElementTree as ET

SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)
PAPER, INK = "#FFEAD2", "#2B2135"
SKIP = {"style", "defs", "clipPath", "title", "desc", "metadata", "linearGradient", "radialGradient", "mask",
        "pattern", "symbol", "filter", "animate", "set"}
LEAVES = {"path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "text"}
PAINT = ("fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "fill-opacity", "stroke-linecap",
         "stroke-linejoin", "stroke-opacity")
# parts from house.figure(HOUSE_TAGS=1), in the order an artist draws a character: head first, outward from there
PART_RANK = {"head": 0, "over": 1, "under": 2, "accessory": 3, "collar": 4, "torso": 5, "arm-near": 6, "arm": 6,
             "arm-far": 7, "mid": 8, "skirt": 9, "legs": 10, "shoes": 11, "ground": 12}


def tag(el):
    return el.tag.split("}", 1)[-1]


# ---------- geometry: sample every element as polylines, in its own coordinates ----------
NUM = r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?"
TOK = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|" + NUM)


def _arc(x1, y1, rx, ry, phi, fa, fs, x2, y2):
    """SVG endpoint arc -> points (implementation notes F.6.5)"""
    if rx == 0 or ry == 0 or (x1 == x2 and y1 == y2):
        return [(x2, y2)]
    rx, ry = abs(rx), abs(ry)
    c, s = math.cos(math.radians(phi)), math.sin(math.radians(phi))
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p, y1p = c * dx + s * dy, -s * dx + c * dy
    lam = x1p ** 2 / rx ** 2 + y1p ** 2 / ry ** 2
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    k = math.sqrt(max(0.0, num / den)) if den else 0.0
    if fa == fs:
        k = -k
    cxp, cyp = k * rx * y1p / ry, -k * ry * x1p / rx
    cx, cy = c * cxp - s * cyp + (x1 + x2) / 2, s * cxp + c * cyp + (y1 + y2) / 2

    def ang(ux, uy, vx, vy):
        a = math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        return a
    t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not fs and dt > 0:
        dt -= 2 * math.pi
    elif fs and dt < 0:
        dt += 2 * math.pi
    n = max(4, int(abs(dt) / (math.pi / 24)))
    pts = []
    for i in range(1, n + 1):
        t = t1 + dt * i / n
        pts.append((cx + rx * math.cos(t) * c - ry * math.sin(t) * s, cy + rx * math.cos(t) * s + ry * math.sin(t) * c))
    return pts


def _bez(p, steps):
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        if len(p) == 4:
            x = u ** 3 * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t ** 3 * p[3][0]
            y = u ** 3 * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t ** 3 * p[3][1]
        else:
            x = u * u * p[0][0] + 2 * u * t * p[1][0] + t * t * p[2][0]
            y = u * u * p[0][1] + 2 * u * t * p[1][1] + t * t * p[2][1]
        out.append((x, y))
    return out


def path_polylines(d):
    toks = TOK.findall(d or "")
    polys, cur = [], None
    x = y = sx = sy = 0.0
    lc = None           # last control point, for S/T
    cmd, i = None, 0

    def nums(k):
        nonlocal i
        v = [float(t) for t in toks[i:i + k]]
        i += k
        return v
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]
            i += 1
            if cmd in "Zz":
                if cur:
                    cur.append((sx, sy))
                x, y, lc = sx, sy, None
                continue
        elif cmd is None:
            break
        rel = cmd.islower()
        C = cmd.upper()
        ox, oy = (x, y) if rel else (0.0, 0.0)
        if C == "M":
            a, b = nums(2)
            x, y = ox + a, oy + b
            sx, sy = x, y
            cur = [(x, y)]
            polys.append(cur)
            cmd = "l" if rel else "L"          # implicit lineto after a moveto
            lc = None
            continue
        if cur is None:
            cur = [(x, y)]
            polys.append(cur)
        if C == "L":
            a, b = nums(2)
            x, y = ox + a, oy + b
            cur.append((x, y))
            lc = None
        elif C == "H":
            (a,) = nums(1)
            x = ox + a
            cur.append((x, y))
            lc = None
        elif C == "V":
            (b,) = nums(1)
            y = oy + b
            cur.append((x, y))
            lc = None
        elif C in "CS":
            if C == "C":
                v = nums(6)
                c1 = (ox + v[0], oy + v[1])
                c2, e = (ox + v[2], oy + v[3]), (ox + v[4], oy + v[5])
            else:
                v = nums(4)
                c1 = (2 * x - lc[0], 2 * y - lc[1]) if lc else (x, y)
                c2, e = (ox + v[0], oy + v[1]), (ox + v[2], oy + v[3])
            chord = math.dist((x, y), e) + math.dist((x, y), c1) + math.dist(c1, c2) + math.dist(c2, e)
            cur.extend(_bez([(x, y), c1, c2, e], max(6, min(64, int(chord / 6)))))
            lc = c2
            x, y = e
        elif C in "QT":
            if C == "Q":
                v = nums(4)
                c1, e = (ox + v[0], oy + v[1]), (ox + v[2], oy + v[3])
            else:
                v = nums(2)
                c1 = (2 * x - lc[0], 2 * y - lc[1]) if lc else (x, y)
                e = (ox + v[0], oy + v[1])
            chord = math.dist((x, y), c1) + math.dist(c1, e)
            cur.extend(_bez([(x, y), c1, e], max(6, min(64, int(chord / 6)))))
            lc = c1
            x, y = e
        elif C == "A":
            v = nums(7)
            e = (ox + v[5], oy + v[6])
            cur.extend(_arc(x, y, v[0], v[1], v[2], int(v[3]), int(v[4]), e[0], e[1]))
            x, y = e
            lc = None
        else:
            i += 1
    return polys


def ellipse_pts(cx, cy, rx, ry, n=96):
    return [[(cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n)) for k in range(n + 1)]]


def geometry(el):
    t = tag(el)
    f = lambda k, dv=0.0: float(re.match(NUM, el.get(k, str(dv))).group(0)) if el.get(k) else dv
    if t == "path":
        return path_polylines(el.get("d"))
    if t == "circle":
        return ellipse_pts(f("cx"), f("cy"), f("r"), f("r"))
    if t == "ellipse":
        return ellipse_pts(f("cx"), f("cy"), f("rx"), f("ry"))
    if t == "rect":
        x, y, w, h = f("x"), f("y"), f("width"), f("height")
        return [[(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]]
    if t == "line":
        return [[(f("x1"), f("y1")), (f("x2"), f("y2"))]]
    if t in ("polyline", "polygon"):
        v = [float(n) for n in re.findall(NUM, el.get("points", ""))]
        p = list(zip(v[0::2], v[1::2]))
        return [p + ([p[0]] if t == "polygon" and p else [])]
    return []


# ---------- transforms ----------
def mat_mul(a, b):
    return (a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3],
            a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5])


def parse_transform(s):
    m = (1, 0, 0, 1, 0, 0)
    for name, args in re.findall(r"(\w+)\s*\(([^)]*)\)", s or ""):
        v = [float(n) for n in re.findall(NUM, args)]
        if name == "translate":
            t = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
        elif name == "scale":
            t = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif name == "rotate":
            a = math.radians(v[0])
            r = (math.cos(a), math.sin(a), -math.sin(a), math.cos(a), 0, 0)
            if len(v) == 3:
                t = mat_mul(mat_mul((1, 0, 0, 1, v[1], v[2]), r), (1, 0, 0, 1, -v[1], -v[2]))
            else:
                t = r
        elif name == "matrix":
            t = tuple(v[:6])
        elif name == "skewX":
            t = (1, 0, math.tan(math.radians(v[0])), 1, 0, 0)
        elif name == "skewY":
            t = (1, math.tan(math.radians(v[0])), 0, 1, 0, 0)
        else:
            continue
        m = mat_mul(m, t)
    return m


def apply(m, p):
    return (m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5])


# ---------- styles: inline the few class rules the early katas use, so SMIL can override everything ----------
def flatten_styles(root):
    rules = {}
    for st in list(root.iter(f"{{{SVG}}}style")):
        for sel, body in re.findall(r"([^{}]+)\{([^}]*)\}", st.text or ""):
            props = dict((k.strip(), v.strip()) for k, v in (kv.split(":", 1) for kv in body.split(";") if ":" in kv))
            for s in sel.split(","):
                s = s.strip()
                if re.fullmatch(r"\.[\w-]+", s):
                    rules.setdefault(s[1:], {}).update(props)
    for parent in list(root.iter()):
        for st in [c for c in parent if tag(c) == "style"]:
            parent.remove(st)
    for el in root.iter():
        eff = {}
        for c in el.get("class", "").split():
            eff.update(rules.get(c, {}))
        if el.get("style"):
            eff.update(dict((k.strip(), v.strip()) for k, v in (kv.split(":", 1) for kv in el.get("style").split(";") if ":" in kv)))
            del el.attrib["style"]
        for k, v in eff.items():
            el.set(k, v)                # class rules and inline style both beat presentation attributes


# ---------- the animation ----------
class Leaf:
    __slots__ = ("el", "parent", "idx", "kind", "local_len", "len", "bbox", "fig", "part", "paint")


def classify(el, paint):
    t = tag(el)
    cls = el.get("class", "").split()
    fill, stroke = paint.get("fill", "#000000"), paint.get("stroke", "none")
    if t == "text":
        return "text"
    if "s" in cls:
        return "shade"
    if "fx" in cls:
        return "fx"
    has_stroke = stroke not in ("none", "") and float(paint.get("stroke-width", "1") or 1) > 0
    has_fill = fill not in ("none", "")
    if has_stroke and paint.get("stroke-dasharray", "none") not in ("none", ""):
        return "fadeline"           # a dashed construction line: it appears, it isn't drawn
    if has_stroke:
        return "shape" if has_fill else "stroke"
    if has_fill:
        return "inkfill" if fill.upper() == INK else "flat"
    return None


def walk(root):
    """leaves in document order, with inherited paint, the figure/part they belong to and their transform"""
    leaves, groups = [], []

    def rec(el, inh, m, fig, part):
        for ch in list(el):
            t = tag(ch)
            if t in SKIP or not isinstance(ch.tag, str):
                continue
            paint = dict(inh)
            for k in PAINT:
                if ch.get(k) is not None and k not in ("opacity",):
                    paint[k] = ch.get(k)
            m2 = mat_mul(m, parse_transform(ch.get("transform"))) if ch.get("transform") else m
            if t == "g":
                f2 = ch.get("data-figure") and (ch, len(leaves)) or fig
                p2 = ch.get("data-part") or part
                if ch.get("clip-path"):
                    groups.append((ch, el, len(leaves)))
                rec(ch, paint, m2, f2, p2)
                continue
            if t not in LEAVES:
                continue
            lf = Leaf()
            lf.el, lf.parent, lf.idx, lf.fig, lf.part, lf.paint = ch, el, len(leaves), fig, part, paint
            lf.kind = classify(ch, paint)
            polys = geometry(ch)
            loc = can = 0.0
            xs, ys = [], []
            for poly in polys:
                tp = [apply(m2, p) for p in poly]
                for a, b in zip(poly, poly[1:]):
                    loc += math.dist(a, b)
                for a, b in zip(tp, tp[1:]):
                    can += math.dist(a, b)
                xs += [p[0] for p in tp]
                ys += [p[1] for p in tp]
            lf.local_len, lf.len = loc, can
            lf.bbox = (min(xs), min(ys), max(xs), max(ys)) if xs else (0, 0, 0, 0)
            leaves.append(lf)
    rec(root, {}, (1, 0, 0, 1, 0, 0), None, None)
    return leaves, groups


def anim(el, attr, frm, to, begin, dur, spline=None):
    a = ET.SubElement(el, f"{{{SVG}}}animate", attributeName=attr, values=f"{frm};{to}", begin=f"{begin:.3f}s",
                      dur=f"{max(dur, 0.01):.3f}s", fill="freeze")
    if spline:
        a.set("calcMode", "spline")
        a.set("keyTimes", "0;1")
        a.set("keySplines", spline)


def fmt(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def animate_tree(root, budget=12.0):
    flatten_styles(root)
    W = float(re.match(NUM, root.get("width", "0")).group(0)) if root.get("width") else 0
    H = float(re.match(NUM, root.get("height", "0")).group(0)) if root.get("height") else 0
    if (not W or not H) and root.get("viewBox"):
        W, H = [float(n) for n in re.findall(NUM, root.get("viewBox"))[2:4]]
    area = max(W * H, 1)
    leaves, groups = walk(root)

    # clip groups that only hold shadows fade in as one piece in the shading pass
    shade_groups = []
    for g, parent, first in groups:
        inner = [lf for lf in leaves if _inside(lf.el, g)]
        if inner and all(lf.kind == "shade" for lf in inner):
            shade_groups.append((g, first, inner))
            for lf in inner:
                lf.kind = None          # handled by the group
    # big fill-only shapes are the ground the drawing is made on (a sky, a dark panel): they stay put
    for lf in leaves:
        if lf.kind == "flat":
            x0, y0, x1, y1 = lf.bbox
            if (x1 - x0) * (y1 - y0) > 0.3 * area:
                lf.kind = None
        if lf.kind and tag(lf.el) == "rect" and lf.idx == 0:
            lf.kind = None              # the background sheet

    def key(lf):
        if lf.fig is not None:
            return (lf.fig[1], PART_RANK.get(lf.part, 13), lf.idx)
        return (lf.idx, 0, lf.idx)

    # units: a tube's ink and its core(s) share one path in one parent, so they are traced as one stroke
    units, by_geo = [], {}
    for lf in leaves:
        if lf.kind in ("shape", "stroke"):
            gk = (id(lf.parent), tag(lf.el), lf.el.get("d"), lf.el.get("cx"), lf.el.get("cy"), lf.el.get("r"),
                  lf.el.get("rx"), lf.el.get("ry"), lf.el.get("points"), lf.el.get("x1"), lf.el.get("y1"))
            if gk in by_geo:
                by_geo[gk].append(lf)
                continue
            by_geo[gk] = [lf]
            units.append(by_geo[gk])
        elif lf.kind in ("inkfill", "text", "fadeline"):
            units.append([lf])
    units.sort(key=lambda u: min(key(lf) for lf in u))

    # time budget: the line work takes ~1.1·√(strokes) seconds (capped), at one steady pen speed
    n = max(len(units), 1)
    B = min(max(1.1 * math.sqrt(n), 3.0), budget)
    gap = min(0.04, 0.25 * B / n)
    dmin = min(0.07, 0.45 * B / n)
    fixed = lambda u: u[0].kind in ("inkfill", "text", "fadeline")
    lens = [max(lf.len for lf in u) for u in units]

    def total(v):
        return sum(0.9 * (min(0.12, dmin * 2) if fixed(u) else min(max(L / v, dmin), 0.5)) + gap for u, L in zip(units, lens))
    lo, hi = 1500.0, 1e7
    if total(lo) > B:
        for _ in range(60):
            mid = math.sqrt(lo * hi)
            lo, hi = (mid, hi) if total(mid) > B else (lo, mid)
        speed = hi
    else:
        speed = lo

    t = 0.3
    flood = []                      # (key, element, attribute, colour)
    for u, L in zip(units, lens):
        lead = u[0]
        if fixed(u):
            dur = min(0.12, dmin * 2)
            for lf in u:
                op = lf.el.get("opacity", "1")
                lf.el.set("opacity", "0")
                anim(lf.el, "opacity", 0, op, t, dur)
        else:
            dur = min(max(L / speed, dmin), 0.5)
            has_ink = any(lf.paint.get("stroke", "").upper() == INK for lf in u)
            for lf in u:
                e = lf.el
                D = 1.02 * lf.local_len + 2
                e.set("stroke-dasharray", f"{fmt(D)} {fmt(2 * D + 4)}")
                e.set("stroke-dashoffset", fmt(D + 1))
                anim(e, "stroke-dashoffset", fmt(D + 1), 0, t, dur, "0.45 0 0.55 1")
                if lf.kind == "shape":           # paper fill the moment the outline closes, colour in the flats pass
                    col, fo = lf.paint.get("fill"), e.get("fill-opacity", "1")
                    e.set("fill", PAPER)
                    e.set("fill-opacity", "0")
                    anim(e, "fill-opacity", 0, fo, t + dur, 0.06)
                    if col.upper() != PAPER:
                        flood.append((key(lf), e, "fill", col))
                elif has_ink and lf.paint.get("stroke", "").upper() != INK:   # a tube's core: paper until the flats
                    col = lf.paint.get("stroke")
                    e.set("stroke", PAPER)
                    if col.upper() != PAPER:
                        flood.append((key(lf), e, "stroke", col))
        t += dur * 0.9 + gap
    t_inks = t + 0.3

    # flats: flood paper fills and tube cores to colour, and let the flat shapes in, in drawing order
    flats = sorted([(k, e, a, c) for k, e, a, c in flood] +
                   [(key(lf), lf.el, "opacity", None) for lf in leaves if lf.kind == "flat"], key=lambda x: x[0])
    step = min(0.045, 1.8 / max(len(flats), 1))
    t = t_inks
    for k, e, a, c in flats:
        if a == "opacity":
            op = e.get("opacity", "1")
            e.set("opacity", "0")
            anim(e, "opacity", 0, op, t, 0.22)
        else:
            anim(e, a, PAPER, c, t, 0.22)
        t += step
    t_flats = t + (0.25 if flats else 0)

    def fade(items, t, step, dur):
        for e in items:
            op = e.get("opacity", "1")
            e.set("opacity", "0")
            anim(e, "opacity", 0, op, t, dur)
            t += step
        return t
    shade = sorted([(key(lf), lf.el) for lf in leaves if lf.kind == "shade"] +
                   [((first, 0, first), g) for g, first, inner in shade_groups], key=lambda x: x[0])
    shade_key = {}
    for g, first, inner in shade_groups:      # a clip group sits where its first shadow sits
        shade_key[id(g)] = min(key(lf) for lf in inner)
    shade = sorted(shade, key=lambda x: shade_key.get(id(x[1]), x[0]))
    t_shade = fade([e for k, e in shade], t_flats, min(0.06, 0.9 / max(len(shade), 1)), 0.3) + (0.2 if shade else 0)
    fx = sorted([(key(lf), lf.el) for lf in leaves if lf.kind == "fx"], key=lambda x: x[0])
    end = fade([e for k, e in fx], t_shade, min(0.08, 0.9 / max(len(fx), 1)), 0.25) + 0.25
    root.set("data-duration", f"{end:.2f}")
    return end, {"units": len(units), "inks": round(t_inks, 2), "flats": round(t_flats, 2),
                 "shading": round(t_shade, 2), "end": round(end, 2), "speed": round(speed)}


def _inside(el, g):
    for d in g.iter():
        if d is el:
            return True
    return False


def animate(svg_text, budget=12.0):
    root = ET.fromstring(svg_text)
    end, marks = animate_tree(root, budget)
    return ET.tostring(root, encoding="unicode"), end


def build(src, out, budget=12.0):
    tree = ET.parse(src)
    end, marks = animate_tree(tree.getroot(), budget)
    tree.write(out, encoding="unicode", xml_declaration=False)
    return end, marks


def preview(svg, out, end, hold=2.0, fps=30, width=None):
    """frames by seeking the SMIL clock, then ffmpeg -> mp4 (and a gif next to it)"""
    import shutil
    import subprocess
    import tempfile
    from playwright.sync_api import sync_playwright
    root = ET.parse(svg).getroot()
    w, h = int(float(root.get("width"))), int(float(root.get("height")))
    fd = tempfile.mkdtemp(prefix=".frames-", dir=os.path.dirname(os.path.abspath(out)))
    n = int((end + hold) * fps)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto("file://" + os.path.abspath(svg))
        pg.evaluate("document.documentElement.pauseAnimations()")
        for k in range(n):
            pg.evaluate(f"document.documentElement.setCurrentTime({min(k / fps, end + 0.01):.4f})")
            pg.screenshot(path=f"{fd}/f{k:05d}.png")
        b.close()
    vf = f"scale={width}:-2:flags=lanczos," if width else ""
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", f"{fd}/f%05d.png",
                    "-vf", vf + "format=yuv420p", "-c:v", "libx264", "-crf", "18", out], check=True)
    gif = out.rsplit(".", 1)[0] + ".gif"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", out, "-vf",
                    "fps=15,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse",
                    gif], check=True)
    shutil.rmtree(fd)
    return out, gif


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--budget", type=float, default=12.0, help="most seconds the line work may take")
    ap.add_argument("--preview", default="")
    a = ap.parse_args()
    end, marks = build(a.src, a.out, a.budget)
    print("wrote", a.out, marks)
    if a.preview:
        print("wrote", *preview(a.out, a.preview, end))
