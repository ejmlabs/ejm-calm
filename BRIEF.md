# calm logo brief + ejmlabs brand research

Status: brief only. The design session that was meant to run this was blocked
(Claude Code reports "Your organization has disabled Claude subscription access
for Claude Code"), so no logo directions have been made yet.

## Product
calm (calm.ejmlabs.com) is a procedurally generated three.js scene: a humpback
whale in an Earth-like ocean, with ships, coastlines and mountains. It should
feel slow, quiet and deep. The site title is currently plain `calm` and the
project has no favicon of its own.

## Brand sources (ejm-ui, /workspace/agents/work/site-polish/packages/tokens)
- Palette (`assets/brand/palette.json`, brand guide Oct 2026):
  Sage #8A9A7B, Forest #29443B, Ink #202721, Paper #F6F5EF, Mist #E8EDE3, White.
  Contrast: Ink on Paper 14.0, Paper on Forest 9.7, Ink on Sage 5.1, Forest on
  Mist 8.9. Sage on Paper is only 2.75, so use it for marks, never for text.
  The brand guide defines no blue. calm should stay in this palette; don't add
  an ocean blue.
- Type: wordmarks are set in **Manrope 600**, lowercase. For example, ide's
  primary logo uses font-size 216 on a 256-high artboard with the baseline
  around y=205, and the text sits about 1 mark-width plus a small gap to the
  right of the mark. Labels/meta text use IBM Plex Mono Medium. Fonts are in
  `assets/fonts/` (Manrope-Variable.ttf, IBMPlexMono-Medium.ttf). Final SVGs
  should outline the wordmark to paths, as the shipped logos do (only
  `editable/` variants keep `<text>`).
- Parent symbol (`assets/logos/symbol-*.svg`): two nested, filled ribbons that
  curl around each other like an "e" or a wave. Organic, with fully rounded
  terminals.
- Product family (`assets/projects/{cli,ide,harness,relay,ui,chess}`, overview
  in `projects/family-light.png`, tagline "Nested ribbons from the ejmlabs
  symbol, each with a shape of its own"):
  - Marks sit on a 256x256 viewBox. They are built from **filled ribbon shapes
    with a constant stroke-like weight of about 36 units** (18-unit round-cap
    radii) and fully rounded caps. Not hairline strokes, and no gradients.
  - Each product has one or two ribbons plus at most one accent element: cli has
    two chevrons and an underscore, ide has brackets and two bars, harness has
    an open ring and a dot, relay has two offset S-ribbons.
  - Primary logo: Sage mark + Ink wordmark. Ink and Paper are one-colour
    variants. Icons are square (rx=0) Forest or Sage tiles with a Paper or Ink
    mark scaled to ~76% of the tile.
  - File set per product: mark-{sage,ink,paper}.svg, logo-{primary,ink,paper}.svg,
    icon-{forest,sage}.svg, favicon.svg (+16/24/32/48 png, ico, webmanifest),
    social-card.svg.
  - Small sizes (16–32 px) stay legible because there are only 2–3 shapes with
    wide gaps.

## Deliverables
Working copy: /workspace/agents/work/calm-logo (branch design/calm-logo, a git
worktree of ejm-calm; don't commit to main, push or deploy).
1. Two or three distinct directions in `logos/<direction>/`: mark.svg (Sage),
   mark-ink.svg, mark-paper.svg, logo-primary.svg (mark + outlined "calm"
   wordmark), logo-paper.svg (for dark backgrounds), favicon.svg (a simplified
   mark that works at 16 px, optionally on a Forest tile).
   Each SVG should be hand-authored and small (<4 KB for a mark if possible),
   with viewBox 0 0 256 256 for marks, a `<title>`, no raster, no scripts, no
   external refs, and no filters or gradients.
2. Previews at `previews/<direction>-{light,dark}.png` (light = Paper #F6F5EF,
   dark = Ink #202721 or Forest #29443B), favicon at 16/32/48, and a combined
   `previews/contact-sheet.png`. Render with
   `resvg-js --font-file /workspace/agents/work/site-polish/packages/tokens/assets/fonts/Manrope-Variable.ttf in.svg out.png`
   (resvg-js is installed at ~/.local/bin; headless google-chrome also works).
3. DESIGN-NOTES.md: for each direction, the idea, how it maps to ejmlabs tokens
   (colours, Manrope 600, ~36-unit ribbon weight, rounded caps, nested-ribbon
   lineage), and how it holds up at small sizes.

## Direction seeds (suggested starting points)
A. **Breach ribbon.** A single ribbon arcs up and back down like a whale's back
   breaking the surface, with a short flat ribbon underneath for the
   waterline/horizon. It's the closest relative of relay and cli.
B. **Fluke.** The humpback tail as two mirrored ribbon curls (a nod to the
   parent symbol's nested curls) rising from a horizon bar. It's the most
   literal and recognisable at favicon size.
C. **Swell / spout.** Two or three nested concentric wave ribbons, like ripples
   or a calm swell, with one dot accent (a spout or a moon) in the harness
   manner. It's the most abstract and "calm".

## Review
After the directions exist, a separate reviewer (who didn't author them) ranks
them for brand fit, distinctiveness, small-size legibility and craft, in at most
two passes. The result goes in REVIEW.md. Don't wire anything into the site yet.
