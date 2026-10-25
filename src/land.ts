import type { NoiseFunction2D } from 'simplex-noise';
import { fbm2, makeNoise2D, ridged2 } from './noise.js';
import { hash } from './rng.js';
import { clamp, smoothstep } from './math.js';
import type { Shore } from './shore.js';

/**
 * Earth-like land for one seed: continents from a warped low-frequency mask,
 * fractal coasts with headlands and bays, offshore islets, beaches, cliffs,
 * rolling hills and ridged mountain ranges. Heights are metres above sea level;
 * negative values are sea depth.
 */
export type Land = Shore & {
  seed: number;
  /** Centre of the landmass kept in view (world XZ). */
  anchor: { x: number; z: number };
  /** Signed coast field: > 0 on land, < 0 at sea. Cheap compared with heightAt. */
  maskAt: (x: number, z: number) => number;
  heightAt: (x: number, z: number, lod?: number) => number;
  /** heightAt that also reports how much of a sea-cliff face the point is on, in [0, 1]. */
  surfaceAt: (x: number, z: number, lod: number, out: { cliff: number }) => number;
  /** Submerged sand banks in [0, 1]: visual only, they never block navigation. */
  shoalAt: (x: number, z: number) => number;
  /** Sampled grid used for navigation and the shallow-water map. */
  grid: LandGrid;
};

export type LandGrid = {
  /** World X/Z of texel (0, 0) centre. */
  min: number;
  cell: number;
  size: number;
  /** Signed coast mask per texel. */
  mask: Float32Array;
  /** Signed distance to the coast in metres: > 0 at sea, < 0 on land. */
  distance: Float32Array;
};

export type LandOptions = {
  /** Camera yaw the main view looks along; land is anchored ahead of it. */
  viewYaw: number;
  /** Navigation / shallow grid resolution (texels per side). */
  gridSize?: number;
  /** Half-extent of the navigation grid in metres. */
  gridExtent?: number;
};

/** Open water is kept around the origin so the whale and ships have room. */
export const HARBOUR_RADIUS = 260;

/**
 * How much the coast distance varies across view bearings, ignoring the single
 * nearest and farthest so one stray bearing cannot fake a receding coast.
 */
export function coastSpread(hits: readonly number[]): number {
  const sorted = [...hits].sort((a, b) => a - b);
  return sorted[sorted.length - 2]! - sorted[1]!;
}

/** Bearings either side of the view scored for composition (fits a portrait frame). */
export const VIEW_HALF_CONE = (24 * Math.PI) / 180;
const COAST_SEARCH = 3000;

/** Sea depth for a negative mask: a shallow shelf, then a drop to open ocean. */
export function depthForMask(mask: number, steep = 0): number {
  if (mask >= 0) return 0;
  const s = -mask;
  // Coast masks change ~0.002 per metre: a sandy shelf runs a few hundred metres out.
  const shelf = 14 + 90 * steep;
  return s * shelf + Math.max(0, s - 0.45) * 260;
}

type Channels = {
  warpA: NoiseFunction2D;
  warpB: NoiseFunction2D;
  continent: NoiseFunction2D;
  coast: NoiseFunction2D;
  bay: NoiseFunction2D;
  shoal: NoiseFunction2D;
  islet: NoiseFunction2D;
  cliff: NoiseFunction2D;
  hill: NoiseFunction2D;
  ridge: NoiseFunction2D;
  range: NoiseFunction2D;
};

function channels(seed: number): Channels {
  const s = hash(seed, 'land');
  return {
    warpA: makeNoise2D(s, 1),
    warpB: makeNoise2D(s, 2),
    continent: makeNoise2D(s, 3),
    coast: makeNoise2D(s, 4),
    islet: makeNoise2D(s, 5),
    cliff: makeNoise2D(s, 6),
    hill: makeNoise2D(s, 7),
    ridge: makeNoise2D(s, 8),
    range: makeNoise2D(s, 9),
    bay: makeNoise2D(s, 10),
    shoal: makeNoise2D(s, 11),
  };
}

