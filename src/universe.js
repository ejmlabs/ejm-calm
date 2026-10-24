import { cellRandom, hash } from './rng.js';
import { noise3 } from './noise.js';
import art from './look.js';
import { sampleStar } from './astrophysics.js';
import { generateSystem, generateNebula, systemCellOf, updateSystem } from './systems.js';
import { sampleRockSize } from './rock-data.js';
import { weightedChoice } from './planet-data.js';

export const CELL_SIZE = art.stars.field.cellSize;
export const cellOf = (position) => position.map((n) => Math.floor((n + CELL_SIZE / 2) / CELL_SIZE));
export const cellKey = (x, y, z) => `${x},${y},${z}`;

export function generateCell(seed, x, y, z) {
  const origin = [x * CELL_SIZE, y * CELL_SIZE, z * CELL_SIZE];
  const point = (rng, margin = 0) => origin.map((n) => n + (rng() - 0.5) * (CELL_SIZE - margin * 2));
  const stars = [], planets = [], asteroids = [], nebulae = [], galaxies = [], events = [];
  let asteroidField = null;
  const starRng = cellRandom(seed, x, y, z, 1);
  const count = art.realism.depthLayers.field.perCell.high;
  for (let i = 0; i < count; i++) {
    const position = point(starRng), stellar = sampleStar(starRng, 'volume');
    stars.push({ position, ...stellar, size: 1.1, warmth: starRng(), brightness: 1, halo: false });
  }
  stars.sort((a, b) => b.luminosity - a.luminosity);
  const rockRng = cellRandom(seed, x, y, z, 3);
  if (rockRng() < 0.075) {
    const center = point(rockRng, 250);
    asteroidField = { center, radius: 250 };
    for (let i = 0; i < art.asteroids.count.high; i++) {
      const radius = sampleRockSize(rockRng, ...art.asteroids.size, art.realism.asteroids.sizePowerLaw);
      const position = center.map((n) => n + (rockRng() - 0.5) * 400), lane = art.asteroids.lane.width / 2 + radius + art.asteroids.lane.clearance;
      if (Math.abs(position[0] - center[0]) < lane && Math.abs(position[1] - center[1]) < lane) position[0] = center[0] + (position[0] < center[0] ? -lane : lane);
      asteroids.push({ position, radius, composition: weightedChoice(Object.entries(art.realism.asteroids.classes).map(([name, data]) => [name, data.weight]), rockRng), tint: rockRng(),
        rotation: [rockRng() * 6.28, rockRng() * 6.28, rockRng() * 6.28], stretch: art.asteroids.shape.flatten[0] + rockRng() * (art.asteroids.shape.flatten[1] - art.asteroids.shape.flatten[0]) });
    }
    asteroids.sort((a, b) => b.radius - a.radius);
  }
  const galaxyRng = cellRandom(seed, x, y, z, 5);
  if (galaxyRng() < 0.025) galaxies.push({ position: point(galaxyRng, 180), radius: 85 + galaxyRng() * 130,
    rotation: galaxyRng() * 6.28, seed: hash(seed, x, y, z, 5) });
  const eventRng = cellRandom(seed, x, y, z, 6);
  if (eventRng() < 0.003) events.push({ position: point(eventRng, 100), radius: 18, kind: 'binary', phase: eventRng() * 6.28 });
  return { key: cellKey(x, y, z), coordinates: [x, y, z], stars, planets, asteroids, asteroidField, nebulae, galaxies, events };
}

export function regionAt(seed, position) {
  return noise3(position[0] / 6500, position[1] / 6500, position[2] / 6500, seed) * 2;
}

export function regionWeights(seed, position, { scale = 26000, sharpness = 2.2, bias = {} } = {}) {
  const kinds = ['tidepool', 'ember', 'hollow'];
  const weights = kinds.map((kind, i) => Math.max(0.001, noise3(position[0] / scale + i * 19.7,
    position[1] / scale - i * 7.3, position[2] / scale + i * 31.1, hash(seed, 71, i)) + (bias[kind] ?? 0)) ** sharpness);
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((n) => n / sum);
}

export class Universe {
  constructor(seed, { radius = 2, cellBudget = 2, timeBudget = 3 } = {}) {
    this.seed = seed; this.radius = radius; this.cellBudget = cellBudget; this.timeBudget = timeBudget;
    this.cells = new Map(); this.pending = []; this.center = ''; this.revision = 0;
    this.systems = new Map(); this.nebulae = new Map(); this.coarse = new Map(); this.coarseQueue = []; this.coarseCenter = '';
  }

