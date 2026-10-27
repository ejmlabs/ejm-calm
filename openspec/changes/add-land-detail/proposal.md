## Why

The owner looked at the step 3 afternoon shot and asked for much better land: the ground and the coastal sides need more detail and better quality, and the land needs life, with little animals, towns and people.

Today the land is one smooth-shaded heightfield coloured per vertex:

- A coast 500 m away is drawn from cells about 21 m across, so a 50 m cliff is two or three flat facets of one grey-brown.
- Nothing grows on the land and nobody lives there: there are no trees, rocks, houses, people or animals.

The owner also set a new rule for the project: no byte, bundle or dependency caps. three.js is the renderer and is used fully, and maintained packages are preferred to hand-rolled code. Load time is the only size bar: a change must not add whole seconds to first paint on a normal connection, and that is measured rather than capped.

## What Changes

- **Ground and sides:** a land shader with procedural detail that costs no triangles. It adds:
  - rock strata, blocks and grit on cliffs and steep faces, sampled from three axes (triplanar);
  - a dark wet-rock band at the waterline;
  - mottled grass, forest canopy and sand ripples;
  - a fine bump normal on `medium` and `high`.

  Each detail fades out once a pixel spans too much of it, so nothing shimmers, and all of it fades with distance.
- **Shape:** gullies and buttresses break the tops of sea cliffs, and spurs and gullies run down every slope with real relief. This is on land only, so the coast mask and the sea depths stay exactly as they are.
- **Far ranges:** tiles from 512 m across carry colour and normal shading maps baked in the worker at four times their vertex density, so distant ranges show spurs, gullies, rock and snow lines instead of flat facets, with thinner aerial haze that still closes before the streamed edge. No triangles are added.
- **Vegetation by biome:** trees in land tiles (conifers, broadleaf trees, palms in the tropics) and shrubs and boulders, built into the tile geometry by the tile worker from three.js primitives merged with its `BufferGeometryUtils`. They are seeded, add no draw calls and dissolve with their tile.
- **Towns:** villages of 6 to 18 houses, some with a tower, on gentle coastal land behind the beach. They are placed from the seed and the land, and are visible from the sea out to about 3 km.
- **People and animals:** tiny people walking about each town, and grazing herds on open meadows (sheep and cows near towns, deer in the temperate wild, reindeer in polar land, goats in the tropics). They take two instanced draws, move gently, and freeze under reduced motion.
- **First frame first:** the opening tiles are built bare on the main thread; their life and shading maps come from the worker after the first frame and dissolve in, so land detail adds no time to the first frame.
- **Budgets:** per-tier caps on objects per tile, object triangles and walkers, all reported in the debug stats and checked in smoke.
- **No size caps:** remove `npm run budget` and its script, the audio size assertion, and the byte and dependency rules in the `add-ocean-migration` and `add-world-detail` changes. Add `tools/load-time.ts`, which times first paint, first contentful paint and the first frame of the sea on a throttled normal connection with Playwright, and fails when a build adds a second or more against another.

## Capabilities

### New Capabilities

- `land-detail`: land surface detail, coastal shape, vegetation, towns, people and animals, and their budgets.
- `load-time`: load time on a normal connection as the performance bar, in place of byte caps.

### Modified Capabilities

None archived. The open changes `add-ocean-migration` (`migration-performance`) and `add-world-detail` (`detail-performance`) lose their byte and dependency rules in place. This change also takes over the terrain material and scatter tasks (section 5) of `add-world-detail`, and replaces that change's scatter caps of 250 and 600 instances with the budgets here.

## Impact

- Code:
  - `src/land.ts`: cliff gullies, and spurs and gullies on slopes, on land only.
  - `src/world-tiles.ts`: detail weights, objects baked into tiles, and shading maps for coarse tiles.
  - `src/landmesh.ts`: the shader, shading maps, bare first tiles upgraded from the worker, and walkers per tile.
  - `src/world-worker.ts`: transfers.
  - new `src/land-life.ts`: placement of trees, towns and herds.
  - new `src/land-objects.ts`: the object shapes, from three.js geometries.
  - new `src/walkers.ts`: instanced people and animals.
  - `src/quality.ts`: the tier table.
  - `src/world.ts` and `src/main.ts`: wiring, stats and review hooks.
- Tests: an unchanged mask and sea depth, placement determinism and rules, the coarse-to-fine subset, caps, and budgets in smoke.
- Tools: `tools/land-shots.ts` for review shots and `tools/load-time.ts` for load time; `tools/budget.ts` is removed.
- The tile worker now bundles the three.js geometry it uses. No new dependency, origin or CSP change.
- The route and its seed sweep must be unchanged: the mask and sea depths do not move.
