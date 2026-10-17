#!/usr/bin/env python3
"""rig.py — pose House Hand characters, blend between poses, and turn the motion into one animated SVG.

A House Hand character is already a rubber-hose rig. figure() and the cast's wrappers (bunny(), unicorn()) take a pose:
where each hand and foot goes, in limb widths from the shoulder or hip; torso lean; head offset; hand poses and turns;
the face; for Bunny, the ears. This adds what an animator needs on top of that:

  blend(a, b, t)        the pose a fraction t of the way from a to b. Numbers and tuples of numbers blend; anything
                        else (a hand pose, a view, an ear kind) switches at the halfway mark.
  Timeline(keys)        key poses at times, eased between them; tl(t) is the pose at time t; it can loop. A key can
                        name the easing of the move into it: (t, pose, overshoot).
  ease, ease_in, ease_out, overshoot, linear
                        easings: slow in and out; speeding up; slowing down; past the key and back; constant.
  animate(draw, tl, T)  draws the character at evenly spaced times and returns ONE drawing in which every shape morphs
                        from frame to frame with SMIL (no script; it plays anywhere an SVG does). Within one view, every
                        pose draws the same shapes with the same path commands and only the numbers move, which is
                        exactly what SVG (and Lottie) can tween. A shape that changes kind on some frames (an open eye
                        that blinks shut, a smile that opens) is swapped for its other version there. A change of view
                        (a spin) changes the whole drawing: with cuts=True it cuts to a copy of the drawing in that
                        view; without, it is refused with the first difference, so it shows up as an error, not a glitch.
  page(body, w, h)      a whole SVG document around a drawing.

    import gen_bunny as B
    draw = lambda pose: B.bunny(320, 720, 110, **pose)
    tl = Timeline([(0.0, WAVE_A), (0.5, WAVE_B), (1.0, WAVE_A)], loop=True)
    open("bunny-wave.svg", "w").write(page(animate(draw, tl, T=1.0), 640, 800))

python3 rig.py   -> ../rig/bunny-wave.svg (+ .mp4/.gif previews with --preview). gen_hello.py is a longer piece.
"""
import copy
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from house import CREAM  # noqa: E402

SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)
NUM = re.compile(r"-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?")
TRANSFORM = re.compile(r"\s*(translate|scale|rotate|skewX|skewY)\(([^)]*)\)\s*$")


class RigError(Exception):
    pass


# ---------- poses ----------
def blend(a, b, t):
    """a pose a fraction t of the way from a to b (dicts, tuples and lists blend element by element)"""
    if isinstance(a, dict) and isinstance(b, dict):
        return {k: blend(a.get(k, b.get(k)), b.get(k, a.get(k)), t) for k in {**a, **b}}
    if isinstance(a, (tuple, list)) and isinstance(b, (tuple, list)) and len(a) == len(b):
        out = [blend(x, y, t) for x, y in zip(a, b)]
        return tuple(out) if isinstance(a, tuple) else out
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return a + (b - a)*t
    return a if t < 0.5 else b


def ease(u):
    """ease in and out: slow off a key pose, quick through the middle, slow into the next"""
    return u*u*(3 - 2*u)


def ease_in(u):
    """slow off the key, fast into the next: a fall, a throw"""
    return u*u


def ease_out(u):
    """fast off the key, slow into the next: a pop up, a settle"""
    return 1 - (1 - u)*(1 - u)


def linear(u):
    return u


def overshoot(u, s=1.70158):
    """arrive a little past the key (about 10%) and settle back onto it"""
    v = u - 1
    return 1 + v*v*((s + 1)*v + s)


class Timeline:
    """key poses at times. tl(t) is the pose at time t, eased between keys; with loop=True time wraps around.
    A key is (t, pose) or (t, pose, easing), the easing used for the move into that key."""
    def __init__(self, keys, loop=False, easing=ease):
        self.keys = sorted(((k[0], k[1], k[2] if len(k) > 2 else None) for k in keys), key=lambda k: k[0])
        self.loop, self.easing = loop, easing
        self.T = self.keys[-1][0]

    def __call__(self, t):
        ks = self.keys
        if self.loop and self.T > 0:
            t = t % self.T if t != self.T else self.T
        if t <= ks[0][0]:
            return dict(ks[0][1])
        for (t0, p0, _), (t1, p1, e) in zip(ks, ks[1:]):
            if t <= t1:
                return blend(p0, p1, (e or self.easing)((t - t0)/(t1 - t0) if t1 > t0 else 1.0))
        return dict(ks[-1][1])


# ---------- motion -> one animated svg ----------
def _tree(fragment):
    """the fragment's elements in document order, and each one's parent (an index, or -1 for the top)"""
    root = ET.fromstring(f'<g xmlns="{SVG}">{fragment}</g>')
    els, parents = [], []

    def walk(node, up):
        for child in node:
            els.append(child)
            parents.append(up)
            walk(child, len(els) - 1)
    walk(root, -1)
    return root, els, tuple(parents)


def _sig(e):
    return e.tag, tuple(sorted(e.attrib))


