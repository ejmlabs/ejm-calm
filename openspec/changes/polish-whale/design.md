## Context

Main 2e896b2: `whale-behavior.ts` cruised with the back awash, with a noise dive to 7.5 m now and then; a breath every 70 to 120 s was surface, spout, one or two more blows and a 5 s dive, then straight back to the surface cruise. The model is a skinned mesh built in code (body tube, flippers, flukes, ten bones) with a generated skin atlas.

## Decisions

### Two stretches, not a cruise with breaks
`travel` is now the long dive at depth; `breathe` is the climb and the surfacing. The opening is a surfacing under way, as before. The surfacing is queued as posed segments (`surface`, `spout`, `roll`, ..., `dive`), each ending exactly where the next begins (`PHASE_ORDER` checks every join). The dive itself is free swimming: depth follows a rail that walks to the seeded dive depth at no more than `VERTICAL_SPEED`, and a critically damped spring follows the rail, which eases every start and stop. A rising floor lifts the rail at once (the floor is read 8 s ahead).

Dive depth stays 14 to 26 m here: the seafloor and deeper dives belong to the deep-ocean lane. The rail and speed cap are what that lane will reuse.

### Timing
Surfacing: 2 to 5 blows, rise 3.5 to 5 s, spout 4.5 s, roll 5 to 9 s, fluke-up dive 10 s: about 30 to 90 s up. Dive: `DIVE_MIN` 100 to `DIVE_MAX` 300 s from the end of the fluke-up dive to the start of the climb, plus the climb: 2 to 6 minutes under. Measured with a headless run of the real mover over 40 minutes on real coasts (six seeds): surfacings 25 to 145 s with 2 to 9 blows (shoals add blows); dives up to about 5 minutes over deep water and shorter over shoals, where the floor pushes the whale up.

### Pace
The surfacing glide is 0.75 of the cruise speed (was 0.6; still above the 60 percent floor of `add-ocean-migration`). The climb keeps the travel pace and the glide starts near the top. With 0.6 the one-hour journey test dropped to 7.1 km net in the first ten minutes on seed 7 (floor 8 km); with 0.75 every journey test passes unchanged.

### Hand-over
Segments carry their leftover time into the next, and on a change of pose source the offset takes only the mismatch between where the old source leaves off and the new one picks up (zero for every `PHASE_ORDER` join). Before, the offset pinned the pose to the previous frame, which held the whale still for a frame at every join (30 m/s² spikes).

### Camera
`DIVE_DWELL` 0.35 → 2.5 s: a breach re-entry dips under the dive line for about a second and used to flip the camera under and back.

### Body
Three bones (13 in all): `FlukeFlex` behind the peduncle, weighted by chord distance so the trailing edge and swept tips follow through; `FlipperTipL/R` at 45 percent span, blended from 30 to 75 percent. The spine bends about the body's vertical by the damped turn rate (`motion.turn`). Material: `MeshPhysicalMaterial` with clear coat 0.35 and sheen 0.35 on medium and high. `mergeGeometries` from three's `BufferGeometryUtils` replaces the hand-written merge. A glTF asset was considered and not used: no licensed humpback that matches the seeded skin and LOD set, and the code-built mesh already carries the skeleton the motion drives.

## Test changes (honest)

- `whale-behavior`: the gap between surfacings was bounded at 190 s; it is now `DIVE_MAX + 220` s because a dive alone may last up to 5 minutes. The count of surfacings in 15 minutes is now at least 2 (was 4 breaths). The transition edges checked now include `spout>roll` and `roll>surface` in place of `spout>surface`.
- New `whale-cycle` tests pin surfacing and dive lengths, the glide depth, the vertical speed cap and vertical acceleration.

## Measurements

See `tasks.md` section 4 for load time and frame cost. In the full suite on a heavily loaded machine the world streaming p95 test can exceed its bound; it passes alone on this branch and on main alike.
