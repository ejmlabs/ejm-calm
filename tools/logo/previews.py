#!/usr/bin/env python3
"""Render fluke previews + contact sheet. Run after build.py.  Needs resvg-js and Pillow."""
import os, re, subprocess, sys
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT = os.environ.get("LOGO_FONT")  # Manrope-Variable.ttf from the ejm-ui tokens package (assets/fonts/)
NO_FONT = "Set LOGO_FONT to the path of Manrope-Variable.ttf from the ejm-ui tokens package (assets/fonts/)."
SAGE, FOREST, INK, PAPER, MIST = "#8A9A7B", "#29443B", "#202721", "#F6F5EF", "#E8EDE3"
PV = os.path.join(ROOT, "previews"); os.makedirs(PV, exist_ok=True)
L = lambda n: os.path.join(ROOT, "logos", "fluke", n + ".svg")
OLD = os.path.join(PV, "fluke-explorations")   # v3.1-with-bars snapshots

def inner(path):
    s = open(path).read()
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', s).group(1).split()]
    body = re.sub(r"<title>.*?</title>", "", re.search(r"<svg[^>]*>(.*)</svg>", s, re.S).group(1))
    return vb[2], vb[3], body

def place(path, x, y, h):
    w, hh, body = inner(path); k = h / hh
    return f'<g transform="translate({x:.1f} {y:.1f}) scale({k:.4f})">{body}</g>', w * k

def render(svg, out, w=None):
    if not FONT: sys.exit(NO_FONT)
    tmp = out + ".svg"; open(tmp, "w").write(svg)
    cmd = ["resvg-js", "--font-file", FONT] + (["--fit-width", str(w)] if w else [])
    subprocess.run(cmd + [tmp, out], check=True, capture_output=True); os.remove(tmp)

def txt(x, y, s, fill, size=22, anchor="start"):
    return (f'<text x="{x}" y="{y}" font-family="IBM Plex Mono, monospace" font-size="{size}" fill="{fill}" '
            f'text-anchor="{anchor}">{s}</text>')

def favs(x, y, bg_label, label_fill, sizes=(16, 32, 48), path=None, gap=28):
    """Favicons at real size (bottom-aligned at y)."""
    o = ""
    for sz in sizes:
        g, _ = place(path or L("favicon"), x, y - sz, sz); o += g
        o += txt(x + sz / 2, y + 22, sz, label_fill, 14, "middle"); x += sz + gap
    return o, x

def board(dark):
    bg, prim, mk = (INK, "logo-paper", "mark-paper") if dark else (PAPER, "logo-primary", "mark-ink")
    W, H = 1600, 900
    o = f'<rect width="{W}" height="{H}" fill="{bg}"/>'
    g, w = place(L(prim), 0, 0, 300); o += f'<g transform="translate({(W-w)/2:.1f} 110)">{g}</g>'
    x = 380; y = 570; s = 170
    for n in (["mark-paper"] if dark else ["mark-sage", "mark-ink"]):
        g, _ = place(L(n), x, y, s); o += g; x += s + 50
    g, _ = place(L("icon-sage" if dark else "icon-forest"), x, y, s); o += g; x += s + 70
    g, _ = place(L("favicon"), x, y, s); o += g; x += s + 70
    f, _ = favs(x, y + s - 30, bg, PAPER if dark else INK); o += f
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{o}</svg>'

