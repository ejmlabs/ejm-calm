## 1. Foundations (P1)

- [x] 1.1 Add `src/swell.ts` with exported constants and `swellAt(x, z, t)`; unit test determinism and amplitude bounds
- [x] 1.2 Add detail tier table to `src/quality.ts` and tests for tier mapping and step-down
- [x] 1.3 Add LOD selector with hysteresis (`src/lod.ts`) and tests
- [x] 1.4 Add budget counters to the `?debug=1` stats (draws, triangles, per-element ms) and a `tools/smoke.ts` budget check

## 2. Birds (P1)

- [x] 2.1 Procedural gull, tern, albatross geometry with `wing` weight attribute (LOD0, LOD1, LOD2)
- [x] 2.2 Vertex-shader flap with instanced phase, rate and glide attributes; reduced-motion freezes the flap
- [x] 2.3 `src/flock.ts` boids with leader orbit around the whale; tests for separation, cohesion and boundedness
- [x] 2.4 Replace `src/birds.ts` Line birds; keep the same `createBirds` interface used by `main.ts`
- [x] 2.5 Screenshot close, mid and far on desktop and mobile; record ms and draws

## 3. Ships (P2)

- [ ] 3.1 Hull loft generator with per-type station curves (`src/hulls.ts`)
- [ ] 3.2 Sloop, schooner and trawler builders producing one merged geometry each
- [x] 3.3 Shader sails (billow and flutter) replacing the CPU vertex loop (`patchSailShader` in `src/ships.ts`: one shared cloth angle, a per-vertex push direction, weight and phase; the sway is the one the CPU loop wrote)
- [ ] 3.4 Wake ribbon and bow spray (`src/wake.ts`)
- [ ] 3.5 Heave, roll, pitch from `swellAt` at three hull points
- [ ] 3.6 Extend `ShipSpec.kind` and `shipSpecsForCell` for the new types with seeded mix; tests for determinism
- [ ] 3.7 LOD0 to LOD3 for ships; verify sink-in-haze still works
- [ ] 3.8 Screenshots and perf numbers

## 4. Terrain shape (P3)

- [ ] 4.1 Domain warp and ridged mid layer in `land.surfaceAt`, behind a layout version constant
- [ ] 4.2 Coves, islets and sea stacks near coasts; check `maskAt` and ship clearance still agree
- [ ] 4.3 Tile seam tests across levels still pass (`tests/world.test.ts`)
- [ ] 4.4 Seabed relief tuning in `seafloor.ts` (ripples, rock outcrops)

## 5. Terrain material and scatter (P4)

- [ ] 5.1 Pack per-vertex material weights in `buildTile`; update worker transfer types
- [ ] 5.2 Patched land material: weights, sun and hemisphere lighting, micro detail, haze
- [ ] 5.3 Wet shoreline band and animated foam line
- [ ] 5.4 `src/scatter.ts` rocks and trees as per-tile `InstancedMesh`; seeded; capped by tier
- [ ] 5.5 Re-measure land haze colours per time-of-day preset (see FOLLOWUP.md)

## 6. Polish and audit (P5)

- [ ] 6.1 Run the frame budget on desktop and a throttled mobile profile; record in the PR
- [ ] 6.2 Load-time check against `main` (`tools/load-time.ts`; replaces the bundle cap)
- [ ] 6.3 CSP check: no new inline style, `data:` image or external request
- [ ] 6.4 Update `README.md`, `FOLLOWUP.md`; add `THIRD_PARTY_NOTICES` entries only if an asset was shipped
- [ ] 6.5 Typecheck, tests and `npm run test:browser` pass
