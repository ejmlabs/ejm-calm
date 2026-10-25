import art from './look.js';
import { weightedChoice } from './planet-data.js';
import type { Rng } from './rng.js';

export type Rgb = [number, number, number];
export type BlackbodyRamp = ReadonlyArray<readonly [number, string] | ReadonlyArray<string | number>>;

export const srgbToLinear = (n: number): number => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
export const linearToSrgb = (n: number): number => n <= 0.0031308 ? n * 12.92 : 1.055 * Math.max(0, n) ** (1 / 2.4) - 0.055;
export function linearColor(hex: string): Rgb {
  const word = Number.parseInt(hex.replace('#', ''), 16);
  return [word >>> 16, (word >>> 8) & 255, word & 255].map((n) => srgbToLinear(n / 255)) as Rgb;
}
export function blackbodyColor(temperature: number, ramp: BlackbodyRamp = art.blackbody): Rgb {
  const last = ramp[ramp.length - 1]!;
  const t = Math.max(Number(ramp[0]![0]), Math.min(Number(last[0]), temperature));
  for (let i = 1; i < ramp.length; i++) if (t <= Number(ramp[i]![0])) {
    if (t === Number(ramp[i]![0])) return linearColor(String(ramp[i]![1]));
    const a = linearColor(String(ramp[i - 1]![1])), b = linearColor(String(ramp[i]![1]));
    const blend = (t - Number(ramp[i - 1]![0])) / (Number(ramp[i]![0]) - Number(ramp[i - 1]![0]));
    return a.map((n, channel) => n + (b[channel]! - n) * blend) as Rgb;
  }
  return linearColor(String(last[1]));
}
export function sampleMagnitude(rng: Rng, settings = art.realism.magnitudes): number {
  const [min, max] = settings.range, a = 10 ** (settings.slope * min), b = 10 ** (settings.slope * max);
  return Math.log10(a + rng() * (b - a)) / settings.slope;
}
export const magnitudeFlux = (magnitude: number, reference = art.realism.magnitudes.mRef): number => 10 ** (-0.4 * (magnitude - reference));

export type StarSample = {
  spectralClass: string;
  temperature: number;
  luminosity: number;
  color: Rgb;
};

export function sampleStar(rng: Rng, distribution: 'volume' | 'apparent' | 'system' = 'volume'): StarSample {
  const settings = art.realism;
  const weights = distribution === 'system'
    ? Object.entries(settings.lighting.systemStarClasses)
    : Object.entries(settings.starClasses).map(([kind, data]) => [kind, data[distribution as 'volume' | 'apparent']] as [string, number]);
  const spectralClass = weightedChoice(weights, rng) as keyof typeof settings.starClasses;
  const spec = settings.starClasses[spectralClass];
  const temperature = spec.tempK[0] + rng() * (spec.tempK[1] - spec.tempK[0]);
  const luminosity = Math.exp(Math.log(spec.luminosity[0]) + rng() * Math.log(spec.luminosity[1] / spec.luminosity[0]));
  return { spectralClass, temperature, luminosity, color: blackbodyColor(temperature) };
}
