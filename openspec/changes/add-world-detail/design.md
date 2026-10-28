## Context

Facts from the code at 7a2de67:

- Land is streamed as a quadtree of tiles (`world-tiles.ts`, `landmesh.ts`) built in a worker from `land.surfaceAt`. Vertex colour comes from `biomeColor(height, slope, patch)`. There is no texture and no real lighting; haze is baked per vertex.
- The sea is three's `Water` on a flat 20 km plane with a normal map. There is no geometric wave and no CPU wave function. Ship bob is `sin()` with a per-ship phase.
- Birds: `THREE.Line` x5, `LineBasicMaterial`, orbit a centre that trails the whale.
- Ships: `buildShipMesh` builds one `Mesh` per part (hull, stripe, masts, sails, cabin), roughly 10 to 14 draws per ship, and rewrites every sail vertex on the CPU each frame. Ships stream by cell and fade out by sinking.
- CSP is `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; worker-src 'self'`. No `data:` images and no inline styles. Canvas and `DataTexture` generated at runtime are fine.
- Quality tiers `low | medium | high` already adapt DPR and land segments (`quality.ts`). Mobile targets 30 fps, desktop 60 fps.
- JS bundle is 212 KB gzip. Audio assets are about 1.9 MB.

## Goals / Non-Goals

**Goals**

- Terrain, birds and ships that hold up at close range and still read as one calm, soft-palette scene.
- Everything procedural, seeded and deterministic per seed.
- Budgets (below) met on a mid-range phone.

**Non-Goals**

- Photoreal rendering, PBR texture sets, shadows from land onto the sea, weather, new audio, new creatures beyond birds, rendering changes to the whale or the underwater world.
- Geometric displacement of the water plane.

## Style direction

Soft stylised low-poly with smooth shading: faceted silhouettes, gentle gradients, no hard black outlines, no photo textures. Semi-realistic is rejected for cost and because it clashes with the water look. This is an open decision for the captain; the specs hold for either direction.

## Decisions

### D1 Terrain shape: layered fields, not authored heightfields

Keep `surfaceAt` as the single source of height. Add layers in this order, each faded by LOD ring so far tiles stay cheap:

1. Macro (existing mask and ridged mountains) with a domain warp (`x += 60 * n(x/900)`) to break the straight, round blobs.
2. Mid (20 to 120 m): ridged creases for gullies, a terrace term on steep rock for strata, and a small-islet and sea-stack pass near coasts using the existing cliff map.
3. Micro (below 20 m, fragment shader only): procedural value-noise normal perturbation and grain, faded out by distance. Costs zero triangles and zero bytes.

Authored heightfields are rejected: they cost bytes and break the endless seeded world.

### D2 Terrain materials: per-vertex weights plus a land shader

Replace the baked RGB with a small weight vector (sand, rock, grass, forest, snow, wet) and an attribute for slope. A patched `MeshLambertMaterial` (`onBeforeCompile`, as the water already does) mixes palette colours per fragment, adds the micro detail, applies real sun and hemisphere light, and keeps the existing haze. A wet band is driven by height against the waterline, with a thin foam line animated by the swell. Seabed uses the same shader with sand ripples (stripe noise) and rock weights, tinted by the existing shelf tint.

Vertex size grows from 9 to 16 bytes per vertex (colour 3 floats becomes 4 packed weights as `Uint8` normalised). Tile triangle budgets stay as they are.

### D3 Scatter: rocks and trees by instancing

`scatter.ts` places low-poly rocks and trees (two meshes each, 40 to 80 triangles) inside the finest tile rings only, as `InstancedMesh` per tile, positions from a seeded hash of the tile and cell. Cap 600 instances desktop, 250 mobile. Fades with the tile. Kelp reuses the underwater instancing in `underwater-life.ts`.

### D4 Shared swell

New `swell.ts`: `swellAt(x, z, t)` returns height and slope from three summed sines (wavelengths 40, 17, 9 m, amplitudes 0.18, 0.07, 0.03 m, matching the visual calm). The water plane stays flat, so the swell is a believable motion field the ships ride, not a displaced mesh. Ships, wakes, shore foam and bird shadows-on-water read it. A shader twin lives in a GLSL string built from the same constants (DRY: constants exported once, GLSL generated from them). Open question for the captain: also displace the water in its shader so the swell is visible (needs a finer water mesh; see Risks).

### D5 Birds: instanced meshes, flap in the vertex shader

One `InstancedMesh` per species (gull, tern, albatross). Each mesh is a single geometry, body plus two three-segment wings, with a per-vertex `wing` weight (0 at the body, 1 at the tips). The vertex shader bends the wing by `sin(time * rate + phase)` scaled by `wing`, with instanced `phase`, `rate` and `glide` attributes (glide=1 stops the flap, for albatross soaring). Triangle counts: LOD0 about 120, LOD1 about 40, LOD2 a flat silhouette of about 12 triangles with the same flap in the shader. Flocks use simple boids (separation, alignment, cohesion, plus a pull to a leader that orbits the whale) with n up to 24, O(n^2) is under 0.05 ms. Species mix and sizes are seeded.

