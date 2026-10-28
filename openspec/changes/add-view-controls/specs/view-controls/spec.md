## ADDED Requirements

### Requirement: Orbit around the whale
The user SHALL be able to turn the view a full 360 degrees around the whale by dragging with a mouse or one finger, with the pitch limited between just above the horizon and about 75 degrees down.

#### Scenario: Side view
- **WHEN** the user drags sideways on the scene
- **THEN** the view turns around the whale and keeps looking at it

#### Scenario: No flip
- **WHEN** the user drags far up or down
- **THEN** the view stops at the pitch limits and never goes under the water or past straight down

### Requirement: Zoom
The user SHALL be able to zoom with the wheel or a pinch between 10 m and 60 m from the whale; the page SHALL NOT scroll or zoom from these gestures over the scene, and gestures outside the scene SHALL behave as normal.

#### Scenario: Limits
- **WHEN** the user zooms all the way in or out
- **THEN** the eye stays between 10 m and 60 m from the whale and never inside it

### Requirement: Follow and reset
The orbit view SHALL follow the travelling whale and keep its chosen angle relative to the whale's heading and its chosen distance after the user lets go. A reset control SHALL return to the default follow camera, which remains the view until the user first orbits or zooms.

#### Scenario: Keeps the angle
- **WHEN** the user has turned to a side view and lets go while the whale turns
- **THEN** the view stays on the same side of the whale

#### Scenario: Reset
- **WHEN** the user presses reset view or the 0 key
- **THEN** the default follow camera returns

### Requirement: Keyboard
While the scene has focus, arrow keys SHALL orbit, `+` and `-` SHALL zoom and `0` SHALL reset the view.

#### Scenario: Keys
- **WHEN** the scene has focus and the user presses the left arrow
- **THEN** the view turns around the whale

### Requirement: Reduced motion
With reduced motion preferred, the view SHALL move only while the user moves it: no damping drift, no blend and no auto-rotation.

#### Scenario: Still after release
- **WHEN** reduced motion is preferred and the user lets go after a drag
- **THEN** the view does not keep turning

### Requirement: Travel speed
The about panel SHALL offer slow, normal and fast travel speeds, normal being the current speed, scaling the whale's travel speed by 0.6, 1 and 1.5. The choice SHALL be saved with the other settings, and the wake, swell, audio, route distance and camera SHALL follow the real speed.

#### Scenario: Fast
- **WHEN** the user picks fast
- **THEN** the whale's cruising speed rises by half, up to 42 m/s, and the choice is kept on the next visit
