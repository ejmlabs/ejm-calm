# calm

A calm, beautiful, seeded ocean scene from **ejmlabs, an open source lab**.
A whale surfaces and breaches, sailboats drift, and long hazy coastlines run to the horizon.
Everything is generated locally from one number. No accounts, tracking,
analytics, or runtime network requests beyond this site's static files.

Open it on a phone and leave it beside you. Drag to look around; the camera
eases back to a slow cinematic drift.

Each `?seed=` value rebuilds the same sea: time of day, whale behaviour, ship
placement, and the continents, coasts and mountains. Sound is optional and off by default.

## Controls

- Drag: look around. The view eases back after you let go.
- New seed: open another sea.
- Share: copy a link to this exact seed.
- Sound: soft procedural ocean ambience (starts only when enabled).
- About: project information and the current seed.

Reduced-motion preferences keep the camera still aside from your own drag.
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

Review hooks (`window.__calmReview`) are available only with `?debug=1`.

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
