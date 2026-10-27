## Why

The ocean is 32 m deep at most: every depth past 16 m is eased toward a shallow constant so the floor stays in sight. A far deeper ocean was asked for, with a seafloor that feels real. Real oceans have a shelf to about 140 m, a slope of a few degrees, and abyssal plains at 3000 to 6000 m.

## What Changes

- A bathymetry profile by distance from the coast: a shelf to about 140 m, a slope of 3 to 4 degrees, and an abyssal plain at about 3500 m that the slope eases onto. Island and islet flanks keep a narrow shelf and drop steeply.
- The seafloor takes an optional bathymetric depth and follows it wherever it is deeper than the land's own eased floor, with low abyssal hills on the plain. The underwater view passes the same depth to its copy of the seafloor.
- Until the planet layout provides a distance to the continental coast, no depth is passed and the seafloor is unchanged; wiring it is a line in each of the two places that build a seafloor.

Light by depth, particles, shallow-water light and deep dives follow as separate changes.

## Capabilities

### New Capabilities
- `deep-ocean`: bathymetry by distance from the coast.

### Modified Capabilities
None.

## Impact

New `src/bathymetry.ts`; `src/seafloor.ts`, `src/underwater.ts`; new `tests/bathymetry.test.ts`. No new dependency. Depends on the planet layout's coast distance for wiring.
