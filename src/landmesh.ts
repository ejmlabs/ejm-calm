import * as THREE from 'three';
import type { Land } from './land.js';
import { makeNoise2D } from './noise.js';
import { clamp, smoothstep } from './math.js';

export type LandMeshHandle = {
  group: THREE.Group;
  triangles: number;
  dispose: () => void;
};

export type LandMeshOptions = {
  /** Cells per side of every LOD ring (multiple of 4). */
  segments: number;
  /** Half-size of the finest ring in metres. Each ring doubles it. */
  inner?: number;
  levels?: number;
  sunDirection: THREE.Vector3;
  /** Sky colour at the horizon; distance haze blends land into it. */
  hazeColor: THREE.Color;
  /** Haze density per metre (thicker at golden hour and dusk). */
  hazeDensity?: number;
  /** Sky colours by elevation angle; when set, haze matches the sky behind each point. */
  hazeGradient?: { angles: number[]; colors: THREE.Color[] };
};

/** Eye height the haze gradient is measured from (the camera rides just above the sea). */
const EYE = 4;

function sampleGradient(gradient: { angles: number[]; colors: THREE.Color[] }, deg: number, out: THREE.Color): THREE.Color {
  const { angles, colors } = gradient;
  if (deg <= angles[0]!) return out.copy(colors[0]!);
  for (let i = 1; i < angles.length; i++) {
    if (deg <= angles[i]!) {
      return out.copy(colors[i - 1]!).lerp(colors[i]!, (deg - angles[i - 1]!) / (angles[i]! - angles[i - 1]!));
    }
  }
  return out.copy(colors[colors.length - 1]!);
}

type Rgb = [number, number, number];

