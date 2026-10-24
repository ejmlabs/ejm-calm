import art from './look.js';
import { random } from './rng.js';

const range = (rng, [min, max]) => min + (max - min) * rng();
export function weightedChoice(entries, rng) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let pick = rng() * total;
  for (const [value, weight] of entries) { pick -= weight; if (pick < 0) return value; }
  return entries.at(-1)?.[0];
}

export function planetTypeWeights(weights, settings = art.planets) {
  const regions = ['tidepool', 'ember', 'hollow'];
  return Object.entries(settings.types).map(([type, data]) => [type, data.weight *
    regions.reduce((sum, region, i) => sum + weights[i] * (settings.regionTypeBias[region]?.[type] ?? 1), 0)]);
}

export function selectPlanetType(rng, weights = [1, 0, 0], settings = art.planets) {
  return weightedChoice(planetTypeWeights(weights, settings), rng);
}

export function planetAppearance(seed, weights, settings = art.planets, forcedType) {
  const rng = random(seed), type = selectPlanetType(rng, weights, settings);
  const resolvedType = settings.types[forcedType] ? forcedType : type;
  const spec = settings.types[resolvedType];
  const palette = [...(spec.altPalette && rng() < 0.5 ? spec.altPalette : spec.palette)];
  const ringed = rng() < settings.rings.chance[resolvedType];
  const ring = { inner: range(rng, settings.rings.inner), outer: range(rng, settings.rings.outer),
    tilt: range(rng, settings.rings.tiltDeg) * Math.PI / 180, opacity: range(rng, settings.rings.opacity),
    bands: Math.floor(range(rng, [settings.rings.bands[0], settings.rings.bands[1] + 1])), gaps: [0.28 + rng() * 0.16, 0.64 + rng() * 0.16], phase: rng() * 30 };
  const moons = [], moonSettings = settings.moons;
  const count = weightedChoice(moonSettings.countWeights.map((weight, i) => [i + moonSettings.count[0], weight]), rng);
  for (let i = 0; i < count; i++) moons.push({ radius: range(rng, moonSettings.radius),
    orbit: Math.max(ringed ? ring.outer + 0.45 : 0, range(rng, moonSettings.orbit)),
    phase: rng() * Math.PI * 2, tilt: (rng() - 0.5) * 0.8, period: range(rng, moonSettings.orbitPeriod),
    palette: [...moonSettings.palette], seed: Math.floor(rng() * 0xffffffff) });
  return { type: resolvedType, palette, atmosphere: { ...spec.atmosphere }, rings: ringed, ring, moons,
    bands: spec.bands ? Math.floor(range(rng, [spec.bands[0], spec.bands[1] + 1])) : 9, phase: rng() * Math.PI * 2,
    spinPeriod: range(rng, settings.spinPeriod), turbulence: spec.turbulence ?? 0.25, emissive: spec.emissive ?? 0 };
}
