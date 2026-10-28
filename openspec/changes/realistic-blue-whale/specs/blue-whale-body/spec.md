## ADDED Requirements

### Requirement: Blue whale anatomy
The whale SHALL be a blue whale about 25 m long, with a slender tapered body, a broad flat U-shaped head with a raised splashguard in front of the blowholes, a small dorsal fin about three quarters of the way back, flippers about an eighth of the body length with smooth leading edges, and broad triangular flukes with a nearly straight trailing edge.

#### Scenario: Size
- **WHEN** the whale geometry is built at any detail level
- **THEN** its length from rostrum to fluke tips is between 24 and 26 m

#### Scenario: Proportions
- **WHEN** the whale geometry is built
- **THEN** each flipper is between 10 and 15 percent of the body length and the fluke span is between 22 and 30 percent of it

### Requirement: One size constant
Every size-dependent value (camera framing, minimum camera distance, blow, splash and wash sizes, wake width and the clearance rails) SHALL be derived from the whale's length.

#### Scenario: Length changes
- **WHEN** the whale's length constant is changed
- **THEN** every derived size changes in proportion and no other constant needs editing

### Requirement: Skin and detail
The skin SHALL be mottled blue-grey with pale spots and a faint yellowish belly, with 55 to 90 throat grooves reaching the navel. The high tier SHALL add normal and detail maps for the grooves, mottling and scars; the low tier SHALL keep a phone budget.

#### Scenario: Tiers
- **WHEN** the tier is `low`
- **THEN** the whale uses no more triangles than the current low-detail whale

### Requirement: Blow and splashes
The blow SHALL rise tall and slender, up to about 9 m, and splashes, wash and wake SHALL scale with the body. Breaching SHALL be rare.

#### Scenario: Blow height
- **WHEN** the whale breathes in calm air
- **THEN** the blow reaches between 6 and 10 m above the surface
