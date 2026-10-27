## Context

Land is streamed as quadtree tiles (`landmesh.ts`), built in a worker (`world-worker.ts`) by `buildTile` (`world-tiles.ts`) from `land.surfaceAt`. The finest tile is 128 m across, a tile splits when the camera is within 0.8 of its size, so levels 0 to 4 cover about the nearest 3 km. Each tile is one draw with per-vertex colour, lit and hazed per fragment. The route and navigation read only `maskAt` and the heights below sea.

## Goals / Non-Goals

**Goals:**
- Near land with real surface detail, and cliffs that read as rock.
- Trees, towns, people and animals, seeded and stable, visible from the sea.
- The route, the mask and the sea depths exactly as before.
- Draws, triangles and frame cost kept sensible; load time measured.

**Non-Goals:**
- Textures or shipped assets: all detail is procedural.
- Shadows from objects, or interaction with life on land.
- Byte or dependency caps (the owner removed them).

## Decisions

### D1. Surface detail in the land shader, not in triangles
Detail weights per vertex (rock, sand, forest, object) ride in one normalised `Uint8` attribute. The fragment shader adds strata, grit, wet bands, mottling and a derivative bump. Noise is sampled triplanar (three axis projections blended by the normal), because blending the coordinates of two projections smeared stripes across slopes. Every band is faded by its screen footprint (`fwidth` of the world position against its period), because unfiltered 2 m detail aliased into moiré at grazing angles.

Rejected: more tile triangles (the grid is shared with the far levels and the stream budget), and terraced strata in the heightfield (tried: cliffs read as stepped pyramids).

### D2. Objects baked into tile geometry
Trees, rocks and houses are merged into the tile mesh in the worker. They cost no draw calls, dissolve with the tile, and need no per-frame work. Shapes come from three.js primitives (`ConeGeometry`, `CylinderGeometry`, `IcosahedronGeometry`, `BoxGeometry`, `ExtrudeGeometry`), flat-shaded with `toNonIndexed` and `computeVertexNormals`, and merged with `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js`. Tree shapes are built once per kind and tone and placed by matrix.

Rejected: `InstancedMesh` per tree kind. It needs its own culling and fading per tile and adds draws per kind; at a few thousand small objects the merged tile costs less.

### D3. Placement on a nested lattice
Tree candidates sit on an 8 m lattice with a rank per point; a tile at level L considers points ranked under 3^-L, and keeps those under the local density. A coarse tile therefore holds a sparser subset of the same world positions, and refining adds trees rather than moving them. Tiles from level 3 out carry half the cap: their trees are a pixel or two.

Towns are tried once per 1.6 km cell (always near the start) on gentle land with the sea within 190 m, with the street along the coast. Herds are tried per 384 m cell on open meadow.

### D4. Walkers as two instanced draws
People and animals come from the walkers listed by the three finest wanted tiles, nearest first up to the tier cap, in one `InstancedBufferGeometry` for people and one for animals. They pace and graze in the vertex shader on their own clock, which stops under reduced motion. They share the land's lighting and haze GLSL and stay out of the water's mirror.

### D5. Load time, not bytes
`tools/load-time.ts` serves a build, throttles the network (9 Mbps down, 1.5 Mbps up, 170 ms round trip) and the phone CPU (4x), and reads first paint, first contentful paint and the first frame of the sea from the page's own clocks over several cold loads. Given two builds it fails when a median grows by a second or more. Playwright is already the browser tool here; Lighthouse would add a large dependency for the same paint timings.

## Risks / Trade-offs

- [Object triangles on phones] → per-tier caps per tile, half on far tiles, and a smoke check on object triangles per tier.
- [Stream step cost from bigger tiles] → measured in smoke throughput (p99 and percent over 3 ms) and by frame cost.
- [Worker bundle grows with three.js geometry] → measured by the load-time check; bytes are not capped.
- [Shapes from library primitives cost a few more triangles than hand-made fans (houses 40 against about 14)] → accepted for maintained code; counted in the triangle budget.

## Migration Plan

Additive. Rollback is a revert of the change. No persisted data changes.

## Open Questions

None.
