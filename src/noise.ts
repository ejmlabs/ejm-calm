import { createNoise2D, createNoise4D, type NoiseFunction2D, type NoiseFunction4D } from 'simplex-noise';
import { random, hash } from './rng.js';

export function makeNoise2D(seed: number, channel = 0): NoiseFunction2D {
  const rng = random(hash(seed, channel, 'noise'));
  return createNoise2D(rng);
}

export function makeNoise4D(seed: number, channel = 0): NoiseFunction4D {
  const rng = random(hash(seed, channel, 'noise4'));
  return createNoise4D(rng);
}

/** Fractal Brownian motion in [-1, 1]. */
export function fbm2(
  noise: NoiseFunction2D,
  x: number,
  z: number,
  octaves = 5,
  lacunarity = 2.02,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** 4D fbm for seamlessly tiling 2D domains via a torus embedding. */
export function fbm4(
  noise: NoiseFunction4D,
  x: number,
  y: number,
  z: number,
  w: number,
  octaves = 5,
  lacunarity = 2.02,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq, z * freq, w * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Ridged multifractal in [0, 1]. */
export function ridged2(
  noise: NoiseFunction2D,
  x: number,
  z: number,
  octaves = 4,
  lacunarity = 2.1,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x * freq, z * freq));
    const ridge = n * n;
    sum += ridge * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}
