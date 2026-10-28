## Why

The sky changes only between clear, hazy and overcast, and the sea is the same calm mirror in every one of them. A long ocean crossing should pass through real weather: rain squalls, storms with distant lightning, fog banks, vivid sunsets and sunrises, and seas that build from glassy swells to rough water with whitecaps, then settle again.

## What Changes

- **Weather**: six states (clear, hazy, overcast, rain, storm, fog) on a seeded, region-biased track that holds each state for minutes and moves between neighbouring states over at least a minute, never a pop. The opening stays clear.
- **Sky**: storms darken the sky and light; sunsets and sunrises glow warm when the cloud allows it and go grey under overcast; fog banks thicken the sea fog; distant lightning brightens the sky softly, never as a rapid full-screen flash, and not at all under reduced motion.
- **Sea state**: one sea level, 0 (glassy) to 1 (rough), follows the wind with a lag of minutes, plus long swells that arrive in fair weather. The shared swell gains long, wind-driven waves; the water surface is displaced by the same waves near the camera, lit by their slope out to the horizon, and breaks into whitecaps on the crests in rough seas.
- **Riders**: ships, the whale near the surface and the wake follow the same surface.
- **Particles**: rain streaks and wind-blown spray, drawn on the GPU around the camera, fewer on `low`.
- **Sound**: a rain bed made in the browser (no new file or origin), wind and open-sea beds that rise with the weather.
- **No caps**: the gzip size assertion of `tools/budget.ts` becomes a report; load time (first paint, measured with Lighthouse) is the bar.

## Capabilities

### New Capabilities
- `weather`: weather states, scheduling, sky and light effects, precipitation, lightning, sound.
- `sea-state`: sea level over time, waves, whitecaps and spray, and what rides the surface.

### Modified Capabilities
None (the earlier weather requirement lives in the unarchived `add-ocean-migration` change; this change supersedes its three states).

## Impact

`src/weather.ts`, `src/sky.ts`, `src/swell.ts`, `src/ocean.ts`, `src/wake.ts`, `src/ship-fx.ts`, `src/audio.ts`, `src/audio-mix.ts`, `src/main.ts`, a new `src/weather-fx.ts`, tests and `tools/`. No change to land, routing or the whale's own modules: the whale rides the surface through its group's height, set in `main.ts`.
