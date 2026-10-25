import art from './look.js';
import { cellRandom, hash } from './rng.js';
import { sampleStar } from './astrophysics.js';
import { weightedChoice, planetAppearance } from './planet-data.js';
import { normalize, distance } from './math.js';
import { frameBody } from './vantage.js';

export const SYSTEM_CELL = art.realism.starSystems.cellSize;
export const systemCellOf = (position: number[]): number[] => position.map((n) => Math.floor((n + SYSTEM_CELL / 2) / SYSTEM_CELL));
const between = (rng: () => number, pair: readonly number[]): number => {
  const a = pair[0]!, b = pair[1]!;
  return a + (b - a) * rng();
};

export type StarBody = {
  id: string;
  position: number[];
  radius: number;
  clearanceRadius: number;
  kind: string;
  spectralClass?: string;
  temperature?: number;
  luminosity?: number;
  color?: [number, number, number];
};

export type SystemPlanet = ReturnType<typeof planetAppearance> & {
  id: string;
  systemId: string;
  position: number[];
  radius: number;
  orbit: number;
  orbitalPhase: number;
  orbitalPeriod: number;
  inclination: number;
  tilt: number;
  seed: number;
};

export type StarSystem = {
  key: string;
  coordinates: number[];
  position: number[];
  stars: StarBody[];
  planets: SystemPlanet[];
  binary: boolean;
  binaryPhase: number;
  separation: number;
  binaryPeriod: number;
  seed: number;
};


export function generateSystem(seed: number, x: number, y: number, z: number): StarSystem | null {
  const settings = art.realism.starSystems, rng = cellRandom(seed, x, y, z, 740);
  if (rng() >= settings.chancePerCell) return null;
  const key = `system:${x},${y},${z}`, origin = [x, y, z].map((n) => n * SYSTEM_CELL);
  const position = origin.map((n) => n + (rng() - 0.5) * SYSTEM_CELL * 0.72);
  const star = sampleStar(rng, 'system');
  const rank = ['M', 'K', 'G', 'F', 'A', 'B', 'O'].indexOf(star.spectralClass);
  const radius = settings.starRadius[0] + rank / 6 * (settings.starRadius[1] - settings.starRadius[0]);
  const primary = { ...star, id: `${key}:a`, position: [...position], radius, clearanceRadius: radius * art.realism.lighting.keepClear, kind: 'star' };
  const stars = [primary], binary = rng() < settings.binaryChance;
  const separation = Math.max(radius * 3.2, between(rng, [1800, 3200])), binaryPhase = rng() * Math.PI * 2;
  if (binary) {
    const companion = sampleStar(rng, 'system'), companionRadius = radius * (0.45 + rng() * 0.35);
    stars.push({ ...companion, id: `${key}:b`, position: [...position], radius: companionRadius, clearanceRadius: companionRadius * art.realism.lighting.keepClear, kind: 'star' });
  }
  const planets = [], count = Math.floor(between(rng, [settings.planets[0], settings.planets[1] + 1]));
  let orbit = between(rng, settings.firstOrbit);
  const plane = between(rng, settings.inclinationDeg) * Math.PI / 180;
  for (let i = 0; i < count; i++) {
    const frostLine = 10000 * Math.sqrt(Math.max(0.1, star.luminosity));
    const allowed = orbit < frostLine ? ['rocky', 'ocean', 'ember'] : ['gas', 'ice'];
    const type = weightedChoice(allowed.map((name) => [name, (art.planets.types as Record<string, { weight: number }>)[name]!.weight]), rng);
    const appearanceSeed = hash(seed, x, y, z, i, 741), appearance = planetAppearance(appearanceSeed, [1, 0, 0], art.planets, type);
    const bodyRadius = between(rng, type === 'gas' ? [art.planets.radius[0] * 2, art.planets.radius[1]] : [art.planets.radius[0], art.planets.radius[1] * 0.55]);
    const phase = rng() * Math.PI * 2, inclination = plane + between(rng, settings.inclinationDeg) * Math.PI / 180;
    const orbitalPeriod = 6000 * (orbit / settings.firstOrbit[0]) ** 1.5;
    planets.push({ ...appearance, id: `${key}:planet:${i}`, systemId: key, position: [0, 0, 0], radius: bodyRadius,
      orbit, orbitalPhase: phase, orbitalPeriod, inclination, tilt: (rng() - 0.5) * 0.55, seed: appearanceSeed });
    orbit *= between(rng, settings.orbitSpacing);
  }
  const system = { key, coordinates: [x, y, z], position, stars, planets, binary, binaryPhase, separation, binaryPeriod: 300 + rng() * 600, seed: hash(seed, x, y, z, 742) };
  updateSystem(system, 0); return system;
}

