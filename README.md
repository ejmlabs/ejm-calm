# ejm-calm

A calm, beautiful, seeded ocean scene from **ejmlabs, an open source lab**.
A whale swims on a long migration through open ocean, past rocks and islets, under a slow
day of changing light and weather; it breathes and breaches, sailboats drift, and hazy coastlines
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

Reduced-motion preferences keep the camera still aside from your own drag, with no field-of-view lift or lean at speed, half the cloud drift and a slower day.
Settings and the last seed are remembered in localStorage when available.

## Seeds

Open `?seed=42` for that sea. Seeds are decimal integers from `0` to
`4294967295`. The resolved seed is always written into the URL.

## Run locally

Use a current Node.js release. Dependencies are already locked; do not add new
ones without checking disk space. For day-to-day work, `npm run dev` starts the
Vite development server on <http://127.0.0.1:8080>. `npm run serve` typechecks,
runs `vite build`, then previews `dist/` on loopback (choose another port with
`npm run serve -- 8081`). The browser needs WebGL 2.

`npm run typecheck` runs `tsc --noEmit`. `npm run build` typechecks then
produces `dist/` via Vite. `npm test` runs unit tests with Vitest. `npm run
test:browser` builds then checks desktop and mobile rendering. `npm run shots`
builds then captures desktop (1440×900) and mobile (390×844 @3x) screenshots
in `shots/` for seeds `42`, `7`, and `1234`, plus a mid-breach frame. Browser
checks use Playwright Core and the system Chrome executable.

`npm run budget` builds, then checks the gzipped JavaScript against the size
before the ocean migration began plus its 25 KB allowance. `npx tsx tools/long-journey.ts 2 42 7` swims
two hours headless on seeds 42 and 7 and reports stalls and heap; `npx tsx tools/frame-cost.ts`
times what the journey's feel adds per frame in Node; `npx tsx tools/feel-shots.ts <dir>` captures
the regions, times of day, weather and indicator (after a build).

Review hooks (`window.__calmReview`) are available only with `?debug=1`, among them
`setDay`, `setWeather`, `setRoute` and `jumpTo`.

## Static deployment

`npm run build` emits `dist/` (`index.html`, hashed `assets/*`, `LICENSE`,
`THIRD_PARTY_NOTICES`, and `public/_headers`). Cloudflare
Pages-style `_headers` sets CSP, framing, sniffing, referrer, and immutable
caching for `/assets/*`. `wrangler.jsonc` serves `dist/` as static assets at
calm.ejmlabs.com.

Serve the `dist/` tree as produced. No server functions, external assets,
import maps, or runtime package resolution are required.

## License

MIT © ejmlabs. See `LICENSE` and `THIRD_PARTY_NOTICES` for three.js and
simplex-noise.

The whale-tail mark (favicon, touch icon and the mark above the title) is the
ejmlabs ejm-calm logo, drawn in the ejm-ui palette. No wordmark or font is shipped.
