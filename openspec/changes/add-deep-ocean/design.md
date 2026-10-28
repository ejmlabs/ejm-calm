## Context

`seafloor.ts` eases every depth toward `ABYSS = 32` so the floor stays in sight. The land field's own depth is only meaningful near the coast: its signed mask saturates about 600 m out, so it cannot say how far open water is from land. The planet layout in progress adds a distance to the nearest continental coast; this change prepares the profile that consumes it.

## Goals / Non-Goals

**Goals:** a real depth scale (shelf, slope, abyssal plain) as a pure, tested function of coast distance; a seafloor that follows it without seams against the land's near-shore floor.
**Non-Goals:** computing coast distance here (the planet layout owns it); light, fog or dive changes; a visible abyssal floor from the surface.

## Decisions

- **Profile.** Depth rises linearly over the shelf (0 to 140 m across 40 km for continents; the real average is 65 to 80 km, compressed to the journey's pace), then follows a 3.5 degree slope, joined to a 3500 m plain by a smooth minimum (150 m knee) that stands in for the continental rise. Sources: Britannica and NOAA Ocean Explorer for the shelf break (120 to 140 m), slope (3 to 4 degrees) and plains (3000 to 6000 m).
- **Islands.** The same profile with a 1.5 km, 60 m shelf and a 15 degree flank, evaluated on the distance to the nearest land of any kind. `seabedDepth` takes the shallower of the continental and island profiles, so every coast starts at zero depth and the floor is continuous.
- **Join with the land's floor.** The seafloor is the deeper of the land's eased floor and the bathymetric depth. Near the coast the land's floor (beaches, cliffs, shelf relief) wins; offshore the bathymetry does. Without a depth the result is bit-identical to the previous floor (checked on 200 000 samples over four seeds).
- **Abyssal hills.** ±300 m of low-frequency fBm (5 km wavelength), fading in from 2000 m to full at 3000 m, so the plain stays within 3000 to 4000 m.
- Rejected: keep the easing and raise `ABYSS` (no shelf break, no slope); derive coast distance from a new lattice here (duplicates the planet layout).

## Risks / Trade-offs

- [Tests and the seed sweep assume a shallow floor] → nothing changes until the depth is wired; that wiring updates them and states each changed number.
- [The whale's floor clamp and the camera read the same seafloor] → they keep reading one function, so they stay consistent.

## Migration Plan

Wire `seabedDepth(planet.openAt(x, z), coastDistance)` into the two `createSeafloor` calls once the planet layout lands. Reverting this change alone restores the previous floor.
