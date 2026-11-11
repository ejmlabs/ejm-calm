# calm logo review: fluke v2

Review of `logos/fluke/*.svg` (v2, "Fluke, but more polish") against BRIEF.md, REVIEW.md,
DESIGN-NOTES.md "fluke v2", the ejmlabs family (`family-light.png`, `{cli,ide,harness,relay}`)
and the previews, using resvg renders, measured ink bounding boxes and nearest-neighbour
blow-ups of the 16/32 px favicons.

## Verdict: **Needs changes**

v2 fixes most of what v1 got wrong. The pedestal/goblet is gone, the file set and titles are complete,
the wordmark numbers are right and the SVG hygiene is clean. The silhouette is still the problem. The
lobes rise from a deep V crotch into thin, upswept, tapering points over a narrowing stem with a round
end, so the main reading is a **longhorn skull / bull horns**, and the ripple-less favicon shows it most
clearly. At 16 px it reads as a **Y**. That fails a hard requirement ("no strong unwanted readings").
It's a geometry fix in `tools/logo/fluke.py`, not a new direction.

## What passes

- **File set:** mark-sage/ink/paper, logo-primary/ink/paper, icon-forest/sage, favicon. All present, and
  `mark.svg` has been removed.
- **Titles/aria:** "calm by ejmlabs, sage symbol / ink logo / paper logo …" and "calm by ejmlabs icon" match
  cli/ide exactly.
- **Hygiene:** no raster, script, href, filter, gradient, `<style>` or `<text>`. viewBox is 256 on marks and
  1024 on icons, matching the family. Only palette hexes are used.
- **Wordmark:** Manrope 600, outlined, size 216, baseline 205. The measured ink bottom is 209, which is the
  'c'/'a' overshoot, so that's fine.
- **Favicon:** a Sage tile with an Ink mark, which matches the siblings' live favicons. The scale is 3.7
  (cli 3.55, ide 3.66), which is fine.
- **Goblet/pedestal:** resolved. The ripples sit beside the stem, not under it.

## Findings

**1. Blocker: longhorn / bull-skull reading.** These features cause it:
(a) The centre crotch is ~60 units below the tips. The lobe root is at y≈188 with a 42 width, so the top edge
sits at ≈167, while the tips are at y≈104. That makes a deep V, not a fluke's near-level trailing edge.
(b) The lobes are thin and taper to 8-unit points that flick upward, which is a horn profile. A fluke is a broad
blade with tips swept *outward*.
(c) The stem narrows downward (w 40→30) and ends in a round cap, which reads as a skull's muzzle. A real
peduncle *thickens* toward the body.
**Fix:** raise and flatten the trailing edge so the silhouette is a wide blade with a small notch:
- Move the lobe root up to about `(128,142)`. Make the centreline leave nearly horizontal, for example
  `((128,142),(104,140),(80,130),(56,126))`, `((56,126),(40,123),(28,117),(18,106))`. The top edge then rises
  only ~15–20 units from the centre to the tips.
- Keep the lobe chord broad through mid-span: ~44 at the root, ≥36 at 70% of the span, then ease to the tip.
  Swap `t**1.6` for a profile that holds the width longer, e.g. `sprof((0,44),(0.7,36),(1,20))`.
- Make the tips **round 10-radius caps** angled ≤20° above horizontal, not 8-unit points.
- Make the lower (leading) edge a convex curve that sweeps from each tip down into the peduncle.
- Check the result against "moustache" and "gull". If either shows up, drop the tips ~6 units.

**2. Major: the centre notch isn't subtle.** At the moment the "notch" is a sharp crossing point, the
apex where the two ribbons' edges intersect. **Fix:** after #1, build the notch as a small rounded dip
~8–10 units deep and ~14 wide at x=128 on the trailing edge (a 6–7 unit radius). Don't leave it as
two ribbon edges crossing to a point.

**3. Major: the stem doesn't read as part of the tail.** Where the lobes' lower edges meet the stem,
around (113,180) and (143,180), there are hard concave corners (see a 4× render), so the stem looks
attached rather than grown out of the lobes. **Fix:** invert the taper to ~32 at the lobes → 40 at the
bottom (or a constant 36, which is family weight), and blend each lobe's leading edge into the stem with a
≥14-unit fillet. Shorten the stem so its visible length below the lobes is ~45–55 units. It's 58–64 now.

**4. Major: the favicon at 16 px is a "Y".** The blow-up shows a 3-pixel Y with the stem taking up half the
glyph. At 32 px it's a longhorn. **Fix:** this follows from #1–3: a wider, flatter blade, and a stem ≤35%
of the height. Then make a dedicated 16 px mark: lobes with no tip taper (round 12-radius ends), the notch
widened to about 2 px at 16, and the stem shortened. Re-check the 16/32 blow-ups next to the cli/ide favicons.

**5. Minor: the lockup gap is tight.** Mark ink runs 6–250 and the 'c' starts at 277, so the visible gap is
**27 units**. ide's is 40 and relay's is 56. The right tip also points straight at the 'c'. **Fix:** set the
wordmark `x0` ≈ 286–296 so the gap is ~40–46, and widen the viewBox to match (~800).

**6. Minor: no edge margin.** The mark is 244 wide, from x=6 to 250, but cli is 219 wide with ~18 margins.
The flat result of #1 will want this width, but keep ≥14–16 units of margin: scale it to ~224 wide.
That also eases #5.

