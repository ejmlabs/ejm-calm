## Why

The whale is a 12 m humpback that dives to 26 m in an ocean whose floor is eased toward 32 m, and the land stops at the waterline. A hyper-realistic blue whale and environment was asked for: a highly detailed blue whale at its real size, a camera that can follow it under the water, an ocean as deep as the real one, and land that carries on down into it the way real coasts do.

## What Changes

- **Blue whale body.** Replace the humpback with a blue whale about 25 m long (adults are 24 to 27 m, rarely 30 m). It has a slender, tapered body; a broad, flat, U-shaped head with a raised splashguard in front of the blowholes; a small dorsal fin about three quarters of the way back; flippers about an eighth of the body length; 55 to 90 throat grooves reaching the navel; broad triangular flukes with a nearly straight trailing edge; and mottled blue-grey skin with pale spots and a faint yellowish belly. High detail on desktop: more body rings, plus normal and detail maps for the grooves, mottling and scars. The phone tiers keep their own budgets.
- **Effects at blue whale scale.** A tall, slender blow (up to about 9 m). The splashes, wake, wash and breach scale with the body. A blue whale rarely breaches, so breaching becomes rare. The camera framing and every body-length constant follow the new length.
- **Deep dives.** Blue whale behaviour: a surfacing series of 2 to 6 blows, then feeding dives typically 100 to 200 m deep, occasionally deeper (up to about 300 m here), with the flukes sometimes lifting on the way down.
- **Following under the water.** The camera follows the whale down through a whole dive, with orbit and zoom working underwater. It never passes through the seafloor or the surface, and it returns with the whale. A control keeps the camera at the surface for viewers who prefer that.
- **Light by depth.** Sunlight fades with depth, as through the photic zone (bright near the surface, dim blue by 100 to 200 m), with gentle exposure adaptation so a deep dive reads as deep without becoming a black screen.
- **Real ocean depth.** Finish `add-deep-ocean` task 1.3: wire the planet's coast distance into both seafloors, so the ocean has its shelf to about 140 m, its slope and abyssal plains at 3,000 to 4,000 m. The steep coasts here get active margins (a 10 to 20 km shelf and a slope of about 5°), and the distance to islets and rocks is measured on the land, so every island stands on its own flank.
- **Land into the sea.** The land mesh carries on below the waterline down the shelf and slope, and joins the seafloor without a seam. A coast seen from below the water shows its underwater flanks.

## Capabilities

### New Capabilities
- `blue-whale-body`: blue whale anatomy, size, skin and detail tiers.
- `deep-dives`: blue whale surfacing series and deep feeding dives.
- `underwater-follow`: the camera following the whale under water, and light by depth.
- `continental-margin`: land continuing below the waterline onto the shelf, slope and abyssal plain.

### Modified Capabilities
- `deep-ocean` (from `add-deep-ocean`): the depth is wired in, no longer optional.

## Out of scope

Other whale species and more than one whale; fluid simulation; reworking the ocean surface; real time scales for the migration (the journey keeps its compressed pace).

## Impact

`src/whale-model.ts`, `src/whale-skin.ts`, `src/whale.ts`, `src/whale-behavior.ts`, `src/whale-motion.ts`, `src/camera.ts`, `src/underwater*.ts`, `src/seafloor.ts`, `src/bathymetry.ts`, `src/land.ts`, `src/landmesh.ts`, `src/world-tiles.ts`, and their tests and review tools. No new dependency. Load time and frame cost are measured before and after each phase with `tools/load-time.ts` and `tools/frame-cost.ts`.
