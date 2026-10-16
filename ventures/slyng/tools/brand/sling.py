"""Slingshot-Y construction in font units (y up).

The Y is built from its centreline: two arms that would meet at (cx, yc),
a handle down to `base`, arm width `wa`, handle width `w`. The inner crotch
gets a round 'U' fillet (what makes it read as a slingshot fork), the outer
junction an optional fillet, tips are cut flat at H or capped round, and the
handle ends flat or round.
"""
import math


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".") if abs(v) < 1e7 else str(v)


class P:
    """Tiny path builder (font units, y up)."""

    def __init__(self):
        self.d = []
        self.pt = None

    def M(self, p):
        self.d.append(f"M{f(p[0])} {f(p[1])}")
        self.pt = p
        return self

    def L(self, p):
        self.d.append(f"L{f(p[0])} {f(p[1])}")
        self.pt = p
        return self

    def C(self, c1, c2, p):
        self.d.append(f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p[0])} {f(p[1])}")
        self.pt = p
        return self

    def arc(self, c, r, a0, a1):
        """Circular arc around c from angle a0 to a1 (radians, math sense)."""
        n = max(1, int(math.ceil(abs(a1 - a0) / (math.pi / 2) - 1e-9)))
        da = (a1 - a0) / n
        k = 4 / 3 * math.tan(da / 4)
        for i in range(n):
            t0 = a0 + i * da
            t1 = t0 + da
            p0 = (c[0] + r * math.cos(t0), c[1] + r * math.sin(t0))
            p3 = (c[0] + r * math.cos(t1), c[1] + r * math.sin(t1))
            c1 = (p0[0] - k * r * math.sin(t0), p0[1] + k * r * math.cos(t0))
            c2 = (p3[0] + k * r * math.sin(t1), p3[1] - k * r * math.cos(t1))
            if self.pt is None:
                self.M(p0)
            self.C(c1, c2, p3)
        return self

    def Z(self):
        self.d.append("Z")
        return self

    def s(self):
        return " ".join(self.d)


def add(a, b, k=1.0):
    return (a[0] + k * b[0], a[1] + k * b[1])


def ang(v):
    return math.atan2(v[1], v[0])