export function updateSystem(system: StarSystem, time: number): StarSystem {
  if (system.binary) system.stars.forEach((star, index) => {
    const phase = system.binaryPhase + time * Math.PI * 2 / system.binaryPeriod + index * Math.PI;
    star.position = system.position.map((n, axis) => n + (axis === 0 ? Math.cos(phase) : axis === 2 ? Math.sin(phase) : 0) * system.separation / 2);
  });
  for (const planet of system.planets) {
    const angle = planet.orbitalPhase + time * Math.PI * 2 / planet.orbitalPeriod;
    planet.position = [system.position[0] + Math.cos(angle) * planet.orbit,
      system.position[1] + Math.sin(angle) * planet.orbit * Math.sin(planet.inclination),
      system.position[2] + Math.sin(angle) * planet.orbit * Math.cos(planet.inclination)];
    for (const moon of planet.moons) {
      const phase = moon.phase + time * Math.PI * 2 / moon.period, orbit = moon.orbit * planet.radius;
      moon.position = [planet.position[0] + Math.cos(phase) * orbit, planet.position[1] + Math.sin(phase) * orbit * Math.sin(moon.tilt), planet.position[2] + Math.sin(phase) * orbit * Math.cos(moon.tilt)];
      moon.worldRadius = moon.radius * planet.radius;
    }
  }
  return system;
}

export function generateNebula(seed: number, x: number, y: number, z: number) {
  const rng = cellRandom(seed, x, y, z, 743), settings = art.nebula;
  if (rng() > settings.chancePerCell) return null;
  const position = [x, y, z].map((n) => n * SYSTEM_CELL + (rng() - 0.5) * SYSTEM_CELL * 0.7);
  const radius = between(rng, settings.radius), embedded = [];
  const count = Math.floor(between(rng, art.realism.nebula.embeddedStars.count.map((n, i) => n + i)));
  for (let i = 0; i < count; i++) embedded.push({ position: position.map((n) => n + (rng() - 0.5) * radius * 0.8),
    temperature: between(rng, art.realism.nebula.embeddedStars.tempK), radius: radius * 0.003 });
  return { key: `nebula:${x},${y},${z}`, coordinates: [x, y, z], position, radius,
    axes: [1, between(rng, [0.5, 0.9]), between(rng, [0.3, 0.7])], embedded, seed: hash(seed, x, y, z, 744) };
}

export function findSpawn(seed: number, { preferType, preferRings = false, fill = 0.32, ringOpenDeg = 20 }: { preferType?: string; preferRings?: boolean; fill?: number; ringOpenDeg?: number } = {}) {
  const candidates = [];
  for (let radius = 0; radius <= 4; radius++) {
    for (let x = -radius; x <= radius; x++) for (let y = -radius; y <= radius; y++) for (let z = -radius; z <= radius; z++) {
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== radius) continue;
      const system = generateSystem(seed, x, y, z); if (!system) continue;
      for (const planet of system.planets) {
        if (planet.orbit < system.stars[0].clearanceRadius * 1.1) continue;
        if (preferType && planet.type !== preferType) continue;
        const ringOpen = planet.rings ? Math.min(0.55, Math.abs(Math.sin(planet.ring.tilt + planet.tilt))) : 0;
        candidates.push({
          system, planet,
          score: distance(planet.position as [number, number, number], [0, 0, 0] as [number, number, number]) / SYSTEM_CELL
            - Number(planet.rings) * (preferRings ? 2.2 : 1.4) - ringOpen
            - Number(planet.type === preferType) * 3
            - Number(planet.type === 'ocean') * 0.35,
        });
      }
    }
    if (candidates.length && (preferType || preferRings || radius >= 1)) break;
  }
  if (!candidates.length && preferType) return findSpawn(seed, { preferRings, fill, ringOpenDeg });
  if (!candidates.length) throw new Error('No nearby system found');
  const best = candidates.sort((a, b) => a.score - b.score)[0]!;
  const { system, planet } = best;
  const light = system.stars[0].position.map((n, i) => n - planet.position[i]);
  // Match createPlanet ring.rotation.set(-π/2 + ring.tilt, planet.tilt*0.4, planet.tilt + 0.15).
  const ringNormal = planet.rings ? ringMeshNormal(planet.ring.tilt, planet.tilt) : [0, 1, 0];
  const framed = frameBody({
    subject: planet.position as [number, number, number], radius: planet.radius, lightFromSubject: light as [number, number, number],
    // Keep the full ring ellipse in frame: outer ~2.5× radius → lower fill.
    fill: planet.rings ? Math.min(fill, 0.18) : fill, lightingDeg: 85,
    ringOpenDeg: planet.rings ? ringOpenDeg : 8, ringNormal: ringNormal as [number, number, number],
  });
  return { system, planet, position: framed.position, yaw: framed.yaw, pitch: framed.pitch, range: framed.range, lightingDeg: framed.angle };
}

/** Ring plane normal matching createPlanet's Euler (X, Y, Z) on local +Z. */
export function ringMeshNormal(ringTilt: number, planetTilt: number): number[] {
  const x = -Math.PI / 2 + ringTilt, y = planetTilt * 0.4, z = planetTilt + 0.15;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // Third column of R = Rz*Ry*Rx applied to (0,0,1).
  return normalize([
    cx * sy * cz + sx * sz,
    cx * sy * sz - sx * cz,
    cx * cy,
  ]);
}
