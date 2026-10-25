import { fork, hash } from './rng.js';
import { fbm2, makeNoise2D, ridged2 } from './noise.js';
import { clamp, distance2 } from './math.js';

export type IslandSpec = {
  id: number;
  x: number;
  z: number;
  radius: number;
  height: number;
  mountain: boolean;
  seed: number;
};

export type ShipSpec = {
  id: number;
  x: number;
  z: number;
  heading: number;
  scale: number;
  kind: 'sloop' | 'tall';
  seed: number;
};

export type WorldLayout = {
  islands: IslandSpec[];
  ships: ShipSpec[];
  whaleHome: { x: number; z: number };
  /** Camera yaw (radians): subjects in look direction (−sin, −cos). */
  viewYaw: number;
};

/** Camera look direction on XZ for a yaw (matches CalmCamera). */
export function lookDirXZ(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Point along camera look from an origin (camera convention). */
export function pointAlongYaw(
  yaw: number,
  dist: number,
  origin: { x: number; z: number } = { x: 0, z: 0 },
): { x: number; z: number } {
  const d = lookDirXZ(yaw);
  return { x: origin.x + d.x * dist, z: origin.z + d.z * dist };
}

/**
 * True if `point` lies inside a portrait half-cone around the look direction
 * from `focus` (default half-angle ~38°, enough for FOV 62° × ~9:16).
 */
export function inPortraitViewCone(
  yaw: number,
  focus: { x: number; z: number },
  point: { x: number; z: number },
  halfConeRad = (38 * Math.PI) / 180,
): boolean {
  const look = lookDirXZ(yaw);
  const dx = point.x - focus.x;
  const dz = point.z - focus.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) return true;
  const dot = (dx / len) * look.x + (dz / len) * look.z;
  const angle = Math.acos(clamp(dot, -1, 1));
  return angle <= halfConeRad;
}

export function sampleIslandHeight(
  island: IslandSpec,
  localX: number,
  localZ: number,
): number {
  const noise = makeNoise2D(island.seed, 1);
  const ridge = makeNoise2D(island.seed, 2);
  const r = Math.hypot(localX, localZ) / Math.max(1, island.radius);
  if (r >= 1) return 0;
  const falloff = Math.pow(1 - r * r, 1.65);
  const base = fbm2(noise, localX * 0.035, localZ * 0.035, 5);
  const ridges = island.mountain ? ridged2(ridge, localX * 0.02, localZ * 0.02, 4) : 0;
  const height = (0.35 + 0.45 * (base * 0.5 + 0.5) + 0.55 * ridges) * island.height * falloff;
  return Math.max(0, height);
}

/** Build a finite heightfield for one island. Heights are world Y above water. */
export function buildHeightfield(
  island: IslandSpec,
  segments: number,
): { size: number; heights: Float32Array; maxHeight: number } {
  const size = island.radius * 2.2;
  const count = segments + 1;
  const heights = new Float32Array(count * count);
  let maxHeight = 0;
  for (let iz = 0; iz < count; iz++) {
    for (let ix = 0; ix < count; ix++) {
      const u = ix / segments;
      const v = iz / segments;
      const lx = (u - 0.5) * size;
      const lz = (v - 0.5) * size;
      const h = sampleIslandHeight(island, lx, lz);
      heights[iz * count + ix] = h;
      if (h > maxHeight) maxHeight = h;
    }
  }
  return { size, heights, maxHeight };
}

function placeAway(
  rng: () => number,
  existing: Array<{ x: number; z: number; radius: number }>,
  minR: number,
  maxR: number,
  clearance: number,
  attempts = 48,
  /** When set, place along camera yaw convention (−sin/−cos). */
  yawBias?: { center: number; spread: number },
): { x: number; z: number } | null {
  for (let i = 0; i < attempts; i++) {
    const angle = yawBias
      ? yawBias.center + (rng() - 0.5) * 2 * yawBias.spread
      : rng() * Math.PI * 2;
    const dist = minR + rng() * (maxR - minR);
    // Camera convention: lookDir = (−sin θ, −cos θ).
    const x = -Math.sin(angle) * dist;
    const z = -Math.cos(angle) * dist;
    let ok = true;
    for (const other of existing) {
      if (distance2(x, z, other.x, other.z) < other.radius + clearance) {
        ok = false;
        break;
      }
    }
    if (ok) return { x, z };
  }
  return null;
}