export function createLand(seed: number, options: LandOptions): Land {
  const n = channels(seed);
  const jitter = (hash(seed, 'land-anchor') / 0x100000000 - 0.5) * 0.7;
  const anchorYaw = options.viewYaw + jitter;
  const anchorDist = 1700 + (hash(seed, 'land-anchor-dist') / 0x100000000) * 500;
  // Camera look convention: (−sin, −cos).
  const look = { x: -Math.sin(options.viewYaw), z: -Math.cos(options.viewYaw) };
  const anchor = { x: -Math.sin(anchorYaw) * anchorDist, z: -Math.cos(anchorYaw) * anchorDist };
  const anchorR2 = 1100 * 1100;
  const bankYaw = options.viewYaw + (hash(seed, 'land-bank') / 0x100000000 - 0.5) * 0.5;
  const bankDist = 110 + (hash(seed, 'land-bank-dist') / 0x100000000) * 90;
  const bank = { x: -Math.sin(bankYaw) * bankDist, z: -Math.cos(bankYaw) * bankDist, r: 60 };

  // Domain-warped coordinates shared by the mask and the mountains.
  // (ox, oz) slides the continents so the camera starts in a natural bay.
  let ox = 0;
  let oz = 0;
  let wx = 0;
  let wz = 0;
  function warp(x: number, z: number): void {
    const px = x + ox;
    const pz = z + oz;
    const qx = fbm2(n.warpA, px / 3000, pz / 3000, 3);
    const qz = fbm2(n.warpB, px / 3000 + 5.2, pz / 3000 + 1.3, 3);
    wx = px + qx * 1300;
    wz = pz + qz * 1300;
  }

  function rawMask(): number {
    const continent = fbm2(n.continent, wx / 6500, wz / 6500, 5, 2.0, 0.5);
    // Bay-scale and cove-scale octaves give headlands, bays and coves.
    const bay = fbm2(n.bay, wx / 1500, wz / 1500, 3, 2.1, 0.5);
    const coast = fbm2(n.coast, wx / 560, wz / 560, 5, 2.07, 0.52);
    headland = bay;
    return continent * 1.05 + bay * 0.3 + coast * 0.3 - 0.03;
  }

  let held = 0;
  let lifted = 0;
  // Bay-scale octave of the last mask sample: high where land juts out as a headland.
  let headland = 0;
  function maskWarped(x: number, z: number): number {
    const r = Math.hypot(x, z);
    const ax = x - anchor.x;
    const az = z - anchor.z;
    held = 0.28 * Math.exp(-(ax * ax + az * az) / anchorR2);
    // A ragged clearing, not a round bowl: its radius wanders with noise.
    const reach = HARBOUR_RADIUS * (1 + 0.35 * fbm2(n.islet, x / 700 + 9.1, z / 700 - 4.2, 2));
    const harbour = 0.3 * (1 - smoothstep(reach, reach + 260, r));
    // Far land rises toward the horizon ahead, so a second, hazier range sits behind the coast.
    const ahead = r > 1 ? (x * look.x + z * look.z) / r : 0;
    const distant = 0.32 * smoothstep(3600, 5400, r) * smoothstep(0.25, 0.8, ahead);
    let m = rawMask() + held + distant - harbour;
    // Offshore islets: blobs that only rise in the water off the coast.
    const isl = fbm2(n.islet, x / 340, z / 340, 2);
    const band =
      smoothstep(-0.45, -0.15, m) * (1 - smoothstep(-0.04, 0.06, m)) * smoothstep(HARBOUR_RADIUS + 40, HARBOUR_RADIUS + 140, r);
    lifted = Math.max(0, isl - 0.36) * 1.5 * band;
    m += lifted;
    return m;
  }

  /** Composition of the opening view: an oblique coast, a far side, an islet. */
  function viewScore(): number {
    let wettest = -Infinity;
    for (let ring = 0; ring < 3; ring++) {
      const r = ring * 130;
      for (let a = 0; a < (ring === 0 ? 1 : 8); a++) {
        const t = (a / 8) * Math.PI * 2;
        warp(Math.cos(t) * r, Math.sin(t) * r);
        wettest = Math.max(wettest, maskWarped(Math.cos(t) * r, Math.sin(t) * r));
      }
    }
    const hits: number[] = [];
    let islets = 0;
    let cliffs = 0;
    for (let b = 0; b < 9; b++) {
      const yaw = options.viewYaw + (b / 8 - 0.5) * 2 * VIEW_HALF_CONE;
      const dx = -Math.sin(yaw);
      const dz = -Math.cos(yaw);
      let hit = COAST_SEARCH;
      let left = -1;
      for (let d = 160; d < COAST_SEARCH; d += 40) {
        warp(dx * d, dz * d);
        const land = maskWarped(dx * d, dz * d) > 0;
        if (land && hit === COAST_SEARCH) {
          hit = d;
          if (d < 2200) cliffs = Math.max(cliffs, cliffiness(dx * d, dz * d));
        }
        if (!land && hit < COAST_SEARCH && left < 0) left = d;
        if (left > 0) {
          if (land && hit < 1100) islets++;
          if (land || d > left + 240) break;
        }
      }
      hits.push(hit);
    }
    const near = Math.min(...hits);
    const spread = coastSpread(hits);
    const landed = hits.filter((h) => h < COAST_SEARCH).length;
    return (
      Math.max(0, wettest + 0.05) * 20 +
      Math.max(0, 320 - near) / 200 +
      Math.max(0, near - 750) / 400 +
      Math.max(0, 900 - spread) / 300 +
      Math.max(0, 4 - landed) * 0.4 +
      (islets > 0 ? 0 : 0.35) +
      // At least one cliffed headland on the visible coast.
      Math.max(0, 0.6 - cliffs) * 0.6
    );
  }

  {
    let best = { x: 0, z: 0, score: Infinity };
    for (let k = 0; k < 160; k++) {
      ox = (hash(seed, 'land-offset-x', k) / 0x100000000 - 0.5) * 60000;
      oz = (hash(seed, 'land-offset-z', k) / 0x100000000 - 0.5) * 60000;
      const score = viewScore();
      if (score < best.score) best = { x: ox, z: oz, score };
      if (score <= 0) break;
    }
    ox = best.x;
    oz = best.z;
  }

  function maskAt(x: number, z: number): number {
    warp(x, z);
    return maskWarped(x, z);
  }

  /** Cliff strength; reads the headland term of the last mask sample, so call it right after one. */
  function cliffiness(x: number, z: number): number {
    const cape = smoothstep(0.02, 0.35, headland) * 0.3;
    return smoothstep(0.45, 0.75, fbm2(n.cliff, x / 800, z / 800, 2) * 0.5 + 0.5 + cape);
  }

  const scratch = { cliff: 0 };

  /** `lod` > 0 drops fine octaves for the coarse far rings. */
  function surfaceAt(x: number, z: number, lod: number, out: { cliff: number }): number {
    warp(x, z);
    const m = maskWarped(x, z);
    const steep = cliffiness(x, z);
    // The face runs from the waterline up to the plateau edge.
    out.cliff = steep * smoothstep(-0.03, 0.0, m) * (1 - smoothstep(0.07, 0.12, m));
    if (m < 0) return -depthForMask(m, steep);
    const fine = Math.max(2, 5 - Math.floor(lod / 2));
    // Beach: a wide sandy strip that cliffs cut through.
    const beach = 2.3 * smoothstep(0, 0.1, m);
    // Coastal lowland: a low plain behind the beach before the land climbs inland.
    // Islets stay low: their lift raises a beach and a knoll, not a hill range.
    const rise = m - lifted * 0.85;
    const gentle = beach + smoothstep(0.1, 0.3, rise) * 7 + Math.max(0, rise - 0.3) * 190;
    // Cliffs step up to a low headland plateau, then follow the land inland.
    const cliffTop = smoothstep(0, 0.08, m) * (8 + 42 * steep) + Math.max(0, rise - 0.3) * 190;
    let h = gentle + (cliffTop - gentle) * steep;
    const inland = smoothstep(0.25, 0.65, rise);
    const natural = m - held - lifted;
    // Hills on warped, low-frequency coordinates merge into ridges that grow inland.
    const hill = fbm2(n.hill, wx / 1300, wz / 1300, fine) * 0.5 + 0.5;
    h += hill * hill * (70 + 190 * smoothstep(0.3, 0.85, natural)) * inland;
    const ranges = smoothstep(-0.25, 0.45, fbm2(n.range, x / 4200, z / 4200, 2));
    const ridge = ridged2(n.ridge, wx / 2800, wz / 2800, fine - 1, 2.0, 0.45);
    const bulk = fbm2(n.range, wx / 1300 + 7.1, wz / 1300 - 3.4, fine - 1) * 0.5 + 0.5;
    const peaks = Math.pow(ridge, 1.3) * 0.55 + bulk * bulk * 0.45;
    // Ranges come from the natural continent, not the in-view anchor, and stay inland of the bay.
    const r = Math.hypot(x, z);
    const far = smoothstep(1200, 2800, r);
    const scale = 800 + 900 * smoothstep(1800, 4800, r);
    h += peaks * scale * smoothstep(0.04, 0.55, natural) * (0.12 + 0.88 * ranges) * far;
    // Sink the outer rim so the mesh edge vanishes under the haze.
    const rim = 1 - smoothstep(6200, 7800, r);
    return h * rim;
  }

  function heightAt(x: number, z: number, lod = 0): number {
    return surfaceAt(x, z, lod, scratch);
  }

  function shoalAt(x: number, z: number): number {
    const r = Math.hypot(x, z);
    // Sand banks dot the bay out to the coast, leaving the water right under the camera deep.
    const reach = smoothstep(25, 70, r) * (1 - smoothstep(900, 1300, r));
    const patches = smoothstep(0.08, 0.26, fbm2(n.shoal, x / 160, z / 160, 3)) * reach;
    // One sand bank always lies in the opening view, close enough to see from steeply above.
    const bx = x - bank.x;
    const bz = z - bank.z;
    const lobe = fbm2(n.shoal, x / 60 + 3.3, z / 60 - 1.7, 2) * 0.35;
    const main = smoothstep(0.15, 0.6, Math.exp(-(bx * bx + bz * bz) / (bank.r * bank.r)) + lobe);
    return Math.max(patches, main);
  }

  const grid = buildGrid(maskAt, options.gridSize ?? 320, options.gridExtent ?? 1600);

  function sampleDistance(x: number, z: number): number {
    const fx = (x - grid.min) / grid.cell;
    const fz = (z - grid.min) / grid.cell;
    if (fx < 0 || fz < 0 || fx > grid.size - 1 || fz > grid.size - 1) {
      // Beyond the grid: distance to its edge plus the edge value keeps a gradient.
      const cx = clamp(fx, 0, grid.size - 1);
      const cz = clamp(fz, 0, grid.size - 1);
      const edge = Math.hypot(fx - cx, fz - cz) * grid.cell;
      return bilinear(grid.distance, grid.size, cx, cz) + edge;
    }
    return bilinear(grid.distance, grid.size, fx, fz);
  }

  return {
    seed,
    anchor,
    maskAt,
    heightAt,
    surfaceAt,
    shoalAt,
    grid,
    clearance(x, z) {
      // Texel centres sit about half a cell either side of the coast.
      return sampleDistance(x, z) - grid.cell * 0.5;
    },
    away(x, z) {
      const e = grid.cell;
      const gx = sampleDistance(x + e, z) - sampleDistance(x - e, z);
      const gz = sampleDistance(x, z + e) - sampleDistance(x, z - e);
      const len = Math.hypot(gx, gz);
      if (len > 1e-6) return { x: gx / len, z: gz / len };
      const r = Math.hypot(x, z);
      return r > 1e-6 ? { x: -x / r, z: -z / r } : { x: 1, z: 0 };
    },
  };
}

