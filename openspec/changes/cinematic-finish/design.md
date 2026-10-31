## Context

Main 981938a draws the scene straight to the canvas (`antialias: false`). Each material either tone-maps itself with three's ACES fit or opts out (`toneMapped: false`) and writes display colours. The land, walkers, wakes, ship foam and lamps, stars, rain, spray, the whale's splash and two underwater layers opt out, so they sit outside the curve the sky, water, whale and ships go through. The water compensated with a reflection gain of 0.8 / exposure for land seen in its mirror. Nothing could be brighter than white.

## Decisions

### three's own HDR output
three r186 has an output path in `WebGLRenderer`: `outputBufferType: HalfFloatType` renders the scene into a half-float target (multisampled 4x when `antialias` is set), runs the effects passed to `setEffects`, then applies the renderer's tone mapping and colour space in one full-screen pass. That is exactly the pipeline the finish needs, so `src/finish.ts` adds only the effects: three's `UnrealBloomPass` and one grade `ShaderPass`. No `EffectComposer`, no hand-written resolve or output pass.

Support is probed once on a throwaway WebGL 2 context: `EXT_color_buffer_float` or `EXT_color_buffer_half_float`, and at least 4 samples for `RGBA16F`. Without them the renderer is made as before and draws to the canvas; the scene still looks the same apart from the bloom, grade and antialiasing, because of the next decision.

### One curve, exact inverse for display colours
Every material draws scene radiance. A material authored in display colours ends its fragment shader with `sceneFromDisplay`, the closed-form inverse of three's fit (`src/tone.ts`): the output matrix inverted, the rational fit solved as its positive quadratic root, the input matrix inverted, divided by the exposure. On the HDR path the output applies the curve and the colour comes back as authored; on the direct path `#include <tonemapping_fragment>` does the same per material. The CPU form (`radianceFor`) replaces the bisection the underwater view used: identical on its palette, and exact where the bisection's clamp was 2 percent off (the near-white caustic). The fit is held under 0.985 before inverting, so white is a finite radiance (about 18 at noon), and bloom sees it.

Built-in materials convert through `drawAsAuthored`, an `onBeforeCompile` patch before `tonemapping_fragment`; shader materials end with `DRAW_AS_AUTHORED_GLSL`. Rain and spray were written as sRGB values with no colour space step, so they decode with three's `sRGBTransferEOTF` first. `displayExposure` is one shared uniform object written once a frame after the sky sets the exposure.

### Bloom and grade
Bloom starts at a display brightness, `BLOOM_FROM` 0.95, converted to radiance at each frame's exposure, so the sun, its glitter and sunlit spray bloom the same at noon and at dusk. Only the light past the threshold blooms, held under one more threshold's worth (`BLOOM_CEILING`): three's high pass blooms the whole of a pixel's radiance, and the sun is hundreds of times the threshold, which flooded a third of the frame with white in the first shots. Strength 0.32, with the five levels weighted 1, 0.55, 0.3, 0.15, 0.06 (radius 0 keeps them as given): with three's defaults the widest level laid a golden veil over islands under a morning sun. The grade works in scene radiance before the curve: saturation 1.1 (ACES greys bright colours), a split tone (light to 1.05/1.0/0.94, shade to 0.96/0.99/1.05), a vignette of 0.24 from a third of the way out to the corners, and relative interleaved-gradient noise of plus or minus 0.4 percent, about half an 8-bit step after the curve. The grain is fixed in screen space, so it never moves under reduced motion.

### Water
The reflection gain becomes a constant 0.85 (reflected land a touch darker than the land) and the haze it lifts toward is converted to scene light. Glitter is a Blinn term toward the sun at exponent 1400 (single facets, 70 in scene light at a clear noon) plus a sheen at 160 (1.6), scaled by the sun's strength (`sun.intensity / SUN_INTENSITY`, 0 at night and under cloud over the sun) and faded as the sun reaches the horizon. Shallows fade out between 150 and 900 m and vanish at grazing angles (eye elevation under 0.004); they were capped at 25 percent there and drew a band. Storm foam is a crest cap times a ripple lace plus wind streaks, capped at 75 percent, in place of a squared crest that lay in flat sheets.

### Land tiles dissolve by coverage
With the finish on, a tile fading in writes its fade as alpha with `alphaToCoverage`, so on the 4x target it covers that share of each pixel's samples: a true cross-fade over the bare tile or the sea. Without multisampling it keeps the screen-space dither, which drew visible cross-hatching on whole islands for the first seconds of a visit.

### Land
Palette moved from lime toward photographed land: grass 0x667a44, meadow 0x848a58, straw 0x9e9268, forest 0x34492c and 0x263a24, rock 0x78726a, cliff 0x6a645c to 0x8e877c, sand 0xd3c4a2. Shade takes the hue of the sky's top haze stop at the same brightness (30 percent, capped at 1.6 per channel), and sunlight takes the sun's colour at the old tint's brightness, so golden hour lights the ranges warm and night shade is moonlit. The sun is a stronger key against the sky's fill (fill 0.36 + 0.16 n.y to 0.3 + 0.14 n.y, sun 0.78 to 0.92), so slopes away from it fall into shade, and cliff banding is halved, both in the vertex colours and in the near strata.

### Water storm
Storm foam is kept within 40 to 450 m of the eye, where the ripples still break it into lace. The pale band a large swell shows in a storm is its face reflecting the overcast sky at a grazing angle, not foam; it is left as it is.

## Risks

- Half-float multisampling costs bandwidth on phones. The quality tiers already lower the pixel ratio when frames run long; device figures are owed (`FOLLOWUP.md`).
- Blending of transparent display-authored layers (foam, rain, the waterline) now happens in scene light. That is closer to how light adds, and the layers were checked in shots, but they are not pixel-identical to main.
