## Why

Calm feels like a lake, not an ocean crossing. The captain: "We're not moving in a direction fast enough or covering enough ground/water. It should be like the whale is migrating non-stop across the generated world."

Measured on main d93f95d (six seeds, headless run of the real whale mover and land code, one hour of simulated time each; see `design.md` Evidence):

- **Slow.** Mean ground speed 5 m/s over the run, 6 m/s while travelling, 1.9 m/s during the 25 to 30 percent of the time spent breathing. Ten minutes cover 2.9 km of path and only 2.3 km of net distance.
- **Not a journey.** In an hour the whale swims 18 km but ends 4.4 km from where it started on average. 34 percent of the time it is within 200 m of a spot it passed at least two minutes earlier.
- **Always coast.** About half of the land mask (50 percent of a 30 km square) is land and the whale sits in a bay of it. It is within 316 m of a shore 74 to 87 percent of the time, and land is always in view. The view is the same few mountains and bays for the whole session.
- **Nothing changes.** One palette, one time of day and one clear sky per seed for the whole run. No region, weather or light change marks distance.
- **Nothing to read speed from.** The sea is a flat mirror plane; the chase camera moves with the whale, so only far land moves, at about 1 to 3 px per second on a phone.

## What Changes

- **Route**: a long, steady heading with gentle drift (a flow-field current), a no-backtrack rule instead of "prefer unvisited cells", and land avoidance kept as a guard.
- **Speed**: cruising 16 to 28 m/s (today 3 to 9), camera and look-ahead limits raised to match.
- **World**: a large-scale region field (about 40 km cells, blended over 5 km) decides land density and ocean character. Open ocean dominates; islets are sparse; continents are rare passages.
- **Regions**: temperate, tropical, polar and deep blue, each with its own water colour, fog, haze, land palette, islet density and bird mix.
- **Atmosphere**: a slow day cycle and three weather states (clear, hazy, overcast) that change over a long journey.
- **Sense of speed**: whale wake and bow wave, passing islets near the route, moving clouds and swell scaled with speed, camera pull-back and field-of-view lift.
- **Streaming**: look-ahead, prefetch and recentre scaled with speed; open-ocean tiles stay empty and cheap.
- **Stops**: breaths happen at a glide (not a stop) and feeding becomes rare and short.
- **Route indicator**: optional, off by default: region name and distance travelled, fading in on a region change.
- **Budgets**: no growth in draw calls beyond +4 on `low`, no new JS beyond 25 KB gzip, streaming CPU stays inside the existing 2.5 ms per frame.

Nothing is built until the captain picks the options in `design.md`.

## Capabilities

### New Capabilities

- `ocean-route`: heading, speed, drift, no-backtrack, stops.
- `ocean-regions`: region field, four regions, land density, blends.
- `journey-feel`: wake, passing islets, clouds, camera, ships.
- `journey-atmosphere`: day cycle and weather over a long run.
- `migration-performance`: streaming, budgets and tier behaviour at speed.

### Modified Capabilities

None. The repository has no archived OpenSpec capabilities. The change builds on the unarchived `add-world-detail` change (see `design.md`, "Interaction with add-world-detail").

## Impact

- Code: `src/whale-behavior.ts`, `src/whale-course.ts`, `src/camera.ts` (`SPEED_CAP`), `src/land.ts` (region modulation of the mask), `src/world.ts` and `src/world-origin.ts` (lead, radii, recentre), `src/landmesh.ts` (lead, fade), `src/sky.ts` (cycle, weather, region tint), `src/ocean.ts` (tint), `src/birds.ts` and `src/flock.ts` (passing flocks), `src/world-ships.ts` (density by region), `src/ui.ts` (indicator), `src/persistence.ts` (indicator toggle). New: `src/regions.ts`, `src/current.ts`, `src/wake.ts` (shared with ship wakes in `add-world-detail` phase 2), `src/weather.ts`, `src/landmarks.ts`, `src/route.ts`, `src/ship-fx.ts`.
- Tests: region determinism and blend continuity, route never backtracks over a one-hour run for a seed set, speed bounds, tile seam and streaming throughput at 28 m/s, budget checks in `tools/smoke.ts`.
- Saved seeds look different (land layout changes). Same call as the domain warp in `add-world-detail`; no fallback is kept unless the captain asks.
- No new runtime dependencies, no third-party requests, CSP unchanged.
