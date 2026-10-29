# ejm-calm

A calm, beautiful, seeded ocean scene from **ejmlabs, an open source lab**.
A whale swims on a long migration across open ocean between continents, past islands and archipelagos, under a slow
day of changing light and weather, with stars at night; it breathes and breaches, sailboats drift, and hazy coastlines
come and go. Everything is generated locally from one number. No accounts, tracking,
analytics, or runtime network requests beyond this site's static files.

Open it on a phone and leave it beside you. Drag to look around; the camera
eases back to a slow cinematic drift.

Each `?seed=` value rebuilds the same sea: where the day begins, the whale's route and
behaviour, the regions it crosses, ship placement, and the coasts, islets and mountains. Sound is optional and off by default.

## Controls

- Drag: look around. The view eases back after you let go.
- New seed: open another sea.
- Share: copy a link to this exact seed.
- Sound: soft procedural ocean ambience (starts only when enabled).
- About: project information, the current seed, and a switch for the route indicator.
- Route indicator (off by default, remembered): the region's name and the distance swum, shown for six
  seconds whenever the whale enters a new region.

Reduced-motion preferences keep the camera still aside from your own drag, and freeze the sea: the whale, clouds and day stand still, with no field-of-view lift or lean. (The code also halves the cloud drift and slows the day, for any use that is not frozen.)
Settings and the last seed are remembered in localStorage when available.

## Seeds

Open `?seed=42` for that sea. Seeds are decimal integers from `0` to
`4294967295`. The resolved seed is always written into the URL.

## Run locally

Use a current Node.js release. Dependencies are locked in `package-lock.json`. For day-to-day work, `npm run dev` starts the
Vite development server on <http://127.0.0.1:8080>. `npm run serve` typechecks,
runs `vite build`, then previews `dist/` on loopback (choose another port with
`npm run serve -- 8081`). The browser needs WebGL 2.

`npm run typecheck` runs `tsc --noEmit`. `npm run build` typechecks then
produces `dist/` via Vite. `npm test` runs unit tests with Vitest. `npm run
test:browser` builds then checks desktop and mobile rendering. `npm run shots`
builds then captures desktop (1440×900) and mobile (390×844 @3x) screenshots
in `shots/` for seeds `42`, `7`, and `1234`, plus a mid-breach frame. Browser
checks use Playwright Core and the system Chrome executable.

The test reliability workflow runs the unit suite twice on pull requests, main,
and daily. It reports identifiable tests that pass in one run and fail in the
other, even when other evidence is incomplete. It preserves available reports
and fails if either run fails or the evidence is incomplete. Run it locally with
`node tools/flaky.mjs`; it prints the evidence directory.

`npx tsx tools/long-journey.ts 2 42 7` swims
two hours headless on seeds 42 and 7 and reports stalls and heap; `npx tsx tools/seed-sweep.ts 1 50 60` swims an hour on each of seeds 1 to 50 (or a list: `42,7,1234 -`) and fails any under 0.5 net over path or with ten minutes under 2 km (it also reports the seeds that dip under 1.5 km in five, how much of the hour a natural coast is within 6 km and the longest open stretch); `npx tsx tools/world-map.ts 42 map.png` draws a seed's world from above (land, regions, the migration lane, optionally the whale's track); `npx tsx tools/frame-cost.ts`
times what the journey's feel adds per frame in Node; `npx tsx tools/feel-shots.ts <dir>` captures
the regions, times of day, weather and indicator, `npx tsx tools/land-shots.ts <dir>` the land by day,
dusk and night, the highest range in sight, and a close coast with a town and a herd, and
`npx tsx tools/world-shots.ts <dir>` the open ocean, a continent's coast and an archipelago along the migration (after a build).

There is no byte cap: load time is the size bar. `npx tsx tools/load-time.ts <base dist> <new dist>` times
first paint, first contentful paint and the first frame of the sea (the page's `calm-first-frame` mark) over
cold loads, gzipped, on a throttled normal connection (9 Mbps, 170 ms; phones also at a 4x slower CPU), each
in a fresh browser and alternating between the builds, and fails if the new build adds a second or more.

Review hooks (`window.__calmReview`) are available only with `?debug=1`, among them
`setDay`, `setWeather` (clear, hazy, overcast, rain, storm, fog), `setSea`
(0 glassy to 1 rough, or null to follow the weather), `setRoute`, `jumpTo`, `life` (towns and herds nearby),
`peak` (the highest land in a ring) and `view` (a fixed review camera).

## Static deployment

`npm run build` emits `dist/` (`index.html`, `404.html`, hashed `assets/*`, the
icons, `LICENSE`, `THIRD_PARTY_NOTICES`, and `public/_headers`). Cloudflare
Pages-style `_headers` sets CSP, framing, sniffing, referrer, and immutable
caching for `/assets/*`. `wrangler.jsonc` serves `dist/` as static assets at
calm.ejmlabs.com, with `404.html` for missing paths.

Serve the `dist/` tree as produced. No server functions, external assets,
import maps, or runtime package resolution are required.

## License

MIT © ejmlabs. See `LICENSE` and `THIRD_PARTY_NOTICES` for three.js and
simplex-noise.

The whale-tail mark (favicon, touch icon and the mark above the title) is the
ejmlabs ejm-calm logo, drawn in the ejm-ui palette. No wordmark or font is shipped.
