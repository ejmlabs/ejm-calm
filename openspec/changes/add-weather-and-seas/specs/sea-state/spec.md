## ADDED Requirements

### Requirement: Sea level over time
The sea SHALL have one level from 0 (glassy swells) to 1 (rough), following the weather's wind with a lag of minutes, plus long swells from distant weather that can arrive under a clear sky. It SHALL be deterministic for a seed and clock.

#### Scenario: Seas build slowly
- **WHEN** the weather moves from clear to storm
- **THEN** the sea level rises by at most 1 percent of its range per second

### Requirement: Waves
The shared swell SHALL keep its three calm waves and add long wind-driven waves whose height grows with the sea level, up to about 2 m crest height on a rough sea. At level 0 the swell SHALL equal the calm swell.

#### Scenario: Calm end unchanged
- **WHEN** the sea level is 0
- **THEN** the surface height at any point equals the calm swell's height there

#### Scenario: Rough sea
- **WHEN** the sea level is 1
- **THEN** the largest surface height over a 1 km square is at least 1.5 m

### Requirement: Surface follows the waves
The water surface SHALL be displaced by the same waves as the shared swell near the camera, lit by their slope out to the horizon, and break into whitecaps on crests when the sea is rough. The water SHALL never rise into the camera.

#### Scenario: Readable at distance
- **WHEN** the sea is rough
- **THEN** wave shading and whitecaps are visible from the chase camera on desktop and phone screenshots

### Requirement: Riders follow the surface
Ships, the whale near the surface and the wake SHALL ride the same surface height the water is drawn at.

#### Scenario: Whale at the surface
- **WHEN** the whale swims at the surface in a rough sea
- **THEN** its body is lifted by the surface height at its position

### Requirement: Load time and frame cost
The change SHALL NOT add a measurable second to first paint (Lighthouse, mobile and desktop presets, before and after), and the per-frame CPU cost of weather and sea SHALL be reported by `tools/frame-cost.ts`.

#### Scenario: First paint
- **WHEN** Lighthouse runs three times before and after the change
- **THEN** the median first contentful paint grows by less than 0.5 s on both presets
