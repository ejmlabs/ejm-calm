## 1. Shape and surface

- [x] 1.1 Cliff gullies and buttresses in `land.surfaceAt`, on land only; test that the mask and sea heights are unchanged (checksums on seeds 1, 7 and 42 match f8b9a73 exactly). Strata ledges in the heightfield were tried and removed: cliffs read as stepped pyramids
- [x] 1.2 Per-vertex detail weights (rock, sand, forest, object) in `buildTile`, sent from the worker; rock only on cliffs and real faces
- [x] 1.3 Land shader detail: triplanar strata, blocks and grit, wet band, grass and canopy mottling, sand ripples, bump on `medium` and `high`; every band faded by its screen footprint, all faded by distance; broad drifts and rain streaks on rock out to the far ranges
- [x] 1.4 Finer tile grid tried (a quarter of the segments per side, +40 percent land triangles): software-GL frames passed a second and the route indicator smoke check failed, so the grid stays as it was

## 2. Life on land

- [x] 2.1 `src/land-life.ts`: seeded trees, shrubs and boulders on a nested lattice by biome; towns per cell; herds per cell; tests for determinism, placement rules and the coarse-to-fine subset
- [x] 2.2 `src/land-objects.ts`: shapes from three.js geometries merged with `mergeGeometries`, replacing a hand-rolled mesh writer
- [x] 2.3 Bake trees, rocks and houses into tiles at the five finest levels under the tier's object cap (half from level 3 out); walkers for the three finest
- [x] 2.4 `src/walkers.ts`: instanced people and animals in two draws, animated in the vertex shader, still under reduced motion
- [x] 2.5 Tier table and debug stats: object triangles of the drawn tiles, walkers, walker draws, walker clock; `life` and `view` review hooks

## 3. No size caps

- [x] 3.1 Remove `npm run budget` and `tools/budget.ts`, the audio size assertion, and the byte and dependency rules in `add-ocean-migration` and `add-world-detail`
- [x] 3.2 `tools/load-time.ts`: first paint, first contentful paint and first frame over five cold loads on a 9 Mbps, 170 ms connection (phone CPU 4x slower). Medians, software GL: against step 3 (f8b9a73) first contentful paint +4 ms desktop and +8 ms phone, first frame +0.29 s desktop and +0.78 s phone; against main (965f536) first contentful paint −4 ms and +0 ms, first frame +0.49 s desktop and +1.22 s phone (flagged; step 3 accounts for the rest). Transfer 811 KB against 784 KB (step 3) and 654 KB (main), reported only

## 4. Checks

- [x] 4.1 Smoke land checks on desktop and phone and under reduced motion; typecheck, tests, smoke, OpenSpec strict, gitleaks
- [x] 4.2 Seed sweep on seeds 1 to 24 for one hour matches step 3 in every shard (mean net 63.9, 63.5, 63.0 and 61.4 km; worst five minutes 2.2 km on seed 23)
- [x] 4.3 Frame cost: a finest tile builds in about 2.1 ms bare and 3.5 to 4.3 ms with life, in the worker (`tools/frame-cost.ts`); smoke throughput on this box p99 5.3 to 7.9 ms against step 3's 9.9 ms in the same session
- [x] 4.4 Review shots: desktop and phone, day, dusk, night, and a close coast with a town and a herd (`tools/land-shots.ts`)
