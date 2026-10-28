## ADDED Requirements

### Requirement: Planet-scale layout
Beyond the composed opening, land SHALL follow a seeded planet-scale layout: a few big continents and large islands with long coastlines, separated by wide open oceans, with archipelagos now and then. About a third of the planet SHALL be land, as on Earth.

#### Scenario: Continents and oceans
- **WHEN** the layout of each seed of the test set is sampled on an 8 km lattice over a 1,600 km square
- **THEN** land is between 20 and 45 percent of it, the largest landmass covers at least 20,000 square kilometres, and one connected ocean holds most of the sea

### Requirement: Migration lane
The whale's migration SHALL follow the ocean current through a lane of open sea: the current's path from the start, with at least 6 km of sea either side of its centreline kept open whatever the continents do. Where the lane crosses a continent the strait SHALL widen with the land's bulk. The whale's journey heading SHALL be the current's steady heading, so the lane and the current agree.

#### Scenario: The lane is the current's path
- **WHEN** a swimmer follows the current's heading from the start for 300 km on each seed of the test set
- **THEN** it stays within 300 m of the lane's centreline

#### Scenario: Never stuck
- **WHEN** `tools/seed-sweep.ts` swims an hour on each of seeds 1 to 50 and the test set
- **THEN** no seed makes under 0.5 net over path, no ten minutes make under 2 km good, and the travel figures are at least those of the ocean migration's step 3

### Requirement: Coast now and then
Along the migration the horizon SHALL be open most of the time, with a coastline now and then: a continent's coast, a large island to one side of the lane or a cluster of islets the lane runs through. Natural land (not the open sea's rocks) SHALL be within 6 km of the whale (where the land haze starts to hide it) about a quarter to a third of the time on average, with open stretches of tens of kilometres between.

#### Scenario: Along the lane
- **WHEN** the first 300 km of the lane's centreline is sampled every kilometre on each seed of the test set
- **THEN** natural land lies within 6 km of between 8 and 50 percent of the samples on every seed and of 15 to 40 percent on average, and every seed has an open stretch of at least 30 km

#### Scenario: Along the whale's hour
- **WHEN** `tools/seed-sweep.ts` swims an hour on each of seeds 1 to 50 and the test set
- **THEN** it reports the share of the hour with natural land within 6 km and the longest open stretch per seed, and the mean share over the seeds is under one half

### Requirement: Deterministic and streamable
The layout SHALL be a pure function of the seed and the migration heading, so the land worker, the navigation field and the main thread build the same world in any order and tiles stream on demand.

#### Scenario: Order of samples
- **WHEN** two layouts of the same seed and heading are sampled at the same 400 points in opposite orders
- **THEN** every value is equal

### Requirement: Opening and mask agreement
The composed opening (within 2.2 km), its exit channel and the land height function's signature SHALL stay unchanged. `maskAt`, the navigation field, the land mesh and the seafloor SHALL agree on where land is.

#### Scenario: Opening
- **WHEN** the opening tests run
- **THEN** the start keeps open water within 200 m and an offset rebuild matches the same heights

#### Scenario: Seams
- **WHEN** the tile seam and navigation order tests run
- **THEN** they pass unchanged
