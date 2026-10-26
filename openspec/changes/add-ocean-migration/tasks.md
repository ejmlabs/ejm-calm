## 1. Measure and guard (M1)

- [x] 1.1 Add a journey probe to `?debug=1` stats: distance travelled, net distance, region id, land within 4.5 km, revisit share (step 1: path and net; step 2: region, land within 4.5 km as the distance to the nearest land sampled on rings, and the revisit share, within 500 m of a fix at least 120 s earlier)
- [x] 1.2 Add `tests/journey.test.ts`: one-hour headless run over a fixed seed set, assert speed bounds, net/path ratio and revisit share (step 1: speed bounds on real coasts; net/path and revisit over open water. Step 2: real coasts assert net in 10 min of at least 9 km, net over path of at least 0.6 and revisits under 5 percent, on the six seeds)
- [x] 1.3 Add a tile throughput check to `tools/smoke.ts` (travel 300 s at cruise speed, assert no coverage gap on screen) (step 2: 300 s in single 30 Hz world steps, a 25 ms yield after every fifth. Asserts no step with a hole in the land inside the haze, no step with the navigation tile 3 s ahead unbuilt, at most 5 recentres, bounded tile counts and under 10 percent of stream steps over 3 ms. The spec's worst stream step under 3 ms is measured and printed, not asserted: software GL on a shared box shows a worst of about 30 to 55 ms with p99 near 6 ms, against under 5 ms and p99 under 1 ms for the same code in plain Node; no phone figure)

## 2. Route and speed (M1)

- [x] 2.1 `src/current.ts`: seeded flow field (curl of low-frequency noise) giving a drift heading; unit tests for determinism and bounded curvature (step 2: `CURRENT_SCALE` 60 to 200 km, the test bound is the spec's 6 degrees a minute at 28 m/s, 0.0623 rad per km, over 15 seeds; the worst measured is 5.0 degrees a minute)
- [x] 2.2 Replace the visited-cell bias in `whale-course.ts` with a no-backtrack cone around the journey heading; keep `planJourney` as the way through coasts
- [x] 2.3 Raise `TRAVEL_MIN` and `TRAVEL_MAX` to 16 and 28; scale `reach`, probe distances and `PLAN_CELL` radius with speed (step 2: route-plan cells are expanded and scored only inside the 3.2 km `PLAN_RADIUS` disc, and the navigation tiles are kept built to `PLAN_REACH` plus the 700 m lead around the point ahead, so no plan cell builds a tile on the main thread)
- [x] 2.4 Raise `SPEED_CAP` in `camera.ts`; tune pull-back and look-ahead so the whale stays framed at 28 m/s
- [x] 2.5 Breaths at a glide (at least 60 percent of cruise speed); feeding rare and short

## 3. Regions and open ocean (M2)

- [x] 3.1 `src/regions.ts`: region field (about 40 km cells, 5 km blends), region id and blend weights from a seed and a world position; tests for continuity and determinism (cells of 40 km, warped by up to 5 km beyond 6 to 18 km from the start; the start cell is always temperate; `tests/regions.test.ts`: weights change under 0.01 per 10 m along six lines on six seeds)
- [x] 3.2 Modulate the land mask by region in `land.ts` so land is 5 to 8 percent overall, islets sparse, continents rare; keep `maskAt`, nav and mesh in agreement (a region offset is subtracted from the mask inside `maskWarped`, so the nav field, mesh and seafloor agree by construction; it fades in between 2.2 and 5 km from the start. Land in a 60 km square: 4.1 to 6.9 percent on the six seeds, 5.7 on average; the worst 10 km disc on five 100 km lines is under 40 percent)
- [x] 3.3 Keep a safe opening: the start bay still has open water and the opening composition still scores (nothing changes within 2.2 km of the start, where the composed view lies; one exit channel of open water, 360 m wide and tens of metres deep, leaves the bay beside the view, so no start sea is enclosed, and the journey heads for the way out of the start sea found by a flood over the mask)
- [x] 3.4 Region looks: water colour, fog tint and density, haze, land palette, islet density, bird mix, ship density (`src/region-look.ts` blends the four looks by the whale's weights; water colour, sea fog, land haze density and palette tint, bird species mix and ship cell counts follow it; the underwater view keeps its own colours. Look values change by under 2 percent between frames at 28 m/s, tested)
- [ ] 3.5 Optional passage set pieces (strait, archipelago) as seeded rare cells (not built: not cheap, and the plan does not call for it before the feel step)

## 4. Streaming at speed (M2)

- [x] 4.1 Scale land `LEAD`, `LEAD_MAX`, nav `LEAD_MAX` and ship load radius with speed; measure tile misses at 28 m/s (measured in step 2: the land-stream unit test now runs at 28 m/s on the main-thread builder, one tile per frame: of 179 fine tiles that came into view none was not solid when the view reached it; the smoke run of 300 s in 30 Hz steps shows 0 coverage gaps and 0 unbuilt navigation tiles ahead)
- [x] 4.2 Raise `RECENTER_RADIUS` and `ORIGIN_SNAP` so recentres stay under one per two minutes at cruise; check shelf rebake cost (3840 m and 512 m: 0.28 recentres a minute on the six-seed hour, no gap under 120 s at 28 m/s, tested. The shelf maps no longer rebake with the origin: the near map (1.6 km) rebakes when the whale is 700 m from its centre and the far map (6.4 km) at 1280 m, around the point ahead; the near bake is 41 slices of 8 rows, worst slice 3 ms in Node, and the tile distance transform builds in slices of 32 lines)
- [x] 4.3 Verify cleanup behind: tiles, nav blocks, ship cells and caches stay bounded over a one-hour run (`tests/streaming.test.ts`, one hour at 22 m/s: peaks of 329 land tiles, 256 nav tiles and 320 blocks (their caps), 25 ship cells, 19 ships, a plan cache of 17,074 cells (cap 40,000), 17 recentres, heap growth 0.0 MB from minute 10 to minute 60)

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
