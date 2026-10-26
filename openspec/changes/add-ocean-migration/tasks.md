## 1. Measure and guard (M1)

- [x] 1.1 Add a journey probe to `?debug=1` stats: distance travelled, net distance, region id, land within 4.5 km, revisit share (step 1: path and net only; region, land and revisit follow with regions)
- [x] 1.2 Add `tests/journey.test.ts`: one-hour headless run over a fixed seed set, assert speed bounds, net/path ratio and revisit share (step 1: speed bounds on real coasts; net/path and revisit over open water)
- [x] 1.3 Add a tile throughput check to `tools/smoke.ts` (travel 300 s at cruise speed, assert no coverage gap on screen)

## 2. Route and speed (M1)

- [x] 2.1 `src/current.ts`: seeded flow field (curl of low-frequency noise) giving a drift heading; unit tests for determinism and bounded curvature
- [x] 2.2 Replace the visited-cell bias in `whale-course.ts` with a no-backtrack cone around the journey heading; keep `planJourney` as the way through coasts
- [x] 2.3 Raise `TRAVEL_MIN` and `TRAVEL_MAX` to 16 and 28; scale `reach`, probe distances and `PLAN_CELL` radius with speed
- [x] 2.4 Raise `SPEED_CAP` in `camera.ts`; tune pull-back and look-ahead so the whale stays framed at 28 m/s
- [x] 2.5 Breaths at a glide (at least 60 percent of cruise speed); feeding rare and short

## 3. Regions and open ocean (M2)

- [ ] 3.1 `src/regions.ts`: region field (about 40 km cells, 5 km blends), region id and blend weights from a seed and a world position; tests for continuity and determinism
- [ ] 3.2 Modulate the land mask by region in `land.ts` so land is 5 to 8 percent overall, islets sparse, continents rare; keep `maskAt`, nav and mesh in agreement
- [ ] 3.3 Keep a safe opening: the start bay still has open water and the opening composition still scores
- [ ] 3.4 Region looks: water colour, fog tint and density, haze, land palette, islet density, bird mix, ship density
- [ ] 3.5 Optional passage set pieces (strait, archipelago) as seeded rare cells

## 4. Streaming at speed (M2)

- [x] 4.1 Scale land `LEAD`, `LEAD_MAX`, nav `LEAD_MAX` and ship load radius with speed; measure tile misses at 28 m/s
- [ ] 4.2 Raise `RECENTER_RADIUS` and `ORIGIN_SNAP` so recentres stay under one per two minutes at cruise; check shelf rebake cost
- [ ] 4.3 Verify cleanup behind: tiles, nav blocks, ship cells and caches stay bounded over a one-hour run

## 5. Sense of speed (M3)

- [ ] 5.1 `src/wake.ts`: whale wake ribbon and bow wave (shared with the ship wake of `add-world-detail` phase 2)
- [ ] 5.2 `src/flecks.ts`: instanced surface flecks around the whale, one draw
- [ ] 5.3 Passing islets and rocks near the route, seeded, sparse
- [ ] 5.4 Clouds scroll with a wind vector; swell time scaled with speed; passing flocks instead of a flock that follows
- [ ] 5.5 Camera: pull-back, field-of-view lift and lean with speed; respect reduced motion

## 6. Atmosphere (M3)

- [ ] 6.1 Slow day cycle across the existing four presets plus a night preset; sun, sky, fog and hemisphere light lerp
- [ ] 6.2 Environment map refresh at most every 90 s on `medium` and `high`; none on `low` (lerp lights only)
- [ ] 6.3 Weather states clear, hazy and overcast per region and time; cloud coverage and fog density lerp
- [ ] 6.4 Reduced motion: no field-of-view lift, slower cycle

## 7. Route indicator (M3, optional)

- [ ] 7.1 Region name and distance travelled, fade in on a region change, fade out after 6 s
- [ ] 7.2 Toggle in the info panel, saved in `persistence.ts`, off by default

## 8. Audit

- [ ] 8.1 Frame budget on desktop and throttled mobile profile; record in the PR
- [ ] 8.2 Bundle size against the 25 KB gzip cap; CSP unchanged
- [ ] 8.3 Screenshots per region and time of day, desktop and phone
- [ ] 8.4 Update `README.md` and `FOLLOWUP.md`; typecheck, tests and `npm run test:browser` pass
