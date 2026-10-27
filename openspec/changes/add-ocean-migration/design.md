## Context

Facts from the code and from runs at main d93f95d (phase 1 of `add-world-detail` live).

### Evidence (how it was measured)

A headless script drives the real `layoutWorld`, `createSeafloor` and `createWhaleMover` at 30 steps per second for 3600 s of simulated time on six seeds (42, 7, 1234, 99, 2024, 31337), prefetching nav tiles as `world.ts` does. A browser run (seed 42, desktop and phone profile, software GL) travelled 600 s with `__calmReview.travel` and matched the headless run (net 2.5 km at 10 min). Numbers are means over the six seeds unless noted.

| Measure | Today |
|---|---|
| Travel speed range (`whale-behavior.ts:24`) | 3 to 9 m/s, mean 6.1 while travelling |
| Mean speed, all behaviours | 5.0 m/s (18 km/h) |
| Time breathing, at 1.9 m/s | 21 to 30 percent |
| Time feeding | 0 to 18 percent over ten minutes, 0 to 13 percent over an hour |
| Path in 10 min / net in 10 min | 3.0 km / 2.3 km |
| Path in 60 min / net in 60 min | 18.2 km / 4.4 km (best seed 7.7 km) |
| Mean heading change | 0.9 to 1.8 deg/s at 10 min, 1.3 to 2.5 deg/s at 60 min; 0.4 to 2.5 full turns of net rotation per hour |
| Time within 200 m of an earlier spot | 0 percent at 10 min, 23 to 51 percent over an hour |
| Time within 316 m of land (the nav field saturates there) | 74 to 87 percent |
| Land share of a 30 km square (`maskAt > 0`) | 49 to 52 percent; 14 to 22 masses over 4 km2 and 1150 to 1350 small ones |
| Land within 4.5 km | 100 percent of the time |
| Scenery already seen (4.5 km disc) | 93 percent after 10 min, 98 to 100 percent after 20 min |
| Camera eye height | about 5 m (distance 16, pitch 0.3 in `camera.ts:24`) |
| Geometric horizon | about 8.4 km; water plane 20 km square (`ocean.ts:105`) |
| Sea fog `FogExp2` 0.00034 (`sky.ts:54`) | 37 percent visible at 2.9 km, 5 percent at 5 km |
| Land haze 0.00026, ends 7.8 km; land stream radius 8.6 km | `landmesh.ts:56-60` |
| Streaming: nav radius 2.3 km, ships 1.8 km, recentre at 1.0 km in 256 m steps | `world.ts`, `world-ships.ts`, `world-origin.ts` |
| Camera speed response capped at 14 m/s | `camera.ts:40` |
| Coast apparent speed on a phone (31 deg wide view, 12.6 px per degree) | coast 1.5 km abeam: 2.4 px/s; 4 km: 0.9 px/s |
| Time to cross the visible 4.5 km at 5 m/s | 15 minutes |
| Phone profile at 10 min (software GL) | 41 draws, 25 k triangles, stream worst 1.2 ms of the 2.5 ms budget |

Frame time from the software renderer (about 100 ms per frame) is not a phone figure and is not used for decisions.

Causes, ranked (see report): 1 land everywhere, so the world has no open ocean; 2 route loops in a bay (revisits); 3 speed; 4 no change along the way; 5 no near-field motion cues; 6 camera and horizon framing.

### Existing machinery that stays

- The world is already endless and chunked: land quadtree tiles (128 m base, built in a worker), nav tiles (64 cells, built on demand and evicted), ship cells (1024 m), floating origin. Tiles that are all sea return null and cost almost nothing.
- Land avoidance, `planJourney`, depth following and the dive and breach poses stay.

## Goals / Non-Goals

**Goals**

- Cover tens of kilometres in ten minutes, in a steady direction, with open ocean dominant.
- Regions and light that change along the way, so distance can be felt.
- Stay within the phone budget: 30 fps, streaming inside 2.5 ms per frame.

**Non-Goals**

- A map or navigation game, goals, scoring, multiplayer.
- New creatures, new audio, geometric water waves, photoreal rendering.
- Real-world geography or map projections. The world is a flat plane; "great circle" means a straight heading with gentle drift.

## Decisions

Each decision lists lettered options. **Recommended** is marked. The captain's pick is recorded in "Resolved Decisions" when made.

### D1 Cruising speed

- A. Double: 6 to 18 m/s cruise. Net 10 min about 7 km. Safe for streaming. Still reads slow against a 4.5 km view.
- B. Fivefold: 16 to 28 m/s cruise (about 60 to 100 km/h). 10 min about 12 km, one hour about 70 km. Needs streaming lead and camera changes (D4). **Recommended.**
- C. Tenfold: 35 to 55 m/s. Reads as flight; tile and shelf work is 10 times today; likely drops frames on a phone.

### D2 Route shape

- A. Keep the planner and the bias to unvisited water; only speed changes. Cheapest. Keeps the loops in bays.
- B. Long steady heading with a flow-field drift (a few degrees per minute), a no-backtrack cone, and the planner used only to get around coasts. Same seed gives the same route. **Recommended.**
- C. B plus waypoints on an authored sea route (current system with gyres). More variety, more state to save and test.

### D3 World composition (land density)

- A. Leave the land mask as is. Open ocean never appears.
- B. A region field scales the mask so land is 5 to 8 percent overall: open ocean dominant, islets sparse, continents rare passages. **Recommended.**
- C. B plus seeded set pieces (strait, archipelago, reef atoll) every few regions. Best moments; more content to tune.

