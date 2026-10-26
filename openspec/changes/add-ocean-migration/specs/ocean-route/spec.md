## ADDED Requirements

### Requirement: Cruising speed
While travelling, the whale SHALL cruise between 16 and 28 m/s, changing speed smoothly under the existing acceleration limits.

#### Scenario: Distance covered
- **WHEN** a seeded run of 600 s starts at the opening
- **THEN** the net distance from the start is at least 8 km on the test set (seeds 1 to 50 make 10.4 km at the median in the sweep, 4.0 km at the least)

### Requirement: Steady heading
The whale SHALL hold a long heading that drifts by a flow field of at most 6 degrees per minute. It SHALL NOT steer toward earlier positions. Coast avoidance SHALL stay, and the whale SHALL stay at least 20 m from land.

#### Scenario: No circling back
- **WHEN** a seeded run of 3600 s completes on each seed of the test set
- **THEN** the net distance is at least 60 percent of the path length and no position lies within 500 m of one visited at least 120 s earlier for more than 5 percent of samples

#### Scenario: Deterministic
- **WHEN** the same seed runs twice
- **THEN** the paths are identical

### Requirement: Stops
Breaths SHALL be taken at a glide of at least 60 percent of the current cruise speed. Feeding SHALL start at most once per 8 minutes, last at most 25 s, and only where the region has prey.

#### Scenario: Time at slow speed
- **WHEN** a seeded run of 3600 s completes
- **THEN** less than 8 percent of samples are below 50 percent of cruise speed

### Requirement: Route indicator
An optional indicator SHALL show the region name and distance travelled, fading in on a region change and out after 6 s. It SHALL be off by default and its setting SHALL be saved.

#### Scenario: Off by default
- **WHEN** a new visitor loads the page
- **THEN** no indicator appears

### Requirement: Forward progress
The whale SHALL always make headway. The route SHALL plan over a wide coarse lattice (about 12 km) so it does not enter a gulf only to leave it, and a whale that swims far and goes nowhere SHALL commit to a way out.

#### Scenario: No poor five minutes
- **WHEN** a seeded run of 3600 s completes on each of seeds 1 to 50 and on the test set, and a run of 3 hours on seeds 3, 13 and 42
- **THEN** no ten-minute window, sliding by a minute, makes less than 2 km good, net over path is at least 0.5 on every seed, and a seed may dip under 1.5 km in five minutes only once, as a U-turn out of a gulf (the sweep reports each)
