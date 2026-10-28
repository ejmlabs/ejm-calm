## 1. Blue whale body (B1)

- [ ] 1.1 Derive every size-dependent constant (framing, sprites, wake, rails, minimum camera distance) from `WHALE_LENGTH`; tests assert the derivations
- [ ] 1.2 Blue whale cross-section profile, U-shaped rostrum with splashguard, small dorsal fin about three quarters back, short pointed flippers (no tubercles), broad triangular flukes; `WHALE_LENGTH` 25 m; re-fit the rig, skin weights and flex bones
- [ ] 1.3 Skin: mottled blue-grey with pale spots and a faint yellowish belly; 55 to 90 throat grooves to the navel; build-time normal and detail maps; tiered detail (high, medium, low)
- [ ] 1.4 Blow up to about 9 m, tall and slender; splashes, wash and wake at the new scale; breaching rare
- [ ] 1.5 Update shots, smoke and frame-cost; record load time and frame cost before and after

## 2. Deep dives and the underwater camera (B2)

- [ ] 2.1 Surfacing series of 2 to 6 blows; feeding dives of 100 to 200 m, occasionally to about 300 m, lasting 60 to 150 s; flukes sometimes lift on the way down
- [ ] 2.2 Camera follows through the whole dive; orbit and zoom under water; held clear of the seafloor and the surface; returns with the whale
- [ ] 2.3 "Stay at surface" switch, saved; reduced motion keeps the camera at the surface
- [ ] 2.4 Light by depth: attenuation by colour, sky light falling with depth, a visibility floor, eased exposure
- [ ] 2.5 Browser checks for a full dive (camera never crosses the floor or surface, no errors); load time and frame cost

## 3. Real ocean depth (B3)

- [ ] 3.1 Wire the planet's coast distance into both seafloors (`add-deep-ocean` 1.3); shelf to about 140 m, 3 to 4° slope, plains at 3,000 to 4,000 m
- [ ] 3.2 The whale's floor clamp and the dive planner read the deep floor; update tests and the seed sweep, stating changed numbers

## 4. Land into the sea (B4)

- [ ] 4.1 Land tiles built below the waterline down to where they meet the seafloor, blended across a 200 m band with no gap or step
- [ ] 4.2 Underwater land tiles stream with the land's LOD rings and are drawn only when the camera is under water or looking through it
- [ ] 4.3 Shots of a coast from below the water at the shelf, the slope and the plain; load time and frame cost
