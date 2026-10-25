import art from './look.js';
import { random, type Rng } from './rng.js';

const range = (rng: Rng, bounds: readonly number[]): number => {
  const min = bounds[0]!, max = bounds[1]!;
  return min + (max - min) * rng();
};

export function weightedChoice<T>(entries: ReadonlyArray<readonly [T, number]>, rng: Rng): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let pick = rng() * total;
  for (const [value, weight] of entries) { pick -= weight; if (pick < 0) return value; }
  return entries[entries.length - 1]![0];
}

export type PlanetSettings = typeof art.planets;

export function planetTypeWeights(weights: number[], settings: PlanetSettings = art.planets): Array<[string, number]> {
  const regions = ['tidepool', 'ember', 'hollow'] as const;
  return Object.entries(settings.types).map(([type, data]) => [type, data.weight *
    regions.reduce((sum, region, i) => sum + weights[i]! * ((settings.regionTypeBias[region] as Record<string, number> | undefined)?.[type] ?? 1), 0)]);
}

export function selectPlanetType(rng: Rng, weights: number[] = [1, 0, 0], settings: PlanetSettings = art.planets): string {
  return weightedChoice(planetTypeWeights(weights, settings), rng);
}

export type PlanetRing = {
  inner: number;
  outer: number;
  tilt: number;
  opacity: number;
  bands: number;
  gaps: number[];
  phase: number;
};

export type PlanetMoon = {
  radius: number;
  orbit: number;
  phase: number;
  tilt: number;
  period: number;
  palette: string[];
  seed: number;
  position?: number[];
  worldRadius?: number;
};

export type PlanetAppearance = {
  type: string;
  palette: string[];
  atmosphere: Record<string, unknown>;
  rings: boolean;
  ring: PlanetRing;
  moons: PlanetMoon[];
  bands: number;
  phase: number;
  spinPeriod: number;
  turbulence: number;
  emissive: number;
};

export function planetAppearance(seed: number, weights: number[], settings: PlanetSettings = art.planets, forcedType?: string): PlanetAppearance {
  const rng = random(seed), type = selectPlanetType(rng, weights, settings);
  const resolvedType = (settings.types as Record<string, unknown>)[forcedType ?? ''] ? forcedType! : type;
  type Spec = {
    palette: string[];
    altPalette?: string[];
    atmosphere: Record<string, unknown>;
    bands?: number[];
    turbulence?: number;
    emissive?: number;
  };
  const spec = (settings.types as unknown as Record<string, Spec>)[resolvedType]!;
  const palette = [...(spec.altPalette && rng() < 0.5 ? spec.altPalette : spec.palette)];
  const ringed = rng() < (settings.rings.chance as Record<string, number>)[resolvedType]!;
  const ring: PlanetRing = { inner: range(rng, settings.rings.inner), outer: range(rng, settings.rings.outer),
    tilt: range(rng, settings.rings.tiltDeg) * Math.PI / 180, opacity: range(rng, settings.rings.opacity),
    bands: Math.floor(range(rng, [settings.rings.bands[0]!, settings.rings.bands[1]! + 1])), gaps: [0.28 + rng() * 0.16, 0.64 + rng() * 0.16], phase: rng() * 30 };
  const moons: PlanetMoon[] = [], moonSettings = settings.moons;
  const count = weightedChoice(moonSettings.countWeights.map((weight, i) => [i + moonSettings.count[0]!, weight] as [number, number]), rng);
  for (let i = 0; i < count; i++) moons.push({ radius: range(rng, moonSettings.radius),
    orbit: Math.max(ringed ? ring.outer + 0.45 : 0, range(rng, moonSettings.orbit)),
    phase: rng() * Math.PI * 2, tilt: (rng() - 0.5) * 0.8, period: range(rng, moonSettings.orbitPeriod),
    palette: [...moonSettings.palette], seed: Math.floor(rng() * 0xffffffff) });
  return { type: resolvedType, palette, atmosphere: { ...spec.atmosphere }, rings: ringed, ring, moons,
    bands: spec.bands ? Math.floor(range(rng, [spec.bands[0]!, spec.bands[1]! + 1])) : 9, phase: rng() * Math.PI * 2,
    spinPeriod: range(rng, settings.spinPeriod), turbulence: spec.turbulence ?? 0.25, emissive: spec.emissive ?? 0 };
}
