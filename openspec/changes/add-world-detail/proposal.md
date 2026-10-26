## Why

The sea is calm and readable, but up close the world looks placeholder-grade:

- **Terrain** is one noise field coloured per vertex. Coasts are smooth lumps, there is no mid or micro detail, and the land is unlit with baked shading, so it never reacts to the sun.
- **Birds** are three-point `THREE.Line` "V" shapes, 1 px wide, about 5 per scene. They never read as birds, do not flap in a believable way and do not flock.
- **Ships** are two kinds (sloop, tall). Hulls are extruded outlines, sails are flat panels, there is no rigging, no wake, and bobbing is a pair of sines rather than the sea's motion. Sails are deformed per vertex on the CPU every frame.

The captain asked for vastly better terrain, bird and ship detail.

## What Changes

- **Terrain detail**: ridged and domain-warped macro shape, mid-scale features (coves, sea stacks, gullies, strata), a distance-faded procedural micro-normal and grain in the land shader, real sun lighting, a material system (sand, wet sand band, rock, grass, forest, seabed sand and rock) driven by per-vertex weights, wet shoreline and foam line, instanced rocks and trees near the camera.
- **Birds**: three low-poly species (gull, tern, albatross) as instanced meshes with a vertex-shader wing flap, simple boids flocking with a leader, 10 to 24 birds near the whale.
- **Ships**: lofted hulls, rigging and shader-driven sails, a wake and bow spray, motion from one shared swell function, three types in the first release (sloop, schooner, trawler) with an optional fourth (ferry).
- **Performance system**: four LODs per element, a detail tier tied to the existing `low | medium | high` quality tier, and hard budgets for frame time, draw calls, triangles and shipped bytes.
- No new runtime dependencies, no third-party requests, CSP unchanged. All new geometry and textures are procedural. If an asset is ever downloaded it needs a licence entry in `THIRD_PARTY_NOTICES` and `public/THIRD_PARTY_NOTICES`.

## Capabilities

### New Capabilities

- `terrain-detail`: layered terrain shape, materials and lighting.
- `bird-detail`: bird species, animation and flocking.
- `ship-detail`: ship types, rigging, wake and sea-driven motion.
- `detail-performance`: frame budget, LOD levels, quality tiers and asset limits for the above.

### Modified Capabilities

None. The repository has no existing OpenSpec capabilities.

## Impact

- Code: `src/world-tiles.ts`, `src/terrain.ts`, `src/land.ts` (shape), `src/landmesh.ts` (material), `src/birds.ts`, `src/ships.ts`, `src/world-ships.ts`, `src/quality.ts`, plus new `src/swell.ts`, `src/flock.ts`, `src/hulls.ts`, `src/wake.ts`, `src/scatter.ts`.
- Tests: new unit tests for the shared swell, flocking, LOD selection and the budget checks in `tools/smoke.ts`.
- Bundle: at most 80 KB gzip added to the JS (currently 212 KB gzip). No new binary assets by default.
- Docs: `README.md` and `FOLLOWUP.md` updated when behaviour lands; `FOLLOWUP.md` items on unlit land and flat sails are closed by this change.
