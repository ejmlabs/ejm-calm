## ADDED Requirements

### Requirement: Weather states
Weather SHALL take six states: clear, hazy, overcast, rain, storm and fog. Each state SHALL set cloud cover and density, fog and haze, sunlight, rain, wind and the sea it drives.

#### Scenario: Every state occurs
- **WHEN** the weather track of one seed is sampled for ten hours across the four regions
- **THEN** each of the six states is the dominant state for some of that time

### Requirement: Weather schedule
The weather SHALL follow a seeded track that depends only on the seed, the experience clock and the region weights where the whale is. A state SHALL hold for minutes, the hold length SHALL vary by seed, and the track SHALL move only between neighbouring states (clear, hazy, overcast, rain, storm), with fog as its own bank that comes and goes. The first minute SHALL be clear.

#### Scenario: Deterministic
- **WHEN** the same seed, clock and region weights are sampled twice
- **THEN** the weather look is identical

#### Scenario: No pop
- **WHEN** the weather runs for two hours at 60 steps per second
- **THEN** no look value changes by more than 2 percent of its full range in one second, except the lightning flash

#### Scenario: Opening
- **WHEN** the experience starts
- **THEN** the weather is clear for at least the first 60 seconds

### Requirement: Region bias
Regions SHALL bias the weather: polar seas are stormier and foggier, tropical seas fairer with showers.

#### Scenario: Polar is rougher
- **WHEN** a seed's track is sampled for ten hours in polar and in tropical weights
- **THEN** the mean sea level is higher in polar weights

### Requirement: Sunsets and sunrises
When the sun is low, the sky, haze and fog SHALL warm toward sunset colours in proportion to how clear the sky is, and SHALL stay grey under overcast, rain or storm.

#### Scenario: Cloud kills the glow
- **WHEN** the sun is 3 degrees above the horizon
- **THEN** the horizon is warmer (red over blue) under clear sky than under overcast

### Requirement: Storm light
Storms SHALL darken the sky and light. Lightning SHALL be distant soft flashes: at most one every 6 seconds, rising over at least 0.1 s, lifting the scene's light by at most 35 percent, and never under reduced motion.

#### Scenario: Photosensitive-safe
- **WHEN** a storm runs for an hour
- **THEN** no two flashes start within 6 seconds of each other and no flash lifts the light by more than 35 percent

#### Scenario: Reduced motion
- **WHEN** reduced motion is on
- **THEN** no lightning flash is drawn

### Requirement: Precipitation
Rain SHALL fall as streaks around the camera, slanted by the wind and dimmed at night; rough seas SHALL throw spray off the crests. Both SHALL be drawn on the GPU in at most two draw calls, with fewer particles on `low`, and not at all when their amount is zero.

#### Scenario: No rain, no draw
- **WHEN** the weather is clear and the sea calm
- **THEN** rain and spray add no draw calls

### Requirement: Weather sound
With sound on, a rain bed made in the browser SHALL follow the rain, and the wind and open-sea beds SHALL rise with the wind and the sea. No new file or origin SHALL be fetched.

#### Scenario: Rain is heard
- **WHEN** it rains at full strength above the water
- **THEN** the rain bed's gain is above zero, and it is zero under clear sky