  update(position, { now = () => performance.now(), onLoad = () => {}, onUnload = () => {}, onLoadSystem = () => {}, onUnloadSystem = () => {},
    onLoadNebula = () => {}, onUnloadNebula = () => {}, time = 0 } = {}) {
    const center = cellOf(position), key = center.join(',');
    if (key !== this.center) {
      this.center = key;
      const wanted = new Set(), queue = [];
      for (let x = -this.radius; x <= this.radius; x++) {
        for (let y = -this.radius; y <= this.radius; y++) {
          for (let z = -this.radius; z <= this.radius; z++) {
            const coords = [center[0] + x, center[1] + y, center[2] + z];
            const cell = coords.join(',');
            wanted.add(cell);
            if (!this.cells.has(cell)) queue.push({ coords, distance: x * x + y * y + z * z });
          }
        }
      }
      this.pending = queue.sort((a, b) => a.distance - b.distance);
      for (const [cell, data] of this.cells) if (!wanted.has(cell)) {
        onUnload(data); this.cells.delete(cell); this.revision++;
      }
    }
    const start = now(); let loaded = 0;
    while (this.pending.length && loaded < this.cellBudget && (loaded === 0 || now() - start < this.timeBudget)) {
      const { coords } = this.pending.shift();
      const cell = generateCell(this.seed, ...coords);
      this.cells.set(cell.key, cell); onLoad(cell); this.revision++; loaded++;
    }
    const coarseCenter = systemCellOf(position), coarseKey = coarseCenter.join(',');
    if (coarseKey !== this.coarseCenter) {
      this.coarseCenter = coarseKey; const wanted = new Set(), queue = [];
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        const coordinates = [coarseCenter[0] + x, coarseCenter[1] + y, coarseCenter[2] + z], key = coordinates.join(','); wanted.add(key);
        if (!this.coarse.has(key)) queue.push({ coordinates, distance: x * x + y * y + z * z });
      }
      this.coarseQueue = queue.sort((a, b) => a.distance - b.distance);
      for (const [key, entry] of this.coarse) if (!wanted.has(key)) {
        if (entry.system) { this.systems.delete(entry.system.key); onUnloadSystem(entry.system); }
        if (entry.nebula) { this.nebulae.delete(entry.nebula.key); onUnloadNebula(entry.nebula); }
        this.coarse.delete(key);
      }
    }
    if (this.coarseQueue.length && now() - start < this.timeBudget) {
      const { coordinates } = this.coarseQueue.shift(), key = coordinates.join(',');
      const generated = generateSystem(this.seed, ...coordinates), system = generated ? (this.systems.get(generated.key) ?? generated) : null;
      const nebula = generateNebula(this.seed, ...coordinates);
      if (system) { updateSystem(system, time); if (!this.systems.has(system.key)) { this.systems.set(system.key, system); onLoadSystem(system); } }
      if (nebula) { this.nebulae.set(nebula.key, nebula); onLoadNebula(nebula); }
      this.coarse.set(key, { system, nebula });
    }
    for (const system of this.systems.values()) updateSystem(system, time);
    return loaded;
  }

  pointsOfInterest() {
    const result = [];
    for (const system of this.systems.values()) result.push(...system.planets);
    result.push(...this.nebulae.values());
    return result;
  }

  obstacles(position, range = 900) {
    const result = [], rocks = [];
    for (const cell of this.cells.values()) {
      if (cell.coordinates.some((n, i) => Math.abs(n * CELL_SIZE - position[i]) > range + CELL_SIZE)) continue;
      for (const rock of cell.asteroids) {
        const distance = Math.hypot(rock.position[0] - position[0], rock.position[1] - position[1], rock.position[2] - position[2]);
        if (distance < rock.radius + 450) rocks.push({ rock, distance });
      }
    }
    for (const system of this.systems.values()) {
      for (const body of [...system.stars, ...system.planets]) {
        const extent = body.clearanceRadius ?? (body.rings ? body.radius * body.ring.outer : body.radius);
        if (Math.hypot(...body.position.map((n, i) => n - position[i])) < range + extent * 2) result.push(body);
        if (body.moons) for (const moon of body.moons) if (Math.hypot(...moon.position.map((n, i) => n - position[i])) < range + moon.worldRadius * 2) result.push({ position: moon.position, radius: moon.worldRadius, type: 'rocky' });
      }
    }
    result.push(...rocks.sort((a, b) => a.distance - b.distance).slice(0, 64).map((entry) => entry.rock)); return result;
  }

  nearestSystem(position) {
    let nearest = null, best = Infinity;
    for (const system of this.systems.values()) {
      const distance = Math.hypot(...system.position.map((n, i) => n - position[i]));
      if (distance < best) { best = distance; nearest = system; }
    }
    return nearest;
  }
}
