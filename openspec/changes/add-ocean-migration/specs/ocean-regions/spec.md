## ADDED Requirements

### Requirement: Region field
The world SHALL be divided by a seeded, deterministic region field of about 40 km cells into temperate, tropical, polar and deep blue regions. Borders SHALL blend over about 5 km so no value jumps.

#### Scenario: Continuity
- **WHEN** region weights are sampled along any straight line at 10 m steps
- **THEN** no weight changes by more than 0.01 between adjacent samples

### Requirement: Open ocean dominant
Land SHALL cover 5 to 8 percent of the world on average. Islets SHALL be sparse and continents rare. The opening bay SHALL keep at least its current open water and composition score.

#### Scenario: Land share
- **WHEN** a 60 km square around each seed of the test set is sampled
- **THEN** land is between 3 and 12 percent of it, and no 10 km disc along a straight 100 km line is more than 40 percent land

### Requirement: Region look
Each region SHALL set water colour, fog tint and density, land haze, land palette, islet density, bird mix and ship density. Changes SHALL ease in across the blend.

#### Scenario: No pop
- **WHEN** the whale crosses a region border
- **THEN** no colour or density changes between two frames by more than 2 percent

### Requirement: Mask agreement
`maskAt`, the nav field, the land mesh and the seafloor SHALL agree on where land is after region modulation.

#### Scenario: Seams
- **WHEN** the tile seam tests run
- **THEN** they pass unchanged
