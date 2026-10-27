## ADDED Requirements

### Requirement: Surfacing bouts
A surfacing SHALL be a string of 2 to 5 blows, seeded, lasting tens of seconds. Each blow SHALL be a rise into the blow, a spout, and (between blows) a roll back under to a glide depth that keeps the body above the camera's dive line. A surfacing SHALL end in a fluke-up dive in which the flukes clear the water.

#### Scenario: Surfacing length
- **WHEN** a seeded run of 1800 s over deep open water completes on each seed of the test set
- **THEN** every whole surfacing lasts more than 20 s and less than 150 s and holds at least one blow, and the lengths vary by more than 30 s

#### Scenario: Glide between blows
- **WHEN** the whale is in a rise, spout or roll
- **THEN** its body is at least 0.5 m above the camera's dive line

### Requirement: Long dives
A dive SHALL last 2 to 6 minutes, seeded per dive. The descent and the climb SHALL be eased and SHALL NOT exceed the capped vertical speed. Over water too shallow to dive, the whale SHALL stay up and keep breathing.

#### Scenario: Dive length and depth
- **WHEN** a seeded run of 1800 s over deep open water completes
- **THEN** every whole dive lasts more than 100 s and less than DIVE_MAX plus 90 s, reaches below 12 m, and some last over 120 s

#### Scenario: Shallow water
- **WHEN** the floor is 8 m down
- **THEN** the whale stays above 6 m and blows at least 10 times in 400 s

### Requirement: Calm camera through dives
The chase camera SHALL follow the whale under only after it has stayed below the dive line for DIVE_DWELL (2.5 s), and SHALL come back up when the whale rises above the rise line.

#### Scenario: Short dip
- **WHEN** the whale dips below the dive line for less than DIVE_DWELL
- **THEN** the camera stays above the water

### Requirement: Continuous motion
Every hand-over between pose segments and between a segment and free swimming SHALL be continuous in height, pitch and heading, with no frame held still and vertical acceleration under 5 m/s² outside a breach.

#### Scenario: No snaps
- **WHEN** a seeded run of 900 s completes on each seed of the test set
- **THEN** no step outside a breach or its splash has a vertical acceleration of 5 m/s² or more

### Requirement: Progress kept
The longer cycle SHALL NOT slow the journey: the route requirements of `add-ocean-migration` (8 km net in the first ten minutes, net over path, revisits) SHALL still hold, and the surfacing glide SHALL stay at or above 60 percent of the cruise speed.

#### Scenario: Ten minutes
- **WHEN** the one-hour journey test runs over real coasts
- **THEN** each seed makes at least 8 km net in its first ten minutes
