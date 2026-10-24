import { hash } from './rng.js';

const ease = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

export function noise3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const u = ease(x - ix), v = ease(y - iy), w = ease(z - iz);
  const at = (dx, dy, dz) => hash(seed, ix + dx, iy + dy, iz + dz) / 0xffffffff;
  return mix(
    mix(mix(at(0, 0, 0), at(1, 0, 0), u), mix(at(0, 1, 0), at(1, 1, 0), u), v),
    mix(mix(at(0, 0, 1), at(1, 0, 1), u), mix(at(0, 1, 1), at(1, 1, 1), u), v), w,
  );
}

export function fractalNoise(x, y, z, seed = 0, octaves = 3) {
  let sum = 0, weight = 0, amplitude = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x, y, z, seed + i) * amplitude;
    weight += amplitude;
    x *= 2.03; y *= 2.03; z *= 2.03; amplitude *= 0.5;
  }
  return weight ? sum / weight : 0;
}