function bilinear(field: Float32Array, size: number, fx: number, fz: number): number {
  const x0 = Math.min(size - 2, Math.floor(fx));
  const z0 = Math.min(size - 2, Math.floor(fz));
  const tx = fx - x0;
  const tz = fz - z0;
  const i = z0 * size + x0;
  const a = field[i]! + (field[i + 1]! - field[i]!) * tx;
  const b = field[i + size]! + (field[i + size + 1]! - field[i + size]!) * tx;
  return a + (b - a) * tz;
}

function buildGrid(maskAt: (x: number, z: number) => number, size: number, extent: number): LandGrid {
  const cell = (extent * 2) / (size - 1);
  const min = -extent;
  const mask = new Float32Array(size * size);
  const inf = 1e20;
  const toLand = new Float64Array(size * size);
  const toSea = new Float64Array(size * size);
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const m = maskAt(min + ix * cell, min + iz * cell);
      mask[iz * size + ix] = m;
      toLand[iz * size + ix] = m > 0 ? 0 : inf;
      toSea[iz * size + ix] = m > 0 ? inf : 0;
    }
  }
  squaredDistance(toLand, size);
  squaredDistance(toSea, size);
  // Signed: positive at sea (metres to land), negative on land (metres to sea).
  const distance = new Float32Array(size * size);
  for (let i = 0; i < distance.length; i++) {
    distance[i] = toLand[i]! > 0 ? Math.sqrt(toLand[i]!) * cell : -Math.sqrt(toSea[i]!) * cell;
  }
  return { min, cell, size, mask, distance };
}

