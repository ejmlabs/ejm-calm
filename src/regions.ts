import { makeNoise2D } from './noise.js';
import { hash } from './rng.js';
import { smoothstep } from './math.js';

/** Side of a region cell in metres. */
export const REGION_CELL = 40000;
/** Width over which a border between two regions blends. */
export const REGION_BLEND = 5000;
/** Region cells are bent by up to this much, so borders are not a square grid. */
const WARP = 5000;
const WARP_SCALE = 30000;
/** The start keeps its own look: no warp (and a temperate cell) within this distance, full warp beyond three times it. */
const HOME = 6000;

export type RegionId = 0 | 1 | 2 | 3;
export type RegionWeights = [number, number, number, number];

/** Everything a region changes. Colours are sRGB hex; factors are multipliers of the scene's own value. */
export type RegionLook = {
  name: string;
  /** Subtracted from the land mask: how much land the region thins to. */
  landOffset: number;
  /** Multiplies the offshore islet lift. */
  isletGain: number;
  water: number;
  /** Fog colour is pulled this far toward `fog`. */
  fog: number;
  fogMix: number;
  fogDensity: number;
  hazeDensity: number;
  /** Multiplies the land's vertex colours. */
  land: [number, number, number];
  /** Share of gulls, terns, albatrosses. */
  birds: [number, number, number];
  ships: number;
};

export const REGION_LOOKS: readonly RegionLook[] = [
  { name: 'Temperate', landOffset: 0.5, isletGain: 1, water: 0x1a4e68, fog: 0x163e54, fogMix: 0, fogDensity: 1, hazeDensity: 1, land: [1, 1, 1], birds: [0.5, 0.35, 0.15], ships: 0.6 },
  { name: 'Tropical', landOffset: 0.46, isletGain: 1.6, water: 0x1e7a8c, fog: 0x2a8a8a, fogMix: 0.35, fogDensity: 0.9, hazeDensity: 0.85, land: [0.94, 1.1, 0.9], birds: [0.2, 0.7, 0.1], ships: 0.5 },
  { name: 'Polar', landOffset: 0.58, isletGain: 0.5, water: 0x1a4a62, fog: 0x7e98a8, fogMix: 0.45, fogDensity: 1.5, hazeDensity: 1.4, land: [1.08, 1.1, 1.14], birds: [0.4, 0.05, 0.55], ships: 0.2 },
  { name: 'Deep blue', landOffset: 0.7, isletGain: 0.25, water: 0x123e66, fog: 0x1a4a78, fogMix: 0.3, fogDensity: 0.8, hazeDensity: 0.9, land: [1, 1, 1], birds: [0.15, 0.1, 0.75], ships: 0.7 },
];

export type Regions = {
  /** Blend weights (summing to 1) of the four regions at a world position. */
  weightsAt: (x: number, z: number, out?: RegionWeights) => RegionWeights;
  /** Region with the largest weight. */
  dominantAt: (x: number, z: number) => RegionId;
  /** Region of a lattice cell (the home cell is always temperate). */
  cellRegion: (i: number, j: number) => RegionId;
};

/** Seeded region field: 40 km cells of one region each, warped, with borders blended over about 5 km. */
export function createRegions(seed: number): Regions {
  const noiseX = makeNoise2D(hash(seed, 'regions'), 1);
  const noiseZ = makeNoise2D(hash(seed, 'regions'), 2);
  const cache = new Map<string, RegionId>();
  const half = REGION_BLEND / 2 / REGION_CELL;

  function cellRegion(i: number, j: number): RegionId {
    if (i === 0 && j === 0) return 0;
    const key = `${i}:${j}`;
    let id = cache.get(key);
    if (id === undefined) {
      id = (hash(seed, 'region-cell', i, j) % 4) as RegionId;
      if (cache.size > 512) cache.clear();
      cache.set(key, id);
    }
    return id;
  }

  /** Weights of the cell holding `f` and its two neighbours along one axis: [before, own, after]. */
  function axis(f: number, out: [number, number, number]): number {
    const i = Math.floor(f);
    const t = f - i;
    out[0] = t < half ? 1 - smoothstep(-half, half, t) : 0;
    out[2] = t > 1 - half ? smoothstep(1 - half, 1 + half, t) : 0;
    out[1] = 1 - out[0] - out[2];
    return i;
  }

  const ax: [number, number, number] = [0, 0, 0];
  const az: [number, number, number] = [0, 0, 0];

  function weightsAt(x: number, z: number, out: RegionWeights = [0, 0, 0, 0]): RegionWeights {
    const gate = smoothstep(HOME, HOME * 3, Math.hypot(x, z)) * WARP;
    const px = x + noiseX(x / WARP_SCALE, z / WARP_SCALE) * gate;
    const pz = z + noiseZ(x / WARP_SCALE + 7.3, z / WARP_SCALE - 2.9) * gate;
    // The origin sits at the middle of cell (0, 0).
    const i = axis(px / REGION_CELL + 0.5, ax);
    const j = axis(pz / REGION_CELL + 0.5, az);
    out[0] = out[1] = out[2] = out[3] = 0;
    for (let b = 0; b < 3; b++) {
      if (az[b] === 0) continue;
      for (let a = 0; a < 3; a++) {
        if (ax[a] === 0) continue;
        out[cellRegion(i + a - 1, j + b - 1)] += ax[a]! * az[b]!;
      }
    }
    return out;
  }

  const scratch: RegionWeights = [0, 0, 0, 0];
  return {
    weightsAt,
    dominantAt(x, z) {
      weightsAt(x, z, scratch);
      let best = 0;
      for (let k = 1; k < 4; k++) if (scratch[k]! > scratch[best]!) best = k;
      return best as RegionId;
    },
    cellRegion,
  };
}

/** Weighted sum of one numeric field of the looks. */
export function blendLook(weights: RegionWeights, pick: (look: RegionLook) => number): number {
  let sum = 0;
  for (let k = 0; k < 4; k++) sum += weights[k]! * pick(REGION_LOOKS[k]!);
  return sum;
}
