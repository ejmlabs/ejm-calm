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

### D5a. Far ranges from shading maps
Distant ranges looked basic because a 2 km tile's vertices are 85 m apart and the heightfield had little relief below 80 m. Two changes, neither adding triangles. The heightfield gains a ridged spur-and-gully term on slopes from about 30 m up, with more octaves at finer levels of detail (land only, so the mask and the sea do not move). Tiles from level 2 (512 m) up carry two RGBA8 maps baked in the worker at four texels per vertex step: colour from the same `biomeColor` rules at the texel's own slope, and the normal with a cavity term (height against the ring two texels out). The shader lights and colours those tiles from the maps; each mesh binds its maps in `onBeforeRender`, so the shared materials and their one program stay. Maps are mipmapped with anisotropic filtering, so they never shimmer. Aerial haze is thinner (a range 4 km out keeps about half its contrast) and still closes completely before the streamed edge.

A far tile with maps takes about 35 ms in the worker against 2 ms bare, and its maps take about 100 KB of GPU memory. Rejected: a finer tile grid (+40 percent land triangles; software-GL frames passed a second), and a separate impostor layer (another draw and another source of seams for what the maps already do on the real tiles).

### D5b. First frame first
The first frame used to wait for every opening tile built on the main thread with its trees, houses and walkers, which cost the phone profile most of a second. The first tiles are now built bare (about half the time each) and marked bare; once the page runs, the worker rebuilds them nearest first, after any tile the camera needs, with their life and shading maps. A rebuilt tile dissolves in over its bare mesh over the usual fade (at once under reduced motion), and the bare mesh goes when it is done, so the land never has a hole. Rebuilds are requested again whenever the worker answers, so slow frames do not idle it, and placed at most six per frame. Main-thread placement rules are only created when there is no worker.

The opening frame no longer draws people, animals or a dissolving tile, so their shader programs would first link a few seconds in, stalling a frame (about a second in software GL under load). Before the first frame the page draws each of those materials once as a single degenerate point, which links them; three.js's `compileAsync` would do this off the main thread, but only where the parallel shader compile extension exists, and the software GL used for measurement has none. The uniform upload per land draw is also skipped when the draw binds the same maps as the previous one.

### D5. Load time, not bytes
`tools/load-time.ts` serves a build, throttles the network (9 Mbps down, 1.5 Mbps up, 170 ms round trip) and the phone CPU (4x), and reads first paint, first contentful paint and the first frame of the sea from the page's own clocks over several cold loads. Given two builds it alternates loads between them, so a busy machine weighs on both alike, and fails when a median grows by a second or more. Playwright is already the browser tool here; Lighthouse would add a large dependency for the same paint timings.

## Risks / Trade-offs

- [Object triangles on phones] → per-tier caps per tile, half on far tiles, and a smoke check on object triangles per tier.
- [Stream step cost from bigger tiles] → measured in smoke throughput (p99 and percent over 3 ms) and by frame cost.
- [Worker bundle grows with three.js geometry] → measured by the load-time check; bytes are not capped.
- [Shapes from library primitives cost a few more triangles than hand-made fans (houses 40 against about 14)] → accepted for maintained code; counted in the triangle budget.

## Migration Plan

Additive. Rollback is a revert of the change. No persisted data changes.

## Open Questions

None.
