## ADDED Requirements

### Requirement: Fish species and swim
The ocean SHALL have a table of fish species (forage fish, mackerel, tuna, lanternfish, jellyfish, rays and reef fish), each with an instanced mesh at three levels of detail of at most 150 triangles, swum in the vertex shader from a per-instance phase and rate.

#### Scenario: Every species in review
- **WHEN** the page is opened with `?debug=1&fish=1` and the camera is under water
- **THEN** a small school of every species is drawn ahead of the camera, each swimming its own way

#### Scenario: Cheaper levels
- **WHEN** a species is built at levels 0, 1 and 2
- **THEN** each level has fewer triangles than the one before, and level 0 has at most 150

### Requirement: Still under reduced motion
Fish SHALL stand still when reduced motion is preferred.

#### Scenario: Reduced motion
- **WHEN** reduced motion is preferred
- **THEN** fish positions and swim phases do not change between frames
