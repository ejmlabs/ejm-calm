# calm logo review

Independent review of `logos/{breach,fluke,swell}`. Compared against the ejmlabs family
(`site-polish/packages/tokens/assets/projects/{cli,ide,harness,relay}`, `family-light.png`) and the
parent symbol. Checked the SVG source, the renders in `previews/`, and 8× nearest-neighbour blow-ups
of the 16/32 px favicons placed next to the family's own `favicon-16/32.png`.

## Verdict

| Rank | Direction | Verdict |
|---|---|---|
| 1 | **swell** | **Shippable with specific changes** (one short refinement pass, not a new round) |
| 2 | fluke | Clearest "whale", but off-family and generic. Fallback if a literal whale is required |
| 3 | breach | Needs a redesign. Reads as a cloche/service bell |

swell is the only direction that looks like it belongs in `family-light.png`. It has two nested
ribbons in the parent symbol's curl, the weight matches, and it holds up at 16 px as well as cli
or harness do. It gives up the whale and says "calm / swell / ocean" instead, which suits a product
named *calm*. The fixes below are about terminals, the unwanted readings and lockup numbers, not the concept.

## Shared findings (all three)

- **Wordmark is ~7% small and sits high.** calm uses Manrope 600 at size 200 with the baseline at
  y≈190 (measured ink from 43 to 192). The family uses size 216 with the baseline at ≈205 (ide `editable/logo-primary.svg`
  has `font-size="216" y="204.75"`). The x-height ratio matches (0.745), so only the scale differs.
  Fix: size 216 and baseline ≈205, then recheck the optical gap. The current visible gap of 54–62 units
  is close to relay's (≈56) and fine.
- **Titles:** every `logo-paper.svg` has the title "calm, primary logo (…)". Change it to "calm, paper logo (…)".
  The family pattern is `"<name> by ejmlabs, …"`. Use "calm by ejmlabs, sage symbol" etc. for consistency.
- **File naming/set:** the family ships `mark-sage.svg`, `logo-ink.svg`, `icon-forest.svg` and `icon-sage.svg`.
  calm has `mark.svg` and no logo-ink or icon files. Rename and add these before shipping (the favicon already
  matches icon-forest).
- **Favicon tile:** the Forest tile and 76% scale follow the brief. Note that the family's live favicons use the
  **Sage** tile with an Ink mark (see blow-ups). Choose one deliberately; Sage/Ink would match the siblings in a tab bar.
- **Hygiene: pass.** There is no raster, script, `href`, filter, gradient, `<style>` or `<text>`. viewBox is
  256 on the marks, and there's a `<title>` and `role="img"`. Marks are 2.4–3.2 KB, under the 4 KB target.
  Logos are 4.3–5.2 KB with the outlined wordmark. Paths are dense, flattened curve runs (`C` every ~4 units,
  as in the family's generated SVGs), which is acceptable. Rounding to 1 decimal is fine at 256.

## 1. swell — rank 1

**Fit:** strongest. It is the closest relative of the parent symbol and relay, with two ribbons, a wide gap and
36-unit weight tapering to 26/28. Its ink coverage (0.27) sits between relay (0.21) and harness (0.33).
**Concept:** a rolling crest over a smaller swell, quiet and slow. There is no whale, which is acceptable.
**Unwanted readings:** fiddlehead fern, ear (the crest's inner hook looks like an ear lobe), a lowercase
"r"/"P", and a shepherd's crook. These all come mostly from the **crest terminal**, a small 13-radius hooked
knob inside the curl that reads as a separate fiddly detail and fills in at 32 px.
**Small sizes:** good. Two shapes with an open gap, legible at 16 px (better than fluke or breach).
**Distinctiveness:** good within the family, and wave curls are common. The nesting is what makes it ejmlabs.

Fixes:
1. Rework the crest terminal: end the curl in a clean full 18-radius round cap, or a single taper as cli does.
   Remove the extra tick/hook so the inside of the curl is one smooth spiral, not a knob. This removes most
   of the ear/fiddlehead reading.
2. Open the curl's nesting gap by about 6–10 units where the crest tip comes near the lower ribbon (DESIGN-NOTES
   flags it as tight). At 32 px the tip and the lower ribbon's cap nearly touch.
3. Make the composition more horizontal: either rotate it ~10–15° clockwise or lower and widen the crest so it rolls
   *forward* rather than standing upright. This turns "plant/ear" into "wave". Optionally extend the lower ribbon
   into a longer swell line under the crest (relay-like) for a stronger horizon/ocean cue.
4. Bring the lower ribbon's start cap to 18 radius (it is 14) so both ribbons share the family's terminal size.
5. Apply the shared fixes (216/205 wordmark, titles, file set), then re-render the contact sheet.

## 2. fluke — rank 2

**Fit:** weak. The lobes are filled leaf/blade shapes (40→50→12), not constant-weight ribbons, so they are the
heaviest and least ribbon-like of anything in the family. The parent's nesting doesn't survive.
**Concept:** immediately a whale tail, so the most literal. **Unwanted readings:** goblet, trophy, cake stand,
martini glass, "T"/"Y", and a smile. The bar pill under a floating stem (there's a gap between the peduncle and the
bar) strongly suggests a stemmed glass. **Distinctiveness:** low. Fluke silhouettes are the default whale-watching
icon. **Small sizes:** recognisable as a tail, but the mark only fills ~40% of the tile's height, so at 16 px it's
a thin smudge and looks noticeably smaller than siblings.

Fixes (if chosen): rebuild each lobe as a curled 36-unit ribbon (open curl, round caps) rather than a filled blade,
so the two curls nod to the parent symbol as the brief seed intended. Drop the pill or join the peduncle into a
waterline ribbon so it isn't a stem on a base. Raise the mark to ~200 units tall so the favicon fills the tile.
Deepen the centre notch.

## 3. breach — rank 3

**Fit:** OK on weight and caps. **Concept:** fails. Dome + bar reads first as a **restaurant cloche / service
bell / pot lid**, an established UI icon. The swept fin reads as a handle or slash rather than a dorsal fin, and
at 16 px the whole thing becomes "bell with a nick" (the author agrees). **Distinctiveness:** low because of the
cloche collision. **Small sizes:** the weakest of the three. The fin merges into the arc.

Fixes: needs another design round, not tweaks. If pursued: make the back long and low and asymmetric
(width ≈ 2.5–3× height, not a dome), let it break *through* a waterline ribbon (back above, gap, tail fluke
peeking at one end) rather than sitting on a separate pill, and drop the fin entirely in favour of the
asymmetric profile. Drop the fin from the favicon in any case.

## Recommended next step

Take **swell** through one refinement pass (fixes 1–5), regenerate via `tools/logo/build.py`, and re-review
only the contact sheet and the 16/32 blow-ups. If stakeholders insist the logo must show a whale, refine fluke
using the ribbon-lobe rebuild instead. Don't ship breach.
