## ADDED Requirements

### Requirement: Land below the water
The land SHALL continue below the waterline down to where it meets the seafloor, and SHALL join the seafloor's shelf, slope and abyssal plain without a gap or step.

#### Scenario: Continuous margin
- **WHEN** the ground height is sampled along a line from a coast out to the open ocean
- **THEN** it falls continuously from the land through the shelf and slope to the abyssal plain

#### Scenario: Seen from below
- **WHEN** the camera is under water near a coast
- **THEN** the coast's underwater flanks are drawn

### Requirement: Drawn only when needed
Land below the waterline SHALL be drawn only when the camera is under water or looking through the surface, and SHALL stream with the land's LOD rings.

#### Scenario: Above the water
- **WHEN** the camera is above the water looking at the horizon
- **THEN** no underwater land tiles add draw calls

## MODIFIED Requirements

### Requirement: Real bathymetry
The bathymetry SHALL deepen with distance from the coast through an active continental margin (a shelf of 10 to 20 km to no deeper than about 160 m, then an upper slope of about 5 degrees) and island flanks that drop steeply from every coast, islets and rocks included, onto an abyssal plain between 3000 and 4000 m. The distance to the nearest land SHALL be measured on the land itself, so the depth never steps into a cliff at a shore. Both seafloors SHALL always be given this depth and follow it wherever it is deeper than the land's own floor.

#### Scenario: No cliffs
- **WHEN** the seafloor is sampled every 50 m along a long line through the open water of the journey
- **THEN** it never changes by more than about 40 m between neighbouring samples

#### Scenario: Open ocean
- **WHEN** a point lies more than 150 km from any continental coast and away from islands
- **THEN** the seafloor depth there is at least 3000 m and at most 4000 m
