## ADDED Requirements

### Requirement: Bird species and meshes
Birds SHALL be low-poly meshes with a body, head, tail and two jointed wings, in at least three species (gull, tern, albatross) with different size, colour and proportions. They SHALL NOT be drawn as lines or points.

#### Scenario: Silhouette reads at close range
- **WHEN** a bird is within 30 m of the camera
- **THEN** its wings, body, head and tail are distinguishable and its species can be told apart by size and colour

#### Scenario: Species mix is seeded
- **WHEN** the same seed loads twice
- **THEN** the species, sizes and counts of the birds are identical

### Requirement: Wing animation
Wing flap SHALL be computed in the vertex shader from an instanced phase and rate. Gliding species SHALL be able to hold their wings still for extended periods. With reduced motion preferred, the flap SHALL freeze in a neutral pose.

#### Scenario: Out-of-step flaps
- **WHEN** a flock is on screen
- **THEN** birds do not flap in unison (phases differ)

#### Scenario: Reduced motion
- **WHEN** the user prefers reduced motion
- **THEN** wings do not animate

### Requirement: Flocking
Birds SHALL move as small flocks using separation, alignment and cohesion toward a leader that circles the whale, never snapping when the whale moves, and keeping a minimum height above the water.

#### Scenario: Flock follows without snapping
- **WHEN** the whale travels more than 1 km
- **THEN** the flock follows over tens of seconds with no teleport, and no bird passes below 5 m above the water

#### Scenario: Bounded count
- **WHEN** the detail tier is `low`
- **THEN** at most 10 birds are updated; on `high`, at most 24

### Requirement: Bird LOD
Each bird SHALL have LOD0 (about 120 triangles), LOD1 (about 40), LOD2 (a flat silhouette of about 12 triangles with the same shader flap) and be hidden beyond the haze.

#### Scenario: No popping
- **WHEN** a bird crosses an LOD boundary
- **THEN** the switch uses hysteresis and a size-matched silhouette so no visible pop occurs
