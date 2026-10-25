import { hash } from './rng.js';
import { makeNoise2D, fbm2, ridged2 } from './noise.js';
import { smoothstep } from './math.js';

/**
 * Seafloor relief under the land field: the coast and the first metres of the
 * shelf are the land's own heights; deeper down the floor gains ridges, sandy
 * swales and rock outcrops. Open-ocean depths are eased toward ABYSS so the
 * floor stays within sight of a diving whale.
 */

/** Relief starts below this much water... */
export const RELIEF_START = 6;
/** ...and is at full strength from this depth. */
export const RELIEF_FULL = 20;
/** Land depths beyond SOFT_DEPTH ease asymptotically toward this. */
export const ABYSS = 32;
export const SOFT_DEPTH = 16;
/** Numeric salt: string salts all hash alike (see rng.ts). */
const SALT = 0x5346;

export type Seafloor = {
  /** Ground height at world X/Z (negative under water). */
  heightAt: (x: number, z: number) => number;
};

/** Eases depths past SOFT_DEPTH toward ABYSS; C1 at the join, monotonic, identity above it. */
export function softDepth(h: number): number {
  if (h >= -SOFT_DEPTH) return h;
  const span = ABYSS - SOFT_DEPTH;
  return -SOFT_DEPTH - span * (1 - Math.exp((h + SOFT_DEPTH) / span));
}

export function createSeafloor(seed: number, land: { heightAt: (x: number, z: number, lod?: number) => number }): Seafloor {
  const s = hash(seed, SALT);
  const ridgeNoise = makeNoise2D(s, 1);
  const outcropNoise = makeNoise2D(s, 2);
  const swaleNoise = makeNoise2D(s, 3);
  const warpNoise = makeNoise2D(s, 4);

  return {
    heightAt(x, z) {
      const base = land.heightAt(x, z);
      const depth = -base;
      if (!(depth > RELIEF_START)) return base;
      const w = smoothstep(RELIEF_START, RELIEF_FULL, depth);
      // Warped ridges run in long, uneven lines, like drowned dunes and reef spurs.
      const wx = x + 40 * warpNoise(x / 300, z / 300);
      const wz = z + 40 * warpNoise(z / 300 + 9.1, x / 300 - 4.7);
      const ridges = ridged2(ridgeNoise, wx / 140, wz / 140, 3) * 9;
      // Rock outcrops: sparse, steep-sided knolls.
      const knoll = smoothstep(0.35, 0.75, fbm2(outcropNoise, x / 60, z / 60, 3)) * 6;
      const swale = fbm2(swaleNoise, x / 45, z / 45, 2) * 1.4;
      // Never shallower than RELIEF_START - 1, so relief cannot breach the shelf.
      const lift = Math.min((ridges + knoll + swale) * w, Math.max(0, depth - RELIEF_START) * 0.7);
      return softDepth(base) + lift;
    },
  };
}
