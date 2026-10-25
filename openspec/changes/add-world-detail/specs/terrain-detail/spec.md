## ADDED Requirements

### Requirement: Layered terrain shape
The land height SHALL combine a macro shape, a mid-scale layer and a micro layer. The macro layer SHALL use ridged noise with a domain warp. The mid layer SHALL add coves, islets, sea stacks, gullies and rock strata. The micro layer SHALL be a fragment-shader normal and grain term that adds no triangles.

#### Scenario: Coast is not a smooth blob
- **WHEN** the camera is within 100 m of a coast
- **THEN** the shoreline outline has features at 10 to 100 m scale (coves, rocks, headlands) rather than a single smooth curve

#### Scenario: Same seed, same land
- **WHEN** the same seed and layout version load twice
- **THEN** `heightAt` returns identical values for identical coordinates

#### Scenario: No seams between tile levels
- **WHEN** two neighbouring tiles use different levels
- **THEN** no visible gap or crack appears (existing skirt behaviour is preserved)

### Requirement: Material system
The land SHALL be shaded from per-vertex material weights for sand, wet sand, rock, grass, forest and snow, mixed per fragment, with the same palette family as the current calm colours. The seabed SHALL use sand and rock with sand ripples.

#### Scenario: Wet shoreline band
- **WHEN** land meets the water
- **THEN** a darker wet band and a thin animated foam line follow the waterline

#### Scenario: Steep faces read as rock
- **WHEN** the surface slope is steep
- **THEN** the rock material dominates regardless of height

### Requirement: Real lighting
The land SHALL respond to the sun direction and a hemisphere ambient, and SHALL keep the existing distance haze matched to the sky.

#### Scenario: Sun moves
- **WHEN** the sun direction changes with the time-of-day preset
- **THEN** land shading changes with it, and distant land still melts into the horizon haze without a visible edge

### Requirement: Scatter near the camera
Rocks and trees SHALL be placed as instanced meshes only inside the finest tile rings, deterministic per seed, and SHALL fade out with their tile.

#### Scenario: Instances are capped
- **WHEN** the detail tier is `low`
- **THEN** no more than 250 scatter instances are alive; on `high`, no more than 600

### Requirement: Calm look preserved
Added terrain detail SHALL NOT use hard black outlines, high-contrast textures or saturated colours outside the existing palette.

#### Scenario: Palette check
- **WHEN** a review screenshot is taken at each time-of-day preset
- **THEN** land colours remain within the existing palette family and the water, sky and land still read as one scene
