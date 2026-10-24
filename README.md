# fly

A small ship, an endless universe, and a little room to breathe. A quiet,
procedurally generated space voyage from **ejmlabs, an open source lab**.
Everything is generated locally. No accounts, tracking, analytics, or runtime
network requests beyond this site's static files.

Press **Begin** to fly. Autopilot chooses a gentle course past planets,
nebulae, asteroid fields, and distant galaxies. Sound starts only when enabled.
Reduced-motion preferences start the voyage paused; press Resume when ready.

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

Use a current Node.js release and run `npm run serve`, then open
<http://127.0.0.1:8080>. Choose another port with `npm run serve -- 8081`.
There is no bundler or build step. The browser needs WebGL 2.

`npm test` checks pure generation, flight, storage, seeds, and quality logic.
`npm run test:browser` checks desktop and mobile rendering and controls.
`npm run shots` captures desktop and mobile views in `shots/`, including a
390×844 mobile viewport at DPR 3. Browser checks use the already installed
browser automation dependency and the system browser executable; the browser may
need permission to run outside a restricted environment.

The full capture includes the about panel, a one-minute flight, both alternate
regions, every planet surface, and the three rare events. `npm run shots -- --quick`
captures only the short reference views. Local review URLs accept
`?seed=42&debug=1&debugRegion=ember` (or `hollow`), `debugPlanet=ice`, and
`debugEvent=comet` (or `binary` / `pulsar`). Review flags are ignored on public hosts.

## Static deployment

Serve `index.html`, `styles.css`, `src/`, and `vendor/three/` together, preserving
relative paths. Include `LICENSE` and `THIRD_PARTY_NOTICES`. No server functions,
external assets, import maps, or runtime package resolution are required. The
same files work from a domain root or a static project subdirectory. Serve
JavaScript as `text/javascript` and retain the page's content security policy.
The preview server listens only on loopback, blocks directory traversal and
hidden files, and supplies security headers.

Rendering caps device pixel ratio and adapts resolution to sustained frame cost.
Phones render at 30 frames per second with simpler geometry and cloud layers.
Hidden pages stop rendering; a paused, settled view has no animation loop.
World cells stream within a per-frame work budget and are released on departure.

## License and credit

[MIT](LICENSE), copyright (c) 2026 ejmlabs. Inspired by
[fly-with-me by Kun Chen (MIT)](https://github.com/kunchenguid/fly-with-me).
The implementation is original; no reference source code was copied.
See [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES) for the rendering library's license.
