#!/usr/bin/env python3
"""Fluke v3 geometry (256 space): one hand-built outline for both lobes + peduncle, plus ripples.

Broad, near-level blade: a small rounded notch dips in the trailing edge, the edge runs out in a
gentle scallop to round tips swept slightly up, the leading edge returns in one convex sweep and
fillets into a peduncle that widens downward. Left half is authored, the right half is mirrored."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import pill

def _f(v):
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s

def outline(oy=0, tipr=11, stem_w=36, stem_end=232, notch=9):
    """Closed path. `notch` = depth of the centre dip (units), `tipr` = tip cap radius."""
    P = lambda x, y: (x, y + oy)
    m = lambda p: (256 - p[0], p[1])
    q = lambda p: f"{_f(p[0])} {_f(p[1])}"
    sw = stem_w / 2
    top = 133                                    # shoulder height of the trailing edge
    # left half, centre notch -> tip (trailing edge)
    n0 = P(128, top + notch)
    t = [(P(119, top + notch), P(113, top + 1), P(100, top)),          # dip rises into the shoulder
         (P(86, top - 1), P(76, top - 2), P(64, top - 7)),             # gentle scallop out
         (P(50, top - 13), P(40, top - 18), P(32, top - 24))]      # sweep up into the tip
    tip_end = P(18, top - 8)                                       # tip cap ends on the leading edge
    # leading edge: tip -> blend into peduncle
    l = [(P(18, top + 18), P(46, top + 38), P(84, top + 44)),
         (P(100, top + 47), P(128 - sw, top + 58), P(128 - sw, top + 78))]
    stem_l = P(128 - sw, stem_end)
    d = f"M{q(n0)}"
    for c in t: d += f"C{q(c[0])} {q(c[1])} {q(c[2])}"
    d += f"C{q(P(32 - tipr * .8, top - 24 - tipr * .6))} {q(P(18 - tipr * .1, top - 8 - tipr * 1.4))} {q(tip_end)}"
    for c in l: d += f"C{q(c[0])} {q(c[1])} {q(c[2])}"
    d += f"L{q(stem_l)}A{_f(sw)} {_f(sw)} 0 0 0 {q(m(stem_l))}L{q(m(l[1][2]))}"
    # right half, mirrored in reverse
    # leading edge reversed: from stem up to the tip
    d += f"C{q(m(l[1][1]))} {q(m(l[1][0]))} {q(m(l[0][2]))}"
    d += f"C{q(m(l[0][1]))} {q(m(l[0][0]))} {q(m(tip_end))}"
    d += f"C{q(m(P(18 - tipr * .1, top - 8 - tipr * 1.4)))} {q(m(P(32 - tipr * .8, top - 24 - tipr * .6)))} {q(m(t[2][2]))}"
    for i in (2, 1, 0):
        prev = t[i - 1][2] if i else n0
        d += f"C{q(m(t[i][1]))} {q(m(t[i][0]))} {q(m(prev))}"
    return d + "Z"

def tail(oy=0):
    """The one clean tail used everywhere (v4): favicon geometry (40 stem, r12 tips, 10 notch).
    It is crisper at small sizes than the 36-wide mark-weight stem and keeps every file identical."""
    return [outline(oy, tipr=12, stem_w=40, stem_end=222, notch=10)]

a = b = lambda simple=False, oy=0: tail(oy)
VARIANTS = {"a": a, "b": b}

def _raster(fn):
    import subprocess, tempfile
    from PIL import Image
    from build import wrap, paths
    with tempfile.TemporaryDirectory() as t:
        src, png = os.path.join(t, "m.svg"), os.path.join(t, "m.png")
        open(src, "w").write(wrap(256, 256, "m", paths(fn(oy=0), "#000")))
        subprocess.run(["resvg-js", "--fit-width", "1024", src, png], check=True, capture_output=True)
        return Image.open(png).getchannel("A")

def metrics(fn=tail):
    """(bbox centre y, ink centroid y, bbox) in 256 units, measured from a resvg raster."""
    al = _raster(fn); box = al.getbbox(); px = al.load()
    W, H = al.size; sy = sm = 0
    for y in range(H):
        n = sum(1 for x in range(W) if px[x, y] > 127)
        sy += n * y; sm += n
    return (box[1] + box[3]) / 8, sy / sm / 4, [v / 4 for v in box]

OPTICAL = 0.5   # share of the way from bbox centre to ink centroid (blade is heavy, stem light)

def optical_cy(fn=tail):
    b, c, _ = metrics(fn)
    return b + OPTICAL * (c - b)

def bbox_shift(fn=tail, target=128):
    """Vertical shift that puts the optical centre of fn()'s ink at `target` on the 256 grid."""
    return round(target - optical_cy(fn), 1)
