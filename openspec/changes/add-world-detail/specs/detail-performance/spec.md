## ADDED Requirements

### Requirement: Frame budget
Added detail SHALL keep 60 fps on desktop (16.7 ms frame) and at least 30 fps on a mid-range phone (33 ms frame), by staying within these added costs on the `high` tier: terrain 2.0 ms GPU and 1.0 ms CPU, birds 0.3 ms CPU and 0.4 ms GPU, ships 0.5 ms CPU and 1.0 ms GPU. Mobile (`low` tier) added costs SHALL be at most half of these.

#### Scenario: Budget check
- **WHEN** the budget check runs in `npm run test:browser` on the software renderer
- **THEN** it reports draw calls and triangles and fails if the caps below are exceeded

### Requirement: Draw call and triangle caps
Added draw calls SHALL be at most 40 on `high` and 25 on `low`. Added visible triangles SHALL be at most 60,000 on `high` and 25,000 on `low`, excluding the existing land tile budget which SHALL NOT grow.

#### Scenario: Caps reported
- **WHEN** `?debug=1` stats are read
- **THEN** they include per-element draw calls and triangles for land scatter, birds and ships

### Requirement: Quality tiers
Detail SHALL follow the existing `low | medium | high` quality tier. On `low`: no micro-normal, no wake foam texture, 10 birds, 4 ships at LOD0 or LOD1, scatter 250. On `medium`: micro-normal near only, 16 birds, 6 ships, scatter 400. On `high`: everything, 24 birds, 8 ships, scatter 600.

#### Scenario: Tier steps down
- **WHEN** the adaptive controller lowers the tier
- **THEN** detail reduces within one second without a visible pop, and DPR is not lowered further until the tier is `low`

### Requirement: LOD with hysteresis
Every detailed element SHALL select its LOD by camera distance with at least 10 percent hysteresis and SHALL have at least three LOD levels.

#### Scenario: No thrash at a boundary
- **WHEN** an object sits at an LOD boundary and the camera jitters by 1 m
- **THEN** the LOD does not change

### Requirement: Asset and bundle limits
Added JavaScript SHALL be at most 80 KB gzip in total. No single new asset SHALL exceed 20 KB gzip. Default delivery SHALL ship no new binary assets. Any shipped asset SHALL have origin and licence recorded in both `THIRD_PARTY_NOTICES` and `public/THIRD_PARTY_NOTICES`.

#### Scenario: Size gate
- **WHEN** `npm run build` completes
- **THEN** the gzip JS size is at most 292 KB (212 KB baseline plus 80 KB)

### Requirement: Security posture unchanged
The Content-Security-Policy in `public/_headers` SHALL NOT change. The app SHALL make no new third-party requests, SHALL NOT use `data:` images or inline styles, and SHALL keep all generation local and seeded.

#### Scenario: Smoke test
- **WHEN** the browser smoke test loads the page
- **THEN** no request leaves the origin and no CSP violation is reported