def contact():
    W, H = 2400, 1800
    o = f'<rect width="{W}" height="{H}" fill="{MIST}"/>'
    # lockups: three on light (left), three on dark (right)
    pw, ph = 1140, 330
    for col, (bg, items) in enumerate(((PAPER, ["logo-primary", "logo-ink", "logo-primary"]),
                                       (INK, ["logo-paper", "logo-paper", "logo-paper"]))):
        x0 = 40 + col * 1180
        o += f'<rect x="{x0}" y="40" width="{pw}" height="{ph*2+30}" fill="{bg}" rx="0"/>'
    lab = lambda x, y, s, c: txt(x, y, s, c, 18)
    for col, (names, labels, c1, c2) in enumerate((
            (["logo-primary", "logo-ink"], ["PRIMARY (SAGE + INK)", "INK"], INK, FOREST),
            (["logo-paper"], ["PAPER"], PAPER, SAGE))):
        x0 = 40 + col * 1180
        for i, n in enumerate(names):
            g, w = place(L(n), 0, 0, 220)
            o += f'<g transform="translate({x0 + (pw-w)/2:.1f} {80 + i*(ph+30)})">{g}</g>' + lab(x0+30, 80+i*(ph+30)+ph-60, labels[i], c1)
    # dark panel second lockup: sage-mark variant on ink for contrast check
    g, w = place(L("logo-paper"), 0, 0, 120); o += f'<g transform="translate({1220+ (pw-w)/2:.1f} {80+ph+30+40})">{g}</g>'
    # marks + icons row
    y = 790; o += f'<rect x="40" y="{y}" width="{W-80}" height="470" fill="{PAPER}"/>'
    x = 90
    for n, bg in (("mark-sage", None), ("mark-ink", None), ("mark-paper", INK)):
        if bg: o += f'<rect x="{x-20}" y="{y+30}" width="220" height="220" fill="{bg}"/>'
        g, _ = place(L(n), x, y + 50, 180); o += g + lab(x, y + 290, n.upper().replace("-", " "), INK); x += 250
    for n in ("icon-forest", "icon-sage", "favicon"):
        g, _ = place(L(n), x, y + 50, 180); o += g + lab(x, y + 290, n.upper().replace("-", " "), INK); x += 250
    # favicons at real size (+8x enlarged nearest-neighbour inserted separately)
    x += 40; o += lab(x, y + 50, "FAVICON AT REAL SIZE", INK)
    f, x2 = favs(x, y + 190, PAPER, INK, (16, 32, 48), gap=34); o += f
    o += lab(x, y + 250, "ENLARGED 8x / 4x / 3x", INK)
    ex = x
    for sz, m in ((16, 8), (32, 4), (48, 3)):
        g, _ = place(L("favicon"), ex, y + 280, sz * m); o += g; ex += sz * m + 30
    # v3.1 (with water bars) vs v4 (clean tail)
    y = 1290; o += f'<rect x="40" y="{y}" width="{W-80}" height="460" fill="{PAPER}"/>'
    o += lab(90, y + 40, "V3.1 (WATER BARS) -> V4 (CLEAN TAIL)", INK)
    v = lambda n: os.path.join(OLD, f"v3.1-bars-{n}.svg")
    g, _ = place(v("mark-sage"), 90, y + 70, 200); o += g
    o += txt(330, y + 190, "&#8594;", INK, 60)
    g, _ = place(L("mark-sage"), 420, y + 70, 200); o += g
    g, _ = place(v("favicon"), 720, y + 70, 200); o += g
    o += txt(960, y + 190, "&#8594;", INK, 60)
    g, _ = place(L("favicon"), 1050, y + 70, 200); o += g
    g, _ = place(v("logo-primary"), 1330, y + 60, 110); o += g
    g, _ = place(L("logo-primary"), 1330, y + 200, 110); o += g
    f, _ = favs(1330, y + 400, PAPER, INK, (16, 32), path=v("favicon"), gap=34); o += f
    f, _ = favs(1500, y + 400, PAPER, INK, (16, 32), gap=34); o += f
    o += lab(1330, y + 440, "v3.1", INK) + lab(1500, y + 440, "v4", INK)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{o}</svg>'

for dark in (False, True):
    render(board(dark), os.path.join(PV, f"fluke-{'dark' if dark else 'light'}.png"))
for sz in (16, 32, 48):
    subprocess.run(["resvg-js", "--fit-width", str(sz), L("favicon"), os.path.join(PV, f"fluke-favicon-{sz}.png")], check=True, capture_output=True)
for n in ("icon-forest", "icon-sage"):
    subprocess.run(["resvg-js", "--fit-width", "512", L(n), os.path.join(PV, f"fluke-{n}.png")], check=True, capture_output=True)
render(contact(), os.path.join(PV, "contact-sheet.png"))
