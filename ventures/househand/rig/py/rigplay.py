"""rigplay.py — the Python half of the rig playground (site/rig/index.html).

Pose a cast member from a small JSON pose, say where its handles are (hands, feet, head) and what each limb hangs from,
and blend two poses into one animated SVG with rig.py. It runs in the browser under Pyodide, on the same house.py the
plates are drawn with, so a pose made in the playground is a pose figure() can draw anywhere.

A pose (JSON):
    who        "bunny" | "unicorn"
    view       "front" | "q" | "qr" | "side" | "sider" | "back"
    arms, legs [[dx, dy], [dx, dy]]: where each hand / foot goes, in limb widths from its shoulder / hip
    hands      [pose, pose] from open, point, fist, peace, pinch, thumbsup, wave
    hand_rot   [deg, deg]; lean; head_dx, head_dy (px); hop (px off the ground)
    arm_bend, leg_bend  [b, b]: how far each limb bows (figure()'s arm_bow / leg_bow)
    body_dx    px: the whole figure across the stage (the feet go with it; the editor's body handle moves the legs back
               to keep them planted)
    arm_z      [z, z]: each arm "front", "behind", "hidden" or null (the view decides); front_arm, front_leg: 0, 1 or
               null, which arm and which leg is drawn over the other
    eyes, mouth_kind; Bunny: ears [[kind, tilt], [kind, tilt]] (up, flop, hang, droop), her right ear first, each
    with an optional bend; Unicorn: mood (up, alert, out, droop, or degrees of splay), swish (0..1)

ready(pose) fills in what a pose leaves out the way the cast draws it: the legs planted where figure() stands them
(with leg_bend 0.09, figure()'s own standing bow, the drawing is the cast's standing pose), Bunny's ears for the view,
Unicorn's mood and swish. The page calls it whenever the character or the view changes.
"""
import json

import house
import gen_bunny as B
import gen_unicorn as U
from rig import RigError, Timeline, animate, page

W, H = 640, 800
CX, GROUND, HEAD = 320, 728, 112
CAST = {"bunny": B, "unicorn": U}
VW = {"front": 1.0, "back": 1.0, "q": 0.93, "qr": 0.93, "qb": 0.93, "qbr": 0.93, "side": 0.78, "sider": 0.78}
_figure = house.figure
SEEN = {}


def _spy(cx, ground, **kw):
    """figure() as the cast calls it, noting what the playground needs: the figure's geometry (which keeps the arm and
    hip roots and the layer order it chose), where each hand lands and where each foot is planted. It draws exactly what figure() draws."""
    SEEN.clear()
    SEEN.update(hands=[None, None], feet=[], kw=dict(kw))

    def keep(f):
        def wrapped(g):
            SEEN.setdefault("g", g)        # the figure's own dict: it gains the arm and hip roots as it draws
            return f(g) if f else ""
        return wrapped
    for k in ("under", "mid", "over"):
        kw[k] = keep(kw.get(k))
    props = list(kw.get("props") or (None, None))
    for i in (0, 1):
        def probe(x, y, rot, fw, i=i, p=props[i]):
            SEEN["hands"][i] = (x, y)
            return p(x, y, rot, fw) if callable(p) else (p or "")
        props[i] = probe
    kw["props"] = tuple(props)
    real_shoe, lw = kw.get("shoe_fn") or house.shoe, kw.get("lw", 30)

    def shoe_fn(x, y, w, h, flip, fill):
        SEEN["feet"].append((x + flip*lw*0.7, y - lw*0.9))      # the foot's target, as figure() placed the shoe
        return real_shoe(x, y, w, h, flip, fill)
    kw["shoe_fn"] = shoe_fn
    return _figure(cx, ground, **kw)


B.figure = U.figure = _spy


def kwargs(p):
    """a JSON pose -> keyword arguments for bunny() / unicorn()"""
    view = p.get("view", "front")
    kw = dict(view=view, uid=p.get("uid", "rp"), eyes=p.get("eyes", "dot"), mouth_kind=p.get("mouth_kind", "smile"),
              arms=tuple(tuple(a) for a in p["arms"]), legs=tuple(tuple(a) for a in p["legs"]),
              hands=tuple(p.get("hands", ("open", "open"))), hand_rot=tuple(p.get("hand_rot", (0, 0))),
              lean=p.get("lean", 0.0), head_dx=p.get("head_dx", 0.0), head_dy=p.get("head_dy", 0.0),
              ground_shadow=False)                     # draw() lays the shadow itself, so it stays on the ground
    for k in ("arm_z", "front_arm", "front_leg"):         # layers: which limb is drawn over which
        if p.get(k) is not None:
            kw[k] = tuple(p[k]) if isinstance(p[k], list) else p[k]
    if p.get("arm_bend"): kw["arm_bow"] = tuple(p["arm_bend"])
    if p.get("leg_bend"): kw["leg_bow"] = tuple(p["leg_bend"])
    if p.get("who", "bunny") == "bunny":
        defaults = B.EARS[view]
        ears = p.get("ears") or [[d[1], d[3]] for d in defaults]
        kw.update(ear_pose=[(e[0], d[2], e[1]) + tuple(e[2:3]) for e, d in zip(ears, defaults)], skirt_fold=False)
    else:
        kw.update(mood=p.get("mood", "up"), swish=p.get("swish", 0.0), sparkles=int(p.get("sparkles", 0)))
    return kw