**7. Minor: ripple weight and reading.** The pills are 26 thick, a thinner weight than both the family's
36 and the stem. Next to the stem they give "–Y–" and "ears/eyes" readings. **Fix:** make them ~30 thick
and 56–64 long, drop them ~8 units below the stem's widest point, and keep a ≥20-unit gap to the stem. If they
still read as a face once #1 is done, try a single ripple ribbon broken by the stem, which is relay-like.

**8. Minor: tips at small sizes.** The 8-unit tips turn into single anti-aliased pixels at 32 px, which looks
noisy. Fix #1's round 10-radius caps solve this.

**9. Nit: file size.** Marks are ~4.4 KB, just over the 4 KB goal. After the reshape, render with a coarser
`ribbon(..., n)` (16 instead of 24 segments per lobe). Rounding to 1 decimal is already fine.

**10. Nit: icon-forest/sage carry the ripples at 76%.** That's fine at 512+, but it's busy at the 180 px
apple-touch size. Consider using the favicon-simplified mark for the icons below 192 px, as the family
keeps its icons to 2–3 shapes.

**11. Nit: lobe weight vs family.** The swelling lobes are a deliberate departure from the constant-weight
family, and DESIGN-NOTES says so. That's acceptable for a literal fluke, but say so in the notes as a
calm-specific rule, so other products don't copy it.

## Next step

Reshape `flukes()`/`stem()` in `tools/logo/fluke.py` (#1–3), regenerate with `build.py`, adjust the
lockup (#5–6), and re-review only the mark at 256, the contact sheet and the 16/32 blow-ups. If it still
reads as horns after the flat-trailing-edge rebuild, fall back to the REVIEW.md suggestion of two
open curled ribbon lobes.

## Pass 2 (v3)

Covers the `logos/fluke/*.svg` source and `tools/logo/fluke.py`, the contact sheet, the light/dark previews,
a 4× render of `mark-ink.svg` and 8× nearest-neighbour blow-ups of the 16/32/48 favicons.

### Final verdict: **Ship with minor fixes**

The mark is now unmistakably a humpback fluke: a broad blade with a level trailing edge, a small rounded centre
notch and round upswept tips, over a peduncle that grows out of the blade. The longhorn, Y and goblet readings
are gone, so nothing is left that blocks shipping.

### Earlier Blocker/Major status

| # | Finding | Status |
|---|---|---|
| 1 | Blocker: longhorn / bull-skull | **Resolved.** The notch now sits at y≈91 and the tips at ≈52–74, so the trailing edge is near-level. The blade is ~45 units thick mid-span with round tips, and the stem widens downward. It reads as a whale tail first in every variant. |
| 2 | Major: notch not subtle | **Resolved.** It's a rounded dip 9 deep and ~18 wide (`M128 90.8C119 90.8 113 82.8 100 81.8`). Visible at 48 and 32 px, and it melts away at 16 px, which is acceptable. |
| 3 | Major: stem not part of tail | **Resolved.** The leading edge fillets into the stem (`C100 132.8 110 139.8 110 159.8`) with no concave corners. The stem is 36→40 wide and shows ~50 units below the blade. |
| 4 | Major: favicon reads "Y" at 16 px | **Resolved.** At 16 px it's a wide, flat-topped tail silhouette (the blade is ~12 px wide over a 3 px stem), not a Y. 32 px shows the notch and the tip upturn. |

Earlier Minors are resolved too. The lockup gap is now **54.5 units** (mark ink 18–238, 'c' at 292.5), between
ide's 40 and relay's 56. Side margins are 18 units, like cli. Pills are 30 thick and 56 long with a ~27-unit gap
to the stem. The tips are round, and the marks are ~0.75 KB. Hygiene, titles and the file set still pass
(no raster, script, href, filter, gradient, style or text elements, and the wordmark is still outlined).

### Remaining findings (none blocking)

- **Minor: ripples read faintly as a face.** The two pills sit mid-stem (y 159–189) and the blade's lower edge
  curves over them, which gives a faint "moustache with eyes" / "–T–" reading in the mark alone. It's not
  strong in the lockup. Fix: drop the pills ~10 units (centre y≈184, so the stem's end rises just above them) or
  shorten them to ~48. If it still bites, use the single ripple broken by the stem that DESIGN-NOTES suggests.
- **Minor: the stem end is slightly bulbous.** The straight flank `L108 180.8` flares 2 units out to a radius-19
  arc spanning 40, so resvg scales it to radius 20 and leaves a slight tangent break. At 256+ that reads as a small
  "drip/bulb". Fix: keep the flank vertical at x=110/146 and end with `A18 18 0 0 0 146 …`, which is a true
  semicircle at family cap radius. Do the same in the favicon (106→108, `A20`).
- **Minor: the blade is heavier than its siblings.** It's a filled silhouette (~70 units deep at the centre), the
  heaviest mark in the family. That's the deliberate literal-fluke exception and it's documented. Optionally thin the
  leading edge by ~4–6 units mid-span (pull `46 123.8`/`84 129.8` up ~4) so it sits closer to harness in tone.
- **Nit:** there's a tiny tangent mismatch at `84 129.8` (incoming slope 0.16, outgoing 0.19), invisible at any
  size. Align the controls if you touch it.
- **Nit:** the icons keep the ripples at 76%. As DESIGN-NOTES says, use the favicon mark for apple-touch/≤192 px.
- **Nit:** distinctiveness is moderate, because whale-tail silhouettes are a common motif. The palette, rounded
  geometry and lockup keep it in-family, so there's nothing to change for v1.
