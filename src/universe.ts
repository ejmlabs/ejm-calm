import { cellRandom, hash } from './rng.js';
import { noise3 } from './noise.js';
import art from './look.js';
import { sampleStar } from './astrophysics.js';
import { generateSystem, generateNebula, systemCellOf, updateSystem } from './systems.js';
import { sampleRockSize } from './rock-data.js';
import { weightedChoice } from './planet-data.js';

export const CELL_SIZE = art.stars.field.cellSize;
export const cellOf = (position: number[]): number[] => position.map((n) => Math.floor((n + CELL_SIZE / 2) / CELL_SIZE));
export const cellKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export function generateCell(seed: number, x: number, y: number, z: number) {
  const origin = [x * CELL_SIZE, y * CELL_SIZE, z * CELL_SIZE];
  const point = (rng: () => number, margin = 0) => origin.map((n) => n + (rng() - 0.5) * (CELL_SIZE - margin * 2));
  const stars: Array<Record<string, unknown>> = [], planets: unknown[] = [], asteroids: Array<{ position: number[]; radius: number; composition: string; tint: number; rotation: number[]; stretch: number }> = [], nebulae: unknown[] = [], galaxies: Array<{ position: number[]; radius: number; rotation: number; seed: number }> = [], events: Array<{ position: number[]; radius: number; kind: string; phase: number }> = [];
  let asteroidField = null;
  const starRng = cellRandom(seed, x, y, z, 1);
  const count = art.realism.depthLayers.field.perCell.high;
  for (let i = 0; i < count; i++) {
    const position = point(starRng), stellar = sampleStar(starRng, 'volume');
    stars.push({ position, ...stellar, size: 1.1, warmth: starRng(), brightness: 1, halo: false });
  }
  stars.sort((a, b) => Number(b.luminosity) - Number(a.luminosity));
  const rockRng = cellRandom(seed, x, y, z, 3);
  if (rockRng() < 0.075) {
    const center = point(rockRng, 250);
    asteroidField = { center, radius: 250 };
    for (let i = 0; i < art.asteroids.count.high; i++) {
      const radius = sampleRockSize(rockRng, art.asteroids.size[0], art.asteroids.size[1], art.realism.asteroids.sizePowerLaw);
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

export function regionAt(seed: number, position: number[]): number {
  return noise3(position[0] / 6500, position[1] / 6500, position[2] / 6500, seed) * 2;
}

export function regionWeights(seed: number, position: number[], { scale = 26000, sharpness = 2.2, bias = {} }: { scale?: number; sharpness?: number; bias?: Record<string, number> } = {}): number[] {
  const kinds = ['tidepool', 'ember', 'hollow'];
  const weights = kinds.map((kind, i) => Math.max(0.001, noise3(position[0] / scale + i * 19.7,
    position[1] / scale - i * 7.3, position[2] / scale + i * 31.1, hash(seed, 71, i)) + (bias[kind] ?? 0)) ** sharpness);
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((n) => n / sum);
}

export class Universe {
  seed: number;
  radius: number;
  cellBudget: number;
  timeBudget: number;
  cells: Map<string, ReturnType<typeof generateCell>>;
  pending: Array<{ coords: number[]; distance: number }>;
  center: string;
  revision: number;
  systems: Map<string, NonNullable<ReturnType<typeof generateSystem>>>;
  nebulae: Map<string, NonNullable<ReturnType<typeof generateNebula>>>;
  coarse: Map<string, { system: NonNullable<ReturnType<typeof generateSystem>> | null; nebula: NonNullable<ReturnType<typeof generateNebula>> | null }>;
  coarseQueue: Array<{ coordinates: number[]; distance: number }>;
  coarseCenter: string;

  constructor(seed: number, { radius = 2, cellBudget = 2, timeBudget = 3 }: { radius?: number; cellBudget?: number; timeBudget?: number } = {}) {
    this.seed = seed; this.radius = radius; this.cellBudget = cellBudget; this.timeBudget = timeBudget;
    this.cells = new Map(); this.pending = []; this.center = ''; this.revision = 0;
    this.systems = new Map(); this.nebulae = new Map(); this.coarse = new Map(); this.coarseQueue = []; this.coarseCenter = '';
  }

  update(position: number[], { now = () => performance.now(), onLoad = (_cell: ReturnType<typeof generateCell>) => {}, onUnload = (_cell: ReturnType<typeof generateCell>) => {}, onLoadSystem = (_system: NonNullable<ReturnType<typeof generateSystem>>) => {}, onUnloadSystem = (_system: NonNullable<ReturnType<typeof generateSystem>>) => {},
    onLoadNebula = (_nebula: NonNullable<ReturnType<typeof generateNebula>>) => {}, onUnloadNebula = (_nebula: NonNullable<ReturnType<typeof generateNebula>>) => {}, time = 0 }: {
      now?: () => number;
      onLoad?: (cell: ReturnType<typeof generateCell>) => void;
      onUnload?: (cell: ReturnType<typeof generateCell>) => void;
      onLoadSystem?: (system: NonNullable<ReturnType<typeof generateSystem>>) => void;
      onUnloadSystem?: (system: NonNullable<ReturnType<typeof generateSystem>>) => void;
      onLoadNebula?: (nebula: NonNullable<ReturnType<typeof generateNebula>>) => void;
      onUnloadNebula?: (nebula: NonNullable<ReturnType<typeof generateNebula>>) => void;
      time?: number;
    } = {}) {
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
      const next = this.pending.shift()!;
      const cell = generateCell(this.seed, next.coords[0]!, next.coords[1]!, next.coords[2]!);
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
      const item = this.coarseQueue.shift()!;
      const coordinates = item.coordinates;
      const key = coordinates.join(',');
      const generated = generateSystem(this.seed, coordinates[0]!, coordinates[1]!, coordinates[2]!);
      const system = generated ? (this.systems.get(generated.key) ?? generated) : null;
      const nebula = generateNebula(this.seed, coordinates[0]!, coordinates[1]!, coordinates[2]!);
      if (system) { updateSystem(system, time); if (!this.systems.has(system.key)) { this.systems.set(system.key, system); onLoadSystem(system); } }
      if (nebula) { this.nebulae.set(nebula.key, nebula); onLoadNebula(nebula); }
      this.coarse.set(key, { system, nebula });
    }
    for (const system of this.systems.values()) updateSystem(system, time);
    return loaded;
  }

  pointsOfInterest() {
    // planets + nebulae for autopilot interest
    const result = [];
    for (const system of this.systems.values()) result.push(...system.planets);
    result.push(...this.nebulae.values());
    return result;
  }

  obstacles(position: number[], range = 900): unknown[] {
    const result: unknown[] = [], rocks: Array<{ rock: ReturnType<typeof generateCell>['asteroids'][number]; distance: number }> = [];
    for (const cell of this.cells.values()) {
      if (cell.coordinates.some((n, i) => Math.abs(n * CELL_SIZE - position[i]) > range + CELL_SIZE)) continue;
      for (const rock of cell.asteroids) {
        const distance = Math.hypot(rock.position[0] - position[0], rock.position[1] - position[1], rock.position[2] - position[2]);
        if (distance < rock.radius + 450) rocks.push({ rock, distance });
      }
    }
    for (const system of this.systems.values()) {
      for (const star of system.stars) {
        if (Math.hypot(...star.position.map((n, i) => n - position[i]!)) < range + star.clearanceRadius * 2) result.push(star);
      }
      for (const body of system.planets) {
        const extent = body.rings ? body.radius * body.ring.outer : body.radius;
        if (Math.hypot(...body.position.map((n, i) => n - position[i]!)) < range + extent * 2) result.push(body);
        for (const moon of body.moons) {
          if (!moon.position || moon.worldRadius == null) continue;
          if (Math.hypot(...moon.position.map((n: number, i: number) => n - position[i]!)) < range + moon.worldRadius * 2) {
            result.push({ position: moon.position, radius: moon.worldRadius, type: 'rocky' });
          }
        }
      }
    }
    result.push(...rocks.sort((a, b) => a.distance - b.distance).slice(0, 64).map((entry) => entry.rock)); return result;
  }

  nearestSystem(position: number[]) {
    let nearest = null, best = Infinity;
    for (const system of this.systems.values()) {
      const distance = Math.hypot(...system.position.map((n, i) => n - position[i]));
      if (distance < best) { best = distance; nearest = system; }
    }
    return nearest;
  }
}
