## MODIFIED Requirements

### Requirement: Region field
The four regions SHALL follow the planet's layout: tropical, temperate and polar by latitude bands of a seeded north axis that crosses the migration at 35 to 55 degrees (equator to pole over 120 km), and deep blue in open ocean 22 to 40 km or more from any continent. The start SHALL be temperate. Borders SHALL blend so no value jumps.

#### Scenario: Continuity
- **WHEN** region weights are sampled along any straight line at 10 m steps
- **THEN** no weight changes by more than 0.01 between adjacent samples

#### Scenario: All four along the way
- **WHEN** the first 600 km of the migration lane is sampled on each seed of the test set
- **THEN** all four regions occur, tropical only at low latitude, polar only at high latitude and deep blue only far from continents

## REMOVED Requirements

### Requirement: Open ocean dominant
**Reason**: Replaced by the planet-scale layout of `world-layout`: land is about a third of the planet in big continents, and open ocean dominates along the migration instead of everywhere.
**Migration**: See `world-layout` ("Planet-scale layout", "Coast now and then").