const hex = (value: number): Rgb => {
  const c = new THREE.Color().setHex(value, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
};

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

/** Sink the land a little so beaches meet the water without a seam. */
const SINK = 0.7;
/** Default haze density (per metre); land a few kilometres out melts into the sky. */
const HAZE = 0.00026;

/**
 * Nested square rings (a static clipmap): each ring has the same cell count and
 * twice the spacing of the one inside it, so far land costs little. Cells that
 * sit fully under water are skipped.
 */
export function createLandMesh(land: Land, options: LandMeshOptions): LandMeshHandle {
  const N = Math.max(8, Math.round(options.segments / 4) * 4);
  const inner = options.inner ?? 256;
  const levels = options.levels ?? 6;
  const count = N + 1;
  const sun = options.sunDirection.clone().normalize();
  const sunTint = new THREE.Color().setHex(0xfff0d8, THREE.SRGBColorSpace);
  const patchNoise = makeNoise2D(land.seed, 21);
  const haze = options.hazeColor.clone();
  const gradient = options.hazeGradient;
  const hazeDensity = options.hazeDensity ?? HAZE;
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: false,
    toneMapped: false,
  });
  const geometries: THREE.BufferGeometry[] = [];
  let triangles = 0;
  const rgb: Rgb = [0, 0, 0];

  for (let level = 0; level < levels; level++) {
    const half = inner * 2 ** level;
    const step = (half * 2) / N;
    const heights = new Float32Array(count * count);
    const outer = level < levels - 1;
    for (let iz = 0; iz < count; iz++) {
      for (let ix = 0; ix < count; ix++) {
        // The outer edge shares vertices with the next ring: sample at its detail.
        const edge = outer && (ix === 0 || iz === 0 || ix === N || iz === N);
        heights[iz * count + ix] = land.heightAt(-half + ix * step, -half + iz * step, edge ? level + 1 : level);
      }
    }
    // The outer edge meets a ring with twice the spacing: put odd vertices on its edges.
    if (outer) {
      for (let i = 1; i < N; i += 2) {
        for (const [a, b, c] of [
          [i, i - 1, i + 1],
          [N * count + i, N * count + i - 1, N * count + i + 1],
          [i * count, (i - 1) * count, (i + 1) * count],
          [i * count + N, (i - 1) * count + N, (i + 1) * count + N],
        ] as Array<[number, number, number]>) {
          heights[a] = (heights[b]! + heights[c]!) * 0.5;
        }
      }
    }

    // Far rings sample sparsely; a lone sampled peak becomes a needle. Limit
    // how far a vertex may rise above its neighbours. Ring seams stay untouched.
    if (level >= 2) {
      const lo = N / 4;
      const hi = (3 * N) / 4;
      const seam = (i: number) => i === lo || i === hi;
      const source = heights.slice();
      for (let iz = 1; iz < N; iz++) {
        for (let ix = 1; ix < N; ix++) {
          if ((seam(ix) && iz >= lo && iz <= hi) || (seam(iz) && ix >= lo && ix <= hi)) continue;
          const i = iz * count + ix;
          const around = (source[i - 1]! + source[i + 1]! + source[i - count]! + source[i + count]!) * 0.25;
          const limit = around + step * 0.8;
          if (source[i]! > limit) heights[i] = limit;
        }
      }
    }

    const positions = new Float32Array(count * count * 3);
    const colors = new Float32Array(count * count * 3);
    for (let iz = 0; iz < count; iz++) {
      for (let ix = 0; ix < count; ix++) {
        const i = iz * count + ix;
        const x = -half + ix * step;
        const z = -half + iz * step;
        const h = heights[i]!;
        positions[i * 3] = x;
        positions[i * 3 + 1] = h - SINK;
        positions[i * 3 + 2] = z;
        const hl = heights[iz * count + Math.max(0, ix - 1)]!;
        const hr = heights[iz * count + Math.min(N, ix + 1)]!;
        const hd = heights[Math.max(0, iz - 1) * count + ix]!;
        const hu = heights[Math.min(N, iz + 1) * count + ix]!;
        let nx = (hl - hr) / (2 * step);
        let nz = (hd - hu) / (2 * step);
        let ny = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        nz /= len;
        const patch = patchNoise(x / 140, z / 140) * 0.7 + patchNoise(x / 37, z / 37) * 0.3;
        biomeColor(h, ny, patch, rgb);
        const lambert = Math.max(0, nx * sun.x + ny * sun.y + nz * sun.z);
        const sky = 0.38 + 0.14 * ny;
        // Aerial perspective: the camera stays near the origin, so bake haze by range.
        const d = Math.hypot(x, z);
        // Snowfields above the haze layer stay readable on far peaks.
        const dh = h > 620 ? d * 0.65 : d;
        const a = Math.min(0.97, 1 - Math.exp(-dh / 9000 - (dh * hazeDensity) ** 2));
        if (gradient) sampleGradient(gradient, (Math.atan2(h - EYE, Math.max(1, d)) * 180) / Math.PI, haze);
        colors[i * 3] = rgb[0] * (sky + lambert * 0.78 * sunTint.r) * (1 - a) + haze.r * a;
        colors[i * 3 + 1] = rgb[1] * (sky + lambert * 0.78 * sunTint.g) * (1 - a) + haze.g * a;
        colors[i * 3 + 2] = rgb[2] * (sky + lambert * 0.78 * sunTint.b) * (1 - a) + haze.b * a;
      }
    }

    const index: number[] = [];
    const lo = N / 4;
    const hi = (3 * N) / 4;
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        if (level > 0 && ix >= lo && ix < hi && iz >= lo && iz < hi) continue;
        const a = iz * count + ix;
        const b = a + 1;
        const c = a + count;
        const d = c + 1;
        if (Math.max(heights[a]!, heights[b]!, heights[c]!, heights[d]!) < -1.5) continue;
        index.push(a, c, b, b, c, d);
      }
    }
    if (!index.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    geometries.push(geometry);
    triangles += index.length / 3;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  return {
    group,
    triangles,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
    },
  };
}
