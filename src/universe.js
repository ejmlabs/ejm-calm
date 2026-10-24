import { cellRandom, hash } from './rng.js';
import { noise3 } from './noise.js';

export const CELL_SIZE = 1200;
export const cellOf = (position) => position.map((n) => Math.floor((n + CELL_SIZE / 2) / CELL_SIZE));
export const cellKey = (x, y, z) => `${x},${y},${z}`;

export function generateCell(seed, x, y, z) {
  const origin = [x * CELL_SIZE, y * CELL_SIZE, z * CELL_SIZE];
  const point = (rng, margin = 0) => origin.map((n) => n + (rng() - 0.5) * (CELL_SIZE - margin * 2));
  const stars = [], planets = [], asteroids = [], nebulae = [], galaxies = [], events = [];
  const starRng = cellRandom(seed, x, y, z, 1);
  const count = 32 + Math.floor(starRng() * 29);
  for (let i = 0; i < count; i++) {
    stars.push({ position: point(starRng), size: 0.7 + starRng() ** 6 * 4, warmth: starRng(), brightness: 0.3 + starRng() * 0.7 });
  }
  const planetRng = cellRandom(seed, x, y, z, 2);
  const opening = x === 0 && y === 0 && z === 0;
  if (opening || planetRng() < 0.065) {
    const radius = opening ? 108 + planetRng() * 25 : 46 + planetRng() * 113;
    const position = opening ? [280 + planetRng() * 80, 90 + planetRng() * 70, -460] : point(planetRng, 190);
    planets.push({ id: `${x}:${y}:${z}:planet`, position, radius, palette: Math.floor(planetRng() * 3),
      rings: opening || planetRng() < 0.37, tilt: 0.18 + planetRng() * 0.7, phase: planetRng() * Math.PI * 2,
      moon: planetRng() < 0.5, seed: hash(seed, x, y, z, 23) });
  }
  const rockRng = cellRandom(seed, x, y, z, 3);
  if (!opening && rockRng() < 0.075) {
    const center = point(rockRng, 250);
    const rocks = 14 + Math.floor(rockRng() * 23);
    for (let i = 0; i < rocks; i++) asteroids.push({
      position: center.map((n) => n + (rockRng() - 0.5) * 400), radius: 3 + rockRng() * 13,
      rotation: [rockRng() * 6.28, rockRng() * 6.28, rockRng() * 6.28], stretch: 0.7 + rockRng() * 0.7,
    });
  }
  const cloudRng = cellRandom(seed, x, y, z, 4);
  if (cloudRng() < 0.085 || (x === 0 && y === 0 && z === -1)) {
    nebulae.push({ position: point(cloudRng, 250), radius: 320 + cloudRng() * 240,
      palette: Math.floor(cloudRng() * 3), rotation: cloudRng() * 6.28, seed: hash(seed, x, y, z, 4) });
  }
  const galaxyRng = cellRandom(seed, x, y, z, 5);
  if (galaxyRng() < 0.025) galaxies.push({ position: point(galaxyRng, 180), radius: 85 + galaxyRng() * 130,
    rotation: galaxyRng() * 6.28, seed: hash(seed, x, y, z, 5) });
  const eventRng = cellRandom(seed, x, y, z, 6);
  if (eventRng() < 0.003) events.push({ position: point(eventRng, 100), radius: 18, kind: 'binary', phase: eventRng() * 6.28 });
  return { key: cellKey(x, y, z), coordinates: [x, y, z], stars, planets, asteroids, nebulae, galaxies, events };
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
  }

  update(position, { now = () => performance.now(), onLoad = () => {}, onUnload = () => {} } = {}) {
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
    return loaded;
  }

  pointsOfInterest() {
    const result = [];
    for (const cell of this.cells.values()) result.push(...cell.planets, ...cell.nebulae, ...cell.galaxies);
    return result;
  }

  obstacles(position, range = 900) {
    const result = [];
    for (const cell of this.cells.values()) {
      if (cell.coordinates.some((n, i) => Math.abs(n * CELL_SIZE - position[i]) > range + CELL_SIZE)) continue;
      result.push(...cell.planets, ...cell.asteroids);
    }
    return result;
  }
}
