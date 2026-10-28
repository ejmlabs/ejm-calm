## 1. Blue whale body (B1)

- [x] 1.1 Derive every size-dependent constant (framing, sprites, wake, rails, minimum camera distance) from `WHALE_LENGTH`; tests assert the derivations
- [x] 1.2 Blue whale cross-section profile, U-shaped rostrum with splashguard, small dorsal fin about three quarters back, short pointed flippers (no tubercles), broad triangular flukes; `WHALE_LENGTH` 25 m; re-fit the rig, skin weights and flex bones
- [x] 1.3 Skin: mottled blue-grey with pale spots and a faint yellowish belly; 55 to 90 throat grooves to the navel; runtime-generated colour and normal atlas; tiered detail (high, medium, low)
- [x] 1.4 Blow up to about 9 m, tall and slender; splashes, wash and wake at the new scale; breaching rare
- [x] 1.5 Update shots, smoke and frame-cost; record load time and frame cost before and after
  - Load time, five cold loads each (9 Mbps, 170 ms; phone CPU 4× slower), main → this phase: desktop first paint 600 → 600 ms, first sea frame 1642 → 1480 ms; phone first paint 628 → 632 ms, first sea frame 2939 → 2843 ms; transfer 257.5 → 257.7 KB. A first try that generated the 2048² skin before the first frame cost +625 ms on desktop; a 512² skin now goes on first and the full one is generated in idle time and swapped in (about 0.9 to 1 s of work on a desktop, after the sea is up).
  - Frame cost: the high-tier whale is about 62,000 triangles (was about 14,000) in the same single draw; the smoke test's peak draws are unchanged (88 desktop, 64 phone).

## 2. Deep dives and the underwater camera (B2)

- [x] 2.1 Surfacing series of 2 to 6 blows; feeding dives of 100 to 200 m, occasionally to about 300 m, a whole dive taking four to six minutes; flukes lift on about three dives in ten
- [x] 2.2 Camera follows through the whole dive; orbit and zoom under water; held clear of the seafloor and the surface; returns with the whale
- [x] 2.3 "Stay at surface" switch, saved; reduced motion keeps the camera at the surface
- [x] 2.4 Light by depth: attenuation by colour, sky light falling with depth, a visibility floor, eased exposure
- [x] 2.5 Browser checks for a full dive (camera never crosses the floor or surface, no errors); load time and frame cost
  - In the browser pane the camera followed a dive to about 65 m: dim navy water, the whale still visible, no console errors. Near the start the islands keep dives to 60 to 80 m; the unit tests cover 100 to 300 m over deep water, and a 200 m camera dive that stays 2 m clear of the seabed.
  - Load time, five cold loads each, main → this phase: desktop first paint 576 → 572 ms, first sea frame 1437 → 1602 ms (+165, the first depth tile built at start); phone first paint 620 → 612 ms, first sea frame 2835 → 2939 ms (+105). Smoke test: peak draws 86 desktop and 64 phone, stream step p99 2.6 ms.

## 3. Real ocean depth (B3)

- [x] 3.1 Wire real ocean depth into both seafloors (`add-deep-ocean` 1.3): a depth field of the true distance to the nearest land (islets and rocks included) for the island flanks, the planet's continental distance for an active-margin shelf (12 km to 140 m, then 5°), plains at 3,000 to 4,000 m; no cliffs at shores
- [x] 3.2 The whale's floor clamp and the dive planner read the deep floor; update tests and the seed sweep, stating changed numbers
  - Tests updated (the behaviour fixtures' floor is now 190 to 310 m deep; the dive, surfacing and feeding bounds follow the new depths). The hour-long seed sweep (`tools/seed-sweep.ts 1 50 60`) has not been re-run.

## 4. Land into the sea (B4)

- [x] 4.1 Land tiles built below the waterline down to where they meet the seafloor, blended across a 200 m band with no gap or step
  - As built: the seafloor patch carries the land on below the waterline from the same height field (no seam), now sized past the underwater visibility (about 175 m across on every tier), and tile skirts stop 2.5 m under the sea instead of hanging tens of metres into it.
- [x] 4.2 Underwater land tiles stream with the land's LOD rings and are drawn only when the camera is under water or looking through it
  - The seafloor patch streams around the camera on the same per-frame budget as before and is drawn only under water; the opaque ocean hides everything below it from above, so nothing extra draws there.
- [x] 4.3 Shots of a coast from below the water at the shelf, the slope and the plain; load time and frame cost
  - Browser pane, under water at the start: the seabed rises smoothly into a bank with kelp and caustics, no gaps or walls. Load time main → this phase: desktop first paint 572 → 584 ms, first sea frame 1551 → 1536 ms; phone first paint 628 → 608 ms, first sea frame 3049 → 2989 ms. Smoke: stream step p99 2.6 ms.