function shortestAngle(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/**
 * Subject-derived camera yaw: hero ship primary, nearest-in-front island secondary.
 * Sun azimuth is only a tiebreak.
 */
export function computeViewYaw(
  whale: { x: number; z: number },
  hero: { x: number; z: number },
  islands: IslandSpec[],
  sunAzimuthDeg: number,
): number {
  const sunYaw = (sunAzimuthDeg * Math.PI) / 180;
  // Focus matches main.ts: whale 0.78 + hero 0.22.
  const focus = {
    x: whale.x * 0.78 + hero.x * 0.22,
    z: whale.z * 0.78 + hero.z * 0.22,
  };

  // Hero is the primary subject — yaw must keep it in the portrait cone.
  const heroDx = hero.x - focus.x;
  const heroDz = hero.z - focus.z;
  const heroLen = Math.hypot(heroDx, heroDz);
  let yaw =
    heroLen > 1e-3
      ? Math.atan2(-heroDx / heroLen, -heroDz / heroLen)
      : sunYaw;

  // Nearest island already roughly in front of the hero heading (ignore behind-camera blobs).
  let nearest: IslandSpec | null = null;
  let nearestD = Infinity;
  const front = lookDirXZ(yaw);
  for (const island of islands) {
    const dx = island.x - focus.x;
    const dz = island.z - focus.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) continue;
    const dot = (dx / len) * front.x + (dz / len) * front.z;
    if (dot < 0.55) continue; // outside ~±57°
    if (len < nearestD) {
      nearestD = len;
      nearest = island;
    }
  }

  if (nearest) {
    const dx = nearest.x - focus.x;
    const dz = nearest.z - focus.z;
    const len = Math.hypot(dx, dz);
    const islandYaw = Math.atan2(-dx / len, -dz / len);
    const delta = shortestAngle(yaw, islandYaw);
    // Soft pull toward the silhouette; keep hero inside a ~30° half-cone.
    yaw += clamp(delta, -0.35, 0.35) * 0.28;
  }

  // Sun glitter as tiebreak only.
  {
    const delta = shortestAngle(yaw, sunYaw);
    yaw += clamp(delta, -0.12, 0.12) * 0.25;
  }
  return yaw;
}

export function layoutWorld(seed: number, sunAzimuthDeg = 185): WorldLayout {
  const rng = fork(seed, 'layout');
  const sunYaw = (sunAzimuthDeg * Math.PI) / 180;
  const islandCount = 2 + Math.floor(rng() * 3); // 2–4
  const islands: IslandSpec[] = [];
  const occupied: Array<{ x: number; z: number; radius: number }> = [];

  // Whale first (near origin), then hero along sun, then silhouette island in that cone.
  const whalePos = placeAway(rng, occupied, 8, 36, 22) ?? { x: 10, z: -16 };
  occupied.push({ x: whalePos.x, z: whalePos.z, radius: 16 });

  const shipCount = 2 + Math.floor(rng() * 4); // 2–5
  const ships: ShipSpec[] = [];

  const heroPos = placeAway(
    rng,
    occupied,
    70,
    130,
    18,
    60,
    { center: sunYaw, spread: (14 * Math.PI) / 180 },
  ) ?? pointAlongYaw(sunYaw, 95, whalePos);
  {
    const kind: ShipSpec['kind'] = rng() > 0.4 ? 'tall' : 'sloop';
    const spec: ShipSpec = {
      id: 0,
      x: heroPos.x,
      z: heroPos.z,
      heading: sunYaw + Math.PI * 0.5,
      scale: kind === 'tall' ? 1.35 * (1.1 + rng() * 0.25) : 1.0 + rng() * 0.25,
      kind,
      seed: hash(seed, 'ship', 0),
    };
    ships.push(spec);
    occupied.push({ x: spec.x, z: spec.z, radius: 14 });
  }

  // Provisional subject yaw (hero-primary) before islands.
  let viewYaw = computeViewYaw(whalePos, ships[0]!, [], sunAzimuthDeg);

  for (let i = 0; i < islandCount; i++) {
    const mountain = i === 0 || (i === islandCount - 1 && rng() > 0.4);
    // Near silhouette stays small so its peak is under ~40% of a phone frame.
    const radius = mountain ? (i === 0 ? 32 + rng() * 10 : 48 + rng() * 22) : 24 + rng() * 16;
    const inCone = i === 0;
    const minR = inCone ? 280 : 340 + i * 40;
    const maxR = inCone ? 380 : 620 + i * 30;
    const bias = inCone
      ? { center: viewYaw, spread: (14 * Math.PI) / 180 }
      : { center: viewYaw + (i % 2 === 0 ? 1.1 : -1.1), spread: (50 * Math.PI) / 180 };
    const fallbackYaw = inCone ? viewYaw : viewYaw + (i % 2 === 0 ? 1.2 : -1.2);
    const pos = placeAway(
      rng,
      occupied,
      minR,
      maxR,
      radius + 55,
      80,
      bias,
    ) ?? pointAlongYaw(fallbackYaw, (minR + maxR) / 2);
    const spec: IslandSpec = {
      id: i,
      x: pos.x,
      z: pos.z,
      radius,
      height: mountain ? (i === 0 ? 16 + rng() * 10 : 28 + rng() * 18) : 7 + rng() * 8,
      mountain,
      seed: hash(seed, 'island', i),
    };
    islands.push(spec);
    occupied.push({ x: spec.x, z: spec.z, radius: spec.radius * 1.15 });
  }

  for (let i = 1; i < shipCount; i++) {
    const pos = placeAway(rng, occupied, 50, 220, 18);
    if (!pos) continue;
    const kind: ShipSpec['kind'] = rng() > 0.55 ? 'tall' : 'sloop';
    const spec: ShipSpec = {
      id: i,
      x: pos.x,
      z: pos.z,
      heading: rng() * Math.PI * 2,
      scale: kind === 'tall' ? 1.3 * (1.05 + rng() * 0.3) : 0.85 + rng() * 0.3,
      kind,
      seed: hash(seed, 'ship', i),
    };
    ships.push(spec);
    occupied.push({ x: spec.x, z: spec.z, radius: 12 });
  }

  viewYaw = computeViewYaw(whalePos, ships[0]!, islands, sunAzimuthDeg);

  // Re-aim hero heading so sails read sideways to the camera.
  ships[0]!.heading = viewYaw + Math.PI * 0.5 + (rng() - 0.5) * 0.25;

  return {
    islands,
    ships,
    whaleHome: whalePos,
    viewYaw,
  };
}

