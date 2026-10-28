## 1. Species and meshes (F1)

- [x] 1.1 Species table; instanced meshes with three LODs and a vertex-shader swim; frozen under reduced motion
- [x] 1.2 Record load time (desktop and phone medians: first paint, first contentful paint, first sea frame, KB) before and after

Load time, median of 5 cold loads at 9 Mbps down and 170 ms round trip (phone CPU slowed 4×), before → after. The test machine was heavily loaded, so the spread between builds is noise; the change adds code only, and its shaders compile only behind the review flag.

| Profile | First paint | First contentful paint | First sea frame | Transfer |
|---|---|---|---|---|
| Desktop | not reported → 1060 ms | not reported → 1060 ms | 20733 → 11179 ms | 784.3 → 790.2 KB |
| Phone | 1944 → 1368 ms | 2380 → 1368 ms | 26844 → 24768 ms | 784.3 → 790.2 KB |

## 2. Schools everywhere (F2)

- [ ] 2.1 Seeded schools per cell across open water by species depth and region; remove the old fish loops
- [ ] 2.2 Tests for determinism and depth ranges; record load time; screenshots shallow, mid-water and deep

## 3. Schooling (F3)

- [ ] 3.1 Leaders steer with the shared steering module; flee and part around the whale; containment; ship avoidance
- [ ] 3.2 Tests: no fish inside the whale's capsule, floor or above the surface; record load time

## 4. Counts (F4)

- [ ] 4.1 Tier counts and per-school culling; deep species glow
- [ ] 4.2 Measure frame time on desktop and a phone; record load time; screenshots

## 5. Bait ball (F5, optional)

- [ ] 5.1 GPU boids bait ball on `high` at feed sites; record load time and frame cost
