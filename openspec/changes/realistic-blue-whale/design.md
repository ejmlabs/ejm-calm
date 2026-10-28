## Context

`whale-model.ts` builds a humpback in metres: `WHALE_LENGTH = 12`, flippers a third of the body, tubercles on their leading edges. Many other constants assume that size, including the 16 m camera framing, spout and splash sprite sizes, the 6 m minimum camera distance, `DIVE_DEPTH` of 14 to 26 m, and `DIVE_BELOW` of −3 m. `seafloor.ts` eases depths toward `ABYSS = 32`. `bathymetry.ts` already has a real profile, but nothing passes it a depth yet. The land is drawn only above about the waterline, and the seafloor is a separate mesh under the water. The camera already follows the whale under the surface after it has been below −3 m for 3.5 s, but dives are short and shallow.

## Goals / Non-Goals

**Goals:** a blue whale that reads as one at every distance, at its real size; long, deep dives the camera can follow; an ocean with real depths; and coasts that continue below the water. Each phase ships on its own and keeps the load-time and frame-cost bars.
**Non-Goals:** see the proposal's out-of-scope list.

## Decisions

- **One length constant.** Every size-dependent constant is derived from `WHALE_LENGTH` (25 m), so the whale's size lives in one place. This covers framing, sprite sizes, wake width, the clearance rails and the camera's minimum distance. Tests assert the derivations, not the numbers.
- **Anatomy as a new profile, not a rescale.** A humpback scaled to 25 m keeps its huge flippers and knobbly head. The blue whale gets its own cross-section profile, a flat U-shaped rostrum with a splashguard, a small falcate dorsal fin, short pointed flippers with no tubercles, and new fluke outlines. The current rig (bones, flex, turning) is kept and re-fitted to the new proportions.
- **Detail by tier.** Desktop high: about 2.3× the old high body rings (300 by 96, about 62,000 triangles), with a 2048² colour and normal atlas for the grooves, mottling and scars. Medium: the old high ring counts with a 1024² atlas. Low (phones): the old low mesh with a 512² atlas. The atlas is generated in the browser at start, as before (about 0.8 s at 2048² on a desktop), so nothing new is downloaded.
- **Dives and time.** Real feeding dives last 8 to 15 minutes. Here the whale descends and climbs at up to 2 m/s (easing off over the last 25 m), holds 120 to 240 s before the climb, and so a whole dive takes about four to six minutes at journey pace, reaching its real depth. A surfacing series is 2 to 6 blows, about 15 s apart, and three dives in ten lift the flukes clear. Krill swarms sit 80 to 200 m down and are bigger, the whale looks for them over 1.2 km and feeds on nothing else. The floor is read sparsely out to where the deepest dive could still climb clear (160 s), every 2 s, as well as closely over the next 30 s.
- **Camera under water.** The follow camera keeps its 3.5 s dwell below the dive line (a shorter one would flip it under for a breach's brief dip); with dives now minutes long the wait is a small part of them. Orbit and zoom keep working below the surface, the orbit kept within the underwater trailing distance and free to look up at the whale from below. The camera is held at least 2 m above the seafloor and 0.5 m below the surface while it is under, so it never crosses either. A "stay at surface" switch in the UI keeps the current behaviour for anyone who doesn't want to dive.
- **Light by depth.** Diffuse attenuation by colour for clear open ocean (about 0.3, 0.06 and 0.022 per metre for red, green and blue, so red is gone by about 15 m and blue reaches a couple of hundred metres). The eye adapts by up to 4× and the scene never falls below 8 % of the surface light, so the whale stays visible at 300 m; the adaptation eases over about 4 s. The water's colour darkens toward navy with the same curve.
- **Land below the water.** The land field already extends below zero height near the coast. Land tiles are built down to the seafloor depth where the two meet, and from there the seafloor (bathymetry) takes over with a smooth blend across a 200 m band, so there is no gap or step. Underwater land tiles stream like the land above, with the same LOD rings, and are only drawn when the camera is under the water or looking through it.
- Rejected: scaling the humpback (wrong anatomy); pitch-black depths (realistic, but nothing would be visible); real dive durations (a calm viewer would spend most of the time in the dark).

## Risks / Trade-offs

- [Frame cost of a detailed whale and underwater land on phones] → tiered detail; underwater tiles drawn only when needed; measured on each phase.
- [Load time from new textures] → generated at build time at modest sizes; the load-time bar gates each phase.
- [Tests and the seed sweep assume a 12 m whale and a shallow floor] → each phase updates them and states every changed number.
- [Motion sickness following long dives] → eased camera, the stay-at-surface switch, and reduced motion keeps the camera at the surface.

## Migration Plan

Phases land in order, each as its own PR: the whale body, then dives and the underwater camera, then real depth, then land below the water. Reverting a phase restores the previous behaviour for that phase only.

- **Real depth (phase 3, landed with phase 2).** The journey's seas are full of islands, islets and rocks a few kilometres apart, which no planet-scale distance captures, so the depth comes from a coarse distance field on the land itself: the land mask sampled every 250 m in 16 km tiles padded by 14 km (about 55 ms a tile), built ahead of the whale a couple of milliseconds a frame. Island flanks reach the abyssal plain within that padding, so the depth is continuous where the field saturates. The steep coasts get an active continental margin (12 km to 140 m, then 5°). Along the journey the sea is 100 to 1,600 m deep, with no cliffs at shores; it rarely reaches the 3,500 m plain because land is seldom more than a few kilometres away. Phase 3 was done first, in the same PR as phase 2, because dives of 100 to 200 m need water that deep.

## Open Questions

- Should the camera follow every dive automatically, or only when the viewer chooses? This plan follows automatically, with a switch to opt out.
- How dark should 200 to 300 m be? This plan keeps it dim but visible.