def shadow(p, cx=CX, ground=GROUND, head=HEAD):
    """the cast's ground shadow (as figure() draws it), left on the ground when she hops and smaller the higher she goes;
    cx: where it sits (draw() puts it between the feet)"""
    r, lw = head*0.5*VW.get(p.get("view", "front"), 1.0), head*0.25
    k = 1 - min(float(p.get("hop", 0)), 120.0)/240
    return house.flat(house.ellipse_path(cx, ground + 6, r*1.5*k, lw*0.55*k), house.shade(house.CREAM, 0.25, 0.08), 0.9, "s")


def draw(p, cx=CX, ground=GROUND, head=HEAD):
    who = CAST[p.get("who", "bunny")]
    body = (B.bunny if who is B else U.unicorn)(cx + float(p.get("body_dx", 0)), ground, head, **kwargs(p))
    feet = SEEN["feet"][:2]
    under_feet = sum(x for x, _ in feet)/len(feet) if feet else cx      # the shadow stays with the feet
    return shadow(p, under_feet, ground, head) + f'<g transform="translate(0 {-float(p.get("hop", 0)):.1f})">{body}</g>'


def _anchors(p):
    """what each limb hangs from, as figure() placed it (figure coordinates, before the hop)"""
    g = SEEN["g"]
    return list(g["arm_roots"]), list(g["hip_roots"])


def render(pose_json):
    """the drawing, and where its handles and anchors are"""
    p = json.loads(pose_json)
    svg = draw(p)
    g = SEEN["g"]
    arms, legs = _anchors(p)
    return json.dumps(dict(svg=svg, lw=g["lw"], hop=float(p.get("hop", 0)),
                           hands=SEEN["hands"], feet=SEEN["feet"][:2],
                           head=(g["head_x"] + g["head_w"]/2, g["head_y"] + g["head_h"]*0.14),    # the crown, clear of the face
                           body=((legs[0][0] + legs[1][0])/2, (legs[0][1] + legs[1][1])/2),   # between the hips
                           arm_anchors=arms, leg_anchors=legs, layers=g["layers"]))


STAND_BOW = 0.09          # figure()'s bow for a standing leg; an aimed leg defaults to 0.16, which crosses standing legs
ARM_BOW = -0.2            # figure()'s bow for an aimed arm


def standing(pose_json):
    """the pose with its legs as explicit targets exactly where figure() plants them standing (so they can be dragged)"""
    p = json.loads(pose_json)
    q = dict(p, legs=[[0, 0], [0, 0]])
    draw(q)                                        # one draw, for the geometry
    g, kw = SEEN["g"], SEEN["kw"]
    vw = VW.get(g["view"], 1.0)
    lw, r = g["lw"], g["r"]
    _, hips = _anchors(q)
    legs = []
    for (hx, hy), s in zip(hips, (-1, 1)):
        sx = 1 if (kw.get("leg_stack") and vw <= 0.8) else s
        fx = g["cx"] + kw.get("hip_dx", 0.0) + sx*((r*0.55 + lw*0.3) if vw > 0.8 else lw*0.35)
        fy = g["ground"] - lw*0.9
        legs.append([round((fx - hx)/lw, 3), round((fy - hy)/lw, 3)])
    return json.dumps(dict(p, legs=legs))


def ready(pose_json):
    """the pose with standing legs, and whatever else it leaves out filled in as the cast draws it"""
    p = json.loads(standing(pose_json))
    p.setdefault("arm_bend", [ARM_BOW, ARM_BOW])
    p.setdefault("leg_bend", [STAND_BOW, STAND_BOW])
    p.setdefault("body_dx", 0.0)
    p.setdefault("arm_z", [None, None])                # the view decides
    p.setdefault("front_arm", None)
    p.setdefault("front_leg", None)
    if p.get("who", "bunny") == "bunny":
        if not p.get("ears"):
            p["ears"] = [[d[1], d[3]] for d in B.EARS[p.get("view", "front")]]
    else:
        p.setdefault("mood", "up")
        p.setdefault("swish", 0.0)
    return json.dumps(p)


def animate_ab(a_json, b_json, seconds=1.2):
    """A -> B -> A on a loop, as one animated SVG. What can't morph (another view, eyes or mouth) switches halfway."""
    a, b = json.loads(a_json), json.loads(b_json)
    tl = Timeline([(0.0, a), (seconds/2, b), (seconds, a)], loop=True)
    try:
        body = animate(draw, tl, T=seconds, fps=12, cuts=True)
    except RigError as e:
        return json.dumps(dict(error=str(e)))
    return json.dumps(dict(svg=page(body, W, H), stats=animate.stats))


def still(pose_json):
    return page(draw(json.loads(pose_json)), W, H)
