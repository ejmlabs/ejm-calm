## Why

The ocean holds at most 336 fish, looping fixed ellipses within about 70 m of the camera near the floor, all of one grey kind. The sea should hold many more fish, of many kinds, through the whole water column. Real games draw tens of thousands of fish by animating instanced meshes in the vertex shader (ABZU, GDC 2017) and steering whole schools as boids. This change lays the first piece: the species and their meshes.

## What Changes

- A species table: sardine, mackerel, tuna, lanternfish that glow, jellyfish, rays and reef fish, each with size, shape, colours, depth range, school size, habitat and swim rate.
- Instanced fish meshes per species at three levels of detail (at most 150 triangles), with a vertex-shader swim: a side-to-side shift, a yaw about the head and a spine wave for fish; a wing wave for rays; a bell pulse for jellyfish. The swim stands still under reduced motion.
- A review-only showcase of every species behind `?debug=1&fish=1`. Nothing changes for visitors yet.

Later items in this lane stream schools across open water (replacing the old fish loops), steer them as boids and set counts by tier.

## Capabilities

### New Capabilities
- `ocean-fish`: fish species, their meshes and their swim.

### Modified Capabilities
None.

## Impact

New `src/fish-species.ts`, `src/fish-mesh.ts` and `tests/fish.test.ts`; `src/underwater-life.ts` exports its depth absorption for reuse; a few lines of debug wiring in `src/main.ts`. No new dependency; three.js `InstancedMesh` and `MeshLambertMaterial` only.
