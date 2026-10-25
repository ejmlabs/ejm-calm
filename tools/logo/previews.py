#!/usr/bin/env python3
"""Render previews + contact sheet. Run after build.py."""
import os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT = "/workspace/agents/work/site-polish/packages/tokens/assets/fonts/Manrope-Variable.ttf"
SAGE, FOREST, INK, PAPER, MIST = "#8A9A7B", "#29443B", "#202721", "#F6F5EF", "#E8EDE3"
DIRS = ["breach", "fluke", "swell"]
PV = os.path.join(ROOT, "previews"); os.makedirs(PV, exist_ok=True)

def inner(path):
    s = open(path).read()
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', s).group(1).split()]
    body = re.sub(r"<title>.*?</title>", "", re.search(r"<svg[^>]*>(.*)</svg>", s, re.S).group(1))
    return vb[2], vb[3], body

def place(path, x, y, h):
    w, hh, body = inner(path); k = h / hh
    return f'<g transform="translate({x} {y}) scale({k:.4f})">{body}</g>', w * k

def render(svg, out, w=None):
    tmp = out + ".svg"; open(tmp, "w").write(svg)
    cmd = ["resvg-js", "--font-file", FONT]
    if w: cmd += ["--fit-width", str(w)]
    subprocess.run(cmd + [tmp, out], check=True); os.remove(tmp)

def tile(path, x, y, s, bg, mark_path_fill=None):
    g, _ = place(path, x, y, s)
    return g

def board(d, dark):
    bg, prim = (INK, "logo-paper") if dark else (PAPER, "logo-primary")
    L = lambda n: os.path.join(ROOT, "logos", d, n + ".svg")
    W, H = 1600, 900
    out = f'<rect width="{W}" height="{H}" fill="{bg}"/>'
    g, w = place(L(prim), 0, 0, 280); out += f'<g transform="translate({(W-w)/2} 130)">{g}</g>'
    # row: mark variants + favicon tile
    xs = 330; y = 580; s = 150
    variants = ["mark-paper"] if dark else ["mark-ink"]
    items = [("mark", None), (variants[0], None)]
    x = (W - (3*s + 2*60 + 3*0))/2 - 0
    x = 380
    for n, _ in items:
        g, _w = place(L(n), x, y, s); out += g; x += s + 60
    g, _w = place(L("favicon"), x, y, s); out += g; x += s + 60
    # small favicon sizes
    for sz in (48, 32, 16):
        g, _w = place(L("favicon"), x, y + s - sz, sz); out += g; x += sz + 24
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{out}</svg>'

def contact():
    W, H = 2400, 1700
    o = f'<rect width="{W}" height="{H*0.5}" fill="{PAPER}"/><rect y="{H*0.5}" width="{W}" height="{H*0.5}" fill="{INK}"/>'
    for i, d in enumerate(DIRS):
        L = lambda n: os.path.join(ROOT, "logos", d, n + ".svg")
        cx = 100 + i * 760
        for row, (dark) in enumerate((False, True)):
            y0 = row * H / 2
            g, w = place(L("logo-paper" if dark else "logo-primary"), cx, y0 + 140, 190); o += g
            x = cx
            for n in (["mark", "mark-paper"] if dark else ["mark", "mark-ink"]):
                g, _ = place(L(n), x, y0 + 480, 150); o += g; x += 190
            g, _ = place(L("favicon"), x, y0 + 480, 150); o += g; x += 190
            for sz in (48, 32, 16):
                g, _ = place(L("favicon"), x, y0 + 630 - sz, sz); o += g; x += sz + 14
        o += f'<text x="{cx}" y="{H/2-40}" font-family="Manrope" font-weight="600" font-size="30" fill="{FOREST}">{d}</text>'
        o += f'<text x="{cx}" y="{H-40}" font-family="Manrope" font-weight="600" font-size="30" fill="{SAGE}">{d}</text>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{o}</svg>'

for d in DIRS:
    for dark in (False, True):
        render(board(d, dark), os.path.join(PV, f"{d}-{'dark' if dark else 'light'}.png"))
    for sz in (16, 32, 48):
        subprocess.run(["resvg-js", "--fit-width", str(sz), os.path.join(ROOT, "logos", d, "favicon.svg"),
                        os.path.join(PV, f"{d}-favicon-{sz}.png")], check=True)
render(contact(), os.path.join(PV, "contact-sheet.png"))
