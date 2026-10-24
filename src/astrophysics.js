import art from './look.js';
import { weightedChoice } from './planet-data.js';

export const srgbToLinear = (n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
export const linearToSrgb = (n) => n <= 0.0031308 ? n * 12.92 : 1.055 * Math.max(0, n) ** (1 / 2.4) - 0.055;
export function linearColor(hex) {
  const word = Number.parseInt(hex.replace('#', ''), 16);
  return [word >>> 16, (word >>> 8) & 255, word & 255].map((n) => srgbToLinear(n / 255));
}
export function blackbodyColor(temperature, ramp = art.blackbody) {
  const t = Math.max(ramp[0][0], Math.min(ramp.at(-1)[0], temperature));
  for (let i = 1; i < ramp.length; i++) if (t <= ramp[i][0]) {
    if (t === ramp[i][0]) return linearColor(ramp[i][1]);
    const a = linearColor(ramp[i - 1][1]), b = linearColor(ramp[i][1]);
    const blend = (t - ramp[i - 1][0]) / (ramp[i][0] - ramp[i - 1][0]);
    return a.map((n, channel) => n + (b[channel] - n) * blend);
  }
  return linearColor(ramp.at(-1)[1]);
}
export function sampleMagnitude(rng, settings = art.realism.magnitudes) {
  const [min, max] = settings.range, a = 10 ** (settings.slope * min), b = 10 ** (settings.slope * max);
  return Math.log10(a + rng() * (b - a)) / settings.slope;
}
export const magnitudeFlux = (magnitude, reference = art.realism.magnitudes.mRef) => 10 ** (-0.4 * (magnitude - reference));
export function sampleStar(rng, distribution = 'volume') {
  const settings = art.realism;
  const weights = distribution === 'system' ? Object.entries(settings.lighting.systemStarClasses) : Object.entries(settings.starClasses).map(([kind, data]) => [kind, data[distribution]]);
  const spectralClass = weightedChoice(weights, rng), spec = settings.starClasses[spectralClass];
  const temperature = spec.tempK[0] + rng() * (spec.tempK[1] - spec.tempK[0]);
  const luminosity = Math.exp(Math.log(spec.luminosity[0]) + rng() * Math.log(spec.luminosity[1] / spec.luminosity[0]));
  return { spectralClass, temperature, luminosity, color: blackbodyColor(temperature) };
}
