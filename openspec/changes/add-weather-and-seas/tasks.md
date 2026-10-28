## 1. Weather and sea schedule

- [x] 1.1 `weather.ts`: six states, severity, fog and swell tracks, region bias, sea level lag, lightning events; review `set` snaps (knots every 200 to 360 s by seed, held 30 percent each side; walk up 0.28, down 0.42 a knot; sea follows at 1/150 a second; flashes at most one per 6 s cell and never in the cell after one)
- [x] 1.2 Tests: determinism, opening clear, smoothness, every state occurs, polar rougher, flash spacing and strength (`tests/weather.test.ts`)

## 2. Sky

- [x] 2.1 Storm darkening, fog banks, sunset and sunrise glow by cloud, lightning light, wind angle shared (the sky shader gains `skyDim` and `skyGrey`; land and water darken through `sky.level`)

## 3. Sea

- [x] 3.1 `swell.ts`: wind waves by sea level; calm end unchanged; tests
- [x] 3.2 `ocean.ts`: polar grid, displacement, slope lighting, whitecaps, ripples by wind (rough water also pinches crests in the vertex shader only, and fades its mirror toward the haze)
- [x] 3.3 Whale, wake and ship wakes ride the surface (the whale through its group's height in `main.ts`)

## 4. Particles and sound

- [x] 4.1 `weather-fx.ts`: rain streaks and spray, tiered, hidden at zero
- [x] 4.2 Rain bed, wind and sea gains; tests

## 5. Measure and review

- [x] 5.1 `tools/budget.ts` reports without a cap; Lighthouse before and after; frame cost
- [x] 5.2 Debug hooks and screenshots of every state, sunset, calm and rough, rain at night, storm and fog on desktop and phone
