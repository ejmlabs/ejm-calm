## Why

The whale is the centre of every view, and the owner's verdict on the live site is that it needs polish: its body and motion, and above all its rhythm. Today a "surfacing" is a few seconds and a "dive" is a five-second dip: on main 2e896b2 the whale cruises with its back awash, breathes every 70 to 120 s in a burst of about 15 s, and its fluke-up dive hands back to the surface cruise within seconds. There are no real stretches above the water and no real stretches under it.

## What Changes

- **Surface and dive cycle**: the whale lives in two long, alternating stretches. A surfacing is a string of 2 to 5 blows over tens of seconds: each a rise, a spout and a roll back under (head first, back humped, fin last) to a glide just below the surface, then the next rise. It ends in a fluke-up dive. The dive that follows lasts 2 to 6 minutes, seeded per dive: a slow, eased descent at a capped vertical speed, a long run at depth, then a gradual climb. Over water too shallow to dive the whale stays up and keeps breathing.
- **Camera**: waits 3.5 s (was 0.35 s) under the dive line before following the whale down, so the run-up to a breach, its re-entry or any short dip never flips it under; the glide between blows stays well above the line.
- **Continuity**: segments carry their leftover time into the next one, and a change of pose source eases out only its mismatch, so no frame holds still and no transition snaps.
- **Body**: three new flex bones (fluke blades and the outer half of each flipper) give the flukes follow-through on every stroke and let the flippers bend; the spine curves into turns and the flippers steer; a wet clear coat and a soft sheen on the skin (standard material kept on phones); knuckles on the tail stock; three's `mergeGeometries` replaces the hand-written merge.
- **Blow**: a denser plume that leaves the whale once it is out and hangs where it was breathed while the whale glides on.
- **Review**: a debug-only `forceWhale(phase, at)` for screenshots of any phase.

Out of scope (separate lanes): the seafloor, underwater light, marine snow and deeper dive depths; land; the sea surface and weather.

## Capabilities

### New Capabilities

- `whale-surfacing`: the surface and dive cycle, its timing and the camera's handling of it.
- `whale-body`: the whale's skeleton, flex, turning motion, skin and blow.

### Modified Capabilities

None (no archived capabilities in the repository).

## Impact

- Code: `src/whale-motion.ts` (new `roll` phase, rise, fluke-up dive, deep pose ends at the glide depth), `src/whale-behavior.ts` (cycle, depth rail, shallow-water rule, segment hand-over), `src/whale-model.ts` (flex bones, `mergeGeometries`), `src/whale.ts` (turn bend, follow-through, material, blow), `src/whale-skin.ts` (knuckles), `src/camera.ts` (`DIVE_DWELL`), `src/main.ts` (debug `forceWhale`).
- Tests: new `tests/whale-cycle.test.ts`; `tests/whale-behavior.test.ts` bounds updated for the longer cycle (see design).
- No new runtime dependency, no new origin, CSP unchanged.
