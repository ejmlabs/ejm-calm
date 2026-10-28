## Why

The live world still reads as "land on every side". Measured on main 2e896b2 with the real whale mover over one hour (seeds 1 to 50 and the six test seeds), natural land (not counting the open sea's rocks) lies within 6 km of the whale 95 percent of the hour on average, and the longest stretch without any is at most 6 minutes. The land mask is one field of 6.5 km noise thinned by region, so land comes as scattered blobs a few kilometres across in every direction, never as continents and never as open ocean.

The captain wants the world laid out like Earth: big continents and large open oceans, long open-ocean stretches with a coastline now and then, so it feels like a real world.

## What Changes

- **Planet layout** (`src/planet.ts`, new): a seeded, deterministic, streamable layout at planet scale. Continents come from warped fractal noise of 260 km wavelength, about a third of the planet (as on Earth), with coastlines hundreds of kilometres long; between them lie wide connected oceans. Archipelago zones scatter islet clusters across the oceans.
- **The migration's lane**: the whale's ocean current is integrated from the start into a centreline. A lane of open sea at least 6 km either side of it is kept whatever the continents do; where it crosses a continent the strait widens into a sound. The continents are slid (one of 64 seeded offsets) so the first 500 km of the lane, and its first 80 km, pass a continent's coast for about 15 percent of the way, in runs of at most 25 km.
- **Islands along the way**: four 32 km stretches of the lane in five have a large island to one side (its shore at least 2.5 km off the centreline) or a cluster of islets the lane runs through.
- **Land mask**: beyond the composed opening (2.2 to 5 km out) `maskAt` follows the planet layout, with the existing coast detail (bays, headlands, coves, cliffs) on top near its coasts and none in the open ocean. The opening, its exit channel and the height function are unchanged.
- **Journey heading**: the whale's journey heading is the planet's migration heading (out of the opening by its exit channel), so the lane and the current agree by construction. The open-water flood that picked the heading is removed.
- **Regions on the layout**: tropical, temperate and polar follow latitude bands of a planet north axis that crosses the lane at 35 to 55 degrees; deep blue is open ocean 22 to 40 km or more from any continent. The start stays temperate. The region thinning of the land mask (`landOffset`) is removed; regions keep their islet gain.
- **Tools**: `tools/world-map.ts` renders a seed's map (land, regions, lane, whale track) to PNG; `tools/seed-sweep.ts` also reports how much of the hour a natural coast is in view and the longest open stretch, and takes a list of seeds.

## Capabilities

### New Capabilities

- `world-layout`: planet-scale continents and oceans, the migration lane, islands and archipelagos, coast-in-view share, determinism and streaming.

### Modified Capabilities

- `ocean-regions`: regions follow latitude and open ocean instead of 40 km cells; the land share requirement is replaced by `world-layout`.

## Impact

- Code: `src/planet.ts` (new), `src/land.ts` (the far-field mask term and the planet hook only; `heightAt` and `surfaceAt` keep their signatures), `src/regions.ts`, `src/terrain.ts` (journey heading), `tools/seed-sweep.ts`, `tools/feel-shots.ts`, `tools/world-map.ts` (new).
- Tests: `tests/planet.test.ts` (new), `tests/regions.test.ts` updated; travel tests unchanged in their bounds.
- Saved seeds look different beyond the opening (the land layout changes), as with every layout change before.
- Dev dependency: `pngjs` (map images only). No runtime dependency, no new asset, CSP unchanged.
