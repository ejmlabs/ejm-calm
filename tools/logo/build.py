#!/usr/bin/env python3
"""Build calm logo directions. Run: python3 tools/logo/build.py  (needs fonttools)."""
import math, os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT = "/workspace/agents/work/site-polish/packages/tokens/assets/fonts/Manrope-Variable.ttf"
SAGE, FOREST, INK, PAPER = "#8A9A7B", "#29443B", "#202721", "#F6F5EF"

def f(v):
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s

# ---------- ribbon geometry ----------
def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return tuple(u**3*a + 3*u*u*t*b + 3*u*t*t*c + t**3*d for a, b, c, d in zip(p0, p1, p2, p3))

def centerline(segs, n=240):
    pts = []
    for s in segs:
        for i in range(n):
            pts.append(bez(*s, i / n))
    pts.append(segs[-1][3])
    return pts

def arc_pts(c, r, a0, a1, n=120):
    return [(c[0] + r*math.cos(math.radians(a0 + (a1-a0)*i/n)),
             c[1] + r*math.sin(math.radians(a0 + (a1-a0)*i/n))) for i in range(n+1)]

def resample(pts, k):
    d = [0]
    for a, b in zip(pts, pts[1:]):
        d.append(d[-1] + math.dist(a, b))
    out = []
    j = 0
    for i in range(k + 1):
        s = d[-1] * i / k
        while j < len(d) - 2 and d[j+1] < s:
            j += 1
        t = (s - d[j]) / ((d[j+1] - d[j]) or 1)
        out.append((pts[j][0] + (pts[j+1][0]-pts[j][0])*t, pts[j][1] + (pts[j+1][1]-pts[j][1])*t))
    return out

def smooth(P):
    """Catmull-Rom through P as cubic segments (string, without initial M)."""
    s = []
    for i in range(len(P) - 1):
        p0 = P[max(i-1, 0)]; p1 = P[i]; p2 = P[i+1]; p3 = P[min(i+2, len(P)-1)]
        c1 = (p1[0] + (p2[0]-p0[0])/6, p1[1] + (p2[1]-p0[1])/6)
        c2 = (p2[0] - (p3[0]-p1[0])/6, p2[1] - (p3[1]-p1[1])/6)
        s.append(f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}")
    return "".join(s)

def ribbon(cl, wfn, k=14):
    """Filled variable-width ribbon with round caps. wfn(t in 0..1) -> width."""
    P = resample(cl, k)
    L, R = [], []
    for i, p in enumerate(P):
        a = P[max(i-1, 0)]; b = P[min(i+1, len(P)-1)]
        tx, ty = b[0]-a[0], b[1]-a[1]
        m = math.hypot(tx, ty); tx, ty = tx/m, ty/m
        w = wfn(i / k) / 2
        L.append((p[0] + ty*w, p[1] - tx*w))
        R.append((p[0] - ty*w, p[1] + tx*w))
    r0, r1 = wfn(0)/2, wfn(1)/2
    d = f"M{f(L[0][0])} {f(L[0][1])}" + smooth(L)
    d += f"A{f(r1)} {f(r1)} 0 0 1 {f(R[-1][0])} {f(R[-1][1])}"
    d += smooth(R[::-1])
    d += f"A{f(r0)} {f(r0)} 0 0 1 {f(L[0][0])} {f(L[0][1])}Z"
    return d

def pill(x, y, w, h):
    r = h / 2
    return f"M{f(x+r)} {f(y)}H{f(x+w-r)}A{f(r)} {f(r)} 0 0 1 {f(x+w-r)} {f(y+h)}H{f(x+r)}A{f(r)} {f(r)} 0 0 1 {f(x+r)} {f(y)}Z"

def circle(cx, cy, r):
    return f"M{f(cx-r)} {f(cy)}A{f(r)} {f(r)} 0 0 1 {f(cx+r)} {f(cy)}A{f(r)} {f(r)} 0 0 1 {f(cx-r)} {f(cy)}Z"

def taper(w0, w1, hold=0.0):
    return lambda t: w0 + (w1 - w0) * max(0, (t - hold)) / (1 - hold)

def mirror(cl):
    return [(256 - x, y) for x, y in cl]

# ---------- directions: lists of path d-strings in 256 space ----------
def ell_pts(c, rx, ry, a0, a1, n=160):
    return [(c[0] + rx*math.cos(math.radians(a0 + (a1-a0)*i/n)),
             c[1] + ry*math.sin(math.radians(a0 + (a1-a0)*i/n))) for i in range(n+1)]

def prof(*pts):
    """Piecewise-linear width profile from (t, w) pairs."""
    def fn(t):
        for (t0, w0), (t1, w1) in zip(pts, pts[1:]):
            if t <= t1:
                return w0 + (w1 - w0) * (t - t0) / ((t1 - t0) or 1)
        return pts[-1][1]
    return fn

