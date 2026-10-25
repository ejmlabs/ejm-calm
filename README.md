# fly

A small ship, an endless universe, and a little room to breathe. A quiet,
procedurally generated space voyage from **ejmlabs, an open source lab**.
Everything is generated locally. No accounts, tracking, analytics, or runtime
network requests beyond this site's static files.

Press **Begin** to fly. Autopilot chooses a gentle course through seeded star
systems: blackbody-lit planets with atmospheres and rings, volumetric nebulae,
asteroid fields, distant galaxies, and the occasional comet. Sound starts only
when enabled. Reduced-motion preferences start the voyage paused; press Resume
when ready.

Each `?seed=` value rebuilds the same infinite cell stream: spectral-class
stars, near-coplanar orbits, worker-baked surfaces, and HDR lighting that
adapts as you travel.

## Controls

- Left drag: orbit the camera. The framing stays where you leave it.
- Right drag, Shift-drag, or one-finger drag: steer. Arrow keys also steer;
  autopilot gradually takes over after you let go.
- Wheel or two-finger pinch: zoom.
- Pause or Space: stop flight and sound together.
- Sound and volume: a softly synthesized ambient pad; volume starts at half.
- Share: copy this universe's link. About: project information and credits.

The controls fade after a few quiet seconds and return on interaction.
Sound settings, camera framing, and flight state are remembered in localStorage.
The experience also works when browser storage is unavailable.

## Universes

Open `?seed=42` to start that universe. Seeds are decimal integers from `0` to
`4294967295`. The resolved seed is always written into the URL. An explicit
seed starts a fresh flight; opening without one resumes the saved voyage.
Each three-dimensional cell has independent deterministic random streams,
so visiting cells in a different order produces the same world.

## Run locally

Use a current Node.js release. Install with `npm install`. For day-to-day work,
`npm run dev` starts the Vite development server on <http://127.0.0.1:8080>.
`npm run serve` typechecks, runs `vite build`, then previews `dist/` on loopback
(choose another port with `npm run serve -- 8081`). The browser needs WebGL 2.

TypeScript sources live under `src/` and import `three` and `simplex-noise` from
npm. `npm run typecheck` runs `tsc --noEmit`; `npm run build` typechecks then
produces `dist/` via Vite.

`npm test` runs unit tests with Vitest (generation, flight, storage, seeds,
quality, and related pure modules). `npm run test:browser` builds then checks
desktop and mobile rendering and controls. `npm run shots` builds then captures
desktop and mobile views in `shots/`, including a 390×844 mobile viewport at
DPR 3. Browser checks use Playwright Core and the system browser executable;
the browser may need permission to run outside a restricted environment.

The full capture waits for surface bakes and exposure, then writes hero frames
for seeds `42`, `7`, `1234`, and `98765` at desktop 1440×900 and mobile
390×844 DPR 3 (`shots/desktop-seedN.png`, `shots/mobile-seedN.png`), plus
`shots/desktop-ring.png` and `shots/desktop-nebula.png`. `shots/desktop.png`
and `shots/mobile.png` remain the seed-42 heroes. It also covers the about
panel, a one-minute flight, both alternate regions, every planet surface, and
the three rare events. `npm run shots -- --quick` captures only the short
reference views. Local review URLs accept `?seed=42&debug=1&debugRegion=ember`
(or `hollow`), `debugPlanet=ice`, and `debugEvent=comet` (or `binary` /
`pulsar`). Review flags are ignored on public hosts.

## Static deployment

`npm run build` typechecks, then Vite emits `dist/` (`index.html`, hashed
`assets/*`, `LICENSE`, `THIRD_PARTY_NOTICES`, and `public/_headers`). Cloudflare
Pages-style `_headers` sets CSP, framing, sniffing, referrer, and immutable
caching for `/assets/*`. `wrangler.jsonc` serves `dist/` as static assets at
fly.ejmlabs.com.

Serve the `dist/` tree as produced: `index.html`, `assets/`, `LICENSE`, and
`THIRD_PARTY_NOTICES` (plus `styles.css` if present). No server functions,
external assets, import maps, or runtime package resolution are required. The
same files work from a domain root or a static project subdirectory. Serve
JavaScript as `text/javascript` and retain the page's content security policy.
Recommend host response headers for `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, and a strict referrer policy, since meta CSP cannot set framing rules.
The preview server listens only on loopback, serves an allowlisted Vite output
tree, and supplies security headers.

Rendering caps device pixel ratio and adapts resolution to sustained frame cost.
Phones render at 30 frames per second with simpler geometry and cloud layers.
Hidden pages stop rendering; a paused, settled view has no animation loop.
World cells stream within a per-frame work budget and are released on departure.

## License and credit

[MIT](LICENSE), copyright (c) 2026 ejmlabs. Inspired by
[fly-with-me by Kun Chen (MIT)](https://github.com/kunchenguid/fly-with-me).
The implementation is original; no reference source code was copied.
See [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES) for the rendering library's license.