### D4 Streaming at speed

- A. Keep radii and leads. At 28 m/s the whale outruns the 2.3 km nav radius in 80 s and land tiles pop in on screen.
- B. Scale lead, prefetch and recentre with speed; keep the 2.5 ms budget; open-ocean tiles are empty. Cleanup behind stays on the existing caps. **Recommended.**
- C. B plus a second worker for nav tiles. Only if B misses the budget on a phone.

### D5 Ocean regions

- A. One look everywhere (today).
- B. Four regions, temperate, tropical, polar and deep blue, about 40 km across with 5 km blends. Each sets water colour, fog, haze, land palette, islet density, bird mix and ship density. **Recommended.**
- C. B plus region geometry (ice floes, reef shallows, kelp mats). Costs draws and triangles; wait for budget numbers.

### D6 Day and weather

- A. Fixed time of day per seed (today).
- B. A slow day cycle (one day per 40 minutes of travel) across the existing four presets and a night preset, and three weather states (clear, hazy, overcast) tied to region. Lights lerp; the environment map refreshes at most every 90 s on `medium` and `high` and not at all on `low`. **Recommended.**
- C. B plus rain and storm swell. Needs a precipitation pass and wave displacement; out of budget for the flat water.

### D7 Route indicator

- A. None.
- B. Region name and distance travelled, fading in on a region change and out after 6 seconds. A toggle in the info panel, off by default. **Recommended.**
- C. A map drawer showing the path. More UI, more state, breaks the calm.

### D8 Stops

- A. Keep as is: 25 to 30 percent of the time at 1.9 m/s breathing, plus feeding.
- B. Keep breaths and feeds, but breath at a glide (at least 60 percent of cruise), feeding at most once per 8 minutes and at most 25 s, only in regions that have prey. Underwater feeding sites stay. **Recommended.**
- C. Remove stops. Loses the spout and the underwater moments that make the whale feel alive.

### D9 Sense of speed

- A. Camera only: pull-back, field-of-view lift, lean.
- B. A plus whale wake and bow wave, instanced surface flecks, passing islets near the route, scrolling clouds, swell scaled with speed, passing flocks. **Recommended.**
- C. B plus speed lines and motion blur. Fill-rate cost on phones; fights the calm look.

### D10 Delivery order

- A. One change, all at once.
- B. Three milestones: M1 route and speed (D1, D2, D8), M2 regions and streaming (D3, D4, D5), M3 feel, atmosphere and indicator (D6, D7, D9). Each ships alone with screenshots and numbers. **Recommended.**

## Interaction with add-world-detail

- Phase 1 (swell, LOD, birds) is live. The flock leader orbits the whale; at 28 m/s birds (about 10 to 15 m/s) cannot follow. Birds become passing flocks that cross the view, and the species mix follows region. `swell.ts` is reused: swell time scales with speed.
- Phase 2 (ships): the ship wake in `wake.ts` is shared with the whale wake. Do phase 2 first or build `wake.ts` once here; do not build two.
- Phase 3 (terrain shape, domain warp): it changes the land mask for every seed. Region modulation applies after the warp. Land phase 3 before M2 so the coastlines change once.
- Phase 4 (scatter): scatter caps stay per tier. Region palettes feed the land material weights.
- Phase 5 (audit): the budgets here add to the table in `detail-performance`; run one audit after M3.
- Land tile budgets in `detail-performance` SHALL NOT grow; open ocean lowers the load.

## Risks / Trade-offs

- **Tile misses at speed**: 5 times the tile demand. Mitigation: lead scaled with speed, all-sea tiles empty, fade-in on arrival, throughput test in smoke.
- **Recentre cost**: every 1 km at 28 m/s is every 36 s, each rebakes shelves. Mitigation: larger radius and snap (task 4.2).
- **Land is the horizon today**: with open ocean the horizon is empty. Passing islets and clouds supply the depth cues; region tints keep it from being flat.
- **Opening must stay composed**: the start bay is scored for composition. Region modulation keeps a safe radius around the start.
- **Motion comfort**: field-of-view lift and pull-back are small, off under reduced motion.
- **Environment map refresh** is a hitch on weak GPUs: capped interval, none on `low`.
- **Saved seeds change**: accepted by the captain for the domain warp; same here.

## Migration Plan

Three milestones (D10 B), each behind the quality tier and independently revertible. No persisted data besides one indicator toggle.

## Resolved Decisions

Confirmed by the captain on 2026-10-25: option B on all ten (1B to 10B).

1. Speed: cruise 16 to 28 m/s.
2. Route: long steady heading, gentle flow-field drift, no turning back; the planner only gets around coasts.
3. World composition: a region field thins land to 5 to 8 percent.
4. Streaming: look-ahead, prefetch and recentre scale with speed.
5. Regions: temperate, tropical, polar, deep blue.
6. Day and weather: slow day cycle, clear, hazy and overcast.
7. Indicator: region name and distance, fading in on a region change.
8. Stops: breaths at a glide, feeding rare and brief.
9. Sense of speed: wake, bow wave, surface flecks, passing islets, moving clouds, faster swell, passing birds.
10. Delivery: three steps, M1 route and speed, M2 regions and streaming, M3 feel, light and indicator.

## Amended after review

The surface flecks of decision 9 were built and then removed: on the water they read as white streaks. Night gains stars, ships are redrawn as proper vessels, and the route plans over a wide coarse lattice and commits to a way out, so it keeps moving on almost every seed (a few U-turns out of gulfs remain, and `tools/seed-sweep.ts` reports them).
