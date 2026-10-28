## ADDED Requirements

### Requirement: Obstacle registry
The whale and the ships afloat SHALL be registered as obstacles where they are every frame, and the registry SHALL report every obstacle that overlaps a query shape, and the first obstacle a swept sphere meets along a feeler with its distance, exactly as a brute-force check over all obstacles does.

#### Scenario: Overlap
- **WHEN** a capsule is queried against the registry
- **THEN** exactly the obstacles whose capsules lie within the sum of the radii are returned, each once, leaving out the asker

#### Scenario: Feeler
- **WHEN** a sphere is swept along a feeler of a given length
- **THEN** the nearest obstacle it touches within that length is returned with the distance travelled, or nothing when the way is clear

### Requirement: Analytic surfaces
The ground (land above the sea, the seafloor below it) and the sea surface SHALL be sampled from the same height fields the world is built from, and a capsule's clearance above the ground SHALL be negative when any sampled part of it is inside the ground.

#### Scenario: Inside the ground
- **WHEN** a capsule lies below the ground height on land
- **THEN** its ground clearance is negative

### Requirement: No physics engine download
Collision SHALL use the analytic samplers and the obstacle registry, and SHALL NOT add a physics engine.

#### Scenario: Dependencies
- **WHEN** the dependency list is read
- **THEN** it contains no Rapier, Jolt, cannon or ammo package
