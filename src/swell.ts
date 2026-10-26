/**
 * One gentle swell shared by everything that floats. The water plane itself stays flat; this is the motion
 * field ships (and later wakes and shore foam) ride, so they all agree on where the sea is.
 */
export type SwellWave = { wavelength: number; amplitude: number; heading: number; speed: number };

/** Wavelengths 40, 17 and 9 m, amplitudes 0.18, 0.07 and 0.03 m: calm enough to match the mirror-like water. */
export const SWELL_WAVES: readonly SwellWave[] = [
  { wavelength: 40, amplitude: 0.18, heading: 0.35, speed: 2.5 },
  { wavelength: 17, amplitude: 0.07, heading: 1.2, speed: 1.6 },
  { wavelength: 9, amplitude: 0.03, heading: 2.3, speed: 1.1 },
];

/** Largest height the swell can reach, either way. */
export const SWELL_MAX = SWELL_WAVES.reduce((sum, wave) => sum + wave.amplitude, 0);

export type SwellSample = { height: number; slopeX: number; slopeZ: number };

/** Surface height (m) and slope (dh/dx, dh/dz) at world (x, z) and time `t` seconds. Writes into `out` when given. */
export function swellAt(x: number, z: number, t: number, out: SwellSample = { height: 0, slopeX: 0, slopeZ: 0 }): SwellSample {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  for (const wave of SWELL_WAVES) {
    const k = (Math.PI * 2) / wave.wavelength;
    const dx = Math.cos(wave.heading);
    const dz = Math.sin(wave.heading);
    const phase = k * (x * dx + z * dz) - k * wave.speed * t;
    height += wave.amplitude * Math.sin(phase);
    const slope = wave.amplitude * k * Math.cos(phase);
    slopeX += slope * dx;
    slopeZ += slope * dz;
  }
  out.height = height;
  out.slopeX = slopeX;
  out.slopeZ = slopeZ;
  return out;
}
