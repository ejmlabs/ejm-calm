## 1. Frame

- [x] 1.1 `src/tone.ts`: three's ACES fit on the CPU and its exact inverse (CPU and GLSL), `displayExposure`, `drawAsAuthored`, `DRAW_AS_AUTHORED_GLSL`; the underwater view's tone code moves here
- [x] 1.2 `src/finish.ts`: probe, bloom from a display brightness, grade
- [x] 1.3 `src/main.ts`: renderer with the half-float output and antialiasing where supported, the exposure each frame, `stats().finish`

## 2. Materials

- [x] 2.1 Land and walkers, wakes, ship foam and lamps, stars, rain and spray, the whale's splash, underwater rays and waterline: converted; no `toneMapped: false` left
- [x] 2.2 Water: constant reflection gain, haze in scene light, glitter, shallows, storm foam
- [x] 2.3 Land: palette, sky-hued shade, sun-coloured light, a stronger key, softer cliff bands
- [x] 2.4 Land tiles dissolve by coverage on the multisampled target

## 3. Checks

- [x] 3.1 `tests/tone.test.ts`: exact inverse, finite white, the shader writes the same curve, no material opts out
- [x] 3.2 `tools/smoke.ts`: the finish is on at the desktop profile
- [x] 3.3 Shots refreshed and reviewed at desktop and mobile, by day, dusk, night, storm, breach and under water
- [ ] 3.4 Frame time of the finish on a real phone and desktop GPU (software GL only here)