/** Exact squared Euclidean distance transform (Felzenszwalb–Huttenlocher), in place. */
function squaredDistance(grid: Float64Array, size: number): void {
  const f = new Float64Array(size);
  const d = new Float64Array(size);
  const v = new Int32Array(size);
  const z = new Float64Array(size + 1);
  const pass = (offset: number, stride: number) => {
    for (let i = 0; i < size; i++) f[i] = grid[offset + i * stride]!;
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < size; q++) {
      let s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      while (s <= z[k]!) {
        k--;
        s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < size; q++) {
      while (z[k + 1]! < q) k++;
      const dq = q - v[k]!;
      d[q] = dq * dq + f[v[k]!]!;
    }
    for (let i = 0; i < size; i++) grid[offset + i * stride] = d[i]!;
  };
  for (let row = 0; row < size; row++) pass(row * size, 1);
  for (let col = 0; col < size; col++) pass(col, size);
}

/** Fraction of land over a square window, sampled on a coarse lattice. */
export function landFraction(land: Land, extent = 4000, steps = 64): number {
  let count = 0;
  for (let iz = 0; iz < steps; iz++) {
    for (let ix = 0; ix < steps; ix++) {
      const x = -extent + ((ix + 0.5) / steps) * extent * 2;
      const z = -extent + ((iz + 0.5) / steps) * extent * 2;
      if (land.maskAt(x, z) > 0) count++;
    }
  }
  return count / (steps * steps);
}

