## ADDED Requirements

### Requirement: Wake and bow wave
The whale SHALL leave a wake that fades with age and push a bow wave, both scaled by speed, drawn in at most 2 draw calls.

#### Scenario: Wake visible
- **WHEN** the whale cruises above 16 m/s
- **THEN** a wake trail at least 40 m long is visible behind it

### Requirement: Passing scenery
Seeded islets and rocks SHALL appear near the route, sparsely, at least one per 2 minutes on average, never within 20 m of the whale's path.

#### Scenario: Something passes
- **WHEN** a seeded run of 600 s completes in open ocean
- **THEN** at least 4 landmarks come within 1.5 km of the whale

### Requirement: Clouds and swell
Clouds SHALL scroll on a wind vector, and swell time SHALL scale with the whale's speed. Birds SHALL be passing flocks, not a flock that has to keep pace.

#### Scenario: Reduced motion
- **WHEN** the user prefers reduced motion
- **THEN** no field-of-view lift is applied and cloud motion is halved

### Requirement: Camera at speed
The camera SHALL respond to speed up to 28 m/s with a pull-back of at most 25 percent and a field-of-view lift of at most 6 degrees, keeping the whale framed.

#### Scenario: Framed
- **WHEN** the whale accelerates from 16 to 28 m/s
- **THEN** its bounding box stays within the central 80 percent of the frame

### Requirement: Ships read as vessels
Ships SHALL read as proper vessels at the distances of the review shots: a hull with a sheer and a deck, shaped sails, a foam wake at the bow and stern, and a masthead lantern at night. The set of all ships SHALL add at most 2 draw calls for foam and lights, and SHALL NOT draw more calls in total than before.

#### Scenario: Night lights
- **WHEN** the sky is dark
- **THEN** each ship in view shows a lantern, and none shows by day

#### Scenario: Draws
- **WHEN** eight ships are in view
- **THEN** the draw calls of the ships and their foam and lights are no more than before this change
