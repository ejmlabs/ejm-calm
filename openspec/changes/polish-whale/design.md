## Context

Main 2e896b2: `whale-behavior.ts` cruised with the back awash, with a noise dive to 7.5 m now and then; a breath every 70 to 120 s was surface, spout, one or two more blows and a 5 s dive, then straight back to the surface cruise. The model is a skinned mesh built in code (body tube, flippers, flukes, ten bones) with a generated skin atlas.

## Decisions

### Two stretches, not a cruise with breaks
`travel` is now the long dive at depth; `breathe` is the climb and the surfacing. The opening is a surfacing under way, as before. The surfacing is queued as posed segments (`surface`, `spout`, `roll`, ..., `dive`), each ending exactly where the next begins (`PHASE_ORDER` checks every join). The dive itself is free swimming: depth follows a rail that walks to the seeded dive depth at no more than `VERTICAL_SPEED`, and a critically damped spring follows the rail, which eases every start and stop. The rail never rises above the glide depth just under the surface.

### Floor
The floor is read every 0.5 s along a fan of arcs out to 30 s ahead (turn rates up to the pilot's 0.2 rad/s, held to 0.7 rad off the course), so a turn into a rise is seen too. Each reading sets the lowest the rail may run: 5 m over that floor (clear of the floor limit's soft band), less what the capped climb gains by the time the whale gets there, allowing twice the spring's lag (it starts from rest, and the whale may speed up). A rising floor is therefore met at the capped climb, never by a jump. The scan runs with each decision (every 0.5 s of sim time). The floor the body's floor limit uses is the seafloor under the whale and a second ahead, eased by a spring (1.5/s), so a narrow knoll or reef edge that slips past the scan nudges the body instead of jolting it.

An earlier version lifted the rail straight to the floor 8 s ahead with no cap: over coasts the whale climbed out of the water (to 18 m on seed 3) at 10 to 30 times the vertical cap.

### Room to dive
A fluke-up dive starts only when the floor stays at least 10 m down (so the rail's 5 m over it stays below the shallowest dive depth, 5 m) along the same fan for 45 s at travel pace; otherwise the whale takes another blow and looks again. In a dive, once a floor has brought the whale up to the shallowest dive depth, the dive ends and the climb becomes a surfacing, so a shoal never leaves the whale skimming without breathing. Before, a shoal passing under during or just after the fluke-up started a new surfacing at once (dives of 5 to 15 s).

Dive depth stays 14 to 26 m here: the seafloor and deeper dives belong to the deep-ocean lane. The rail and speed cap are what that lane will reuse.

### Timing
Surfacing: 2 to 5 blows, rise 3.5 to 5 s, spout 4.5 s, roll 5 to 9 s, fluke-up dive 10 s: about 30 to 90 s up. Dive: `DIVE_MIN` 100 to `DIVE_MAX` 300 s from the end of the fluke-up dive to the start of the climb, plus the climb: 2 to 6 minutes under. Measured with a headless run of the real mover over 30 minutes on real coasts (seeds 1 to 7 and 42): 42 dives, 32 of them over 60 s (up to 249 s); the ten that a shoal ended early lasted 8 to 56 s. Along a shallow coast the whale stays up and keeps blowing until it has room, so a coastal surfacing can run several minutes (the longest, 661 s on seed 1). The whale never rose above the glide depth while swimming free, its vertical speed stayed at or under 1.2 m/s with the floor limit applied, and vertical acceleration stayed under 4.3 m/s².

### Pace
The surfacing glide is 0.75 of the cruise speed (was 0.6; still above the 60 percent floor of `add-ocean-migration`). The climb keeps the travel pace and the glide starts near the top. Blows added because there is no room to dive keep the full travel pace: held up along a shallow coast, the whale travels at the surface rather than idling (the start seas are often shallow; at 0.75 there, seed 99 made only 7.6 km in its first ten minutes). With 0.6 the one-hour journey test dropped to 7.1 km net in the first ten minutes on seed 7 (floor 8 km); with 0.75 every journey test passes unchanged.

### Hand-over
Segments carry their leftover time into the next, and on a change of pose source the offset takes only the mismatch between where the old source leaves off and the new one picks up (zero for every `PHASE_ORDER` join). Before, the offset pinned the pose to the previous frame, which held the whale still for a frame at every join (30 m/s² spikes).

### Camera
`DIVE_DWELL` 0.35 → 3.5 s: a breach re-entry dips under the dive line for about a second, and the fluke-up dive into a breach plus its run-up spend 2.5 s under it; both used to flip the camera under and back.

### Body
Three bones (13 in all): `FlukeFlex` behind the peduncle, weighted by chord distance so the trailing edge and swept tips follow through; `FlipperTipL/R` at 45 percent span, blended from 30 to 75 percent. The spine bends about the body's vertical by the damped turn rate (`motion.turn`). Material: `MeshPhysicalMaterial` with clear coat 0.35 and sheen 0.35 on medium and high. `mergeGeometries` from three's `BufferGeometryUtils` replaces the hand-written merge. A glTF asset was considered and not used: no licensed humpback that matches the seeded skin and LOD set, and the code-built mesh already carries the skeleton the motion drives.

## Test changes (honest)

- `whale-behavior`: the gap between surfacings was bounded at 190 s; it is now `DIVE_MAX + 220` s because a dive alone may last up to 5 minutes. The count of surfacings in 15 minutes is now at least 2 (was 4 breaths). The transition edges checked now include `spout>roll` and `roll>surface` in place of `spout>surface`.
- New `whale-cycle` tests pin surfacing and dive lengths, the glide depth, the vertical speed cap and vertical acceleration, over open water and over the real coasts of seeds 3, 7 and 42.

## Measurements

See `tasks.md` section 4 for load time and frame cost. In the full suite on a heavily loaded machine the world streaming p95 test can exceed its bound; it passes alone on this branch and on main alike.
