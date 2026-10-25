import type { NoiseFunction2D } from 'simplex-noise';
import type { Land } from './land.js';
import { CHUNK_SIZE } from './chunks.js';
import { clamp, smoothstep } from './math.js';

/**
 * Land tile geometry, a pure function of (land, level, ix, iz, cells). Runs in
 * the land worker and, as a fallback, on the main thread; it must not import
 * three.js so the worker stays small.
 */

/** Coarsest level: tiles of CHUNK_SIZE · 2^TOP_LEVEL metres. */
export const TOP_LEVEL = 6;
/** Sink the land a little so beaches meet the water without a seam. */
export const SINK = 0.7;

export function tileSize(level: number): number {
  return CHUNK_SIZE * 2 ** level;
}

export type TileData = {
  /** Local to the tile's (x0, z0) corner. */
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  index: Uint16Array;
  triangles: number;
};

type Rgb = [number, number, number];

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hex = (value: number): Rgb => [
  toLinear(((value >> 16) & 255) / 255),
  toLinear(((value >> 8) & 255) / 255),
  toLinear((value & 255) / 255),
];

const WET_SAND = hex(0xa8946c);
const SAND = hex(0xd6c49a);
const GRASS = hex(0x6f8f3e);
const MEADOW = hex(0x8c9a50);
const FOREST = hex(0x3a5a2c);
const DARK_FOREST = hex(0x2c4626);
const SCRUB = hex(0x6f7046);
const ROCK = hex(0x7a7266);
const CLIFF = hex(0x6d665c);
const CLIFF_PALE = hex(0x8c8274);
const SNOW = hex(0xf2f5f8);

function mix(out: Rgb, to: Rgb, t: number): void {
  const u = clamp(t, 0, 1);
  out[0] += (to[0] - out[0]) * u;
  out[1] += (to[1] - out[1]) * u;
  out[2] += (to[2] - out[2]) * u;
}

/** Biome colour (linear RGB) from height in metres, slope (normal Y) and a patch noise in [−1, 1]. */
export function biomeColor(height: number, slopeY: number, patch: number, out: Rgb = [0, 0, 0]): Rgb {
  const h = height + patch * 18;
  out[0] = GRASS[0];
  out[1] = GRASS[1];
  out[2] = GRASS[2];
  mix(out, MEADOW, patch * 0.5 + 0.5);
  mix(out, FOREST, smoothstep(12, 70, h + patch * 25));
  mix(out, DARK_FOREST, smoothstep(90, 220, h) * (0.5 + 0.5 * patch));
  mix(out, SCRUB, smoothstep(260, 460, h + patch * 60));
  mix(out, ROCK, smoothstep(460, 720, h + patch * 70));
  const steep = 1 - smoothstep(0.42, 0.66, slopeY);
  // Sea cliffs show layered rock bands rather than one flat tone.
  const strata = 0.5 + 0.35 * Math.sin(height * 0.3 + patch * 2.5);
  const cliffRgb: Rgb = [CLIFF[0], CLIFF[1], CLIFF[2]];
  mix(cliffRgb, CLIFF_PALE, strata);
  mix(out, height < 90 ? cliffRgb : ROCK, steep);
  const snowline = 640 + patch * 110;
  const snowy = smoothstep(snowline - 60, snowline + 60, height);
  // Snow settles on all but sheer faces, and dusts even those well above the line.
  mix(out, SNOW, Math.max(snowy * smoothstep(0.2, 0.45, slopeY), smoothstep(snowline + 120, snowline + 260, height) * 0.7));
  // Beaches: flat sand at the waterline, darker where wet.
  const sandy = (1 - smoothstep(1.8, 3.4, height + patch * 0.6)) * smoothstep(0.75, 0.92, slopeY);
  mix(out, SAND, sandy);
  mix(out, WET_SAND, (1 - smoothstep(0.4, 1.0, height)) * smoothstep(0.6, 0.85, slopeY));
  return out;
}

/** Cells under this depth on all four corners are skipped (open sea). */
const DEEP = -1.5;
const B = 2;

/**
 * Builds one tile of `cells`² quads at `level`, or null when it is all sea.
 * Heights are sampled on a two-sample border so the peak limiter and normals
 * agree with the neighbouring tiles of the same level; skirts hide the cracks
 * against other levels.
 */