/** Shallowness per texel for the water shader: 1 at the shore, 0 at ≥ 40 m depth. */
export type ShelfMap = { data: Uint8Array; size: number; min: number; extent: number };

/** Water depth (metres) by distance from the coast: a wide sandy shelf, then the drop-off. */
export function depthForDistance(metres: number): number {
  if (metres <= 0) return 0;
  if (metres < SHELF_WIDTH) return 1.5 + 6.5 * (metres / SHELF_WIDTH);
  return Math.min(200, 8 + (metres - SHELF_WIDTH) * 0.08 + Math.max(0, metres - 450) * 0.25);
}

/** Shallow, turquoise shelf width off every coast. */
export const SHELF_WIDTH = 150;

function shelfFromDistance(distance: ArrayLike<number>, size: number, min: number, extent: number): ShelfMap {
  const data = new Uint8Array(size * size);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.round(clamp(1 - depthForDistance(distance[i]!) / 40, 0, 1) * 255);
  }
  // Clamp-to-edge sampling should read as open sea outside the map.
  for (let i = 0; i < size; i++) {
    data[i] = 0;
    data[(size - 1) * size + i] = 0;
    data[i * size] = 0;
    data[i * size + size - 1] = 0;
  }
  return { data, size, min, extent };
}

export function nearShelf(land: Land): ShelfMap {
  const g = land.grid;
  const shelf = shelfFromDistance(g.distance, g.size, g.min, g.cell * (g.size - 1));
  // Sand banks: patches of 2–4 m water out in the bay.
  const bank = Math.round(clamp(1 - 2 / 40, 0, 1) * 255);
  for (let iz = 1; iz < g.size - 1; iz++) {
    for (let ix = 1; ix < g.size - 1; ix++) {
      const i = iz * g.size + ix;
      const t = land.shoalAt(g.min + ix * g.cell, g.min + iz * g.cell);
      if (t > 0) shelf.data[i] = Math.max(shelf.data[i]!, Math.round(shelf.data[i]! + (bank - shelf.data[i]!) * t));
    }
  }
  return shelf;
}

export function farShelf(land: Land, size = 192, extent = 6400): ShelfMap {
  // Too coarse for an exact distance field: estimate it from the coast mask slope.
  const distance = new Float32Array(size * size);
  const cell = (extent * 2) / (size - 1);
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const m = land.maskAt(-extent + ix * cell, -extent + iz * cell);
      distance[iz * size + ix] = m > 0 ? 0 : -m / 0.0025;
    }
  }
  return shelfFromDistance(distance, size, -extent, extent * 2);
}
