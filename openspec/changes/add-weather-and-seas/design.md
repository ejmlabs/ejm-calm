## Context

Weather was three states drawn per 300 s slot and eased over 90 s (`weather.ts`); the sky is three.js `Sky` with its clouds; the water is three.js `Water` on a flat 20 km plane; ships ride `swellAt` (three calm sines); the whale and its wake sit on y = 0.

## Decisions

### A severity track, not independent draws
Weather comes from one seeded severity value per knot, knots every 200 to 360 s (by seed). Between knots the value holds for the first and last 30 percent and eases across the middle 40 percent (80 to 144 s). Severity maps onto the ladder clear (0), hazy, overcast, rain, storm (1), so the weather only ever moves between neighbours and every change is gradual. Regions add a bias (polar +0.12, temperate +0.04, deep blue 0, tropical -0.06). Fog is a second track with its own knots: a bank when its value is high, thinned by wind. A third track sets distant swell. Knot 0 of every track is calm, so the opening is clear. Everything is a pure function of seed, clock and weights, which makes it testable without stepping; only the sea level is integrated (it lags the wind at 1/150 per second) and the review hook can snap it.

Alternatives: a Markov chain over slots would need the history of region weights to be reproducible; independent draws (the old way) jump from clear to storm.

### Waves: fixed components, varying amplitude
Changing a wavelength while the clock runs shifts the phase everywhere, so wave components are fixed and only their amplitudes move with the sea level. Three calm waves (as before, 1.0 to 1.5 times their height as the sea rises) and five wind waves of 12 to 110 m whose height grows as level^1.5, up to about 2 m crest height together. Wind waves are oriented around the seed's wind direction (the same angle that drives the clouds and the rain's slant). Phases are reduced modulo 2 pi on the CPU in double precision from world coordinates and the swell clock, so the GPU only sees render-space offsets.

### Water surface
The water keeps three.js `Water` (reflections, sun glint, its shader patches). Its plane becomes a polar grid around the camera, fine near the eye (decimetres) and coarse toward the 10 km edge, and the vertex shader adds the wave height, fading to flat by 3 km. The fragment shader tilts the ripple normal by the analytic wave slope (fading short waves with distance so they do not alias) and paints whitecaps where the crest height is high and the sea rough, broken up by the ripple noise. Near the camera the height is capped below the eye. Ripples grow with the wind.

Alternative: three.js `Water2` (flow maps) or an FFT ocean. `Water2` changes the look of the calm end the captain already approved; an FFT ocean needs float render targets and compute passes that cost phones more than eight sines. Postprocessing is not used.

### Particles
`weather-fx.ts`: rain is one `LineSegments` of streaks placed in the vertex shader from a per-drop seed and a drift offset, wrapped in a box around the camera; the drift is integrated on the CPU each frame (velocity times the frame's time, reduced into the box), so a change of wind changes how the rain moves, never where it is; spray is one `Points` that drifts downwind just above the crests, using the same wave function as the water, its puffs capped in size near the camera. Counts by tier (rain 1500 / 4000 / 7000, spray 250 / 600 / 1000). Both sit on layer 1, so the water's mirror does not draw them.

### Lightning
A flash is a deterministic event: each 6 s cell may hold one flash at a seeded offset, with probability proportional to the storm's share. The envelope rises over 0.15 s and decays over about a second; it lifts the hemisphere and ambient light and the sky's exposure by at most 35 percent. Reduced motion freezes the clock and turns flashes off.

### Sound
The rain bed is a two-second noise buffer generated in the browser, high-passed, looped through the existing above-water bus. Wind and the open-sea bed are scaled by pure gain functions in `audio-mix.ts`.

### Measurement
Load: Lighthouse (maintained, run from a scratch install) mobile and desktop presets, three runs each, before and after. Frame cost: `tools/frame-cost.ts` with weather, sea and wave sampling added.

## Risks

- The whale is lifted by its group's height in `main.ts` so the whale's own modules are untouched; at depth the lift fades out.
- The underwater view's surface stays flat, and the underwater fog switches on the camera's height against y = 0; from below, rough seas are only seen in the light, and a whale lifted on a crest can cross the flat plane. A later step should use the local surface height there.
- The water shader fades each wave out with distance from the camera and pinches crests sideways, while ships and the wake ride the plain `swellAt` height; in a rough sea, distant ships can heave against flat drawn water, and wake ribbons can be hidden in places on steep crests. A later step should serve the shader and the riders from one faded wave function.
