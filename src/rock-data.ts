import type { Rng } from './rng.js';

export function sampleRockSize(rng: Rng, min: number, max: number, exponent: number): number {
  return (min ** -exponent - rng() * (min ** -exponent - max ** -exponent)) ** (-1 / exponent);
}
