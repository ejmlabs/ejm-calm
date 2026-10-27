## ADDED Requirements

### Requirement: Detailed ground and coastal sides
The land shader SHALL add procedural surface detail that costs no triangles:
- rock strata, blocks and grit on cliffs and steep faces, sampled from three axes so steep faces are not smeared;
- a darker wet-rock and wet-sand band at the waterline;
- mottled grass, forest canopy and sand ripples;
- a fine bump normal on the `medium` and `high` tiers.

It SHALL keep the existing sun lighting and haze, and stay within the existing palette family.

#### Scenario: Cliffs show strata
- **WHEN** a sea cliff is in view within 1.5 km
- **THEN** its face shows horizontal rock bands and grain, not one flat tone

### Requirement: Detail without shimmer
Each surface detail SHALL fade out where one pixel spans a large part of its period, so it never aliases into moiré, and all detail SHALL fade out with distance, so far land stays a calm, solid mass. Hillsides that are not cliffs SHALL NOT take the rock detail.

#### Scenario: No moiré at grazing angles
- **WHEN** a grassy or rocky slope is seen at a grazing angle from the water
- **THEN** it shows no striped or zebra pattern

#### Scenario: Far land stays calm
- **WHEN** land is more than 4 km away
- **THEN** no fine detail is drawn and the land melts into the haze as before

### Requirement: Shape detail on land only
Cliff tops SHALL gain gullies and buttresses, only where the coast mask is above sea. Cliff faces SHALL NOT be terraced. The coast mask (`maskAt`) and every height below sea level SHALL be unchanged, so the route, navigation, shelf maps and seafloor are unaffected.

#### Scenario: Mask and sea unchanged
- **WHEN** `maskAt` and `heightAt` are sampled at sea for a seed before and after this change
- **THEN** the mask values are identical everywhere and the heights are identical wherever the mask is below zero

#### Scenario: Route unchanged
- **WHEN** the one-hour seed sweep runs on seeds 1 to 24
- **THEN** it reports the same figures as before this change

### Requirement: Vegetation, rocks and towns in land tiles
Land tiles at the five finest levels SHALL carry seeded objects built into the tile geometry:
- trees by biome (conifers, broadleaf trees, and palms in the tropics), shrubs and boulders;
- town houses.

The objects SHALL stand on the tile's own drawn surface, dissolve with their tile and add no draw calls.

#### Scenario: Biome rules
- **WHEN** objects are placed
- **THEN** no tree or house stands in the sea, on a beach or on a cliff face; palms grow only in tropical land; trees thin out with altitude and are absent from snow

### Requirement: Stable object placement
Land objects SHALL be a pure function of the seed and the tile key. Objects on a coarser tile SHALL be a sparser subset of the same world positions, so refining a tile adds objects rather than moving them.

#### Scenario: Deterministic objects
- **WHEN** the same tile is built twice, in any order, from the same seed
- **THEN** its geometry, objects included, is identical

#### Scenario: Coarse is a subset
- **WHEN** a tile and its four children are built
- **THEN** almost every tree of the parent stands at the same world position in one of the children

### Requirement: Coastal towns
Towns SHALL be placed deterministically per town cell on gentle land behind a beach, near the sea, and never on cliffs or in the sea. A town SHALL have 6 to 18 houses, some with a tower, with walls in pale tones and roofs in warm or slate tones. Cells near the start SHALL always try to hold a town, so the opening coast often shows one.

#### Scenario: Town sites
- **WHEN** towns are generated for seeds 1 to 24 around the start
- **THEN** every house is on land with low slope, and most seeds have a town within 4 km of the start

### Requirement: People and animals
Towns SHALL have tiny people that walk to and fro between the houses. Open meadows SHALL have small grazing herds by biome:
- sheep and cows near towns;
- deer in temperate land;
- reindeer in polar land;
- goats in tropical land.

People and animals SHALL be instanced in at most two draw calls, come only from the three finest tile levels that are wanted, and move subtly. They SHALL be visible as figures from a close coast. Under the reduced-motion preference they SHALL be still.

#### Scenario: Reduced motion
- **WHEN** the reduced-motion preference is set
- **THEN** people and animals keep their pose and position from frame to frame

#### Scenario: Walkers are bounded
- **WHEN** the debug stats are read on any tier
- **THEN** the walkers never exceed the tier's cap and draw in at most two calls

### Requirement: Land detail draw and triangle budgets
The change SHALL add at most 2 draw calls on every tier. With the camera off a town, it SHALL keep the object triangles of the placed tiles within 25,000 on `low`, 40,000 on `medium` and 60,000 on `high`, read from the debug stats. The tile grid's own cells and split distance SHALL NOT change.

#### Scenario: Budget check
- **WHEN** smoke runs on the desktop and phone profiles
- **THEN** it reads the land object triangles, the walkers and their draws from the debug stats, and fails if any cap is exceeded

### Requirement: Land detail object caps
A tile SHALL carry at most 36 objects on `low`, 70 on `medium` and 110 on `high`, and half as many trees from level 3 out. The walkers SHALL number at most 64 on `low`, 128 on `medium` and 192 on `high`.

#### Scenario: Caps hold on a full tile
- **WHEN** a tile wholly on forested land is built on each tier
- **THEN** its object count is at most the tier's cap
