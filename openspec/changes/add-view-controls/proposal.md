## Why

Viewers want to look at the whale from any side, get closer or further away, and choose how fast the journey goes. Today a drag only peeks a little around the chase view and springs back, the wheel zooms a narrow range, and the whale's speed is fixed.

## What Changes

- **Orbit**: drag (mouse or one finger) turns the view a full 360 degrees around the whale; the pitch is limited so the view never goes under the sea floor or flips over the top. Built on three.js `OrbitControls`.
- **Zoom**: wheel or pinch moves between 10 m and 60 m from the whale.
- **Follow**: the view keeps following the travelling whale and keeps the chosen angle relative to its heading; the existing follow camera stays the default and a "reset view" control returns to it.
- **Keyboard**: arrow keys orbit, `+` and `-` zoom, `0` resets, while the scene has focus.
- **Speed**: a slow, normal, fast choice in the about panel scales the whale's travel speed (0.6, 1 and 1.5 times); saved with the other settings.

## Capabilities

### New Capabilities
- `view-controls`: user orbit, zoom, reset and the travel speed setting.

## Impact

`src/view-controls.ts` (new), `src/pace.ts` (new), `src/camera.ts` (orbit pose), `src/whale-behavior.ts` and `src/whale.ts` (speed scale), `src/main.ts`, `src/ui.ts`, `src/persistence.ts`, `index.html`, `styles.css`, tests.
