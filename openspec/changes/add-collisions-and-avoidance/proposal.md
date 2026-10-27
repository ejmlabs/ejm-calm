## Why

Only land is avoided today: the whale steers off a clearance field, and ships are pushed clear of land and flip their heading. Nothing stops a ship passing through another ship or the whale, and nothing can ask what lies ahead of a mover. Collisions for the whale and ships, and active avoidance, need one place that knows where every obstacle is.

## What Changes

- An obstacle registry: a spatial hash of kinematic obstacles (whale and ships as capsules along their bodies; rocks, landmarks and props as spheres) with overlap and feeler queries.
- The analytic ground (land and seafloor) and sea samplers exposed beside it, with a clearance check against the ground.
- The whale and the ships afloat are registered where they are every frame.
- Later steps adopt it: shared steering, ship steering, whale avoidance and mesh-level checks.

## Capabilities

### New Capabilities
- `collisions`: obstacle registry, analytic samplers.

### Modified Capabilities
None.

## Impact

New `src/obstacles.ts` and `tests/obstacles.test.ts`; a few lines of wiring in `src/main.ts`. No new dependency: the shapes are the three.js `Capsule` addon. No physics engine.