export function islandsOverlap(a: IslandSpec, b: IslandSpec): boolean {
  return distance2(a.x, a.z, b.x, b.z) < a.radius + b.radius;
}

export function shipHitsIsland(ship: ShipSpec, island: IslandSpec, margin = 10): boolean {
  return distance2(ship.x, ship.z, island.x, island.z) < island.radius + margin;
}

export function clampShipClearOfIslands(
  x: number,
  z: number,
  islands: IslandSpec[],
  margin = 12,
): { x: number; z: number } {
  let cx = x;
  let cz = z;
  for (const island of islands) {
    const d = distance2(cx, cz, island.x, island.z);
    const need = island.radius + margin;
    if (d < need && d > 1e-4) {
      const push = (need - d) / d;
      cx += (cx - island.x) * push;
      cz += (cz - island.z) * push;
    } else if (d <= 1e-4) {
      cx = island.x + need;
      cz = island.z;
    }
  }
  return { x: cx, z: cz };
}

const SAND: [number, number, number] = [0xb8 / 255, 0xa8 / 255, 0x88 / 255]; // #b8a888
const FOREST_LO: [number, number, number] = [0x2f / 255, 0x4a / 255, 0x2c / 255]; // #2f4a2c
const FOREST_HI: [number, number, number] = [0x3d / 255, 0x5a / 255, 0x34 / 255]; // #3d5a34
const ROCK_LO: [number, number, number] = [0x5e / 255, 0x5a / 255, 0x52 / 255]; // #5e5a52
const ROCK_HI: [number, number, number] = [0x6f / 255, 0x66 / 255, 0x5a / 255]; // #6f665a

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const u = clamp(t, 0, 1);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/** Muted forest / grey-brown rock. Sand only in a thin waterline band. No snow. */
export function waterlineColor(
  height: number,
  maxHeight: number,
  slopeY = 1,
  _opts?: { allowSnow?: boolean },
): [number, number, number] {
  const t = clamp(height / Math.max(0.001, maxHeight), 0, 1);
  const forest = mixRgb(FOREST_LO, FOREST_HI, t);
  // Steep faces and high peaks drift to rock; gentle slopes stay forest.
  const steep = clamp((0.82 - slopeY) / 0.42, 0, 1);
  const peak = clamp((t - 0.62) / 0.3, 0, 1);
  const rockAmt = clamp(steep * 0.85 + peak * 0.55, 0, 1);
  const rock = mixRgb(ROCK_LO, ROCK_HI, t);
  const land = mixRgb(forest, rock, rockAmt);
  // Thin sand only at the waterline, blended out by ~1.4 m.
  if (height < 1.4) return mixRgb(SAND, land, clamp(height / 1.4, 0, 1));
  return land;
}
