## Context

Every mover in calm is kinematic. Land and seafloor are height functions already evaluated on the main thread (`seafloor.heightAt` is the land's height above the sea and the floor below it), so sampling them is exact collision with the ground. What is missing is a way to find movers near a point or ahead of one.

## Goals / Non-Goals

**Goals:** one registry that answers "what overlaps this?" and "what is the first thing ahead?" for the whale, ships and later fish schools; exact answers, checked against brute force.
**Non-Goals:** rigid-body dynamics, contact forces, steering (a later step), mesh-level checks (a later step).

## Decisions

- **No physics engine.** Rapier's WASM is about 1.17 MB gzip (about one second at 9 Mbps), Jolt about 0.75 MB plus glue, cannon-es and ammo are stale, and nothing in calm is dynamic. Load time is the only bar, so the cost buys nothing.
- **One shape: the three.js `Capsule` addon.** The whale is a capsule from head to flukes along its heading and pitch, a ship one from bow to stern at the waterline, half its beam wide. A rock, landmark or prop is a capsule whose ends meet, so every test is one test.
- **Broad phase: a spatial hash in XZ.** Cells of 64 m keyed by a packed integer. Movers are cleared and added again each frame after they move; with tens of obstacles this costs less than keeping cells up to date. Clearing empties each cell's list in place and drops only cells left empty for a whole frame, so a warm rebuild allocates nothing; overlap queries fill a list the caller passes and the feeler reuses its hit.
- **Narrow phase: three.js where it has the test, a published closed form where it does not.**
  - Overlap: three.js `Line3.distanceSqToLine3` (the standard closest-points segment–segment distance) against the sum of the radii.
  - Feeler: a sphere swept along a ray is a ray against the capsule grown by the sphere's radius. three.js `Ray` meets spheres and measures distance to a segment but has no first hit on a capsule, so the ray–capsule intersection is ported from a published MIT-licensed ray–capsule intersector (source in THIRD_PARTY_NOTICES). A ray that starts inside reports a hit at 0. Tests check it against an independent search along the ray.
- **Surfaces beside it.** `groundAt` is the seafloor field (land above the sea), `seaAt` the shared swell; `groundClearance` samples a capsule's ends and middle against the ground.

## Risks / Trade-offs

- [Per-frame rebuild grows with obstacle count] → fine for the whale and tens of ships; fish schools register one capsule per school, not per fish.
- [A capsule only approximates the flukes and rig] → mesh-level checks come later with `three-mesh-bvh`, for close range only.

## Migration Plan

This step adds the module, its tests and the wiring; nothing reads the registry yet, so behaviour is unchanged. Steering, ship steering, whale avoidance and mesh-level checks adopt it one at a time.