export function buildTile(
  land: Pick<Land, 'surfaceAt'>,
  patchNoise: NoiseFunction2D,
  level: number,
  ix: number,
  iz: number,
  cells: number,
): TileData | null {
  const N = cells;
  const size = tileSize(level);
  const step = size / N;
  const x0 = ix * size;
  const z0 = iz * size;
  // Equivalent ring of the old clipmap (4 m cells at ring 0): sets fine octaves and far colouring.
  const ring = Math.max(0, Math.round(Math.log2(step / 4)));
  const S = N + 1 + 2 * B;
  const raw = new Float32Array(S * S);
  const cliffs = new Float32Array(S * S);
  const surface = { cliff: 0 };
  let highest = -Infinity;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const k = j * S + i;
      raw[k] = land.surfaceAt(x0 + (i - B) * step, z0 + (j - B) * step, ring, surface);
      cliffs[k] = surface.cliff;
      if (raw[k]! > highest) highest = raw[k]!;
    }
  }
  if (highest < DEEP) return null;

  // Coarse levels sample sparsely; a lone sampled peak becomes a needle. Limit
  // how far a vertex may rise above its neighbours.
  const heights = raw.slice();
  if (ring >= 2) {
    for (let j = 1; j < S - 1; j++) {
      for (let i = 1; i < S - 1; i++) {
        const k = j * S + i;
        const around = (raw[k - 1]! + raw[k + 1]! + raw[k - S]! + raw[k + S]!) * 0.25;
        const limit = around + step * 0.8;
        if (raw[k]! > limit) heights[k] = limit;
      }
    }
  }

  const count = N + 1;
  const at = (i: number, j: number) => (j + B) * S + (i + B);
  // Grid vertices, then up to 4N skirt vertices.
  const maxVerts = count * count + 4 * count;
  const positions = new Float32Array(maxVerts * 3);
  const normals = new Float32Array(maxVerts * 3);
  const colors = new Float32Array(maxVerts * 3);
  const rgb: Rgb = [0, 0, 0];
  for (let j = 0; j < count; j++) {
    for (let i = 0; i < count; i++) {
      const v = j * count + i;
      const k = at(i, j);
      const h = heights[k]!;
      positions[v * 3] = i * step;
      positions[v * 3 + 1] = h - SINK;
      positions[v * 3 + 2] = j * step;
      let nx = (heights[k - 1]! - heights[k + 1]!) / (2 * step);
      let nz = (heights[k - S]! - heights[k + S]!) / (2 * step);
      let ny = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      normals[v * 3] = nx;
      normals[v * 3 + 1] = ny;
      normals[v * 3 + 2] = nz;
      const wx = x0 + i * step;
      const wz = z0 + j * step;
      const patch = patchNoise(wx / 140, wz / 140) * 0.7 + patchNoise(wx / 37, wz / 37) * 0.3;
      // Coarse cells smear a cliff face over one cell: colour it as a cliff from the land's own cliff map.
      // Far levels are too coarse for per-face rock and snow: colour from a gentler slope
      // so a range reads as one mass with snowy tops, not stripes.
      const slopeY = ring >= 3 ? ny + (1 - ny) * 0.6 : ny;
      biomeColor(h, Math.min(slopeY, 1 - cliffs[k]! * 0.75), patch, rgb);
      colors[v * 3] = rgb[0];
      colors[v * 3 + 1] = rgb[1];
      colors[v * 3 + 2] = rgb[2];
    }
  }

  const index: number[] = [];
  const emitted = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * count + i;
      const b = a + 1;
      const c = a + count;
      const d = c + 1;
      const y = Math.max(positions[a * 3 + 1]!, positions[b * 3 + 1]!, positions[c * 3 + 1]!, positions[d * 3 + 1]!) + SINK;
      if (y < DEEP) continue;
      emitted[j * N + i] = 1;
      index.push(a, c, b, b, c, d);
    }
  }
  if (!index.length) return null;

  // Skirts hang below every emitted edge so a coarser neighbour never shows a crack.
  const skirt = step * 1.5 + 2;
  let next = count * count;
  const skirtOf = new Map<number, number>();
  const lowered = (v: number): number => {
    let s = skirtOf.get(v);
    if (s === undefined) {
      s = next++;
      skirtOf.set(v, s);
      positions[s * 3] = positions[v * 3]!;
      positions[s * 3 + 1] = positions[v * 3 + 1]! - skirt;
      positions[s * 3 + 2] = positions[v * 3 + 2]!;
      for (let c = 0; c < 3; c++) {
        normals[s * 3 + c] = normals[v * 3 + c]!;
        colors[s * 3 + c] = colors[v * 3 + c]!;
      }
    }
    return s;
  };
  // Each edge (a → b) is wound so its face points out of the tile.
  const edge = (a: number, b: number) => {
    const la = lowered(a);
    const lb = lowered(b);
    index.push(a, la, b, b, la, lb);
  };
  for (let i = 0; i < N; i++) {
    if (emitted[i]) edge(i + 1, i);
    if (emitted[(N - 1) * N + i]) edge(N * count + i, N * count + i + 1);
  }
  for (let j = 0; j < N; j++) {
    if (emitted[j * N]) edge(j * count, (j + 1) * count);
    if (emitted[j * N + N - 1]) edge((j + 1) * count + N, j * count + N);
  }

  return {
    positions: positions.slice(0, next * 3),
    normals: normals.slice(0, next * 3),
    colors: colors.slice(0, next * 3),
    index: Uint16Array.from(index),
    triangles: index.length / 3,
  };
}
