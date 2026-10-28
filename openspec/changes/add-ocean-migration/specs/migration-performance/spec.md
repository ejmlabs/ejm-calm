## ADDED Requirements

### Requirement: Streaming keeps up
At 28 m/s the streamed world SHALL NOT show missing land, nav or ship cells on screen. Lead and prefetch SHALL scale with speed. All streaming work on the main thread SHALL stay near 2.5 ms per frame.

#### Scenario: Throughput
- **WHEN** the smoke test travels 300 s at cruise speed
- **THEN** no on-screen coverage gap is reported and the 99th-percentile stream frame is under 3 ms on a phone-class device; the smoke run prints that percentile and the worst frame, and fails if more than 10 percent of stream frames exceed 3 ms

### Requirement: Cleanup behind
Tiles, nav blocks, ship cells and caches behind the whale SHALL be evicted so memory stays bounded.

#### Scenario: One hour
- **WHEN** a one-hour simulated run completes
- **THEN** tile, nav and cache counts stay under their caps and heap growth is under 50 MB

### Requirement: Recentre
The floating origin SHALL recentre at most once per 2 minutes at cruise speed.

#### Scenario: Count
- **WHEN** a 600 s run at cruise speed completes
- **THEN** at most 5 recentres occurred

### Requirement: Added cost
The change SHALL add at most 4 draw calls on `low` and 8 on `high`, and at most 6,000 visible triangles on `low`. The land tile budget SHALL NOT grow. The CSP SHALL NOT change.

#### Scenario: Draw gate
- **WHEN** smoke runs on the desktop and phone profiles
- **THEN** the draws the change adds are at most 4 on `low` and 8 on `high`
