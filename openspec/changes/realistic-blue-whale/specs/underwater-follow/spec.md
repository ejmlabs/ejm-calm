## ADDED Requirements

### Requirement: Following under water
Unless the viewer has chosen to stay at the surface, or reduced motion is set, the camera SHALL follow the whale through a whole dive and back. Orbit and zoom SHALL keep working under water. The camera SHALL stay at least 2 m above the seafloor and at least 0.5 m below the surface while under.

#### Scenario: Full dive
- **WHEN** the whale dives to 200 m and returns
- **THEN** the camera follows it down and up and is never below the seafloor or crossing the surface except while following the whale through it

#### Scenario: Stay at surface
- **WHEN** the viewer has switched on "stay at surface"
- **THEN** the camera stays above the water during dives, and the choice is saved

### Requirement: Light by depth
Light SHALL fade with depth, red first and blue last, with sky light falling exponentially with depth and a floor that keeps the whale visible at 300 m. Exposure SHALL adapt over a few seconds.

#### Scenario: Deeper is darker
- **WHEN** the camera goes from 20 m to 200 m below the surface
- **THEN** the scene's average brightness falls, and the whale is still visible against the water