def _shape(els, parents):
    """what frames must share to morph into each other: the tree, and every element that holds others. A leaf may
    change kind (an eye from ellipse to path): it is swapped, not cut."""
    return parents, tuple(_sig(e) if len(e) else None for e in els)


def _difference(a, b, k):
    (_, ea, pa), (_, eb, pb) = a, b
    if len(ea) != len(eb):
        return f"frame {k} draws {len(eb)} shapes, frame 0 draws {len(ea)}: keep the view fixed, or let it cut (cuts=True)"
    for i, (x, y) in enumerate(zip(ea, eb)):
        if pa[i] != pb[i] or (len(x) and _sig(x) != _sig(y)):
            return f"frame {k}, shape {i}: {y.tag.split('}')[-1]} where frame 0 has {x.tag.split('}')[-1]}"
    return f"frame {k} doesn't line up with frame 0"


def _held(active, value_at, n):
    """a value for every frame: a shape's own on the frames it shows, else that of the nearest frame where it does"""
    out, j = [], 0
    for k in range(n + 1):
        while j + 1 < len(active) and active[j + 1] <= k:
            j += 1
        out.append(value_at(active[j]))
    return out


def _keep(vals, discrete, tolerance=0.0):
    """the frames worth a key: an interior frame equal to the frames either side of it adds nothing. With a tolerance
    (in drawing units), so does a run of frames that a straight tween between its ends passes within it of."""
    n = len(vals) - 1
    if discrete:
        return [k for k in range(n + 1) if k == 0 or vals[k] != vals[k - 1]]
    if not tolerance:
        return [k for k in range(n + 1) if k in (0, n) or vals[k] != vals[k - 1] or vals[k] != vals[k + 1]]
    nums = [[float(x) for x in NUM.findall(v)] for v in vals]

    def straight(a, b):
        return all(abs(x0 + (x1 - x0)*(k - a)/(b - a) - xk) <= tolerance
                   for k in range(a + 1, b) for x0, x1, xk in zip(nums[a], nums[b], nums[k]))
    keep, a = [0], 0
    while a < n:
        b = a + 1
        while b < n and straight(a, b + 1):
            b += 1
        keep.append(b)
        a = b
    return keep


def _key(node, attr, vals, n, T, discrete=None, tolerance=0.0):
    """an <animate> for one attribute over the whole loop. Returns 'moving', 'stepped', or None if it never changes."""
    if len(set(vals)) == 1:
        return None
    tag, kind = "animate", {}
    if attr == "transform":                                       # SMIL moves a transform with <animateTransform>
        m = [TRANSFORM.match(v) for v in vals]
        if not all(m) or len({x.group(1) for x in m}) > 1:
            raise RigError(f"can't tween transform {vals[0]!r} into {next(v for v in vals if v != vals[0])!r}")
        tag, kind = "animateTransform", dict(type=m[0].group(1))
        vals = [" ".join(x.group(2).replace(",", " ").split()) for x in m]
    if discrete is None:
        discrete = len({NUM.sub("#", v) for v in vals}) > 1       # numbers move smoothly only in the same skeleton
    keep = _keep(vals, discrete, tolerance)
    a = ET.SubElement(node, f"{{{SVG}}}{tag}", attributeName=attr, **kind, dur=f"{T:g}s", repeatCount="indefinite",
                      values=";".join(vals[k] for k in keep), keyTimes=";".join(f"{k/n:.5f}" for k in keep),
                      calcMode="discrete" if discrete else "linear")
    a.tail = None
    return "stepped" if discrete else "moving"


REF = re.compile(r"url\(#([^)]+)\)")


def _align_ids(els, base):
    """give a frame's elements the ids its group's first frame gave them: ids a drawing generates (a counter, say)
    differ from call to call, and an <animate> can't move an id, so they are made to match instead"""
    rename = {e.get("id"): b.get("id") for e, b in zip(els, base)
              if e.get("id") and b.get("id") and e.get("id") != b.get("id")}
    if not rename:
        return
    for e in els:
        for k, v in list(e.attrib.items()):
            if k == "id" and v in rename:
                e.set(k, rename[v])
            elif "#" in v:
                w = REF.sub(lambda m: f"url(#{rename.get(m.group(1), m.group(1))})", v)
                if k.endswith("href") and w.startswith("#"):
                    w = "#" + rename.get(w[1:], w[1:])
                if w != v:
                    e.set(k, w)


def _suffix_ids(root, suffix):
    """rename every id under root, and every reference to one, so copies of a drawing don't share ids"""
    ids = {e.get("id") for e in root.iter() if e.get("id")}
    if not ids:
        return
    for e in root.iter():
        for k, v in list(e.attrib.items()):
            if k == "id" and v in ids:
                e.set(k, v + suffix)
            elif "#" in v:
                w = REF.sub(lambda m: f"url(#{m.group(1)}{suffix})" if m.group(1) in ids else m.group(0), v)
                if k.endswith("href") and w.startswith("#") and w[1:] in ids:
                    w += suffix
                if w != v:
                    e.set(k, w)


