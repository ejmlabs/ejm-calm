import art from './look.js';
import { cellRandom, hash } from './rng.js';
import { sampleStar } from './astrophysics.js';
import { weightedChoice, planetAppearance } from './planet-data.js';
import { normalize, distance } from './math.js';

export const SYSTEM_CELL = art.realism.starSystems.cellSize;
export const systemCellOf = (position) => position.map((n) => Math.floor((n + SYSTEM_CELL / 2) / SYSTEM_CELL));
const between = (rng, [a, b]) => a + (b - a) * rng();

export function generateSystem(seed, x, y, z) {
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
    const type = weightedChoice(allowed.map((type) => [type, art.planets.types[type].weight]), rng);
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

export function updateSystem(system, time) {
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

export function generateNebula(seed, x, y, z) {
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

export function findSpawn(seed) {
  const candidates = [];
  for (let radius = 0; radius <= 3 && !candidates.length; radius++) {
    for (let x = -radius; x <= radius; x++) for (let y = -radius; y <= radius; y++) for (let z = -radius; z <= radius; z++) {
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== radius) continue;
      const system = generateSystem(seed, x, y, z); if (!system) continue;
      for (const planet of system.planets) {
        if (planet.orbit < system.stars[0].clearanceRadius * 1.1) continue;
        const ringOpen = planet.rings ? Math.min(0.55, Math.abs(Math.sin(planet.ring.tilt + planet.tilt))) : 0;
        candidates.push({ system, planet, score: distance(planet.position, [0, 0, 0]) / SYSTEM_CELL - Number(planet.rings) * 1.4 - ringOpen - Number(planet.type === 'ocean') * 0.35 });
      }
    }
  }
  if (!candidates.length) throw new Error('No nearby system found');
  const { system, planet } = candidates.sort((a, b) => a.score - b.score)[0];
  const light = normalize(system.stars[0].position.map((n, i) => n - planet.position[i]));
  const tangent = normalize([-light[2], 0, light[0]].map((n, i) => n + (i === 1 ? 0 : 0)));
  const binormal = normalize([
    light[1] * tangent[2] - light[2] * tangent[1],
    light[2] * tangent[0] - light[0] * tangent[2],
    light[0] * tangent[1] - light[1] * tangent[0],
  ]);
  // Prefer a 60–120° lighting angle and open the rings ~15–40° from edge-on.
  const ringLift = planet.rings ? 0.42 + Math.abs(planet.ring.tilt) * 0.35 : 0.18;
  const observation = normalize(tangent.map((n, i) => n * 0.72 - light[i] * 0.38 + binormal[i] * ringLift));
  const position = planet.position.map((n, i) => n + observation[i] * (planet.radius * (planet.rings ? 7.2 : 6.5) + 180));
  const aim = planet.position.map((n, i) => n + tangent[i] * planet.radius * 0.4 + binormal[i] * planet.radius * 0.12);
  const direction = normalize(aim.map((n, i) => n - position[i]));
  return { system, planet, position, yaw: Math.atan2(direction[0], -direction[2]), pitch: Math.asin(Math.max(-1, Math.min(1, direction[1]))) };
}
