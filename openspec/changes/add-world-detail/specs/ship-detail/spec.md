## ADDED Requirements

### Requirement: Ship types
The world SHALL contain at least three ship types: sloop, schooner and fishing trawler. A fourth type (small ferry or cargo) MAY be added. Type choice SHALL be seeded and deterministic per ship cell.

#### Scenario: Types are recognisable
- **WHEN** a ship is within 60 m of the camera
- **THEN** its type is identifiable by hull shape and superstructure (sails for sloop and schooner, wheelhouse and gantry for trawler)

#### Scenario: Same seed, same ships
- **WHEN** the same seed loads twice
- **THEN** each ship cell produces the same ship specs

### Requirement: Hulls and rigging
Hulls SHALL be lofted from station curves with a shaped bow and stern, deck, bulwarks and waterline stripe. Sailing types SHALL have masts, booms and visible stays or shrouds.

#### Scenario: One merged geometry
- **WHEN** a ship is drawn at LOD0
- **THEN** it uses at most 3 draw calls and at most 2500 triangles

### Requirement: Shader sails
Sail billow and flutter SHALL be computed in the vertex shader. The CPU SHALL NOT rewrite sail vertices per frame.

#### Scenario: Sails move
- **WHEN** the scene runs
- **THEN** sails visibly breathe and no per-frame CPU geometry upload occurs for them

### Requirement: Wake and spray
A moving ship SHALL leave a foam wake that fades with age, and show a small bow spray. Stationary or hidden ships SHALL NOT draw them.

#### Scenario: Wake follows the path
- **WHEN** a ship turns
- **THEN** the wake curves behind it along the path actually travelled

### Requirement: Motion from the shared swell
Heave, roll and pitch SHALL come from sampling `swellAt` at bow, stern and beam points of the hull, with heave under 0.3 m and roll under 4 degrees.

#### Scenario: Ship rides the swell
- **WHEN** `swellAt` is sampled at the ship's centre over a minute
- **THEN** the ship's height tracks it within the smoothing time and never leaves the water or sinks past its waterline stripe

### Requirement: Ship LOD
Ships SHALL have LOD0 (about 2500 triangles), LOD1 (about 600), LOD2 (about 40 silhouette) and LOD3 (sunk in haze, as today).

#### Scenario: Far ship still reads
- **WHEN** a ship is 800 m away
- **THEN** it renders at LOD2 with its sail and hull colour visible as a small silhouette
