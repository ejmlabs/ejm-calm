import * as THREE from 'three';
import { clamp, lerp } from './math.js';

/**
 * Pure optics and colour helpers for the underwater view: Snell's window, fog
 * blending across the surface, depth tint and light falloff. No GPU state here.
 */

/** Refractive index of sea water. */
export const WATER_IOR = 1.333;

/** Angle from the vertical beyond which light from above cannot reach the eye (Snell's window edge). */
export function criticalAngle(n = WATER_IOR): number {
  return Math.asin(1 / n);
}

/**
 * Angle from the vertical in air of a ray that leaves the water at `angle` from
 * the vertical, or null when it is totally internally reflected.
 */
export function airAngle(angle: number, n = WATER_IOR): number | null {
  const s = n * Math.sin(Math.abs(angle));
  return s >= 1 ? null : Math.asin(s);
}

export type FogState = { color: THREE.Color; density: number };

/**
 * Fog at submersion `s`: colour lerps linearly, density geometrically, because
 * the two densities differ by two orders of magnitude and a linear blend would
 * jump straight to murk.
 */
export function blendFog(above: FogState, below: FogState, s: number, out: FogState): FogState {
  const t = clamp(s, 0, 1);
  out.color.copy(above.color).lerp(below.color, t);
  const a = Math.max(1e-7, above.density);
  const b = Math.max(1e-7, below.density);
  out.density = a * Math.pow(b / a, t);
  return out;
}

/** Fraction of surface light left at `depth` metres (bluer wavelengths survive longest). */
export function surfaceLight(depth: number): number {
  return Math.exp(-0.055 * Math.max(0, depth));
}

/**
 * Light left at `depth` metres by colour, in clear open ocean: red is gone by about 15 m, green fades by around 50 m
 * and blue reaches a couple of hundred metres (diffuse attenuation of about 0.3, 0.06 and 0.022 per metre).
 */
export function depthLight(depth: number, out: THREE.Color): THREE.Color {
  const d = Math.max(0, depth);
  return out.setRGB(Math.exp(-0.3 * d), Math.exp(-0.06 * d), Math.exp(-0.022 * d));
}

/** Eyes adapt to the dark down to a quarter of the light, and the deep never drops below VISIBLE_LIGHT of the surface's. */
export const ADAPT_GAIN = 4;
export const VISIBLE_LIGHT = 0.08;
const scratch = new THREE.Color();

/** Brightness the adapted eye sees at `depth`, 1 at the surface: dim but never black, so the whale stays in view. */
export function seenLight(depth: number): number {
  depthLight(depth, scratch);
  const luminance = 0.2126 * scratch.r + 0.7152 * scratch.g + 0.0722 * scratch.b;
  return clamp(luminance * ADAPT_GAIN, VISIBLE_LIGHT, 1);
}

/** Underwater look keyed by daylight: shallow and deep display colours (sRGB hex) and fog densities. */
export type WaterLook = { shallow: number; deep: number; density: number; deepDensity: number };

export const WATER_LOOK: WaterLook = {
  shallow: 0x2f8590,
  deep: 0x0c3a4a,
  // FogExp2: visibility (95 %) is ~1.73 / density: clear open-ocean water, about 80 m near the top and 65 m
  // deep, so a 25 m whale stays in view from the trailing camera.
  density: 0.021,
  deepDensity: 0.026,
};

const shallowColor = new THREE.Color();
const deepColor = new THREE.Color();

/**
 * Absorption colour (display space, linear) and density at `depth`; darker and
 * bluer the deeper the eye. `daylight` dims everything for low suns.
 */
export function waterTint(depth: number, daylight: number, out: FogState, look: WaterLook = WATER_LOOK): FogState {
  const k = 1 - Math.exp(-Math.max(0, depth) / 10);
  shallowColor.setHex(look.shallow, THREE.SRGBColorSpace);
  deepColor.setHex(look.deep, THREE.SRGBColorSpace);
  // The water itself darkens toward a deep navy as the light fails with depth.
  out.color.copy(shallowColor).lerp(deepColor, k).multiplyScalar(clamp(daylight, 0.2, 1) * lerp(0.35, 1, seenLight(depth)));
  out.density = look.density + (look.deepDensity - look.density) * k;
  return out;
}

/* ---------------------------------------------------------------- tone mapping */

// three's ACESFilmicToneMapping, column-major like the GLSL source.
const ACES_IN = [0.59719, 0.076, 0.0284, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777];
const ACES_OUT = [1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602];

function mul(m: readonly number[], x: number, y: number, z: number, out: number[]): void {
  out[0] = m[0]! * x + m[3]! * y + m[6]! * z;
  out[1] = m[1]! * x + m[4]! * y + m[7]! * z;
  out[2] = m[2]! * x + m[5]! * y + m[8]! * z;
}

function fit(v: number): number {
  const a = v * (v + 0.0245786) - 0.000090537;
  const b = v * (0.983729 * v + 0.432951) + 0.238081;
  return a / b;
}

const va = [0, 0, 0];
const vb = [0, 0, 0];

/** three's ACES filmic curve before the final clamp, into `vb`. */
function acesRaw(r: number, g: number, b: number, exposure: number): void {
  const e = exposure / 0.6;
  mul(ACES_IN, r * e, g * e, b * e, va);
  mul(ACES_OUT, fit(va[0]!), fit(va[1]!), fit(va[2]!), vb);
}

/** Linear display colour that three's ACES filmic curve produces for scene radiance `c`. */
export function acesFilmic(c: THREE.Color, exposure: number, out = new THREE.Color()): THREE.Color {
  acesRaw(c.r, c.g, c.b, exposure);
  return out.setRGB(clamp(vb[0]!, 0, 1), clamp(vb[1]!, 0, 1), clamp(vb[2]!, 0, 1));
}

const x3 = [0, 0, 0];
const goal3 = [0, 0, 0];

/**
 * Scene radiance that tone-maps to the linear display colour `target`, so the
 * underwater palette can be chosen as it should look on screen. Each channel's
 * output rises monotonically with its own input, so a few Gauss–Seidel sweeps of
 * per-channel bisection converge; a channel ACES cannot pull low enough
 * (it desaturates strong teals) ends at zero.
 */
export function radianceFor(target: THREE.Color, exposure: number, toneMapping: THREE.ToneMapping, out = new THREE.Color()): THREE.Color {
  if (toneMapping !== THREE.ACESFilmicToneMapping) return out.copy(target).multiplyScalar(1 / Math.max(1e-3, exposure));
  const goal = goal3;
  goal[0] = clamp(target.r, 0, 0.98);
  goal[1] = clamp(target.g, 0, 0.98);
  goal[2] = clamp(target.b, 0, 0.98);
  x3[0] = goal[0]! / exposure;
  x3[1] = goal[1]! / exposure;
  x3[2] = goal[2]! / exposure;
  for (let sweep = 0; sweep < 6; sweep++) {
    for (let c = 0; c < 3; c++) {
      let lo = 0;
      let hi = 64;
      for (let i = 0; i < 26; i++) {
        const mid = (lo + hi) * 0.5;
        x3[c] = mid;
        acesRaw(x3[0]!, x3[1]!, x3[2]!, exposure);
        if (vb[c]! < goal[c]!) lo = mid;
        else hi = mid;
      }
      x3[c] = (lo + hi) * 0.5;
    }
  }
  return out.setRGB(x3[0]!, x3[1]!, x3[2]!);
}
