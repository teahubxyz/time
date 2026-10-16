"""Font helpers: load (variable) fonts at a fixed instance, emit glyph outlines
as SVG path data in font units (y up), and measure stems / Y proportions by
scanlines over flattened contours."""
import math
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen

# the fonts: tools/brand/make.py fetches them (google/fonts at a fixed commit) and points BRAND_FONTS at them
FONTDIR = os.environ.get("BRAND_FONTS") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")


class FlattenPen(BasePen):
    """Collects contours as polylines."""

    def __init__(self, glyphSet, steps=24):
        super().__init__(glyphSet)
        self.contours = []
        self.cur = None
        self.steps = steps

    def _moveTo(self, p):
        self.cur = [p]

    def _lineTo(self, p):
        self.cur.append(p)

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        for i in range(1, self.steps + 1):
            t = i / self.steps
            mt = 1 - t
            x = mt**3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t**3 * p3[0]
            y = mt**3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t**3 * p3[1]
            self.cur.append((x, y))

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        for i in range(1, self.steps + 1):
            t = i / self.steps
            mt = 1 - t
            x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0]
            y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
            self.cur.append((x, y))

    def _closePath(self):
        if self.cur:
            self.contours.append(self.cur)
        self.cur = None

    _endPath = _closePath


class Face:
    def __init__(self, filename, **axes):
        f = TTFont(os.path.join(FONTDIR, filename))
        if "fvar" in f:
            fv = {a.axisTag: a for a in f["fvar"].axes}
            pin = {}
            for tag, ax in fv.items():
                v = axes.get(tag, ax.defaultValue)
                pin[tag] = max(ax.minValue, min(ax.maxValue, v))
            f = instancer.instantiateVariableFont(f, pin)
        self.font = f
        self.gs = f.getGlyphSet()
        self.cmap = f.getBestCmap()
        self.upm = f["head"].unitsPerEm
        os2 = f["OS/2"]
        self.cap = getattr(os2, "sCapHeight", 0) or self.bounds("H")[3]
        self.xh = getattr(os2, "sxHeight", 0) or self.bounds("x")[3]
        self.desc = f["hhea"].descent

    def g(self, ch):
        return self.cmap[ord(ch)]

    def adv(self, ch):
        return self.font["hmtx"][self.g(ch)][0]

    def path(self, ch):
        pen = SVGPathPen(self.gs)
        self.gs[self.g(ch)].draw(pen)
        return pen.getCommands()

    def bounds(self, ch):
        pen = BoundsPen(self.gs)
        self.gs[self.g(ch)].draw(pen)
        return pen.bounds  # xMin, yMin, xMax, yMax

    def contours(self, ch):
        pen = FlattenPen(self.gs)
        self.gs[self.g(ch)].draw(pen)
        return pen.contours

    def hscan(self, ch, y):
        """x positions where the outline crosses the horizontal line y (sorted)."""
        xs = []
        for c in self.contours(ch):
            n = len(c)
            for i in range(n):
                (x0, y0), (x1, y1) = c[i], c[(i + 1) % n]
                if (y0 <= y < y1) or (y1 <= y < y0):
                    t = (y - y0) / (y1 - y0)
                    xs.append(x0 + t * (x1 - x0))
        return sorted(xs)

    def vscan(self, ch, x):
        ys = []
        for c in self.contours(ch):
            n = len(c)
            for i in range(n):
                (x0, y0), (x1, y1) = c[i], c[(i + 1) % n]
                if (x0 <= x < x1) or (x1 <= x < x0):
                    t = (x - x0) / (x1 - x0)
                    ys.append(y0 + t * (y1 - y0))
        return sorted(ys)

    def stem(self, ch="L", frac=0.5):
        xs = self.hscan(ch, self.cap * frac)
        return xs[1] - xs[0], xs[0], xs[1]

    def measure_Y(self, ch="Y", top=None):
        """Measure the font's own Y: top extents, arm slope, crotch, stem."""
        H = self.cap if top is None else top
        b = self.bounds(ch)
        cx_guess = (b[0] + b[2]) / 2
        yt = H * 0.94
        xs_t = self.hscan(ch, yt)
        ym = H * 0.72
        xs_m = self.hscan(ch, ym)
        xs_s = self.hscan(ch, H * 0.12)
        s0, s1 = xs_s[0], xs_s[-1]
        cx = (s0 + s1) / 2
        # inner edges at two heights -> slope of inner left edge
        li_t, li_m = xs_t[1], xs_m[1]
        dxdy = (li_t - li_m) / (yt - ym)  # negative: moves left going up
        lo_t = xs_t[0]
        # crotch: first ink going down the centre line from the top
        ys = [y for y in self.vscan(ch, cx) if y < H]
        y_v = max(ys) if ys else H * 0.45
        return dict(H=H, cx=cx, s0=s0, s1=s1, stem=s1 - s0,
                    lo_top=lo_t + (H - yt) * dxdy, li_top=li_t + (H - yt) * dxdy,
                    dxdy=dxdy, y_v=y_v, adv=self.adv(ch), bounds=b,
                    arm_h=xs_t[1] - xs_t[0])