### D6 Ships: lofted hulls, shader sails, wake

- Hulls are lofted from 8 to 10 station curves (beam and depth profiles per type) so bow and stern are shaped, with a deck, bulwarks and a waterline stripe baked into vertex colour. One merged geometry per ship at LOD0 (hull, rigging, details), one material, so about 2 draws (opaque plus sail).
- Rigging: masts, booms, shrouds and stays as thin merged boxes or lines in the same geometry.
- Sails: static curved cloth geometry. Billow and flutter are in the vertex shader (wind phase, per-sail attribute). This deletes the CPU loop that rewrites sail vertices each frame.
- Wake: one ribbon mesh per moving ship (24 segments), a shader fades foam with age, plus a bow-spray sprite pair; stern wake only at LOD0 and LOD1.
- Motion: heave, roll and pitch come from `swellAt` sampled at bow, stern and beam points, so a ship follows the same swell as everything else.
- Types in the first release: sloop (refined), schooner (replaces the three-mast "tall", fewer parts), trawler (engine, wheelhouse, boom and gantry, no sails, a faint exhaust, uses a lower speed wake). Optional fourth, small ferry or cargo, behind the open decision on ship count.

### D7 LOD and quality tier

Each element has four LOD levels chosen by distance with hysteresis, never by popping: LOD0 close detail, LOD1 mid, LOD2 impostor or simplified, LOD3 hidden or sunk in the haze (ships already sink between 1250 and 1650 m). The detail tier is derived from the existing quality tier and capped by an explicit table (see `detail-performance`). The adaptive quality loop in `updateQuality` already steps the tier down when the frame average exceeds 1.3x target; detail follows it, so there is no second controller.

### D8 Assets

Everything procedural. The micro-detail needs no texture. If a small tileable detail normal ever proves necessary it is generated on a canvas at start (256 x 256) rather than shipped. Any shipped asset must be listed in `THIRD_PARTY_NOTICES` and `public/THIRD_PARTY_NOTICES` with origin and licence.

## Risks / Trade-offs

- **Shader patching breaks on three upgrade**: follow the existing `patchShader` pattern, which falls back to the stock material with a console message.
- **Vertex size growth** (D2) raises tile memory by about 15 to 25 percent. Mitigate with packed `Uint8` weights; budget in the performance spec.
- **Domain warp changes every seed's coastline**. Saved seeds and shared links will look different. Gate behind a layout version constant so old seeds can be kept if the captain wants.
- **Mobile fragment cost** of the land shader: micro detail is distance-faded and removed entirely on `low`.
- **Water stays flat**: the swell is invisible on the water itself, so ship motion must stay small (under 0.3 m heave) or it will look wrong against a mirror surface.
- **Instanced bird flap** uses vertex shaders only, so the debug and test paths need a CPU twin for positions of the wing tips (used for tests only).

## Migration Plan

Land in phases, each independently shippable behind the quality tier, each with its own screenshots and perf numbers: P1 shared swell, LOD and tier plumbing, plus birds; P2 ships; P3 terrain shape; P4 terrain material and scatter; P5 polish and budgets audit. No data migration (nothing persisted). Rollback is a revert of the phase.

## Resolved Decisions

Confirmed by the captain on 2026-10-25; they replace the former open questions.

1. Style: soft stylised low-poly with smooth shading.
2. Scope: all five phases, birds first. Phase 1 (swell, LOD and tier plumbing, birds) is built first.
3. Ships: three types, sloop, schooner and trawler. The three-mast "tall" ship goes. No ferry in this change.
4. Birds: three species, gull, tern and albatross.
5. Density: 1.5x today's islets and rocks.
6. Coastlines: accept the new ones (the domain warp changes every seed); no layout-version fallback is kept.
7. Quality and water: keep the three tiers (`low`, `medium`, `high`) and keep the water flat; the swell is not displaced on the water.

## Phase 1 notes

- LOD2 for birds is a flat silhouette of about 12 triangles with the same shader flap, not a camera-facing billboard: it needs no per-frame orientation work. LOD0 is about 120 triangles and LOD1 about 40; the earlier 200 and 60 were estimates.
- Bird LOD distances are 40 m and 120 m from the camera, with 10 percent hysteresis (`src/lod.ts`).
- Birds are one instanced mesh per species and level (at most nine draws, in practice three to six), one shared material, 24 instances at most, never below 5 m over the water.
- Ships use `swellAt` at their own position for heave and for roll and pitch from the slope; the per-ship random sines are gone. Hull, rigging, shader sails and wakes remain Phase 2.
