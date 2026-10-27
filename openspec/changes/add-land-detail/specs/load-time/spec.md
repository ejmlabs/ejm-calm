## ADDED Requirements

### Requirement: Load time is the size bar
The project SHALL NOT cap bundle bytes, asset bytes or the number of dependencies in its tests, smoke checks, specs or review criteria. Instead, load time on a normal connection SHALL be measured, and a change SHALL NOT add a second or more to the median first paint, first contentful paint or first frame of the sea against the build it changes.

#### Scenario: No byte gate
- **WHEN** the checks run (`npm test`, `npm run test:browser`)
- **THEN** none of them fails on bundle size, asset size or dependency count

#### Scenario: Load time measured against the base
- **WHEN** `npx tsx tools/load-time.ts <base build> <new build>` runs on the desktop and phone profiles through a 9 Mbps, 170 ms connection
- **THEN** it alternates cold loads between the two builds, reports the median first paint, first contentful paint and first frame for both, and fails if any grows by 1,000 ms or more

### Requirement: three.js used fully
Rendering and geometry SHALL use three.js and its maintained addons where they do the job (geometries, `BufferGeometryUtils`, instancing), rather than hand-rolled equivalents.

#### Scenario: Land objects from library geometry
- **WHEN** trees, rocks, houses, people and animals are built
- **THEN** their shapes come from three.js geometries merged with `mergeGeometries`