class SlingY:
    def __init__(self, cx, H, base, w, wa, a, yc, r_u=0.0, r_o=0.0,
                 tips="flat", bottom="flat", tip_over=0.0, flare=0.0):
        self.cx, self.H, self.base = cx, H, base
        self.w, self.wa, self.a, self.yc = w, wa, a, yc
        self.r_u, self.r_o = r_u, r_o
        self.tips, self.bottom = tips, bottom
        self.tip_over = tip_over
        self.flare = flare  # handle gets wider toward the bottom by this much (each side)
        # arm angle from vertical
        self.Hc = H - (wa / 2 if tips == "round" else 0) + tip_over
        self.phi = math.atan2(a, self.Hc - yc)
        self.sp, self.cp = math.sin(self.phi), math.cos(self.phi)
        self.tn = math.tan(self.phi)

    # x of left arm edges at height y (right arm mirrors)
    def x_out(self, y):
        return self.cx - self.a - (self.wa / 2) / self.cp + (self.Hc - y) * self.tn

    def x_in(self, y):
        return self.cx - self.a + (self.wa / 2) / self.cp + (self.Hc - y) * self.tn

    def centre(self, y):
        return self.cx - self.a + (self.Hc - y) * self.tn

    def geometry(self):
        cx, w = self.cx, self.w
        sp, cp, tn = self.sp, self.cp, self.tn
        # inner V point on the centre line
        y_v = self.Hc - ((self.a - (self.wa / 2) / cp) / tn)
        # fillet in the V
        r = self.r_u
        t = r / tn if r > 0 else 0
        TL = (cx - t * sp, y_v + t * cp)
        TR = (cx + t * sp, y_v + t * cp)
        Cu = (cx, y_v + (r / sp if r > 0 else 0))
        # outer junction with the handle edge x = cx - w/2
        y_j = self.Hc - ((self.a + (self.wa / 2) / cp - w / 2) / tn)
        return dict(y_v=y_v, TL=TL, TR=TR, Cu=Cu, y_j=y_j,
                    u_bottom=Cu[1] - r if r > 0 else y_v)

    def path(self):
        g = self.geometry()
        cx, w, H, base = self.cx, self.w, self.H, self.base
        sp, cp = self.sp, self.cp
        p = P()
        fl = self.flare
        # --- handle bottom, left side
        if self.bottom == "round":
            rb = w / 2 + fl
            p.M((cx + rb, base + rb))
            p.arc((cx, base + rb), rb, 0, -math.pi)  # right -> bottom -> left
            p.L((cx - w / 2, base + rb + 0.0))
        else:
            p.M((cx + w / 2 + fl, base))
            p.L((cx - w / 2 - fl, base))
        # --- up the left handle edge to the outer junction (with fillet)
        J = (cx - w / 2, g["y_j"])
        if self.r_o > 0:
            ro = self.r_o
            half = (math.pi - self.phi) / 2
            tt = ro / math.tan(half)
            up_arm = (-sp, cp)
            Ts = (J[0], J[1] - tt)  # on handle edge
            Ta = add(J, up_arm, tt)  # on arm edge
            bis = (-sp + 0, cp - 1)
            bl = math.hypot(*bis)
            bis = (bis[0] / bl, bis[1] / bl)
            Co = add(J, bis, ro / math.sin(half))
            p.L(Ts)
            a0 = ang((Ts[0] - Co[0], Ts[1] - Co[1]))
            a1 = ang((Ta[0] - Co[0], Ta[1] - Co[1]))
            # concave corner on a clockwise outline: counter-clockwise arc
            if a1 < a0:
                a1 += 2 * math.pi
            p.arc(Co, ro, a0, a1)
        else:
            p.L(J)
        # --- up the outer left arm edge to the tip
        if self.tips == "round":
            E = (self.centre(self.Hc), self.Hc)
            n_out = (-cp, -sp)
            Po = add(E, n_out, self.wa / 2)
            p.L(Po)
            a0 = ang(n_out)
            p.arc(E, self.wa / 2, a0, a0 - math.pi)  # over the top to the inner side
        else:
            p.L((self.x_out(H), H))
            p.L((self.x_in(H), H))
        # --- down the inner left edge into the U, across, up the inner right edge
        if self.r_u > 0:
            p.L(g["TL"])
            Cu = g["Cu"]
            # TL sits lower-left of the fillet centre, TR lower-right: go
            # counter-clockwise through the bottom
            a0 = ang((g["TL"][0] - Cu[0], g["TL"][1] - Cu[1]))
            a1 = ang((g["TR"][0] - Cu[0], g["TR"][1] - Cu[1]))
            if a1 < a0:
                a1 += 2 * math.pi  # counter-clockwise from upper-left through bottom to upper-right
            p.arc(Cu, self.r_u, a0, a1)
        else:
            p.L((cx, g["y_v"]))
        mx = lambda q: (2 * cx - q[0], q[1])
        if self.tips == "round":
            E = (self.centre(self.Hc), self.Hc)
            n_in = (cp, sp)
            Pi = add(E, n_in, self.wa / 2)
            p.L(mx(Pi))
            # right tip cap: from inner side over the top to the outer side
            Er = mx(E)
            a0 = ang((-n_in[0], n_in[1]))  # inner normal of the right arm points left-up
            p.arc(Er, self.wa / 2, a0, a0 - math.pi)
        else:
            p.L(mx((self.x_in(H), H)))
            p.L(mx((self.x_out(H), H)))
        # down the right outer edge to the junction
        if self.r_o > 0:
            ro = self.r_o
            half = (math.pi - self.phi) / 2
            tt = ro / math.tan(half)
            Ta = mx(add(J, (-sp, cp), tt))
            Ts = mx((J[0], J[1] - tt))
            bis = (-sp, cp - 1)
            bl = math.hypot(*bis)
            bis = (bis[0] / bl, bis[1] / bl)
            Co = mx(add(J, bis, ro / math.sin(half)))
            p.L(Ta)
            a0 = ang((Ta[0] - Co[0], Ta[1] - Co[1]))
            a1 = ang((Ts[0] - Co[0], Ts[1] - Co[1]))
            if a1 < a0:
                a1 += 2 * math.pi
            p.arc(Co, ro, a0, a1)
        else:
            p.L(mx(J))
        # down the right handle edge
        if self.bottom == "round":
            p.L((cx + w / 2, base + w / 2 + fl))
        else:
            p.L((cx + w / 2 + fl, base))
        p.Z()
        return p.s()

    # anchor points for the band: on the inner edge, `drop` below the top
    def anchors(self, drop=0.0, inset=0.0):
        y = self.Hc - drop if self.tips == "round" else self.H - drop
        if self.tips == "round" and drop == 0:
            E = (self.centre(self.Hc), self.Hc)
            L = (E[0] + inset, E[1])
        else:
            L = (self.x_in(y) - inset, y)
        R = (2 * self.cx - L[0], L[1])
        return L, R


def svg_doc(body, vb, bg=None, w=None, h=None):
    x, y, W, H = vb
    rect = f'<rect x="{f(x)}" y="{f(y)}" width="{f(W)}" height="{f(H)}" fill="{bg}"/>' if bg else ""
    size = f' width="{w}" height="{h}"' if w else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{f(x)} {f(y)} {f(W)} {f(H)}"{size}>'
            f"{rect}{body}</svg>")


def make_y(cx, H, w, wa, outer_half, y_j, base=0, r_u=0, r_o=0, tips="flat",
           bottom="flat", tip_over=0.0, flare=0.0):
    """Slingshot Y from intuitive targets: arms reach `outer_half` from the
    centre at the top, and their outer edges meet the handle (width w) at y_j."""
    def build(phi):
        cp = math.cos(phi)
        a = outer_half - (wa / 2 if tips == "round" else (wa / 2) / cp)
        Hc = H - (wa / 2 if tips == "round" else 0) + tip_over
        yc = Hc - a / math.tan(phi)
        return SlingY(cx, H, base, w, wa, a, yc, r_u=r_u, r_o=r_o, tips=tips,
                      bottom=bottom, tip_over=tip_over, flare=flare)

    lo, hi = math.radians(1), math.radians(80)
    for _ in range(100):
        mid = (lo + hi) / 2
        y = build(mid)
        err = y.x_out(y_j) - (cx - w / 2)
        # larger phi -> edge moves right faster going down -> x_out(y_j) larger
        if err > 0:
            hi = mid
        else:
            lo = mid
    return build((lo + hi) / 2)
