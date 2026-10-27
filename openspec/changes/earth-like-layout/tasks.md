## 1. Layout

- [x] 1.1 `src/planet.ts`: lane centreline integrated from the current, continents (warped noise, about a third land), placement search, strait widening, lane islands and islet clusters, ocean archipelagos, latitude
- [x] 1.2 `src/land.ts`: the far-field mask follows the planet layout with the coast detail on top near its coasts; region thinning removed; `heightAt` and `surfaceAt` signatures unchanged
- [x] 1.3 `src/terrain.ts`: journey heading is the planet's migration heading; the open-water flood removed
- [x] 1.4 `src/regions.ts`: latitude bands and deep blue by distance from continents; `landOffset` removed

## 2. Tools and tests

- [x] 2.1 `tools/world-map.ts` (map PNG), `tools/world-shots.ts` (review screenshots); `tools/seed-sweep.ts` reports coast share and longest open stretch and takes a seed list; `tools/feel-shots.ts` finds regions along the lane
- [x] 2.2 `tests/planet.test.ts`; `tests/regions.test.ts` and the far-land test in `tests/world.test.ts` updated for the layout

## 3. Verify

- [x] 3.1 Seed sweep over seeds 1 to 50 and the test set: travel at or above step 3 (net over path 0.83 to 0.99, median 0.95, against 0.55 to 0.97, median 0.88; worst ten minutes 7.2 km against 2.4; one seed under 1.5 km in five minutes, seed 23 at the start, against seed 34 before; coast in view 28 percent of the hour on average against 95)
- [x] 3.2 Typecheck, unit tests, `npm run test:browser`, `openspec validate earth-like-layout --strict`, gitleaks (on a shared, busy machine two timing tests failed in the full run, the 4 ms streaming p95 at 4.36 ms and a journey test's time limit; both pass run alone, as on main)
- [x] 3.3 Load time before and after (Lighthouse 12.8.2, median of three, seed 42): first contentful paint 886 to 889 ms on the desktop preset and 4.82 s to 4.82 s on the simulated mobile preset; transfer 805 to 808 KB. Frame cost: the layout adds nothing per frame beyond land sampling; `maskAt` costs about the same as before (4 to 9 us a sample on the busy machine, both versions); the smoke run's stream steps are compared with main in the report
- [x] 3.4 Map images in `design.md`; screenshots mid-ocean, approaching a continent and in an archipelago, desktop and phone
