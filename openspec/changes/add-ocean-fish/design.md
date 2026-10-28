## Context

`underwater-life.ts` draws up to 6 schools of 56 identical fish around the camera, with the swim in the vertex shader; `underwater-swarm.ts` draws krill and bait-ball points at feed sites. This change adds the species and meshes the later schooling work builds on, without changing what visitors see.

## Goals / Non-Goals

**Goals:** a species table that later items distribute by depth and region; cheap instanced meshes for each species at three levels of detail; a convincing swim that costs nothing on the CPU.
**Non-Goals:** distribution, schooling and counts (later items in this lane); per-fish physics; skinned fish.

## Decisions

- **Vertex-shader swim on instanced meshes.** Each species and level is one `InstancedMesh` built at unit length (nose toward +x) and scaled by the instance matrix. The swim follows ABZU's instanced fish (Matt Nava, "Art Design Deep Dive: Using a 3D Pipeline for 2D Animation in ABZU", GDC 2017): a side-to-side shift, a yaw about a pivot near the head, and a spine wave travelling to the tail with an amplitude that grows toward it (the carangiform envelope). Per-instance phase and rate (`aSwim`) keep a school from beating in step. Rejected: skinned fish (a skeleton per fish is far too costly at these counts) and CPU-animated meshes.
- **Rates from biology.** Tail-beat rates follow Bainbridge (1958), speed ≈ 0.75 × length × beat frequency, at a cruise of one to two body lengths a second; the tail's amplitude is about a fifth of the length (Videler, *Fish Swimming*, 1993). Depth ranges and habitats follow FishBase.
- **Three shapes.** Fish are a lathe with a forked tail and a dorsal fin; rays a domed diamond disc whose wing tips rise and fall in a wave from front to back; jellyfish a bell that squeezes quickly and relaxes slowly over drifting tentacles. Levels drop rings and sides: 87, 35 and 14 triangles for a fish, all under 150.
- **One clock.** The swim reads only the shared `uTime`, which stops under reduced motion, so every fish holds still.
- **Light.** The materials reuse the life meshes' depth absorption, so fish dim and turn blue with depth like the floor life; a species' own glow is added after it, so lanternfish still glow in the dark.
- **Showcase behind a flag.** `?debug=1&fish=1` holds a small school of every species broadside 14 m ahead of the camera, for review. The shaders compile only when that flag is set, so load time does not change.

## Risks / Trade-offs

- [Phone vertex and fill cost at large counts] → three levels now; per-school culling and tier counts when schools are streamed.
- [Shader compile hitch when fish ship to visitors] → compile after the first frame with `compileAsync` in the distribution item.

## Migration Plan

This item adds species and meshes behind a review flag. The next item streams schools and removes the old fish from `underwater-life.ts`; then schooling, then counts.
