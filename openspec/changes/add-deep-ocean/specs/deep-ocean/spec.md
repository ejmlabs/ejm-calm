## ADDED Requirements

### Requirement: Real bathymetry
The bathymetry SHALL deepen with distance from the continental coast through a shelf no deeper than about 160 m, a slope of 3 to 4 degrees, and an abyssal plain between 3000 and 4000 m, and island flanks SHALL drop steeply from their own coast; when given this depth, the seafloor SHALL follow it wherever it is deeper than the land's own floor, with no depth limit that eases it toward a shallow constant.

#### Scenario: Open ocean
- **WHEN** a point lies more than 150 km from any continental coast and away from islands
- **THEN** the bathymetric depth there is at least 3000 m and at most 4000 m

#### Scenario: Continuous floor
- **WHEN** the coast distance changes smoothly
- **THEN** the depth changes continuously and never gets shallower further from the coast

#### Scenario: No depth given
- **WHEN** no bathymetric depth is passed to the seafloor
- **THEN** the seafloor is the same as before this change
