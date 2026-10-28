## Context

`whale-model.ts` builds a humpback in metres: `WHALE_LENGTH = 12`, flippers a third of the body, tubercles on their leading edges. Many other constants assume that size, including the 16 m camera framing, spout and splash sprite sizes, the 6 m minimum camera distance, `DIVE_DEPTH` of 14 to 26 m, and `DIVE_BELOW` of −3 m. `seafloor.ts` eases depths toward `ABYSS = 32`. `bathymetry.ts` already has a real profile, but nothing passes it a depth yet. The land is drawn only above about the waterline, and the seafloor is a separate mesh under the water. The camera already follows the whale under the surface after it has been below −3 m for 3.5 s, but dives are short and shallow.

## Goals / Non-Goals

**Goals:** a blue whale that reads as one at every distance, at its real size; long, deep dives the camera can follow; an ocean with real depths; and coasts that continue below the water. Each phase ships on its own and keeps the load-time and frame-cost bars.
**Non-Goals:** see the proposal's out-of-scope list.

## Decisions

- **One length constant.** Every size-dependent constant is derived from `WHALE_LENGTH` (25 m), so the whale's size lives in one place. This covers framing, sprite sizes, wake width, the clearance rails and the camera's minimum distance. Tests assert the derivations, not the numbers.
- **Anatomy as a new profile, not a rescale.** A humpback scaled to 25 m keeps its huge flippers and knobbly head. The blue whale gets its own cross-section profile, a flat U-shaped rostrum with a splashguard, a small falcate dorsal fin, short pointed flippers with no tubercles, and new fluke outlines. The current rig (bones, flex, turning) is kept and re-fitted to the new proportions.
- **Detail by tier.** Desktop high: about 2.3× the old high body rings (300 by 96, about 62,000 triangles), with a 2048² colour and normal atlas for the grooves, mottling and scars. Medium: the old high ring counts with a 1024² atlas. Low (phones): the old low mesh with a 512² atlas. The atlas is generated in the browser at start, as before (about 0.8 s at 2048² on a desktop), so nothing new is downloaded.
- **Dives and time.** Real feeding dives last 5 to 15 minutes. Here a dive is 60 to 150 s at journey pace, the same compression the migration already uses, and it reaches its real depth. A surfacing series is 2 to 6 blows, about 15 s apart.
- **Camera under water.** The follow camera's dwell drops from 3.5 s to 1.5 s when a dive starts. Orbit and zoom keep working below the surface. The camera is held at least 2 m above the seafloor and 0.5 m below the surface while it is under, so it never crosses either. A "stay at surface" switch in the UI keeps the current behaviour for anyone who doesn't want to dive.
- **Light by depth.** Exponential attenuation of light through the water by colour (red gone by about 15 m, blue persisting), and sky light scaled by e^(−depth/60 m), floored so the whale and particles stay visible at 300 m. Exposure eases over about 4 s, as eyes adjust.
- **Land below the water.** The land field already extends below zero height near the coast. Land tiles are built down to the seafloor depth where the two meet, and from there the seafloor (bathymetry) takes over with a smooth blend across a 200 m band, so there is no gap or step. Underwater land tiles stream like the land above, with the same LOD rings, and are only drawn when the camera is under the water or looking through it.
- Rejected: scaling the humpback (wrong anatomy); pitch-black depths (realistic, but nothing would be visible); real dive durations (a calm viewer would spend most of the time in the dark).

## Risks / Trade-offs

- [Frame cost of a detailed whale and underwater land on phones] → tiered detail; underwater tiles drawn only when needed; measured on each phase.
- [Load time from new textures] → generated at build time at modest sizes; the load-time bar gates each phase.
- [Tests and the seed sweep assume a 12 m whale and a shallow floor] → each phase updates them and states every changed number.
- [Motion sickness following long dives] → eased camera, the stay-at-surface switch, and reduced motion keeps the camera at the surface.

## Migration Plan

Phases land in order, each as its own PR: the whale body, then dives and the underwater camera, then real depth, then land below the water. Reverting a phase restores the previous behaviour for that phase only.

## Open Questions

- Should the camera follow every dive automatically, or only when the viewer chooses? This plan follows automatically, with a switch to opt out.
- How dark should 200 to 300 m be? This plan keeps it dim but visible.
