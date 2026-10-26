## ADDED Requirements

### Requirement: Day cycle
Sun position, sky, fog and light SHALL move slowly through dawn, day, golden hour, dusk and night, one full cycle per 40 minutes of travel, starting from the seed's current time of day.

#### Scenario: Smooth
- **WHEN** the cycle runs for a full period
- **THEN** exposure and fog colour change by at most 1 percent per second

### Requirement: Weather states
Weather SHALL be clear, hazy or overcast, chosen from region and time, changing cloud coverage and fog density over at least 60 seconds.

#### Scenario: Horizon stays calm
- **WHEN** overcast is at its strongest
- **THEN** the horizon seam shows no bright band and land remains readable within 2 km

### Requirement: Environment map refresh
The environment map SHALL refresh at most every 90 s on `medium` and `high`, and never on `low`, where lights are lerped instead.

#### Scenario: No hitch
- **WHEN** the refresh runs
- **THEN** the frame it runs in costs at most 8 ms more than the average on the desktop profile
