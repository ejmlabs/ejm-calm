## 1. Surface and dive cycle

- [x] 1.1 `whale-motion.ts`: `roll` phase; rise from the glide depth (`SHALLOW_Y`); spout lifts the head; 10 s fluke-up dive that hands a sink rate on; `deep` ends at the glide depth; `PHASE_ORDER` covers rolls, the fluke-up dive and a breach
- [x] 1.2 `whale-behavior.ts`: `travel` is the long dive (100 to 300 s, seeded per dive) on a depth rail capped at `VERTICAL_SPEED`; `breathe` is the climb and 2 to 5 blows; breach now and then before one more blow and the dive; shallow water keeps the whale up
- [x] 1.3 Segment hand-over carries leftover time and eases only the mismatch between sources
- [x] 1.4 Surfacing glide at 0.75 of cruise; the climb keeps the travel pace
- [x] 1.5 Camera `DIVE_DWELL` 2.5 s

## 2. Body and motion

- [x] 2.1 Flex bones for the fluke blades and flipper tips; skin weights; three's `mergeGeometries`
- [x] 2.2 Spine bend and flipper steering into turns from the damped turn rate; fluke and flipper follow-through
- [x] 2.3 Physical skin with clear coat and sheen on medium and high; knuckles on the tail stock
- [x] 2.4 Blow hangs where it was breathed; denser plume
- [x] 2.5 Debug `forceWhale(phase, at)` for review

## 3. Tests

- [x] 3.1 `tests/whale-cycle.test.ts`: surfacing and dive lengths, glide depth, vertical speed cap and acceleration, shallow water
- [x] 3.2 `tests/whale-model.test.ts`: the roll keeps the flukes under
- [x] 3.3 `tests/whale-behavior.test.ts`: bounds updated for the longer cycle (design, "Test changes")

## 4. Measure

- [x] 4.1 Load time before and after (Chrome through Playwright, network throttled by the DevTools protocol, cold cache, median of 5, main and branch back to back on the same machine): first contentful paint 396 → 372 ms at 10 Mbps / 40 ms, 572 → 472 ms at 9 Mbps / 170 ms; scene ready 6.0 → 4.7 s and 6.3 → 4.8 s (software GL; noise on a shared machine is larger than the difference). JavaScript 790 → 799 KB (the physical material's shader chunks)
- [x] 4.2 Mover CPU per 60 Hz step in Node: 0.022 ms on main, 0.029 ms after (noise on a shared machine is about the size of the difference)
- [ ] 4.3 GPU frame cost on a real phone (not measured: software GL only here)