def breach(simple=False):
    k = 1.2 if simple else 1.0
    # low humpback back with a dorsal fin, riding above the waterline
    back = centerline([((28, 168), (30, 118), (68, 88), (112, 88)),
                       ((112, 88), (166, 88), (206, 118), (228, 166))])
    fin = centerline([((140, 96), (164, 90), (184, 76), (204, 56))])
    return [ribbon(back, prof((0, 36*k), (.55, 36*k), (1, 24*k)), 22),
            ribbon(fin, prof((0, 32*k), (1, 14)), 8),
            pill(52, 196, 150, 34*k)]

def fluke(simple=False):
    k = 1.2 if simple else 1.0
    lobe = centerline([((128, 132), (100, 134), (54, 130), (22, 84))])
    wp = prof((0, 40*k), (.3, 50*k), (.75, 30*k), (1, 12))
    ped = centerline([((128, 128), (128, 152), (128, 174), (128, 198))])
    d = [ribbon(lobe, wp, 18), ribbon(mirror(lobe), wp, 18),
         ribbon(ped, prof((0, 34*k), (1, 22*k)), 6)]
    if not simple:
        d.append(pill(76, 206, 104, 28))
    return d

def swell(simple=False):
    k = 1.15 if simple else 1.0
    # two nested ribbons curling like a rolling swell (symbol lineage), no dot
    outer = centerline([((30, 198), (38, 120), (84, 46), (148, 46)),
                        ((148, 46), (192, 46), (222, 78), (214, 112)),
                        ((214, 112), (208, 140), (174, 146), (166, 122))])
    inner = centerline([((96, 218), (98, 188), (110, 154), (134, 148))])
    return [ribbon(outer, prof((0, 36*k), (.7, 36*k), (1, 26*k)), 30),
            ribbon(inner, prof((0, 36*k), (1, 28*k)), 14)]

DIRS = {"breach": breach, "fluke": fluke, "swell": swell}

# ---------- wordmark ----------
_font = None
def glyph_paths(text="calm", size=216, x0=0, base=205):
    global _font
    if _font is None:
        _font = instantiateVariableFont(TTFont(FONT), {"wght": 600})
    gs = _font.getGlyphSet(); cmap = _font.getBestCmap(); upm = _font["head"].unitsPerEm
    sc = size / upm; x = x0; out = []; xs = []
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs, lambda v: f(v))
        gs[g].draw(TransformPen(pen, (sc, 0, 0, -sc, x, base)))
        out.append(pen.getCommands()); x += gs[g].width * sc
    return "".join(out), x

def wrap(w, h, title, body, vb=None):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')

def paths(ds, fill):
    return "".join(f'<path fill="{fill}" d="{d}"/>' for d in ds)

def logo(ds, mark_fill, word_fill, kind, x0=284):
    wd, xe = glyph_paths(size=216, x0=x0, base=205)
    W = int(math.ceil(xe + 16))
    return wrap(W, 256, f"calm by ejmlabs, {kind} logo",
                paths(ds, mark_fill) + f'<path fill="{word_fill}" d="{wd}"/>')

def tile(ds, bg, fg, scale, title="calm by ejmlabs icon", size=1024):
    """Square tile (rx=0, as the family), mark centred and scaled to `scale` of the tile."""
    k = size / 256 * scale; o = size / 2 - 128 * k
    return wrap(size, size, title, f'<rect width="{size}" height="{size}" fill="{bg}"/>'
                f'<g transform="translate({f(o)} {f(o)}) scale({f(k)})">' + paths(ds, fg) + "</g>")

def build():
    from fluke import a as fluke_a, bbox_shift
    oy = bbox_shift(fluke_a)
    mark = fluke_a(oy=oy)
    fav = fluke_a(True, oy=bbox_shift(lambda **kw: fluke_a(True, **kw)))
    d = os.path.join(ROOT, "logos", "fluke"); os.makedirs(d, exist_ok=True)
    for old in ("mark.svg",):
        p = os.path.join(d, old)
        if os.path.exists(p): os.remove(p)
    def w(name, s): open(os.path.join(d, name), "w").write(s)
    for fill, nm in ((SAGE, "sage"), (INK, "ink"), (PAPER, "paper")):
        w(f"mark-{nm}.svg", wrap(256, 256, f"calm by ejmlabs, {nm} symbol", paths(mark, fill)))
    w("logo-primary.svg", logo(mark, SAGE, INK, "primary"))
    w("logo-ink.svg", logo(mark, INK, INK, "ink"))
    w("logo-paper.svg", logo(mark, PAPER, PAPER, "paper"))
    w("icon-forest.svg", tile(mark, FOREST, PAPER, 0.76))
    w("icon-sage.svg", tile(mark, SAGE, INK, 0.76))
    w("favicon.svg", tile(fav, SAGE, INK, 0.92))

if __name__ == "__main__":
    build()