def animate(draw, pose_at, T, fps=12, cuts=False, tolerance=0.0):
    """draw the character at fps frames a second for T seconds and morph between the frames with SMIL.
    Returns the drawing as an svg fragment: frame 0's shapes, each carrying its own <animate> for whatever moves.
    A renderer without SMIL shows frame 0, so make the timeline start on the pose that should stand for the whole.
    tolerance (drawing units, e.g. 0.3) drops the keys a straight tween reproduces that closely: a smaller file."""
    n = max(2, round(T*fps))
    frames = [_tree(draw(pose_at(T*k/n))) for k in range(n + 1)]     # the last frame closes the loop
    shapes = [_shape(els, parents) for _, els, parents in frames]
    groups = {}                                                       # frames that line up, in order of first use
    for k, s in enumerate(shapes):
        groups.setdefault(s, []).append(k)
    groups = sorted(groups.values(), key=lambda ks: ks[0])
    if len(groups) > 1 and not cuts:
        k = groups[1][0]
        raise RigError(_difference(frames[0], frames[k], k))
    for active in groups:
        for k in active[1:]:
            _align_ids(frames[k][1], frames[active[0]][1])
    stats = dict(frames=n, moving=0, stepped=0, swaps=0, cuts=len(groups) - 1)
    out = []
    for c, active in enumerate(groups):
        root, els, parents = frames[active[0]]
        for i, node in enumerate(els):
            variants = {}                                             # this shape's kinds over the frames it's in
            for k in active:
                variants.setdefault(_sig(frames[k][1][i]), []).append(k)
            if len(node) or len(variants) == 1:
                for attr in sorted(node.attrib):
                    r = _key(node, attr, _held(active, lambda k: frames[k][1][i].get(attr), n), n, T, tolerance=tolerance)
                    if r:
                        stats[r] += 1
                continue
            parent = root if parents[i] < 0 else els[parents[i]]
            at = list(parent).index(node)
            for v, shown in enumerate(sorted(variants.values(), key=lambda ks: ks[0])):
                if v:                                                 # the other kind, laid in the same place
                    node = copy.deepcopy(frames[shown[0]][1][i])
                    node.set("display", "none")
                    at += 1
                    parent.insert(at, node)
                    stats["swaps"] += 1
                for attr in sorted(a for a in node.attrib if a != "display"):
                    r = _key(node, attr, _held(shown, lambda k: frames[k][1][i].get(attr), n), n, T, tolerance=tolerance)
                    if r:
                        stats[r] += 1
                on = set(shown)
                _key(node, "display", _held(active, lambda k: "inline" if k in on else "none", n), n, T, discrete=True)
        if len(groups) == 1:
            out.append("".join(ET.tostring(ch, encoding="unicode") for ch in root))
            break
        if c:
            _suffix_ids(root, f"-c{c}")
        g = ET.Element(f"{{{SVG}}}g")
        if c:
            g.set("display", "none")
        g.extend(list(root))
        on = set(active)
        _key(g, "display", ["inline" if k in on else "none" for k in range(n + 1)], n, T, discrete=True)
        out.append(ET.tostring(g, encoding="unicode"))
    animate.stats = stats
    return "".join(out)


def page(body, w, h, bg=CREAM):
    return (f'<svg xmlns="{SVG}" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<rect width="{w}" height="{h}" fill="{bg}"/>{body}</svg>\n')


# ---------- Bunny's poses ----------
REST_L = dict(arm=(-3.3, 6.9), rot=-34)            # the near arm hanging, hand flared off the skirt
FACE = dict(eyes="happy", mouth_kind="open", collar=False)

WAVE_A = dict(FACE, view="front", arms=(REST_L["arm"], (4.4, -2.9)), hands=("open", "wave"),
              hand_rot=(REST_L["rot"], -16), lean=-0.02, head_dx=-3.0, head_dy=0.0,
              ear_pose=[("flop", -1, -5), ("up", 1, 6)])
WAVE_B = dict(WAVE_A, arms=(REST_L["arm"], (4.9, -2.3)), hand_rot=(REST_L["rot"], 24), lean=0.025, head_dx=3.0,
              ear_pose=[("flop", -1, -11), ("up", 1, 14)])


if __name__ == "__main__":
    import gen_bunny as B
    out = os.path.join(HERE, "..", "rig")
    os.makedirs(out, exist_ok=True)
    draw = lambda pose: B.bunny(320, 720, 112, uid="w", **pose)
    tl = Timeline([(0.0, WAVE_A), (0.55, WAVE_B), (1.1, WAVE_A)], loop=True)
    svg = page(animate(draw, tl, T=1.1, fps=12), 640, 800)
    path = os.path.join(out, "bunny-wave.svg")
    open(path, "w").write(svg)
    print("wrote", os.path.relpath(path), f"{len(svg)/1000:.0f} KB", animate.stats)
    if "--preview" in sys.argv:
        import drawon
        print(drawon.preview(path, os.path.join(out, "bunny-wave.mp4"), end=3.3, hold=0.0, fps=30))
