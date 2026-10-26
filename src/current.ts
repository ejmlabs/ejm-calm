import { makeNoise2D } from './noise.js';

/** Metres per cell of the stream-function noise: eddies are a few of these across. */
export const CURRENT_SCALE = 200000;
/** Strength of the eddies against the steady flow along the base heading (0.5 bends it by at most 30°). */
export const CURRENT_EDDY = 0.5;

/** Seeded flow field: a steady flow along `baseHeading` plus the curl of slow noise, as a heading at any point. */
export function createCurrent(seed: number, baseHeading: number): (x: number, z: number) => number {
  const noise = makeNoise2D(seed, 29);
  const e = CURRENT_SCALE / 64;
  const fx = -Math.cos(baseHeading);
  const fz = Math.sin(baseHeading);
  return (x, z) => {
    const psi = (px: number, pz: number) => noise(px / CURRENT_SCALE, pz / CURRENT_SCALE);
    // Curl of the stream function, in units of "one noise cell per metre", roughly within ±1.
    const u = ((psi(x, z + e) - psi(x, z - e)) / (2 * e)) * CURRENT_SCALE * 0.3;
    const w = (-(psi(x + e, z) - psi(x - e, z)) / (2 * e)) * CURRENT_SCALE * 0.3;
    const m = Math.max(1, Math.hypot(u, w));
    const vx = fx + (CURRENT_EDDY * u) / m;
    const vz = fz + (CURRENT_EDDY * w) / m;
    // Heading of the flow vector (the whale's forward is (−cos h, sin h)); the steady part keeps it near the base.
    const h = Math.atan2(vz, -vx);
    return baseHeading + Math.atan2(Math.sin(h - baseHeading), Math.cos(h - baseHeading));
  };
}
