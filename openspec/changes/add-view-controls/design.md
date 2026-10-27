## Context

The follow camera (`FollowCamera`) places the eye with springs and keeps it clear of the whale, the land, the sea floor and the waterline band, and follows the whale under on a dive. Any user view has to keep those guards.

## Decisions

- **OrbitControls drives a proxy camera, not the real one.** The controls own the input: pointer, touch, pinch, wheel, damping and the angle and distance limits. Each frame the proxy's azimuth, polar angle and distance are read and handed to the follow camera as an orbit view, which places the real eye with its existing guards (whale clearance, ground and floor clearance, waterline band, dives). Moving the controls' target along with the whale directly would bypass those guards.
- **Angle relative to the whale's heading.** The orbit azimuth is measured from "behind the whale" in the frame of its smoothed heading. A side view stays a side view as the whale curves along its route; a world-fixed angle would swing the whale through the frame on every turn of a long journey.
- **Look at the whale.** In the orbit view the camera looks at the whale itself, not ahead along the heading, so every angle (including from the front) frames it.
- **Default and reset.** Until the first drag, wheel, pinch or key, the follow camera is unchanged. The first input starts the orbit from the current eye, so there is no jump; the switch blends in about a second. Reset returns to the follow camera with the same blend and restores the controls' starting state.
- **Limits.** Distance 10 to 60 m (the whale is about 12 m long). Pitch from 0.02 rad above the horizon to about 75 degrees down. Pan is off.
- **Reduced motion.** No damping and no blend: the view moves only while the user moves it. There is no auto-rotation.
- **Speed.** A pace factor (slow 0.6, normal 1, fast 1.5) multiplies the travel speed goal inside the whale mover, so position, reported speed, wake, swell, audio and the camera's speed response all see the same real speed. Feeding moves are unchanged. Fast tops out at 42 m/s.
- **Not persisted.** The orbit view is per visit; the speed is saved with the other settings.

## Risks

- Very low views over steep land are raised by the ground guard, so the pitch the user asked for is not always reached; that is intended.
