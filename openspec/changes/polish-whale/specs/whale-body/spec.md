## ADDED Requirements

### Requirement: Flexing body
The skinned whale SHALL carry flex bones for the fluke blades and the outer half of each flipper. Each stroke SHALL end with the fluke tips following through behind the peduncle, and the flipper tips SHALL lag their own sweep.

#### Scenario: Skinning stays valid
- **WHEN** the whale geometry is built at every detail level
- **THEN** every skin weight set sums to 1 and every bone index is below BONE_COUNT

### Requirement: Turning
Into a turn the spine SHALL curve with head and tail toward the inside, scaled by the smoothed turn rate, and the inside flipper SHALL drop and reach forward while the outside one lifts. Banking SHALL stay eased.

#### Scenario: Turn rate is smoothed
- **WHEN** the heading changes
- **THEN** the turn the body bends to is damped, never a step

### Requirement: Skin
On medium and high tiers the skin SHALL use a physically based material with a thin clear coat and a soft sheen so the dark body reads in day, dusk and night light; phones SHALL keep the standard material. The skin SHALL show knuckles along the tail stock in addition to the existing throat grooves, knobs, barnacles and scars.

#### Scenario: Tiers
- **WHEN** the tier is `low`
- **THEN** the whale uses MeshStandardMaterial

### Requirement: Blow
The blow SHALL rise from the blowholes and, once out, stay where it was breathed while the whale glides on, thinning over the rest of the spout.

#### Scenario: Forced review
- **WHEN** a spout is forced part way through
- **THEN** the plume is drawn at the blowholes, not at the world origin
