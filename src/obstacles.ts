import * as THREE from 'three';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { swellAt, type SwellSample } from './swell.js';
import { HEAD_X, WHALE_LENGTH } from './whale-model.js';
import type { WhaleState } from './whale.js';
import type { ShipHandle } from './ships.js';

/**
 * Kinematic obstacles in a spatial hash, beside the analytic ground and sea. Every mover in calm is kinematic and the
 * ground is a height field, so there is no physics engine: the whale and ships are capsules along their bodies, and a
 * rock, landmark or prop is a capsule whose ends meet (a sphere). Coordinates are absolute world metres.
 */

export type ObstacleKind = 'whale' | 'ship' | 'rock' | 'prop';

export type Obstacle = { kind: ObstacleKind; capsule: Capsule };

export type FeelerHit = { obstacle: Obstacle; distance: number };

export type Obstacles = {
  /** Forgets every obstacle; movers are added again each frame, after they move. */
  clear: () => void;
  add: (obstacle: Obstacle) => void;
  /** Obstacles that overlap `capsule`, leaving out `ignore` (the asker itself). */
  overlaps: (capsule: Capsule, ignore?: Obstacle) => Obstacle[];
  /**
   * First obstacle a sphere of `radius` meets when swept from `origin` along the unit vector `direction` for `length`
   * metres, with the distance it travels before touching; null when the way is clear.
   */
  feeler: (origin: THREE.Vector3, direction: THREE.Vector3, length: number, radius?: number, ignore?: Obstacle) => FeelerHit | null;
  readonly size: number;
};

/** Hash cell edge, metres: a few whale lengths, about one tall ship with room to spare. */
export const OBSTACLE_CELL = 64;

/** Cell indices stay well inside ±2^25, so a pair packs into one safe integer. */
const BIAS = 2 ** 25;
const key = (i: number, j: number): number => (i + BIAS) * 2 * BIAS + (j + BIAS);

export function createObstacles(cell = OBSTACLE_CELL): Obstacles {
  const cells = new Map<number, Obstacle[]>();
  const all: Obstacle[] = [];
  // An obstacle that spans several cells is tested once per query.
  const seen = new Set<Obstacle>();

  /** Calls `visit` for each obstacle in the cells under the XZ box of a segment grown by `pad`. */
  function near(a: THREE.Vector3, b: THREE.Vector3, pad: number, visit: (obstacle: Obstacle) => void): void {
    const i0 = Math.floor((Math.min(a.x, b.x) - pad) / cell);
    const i1 = Math.floor((Math.max(a.x, b.x) + pad) / cell);
    const j0 = Math.floor((Math.min(a.z, b.z) - pad) / cell);
    const j1 = Math.floor((Math.max(a.z, b.z) + pad) / cell);
    seen.clear();
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const list = cells.get(key(i, j));
        if (!list) continue;
        for (const obstacle of list) {
          if (seen.has(obstacle)) continue;
          seen.add(obstacle);
          visit(obstacle);
        }
      }
    }
  }

  const end = new THREE.Vector3();
  return {
    clear() {
      cells.clear();
      all.length = 0;
    },
    add(obstacle) {
      const { start, end: tip, radius } = obstacle.capsule;
      const i0 = Math.floor((Math.min(start.x, tip.x) - radius) / cell);
      const i1 = Math.floor((Math.max(start.x, tip.x) + radius) / cell);
      const j0 = Math.floor((Math.min(start.z, tip.z) - radius) / cell);
      const j1 = Math.floor((Math.max(start.z, tip.z) + radius) / cell);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const k = key(i, j);
          const list = cells.get(k);
          if (list) list.push(obstacle);
          else cells.set(k, [obstacle]);
        }
      }
      all.push(obstacle);
    },
    overlaps(capsule, ignore) {
      const found: Obstacle[] = [];
      near(capsule.start, capsule.end, capsule.radius, (obstacle) => {
        if (obstacle !== ignore && capsulesOverlap(capsule, obstacle.capsule)) found.push(obstacle);
      });
      return found;
    },
    feeler(origin, direction, length, radius = 0, ignore) {
      end.copy(direction).multiplyScalar(length).add(origin);
      let best: FeelerHit | null = null;
      near(origin, end, radius, (obstacle) => {
        if (obstacle === ignore) return;
        const { start, end: tip, radius: r } = obstacle.capsule;
        const t = rayCapsule(origin, direction, start, tip, r + radius);
        if (t >= 0 && t <= length && (!best || t < best.distance)) best = { obstacle, distance: t };
      });
      return best;
    },
    get size() {
      return all.length;
    },
  };
}

const d1 = new THREE.Vector3();
const d2 = new THREE.Vector3();
const r0 = new THREE.Vector3();
const c1 = new THREE.Vector3();
const c2 = new THREE.Vector3();

/** Squared distance between segments p1q1 and p2q2 (Ericson, Real-Time Collision Detection, 2005, §5.1.9). */
export function segmentDistanceSq(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3): number {
  d1.subVectors(q1, p1);
  d2.subVectors(q2, p2);
  r0.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r0);
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) return r0.lengthSq();
  if (a <= 1e-12) {
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r0);
    if (e <= 1e-12) {
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  c1.copy(d1).multiplyScalar(s).add(p1);
  c2.copy(d2).multiplyScalar(t).add(p2);
  return c1.distanceToSquared(c2);
}

export function capsulesOverlap(a: Capsule, b: Capsule): boolean {
  const reach = a.radius + b.radius;
  return segmentDistanceSq(a.start, a.end, b.start, b.end) <= reach * reach;
}

const ba = new THREE.Vector3();
const oa = new THREE.Vector3();
const oc = new THREE.Vector3();

/**
 * Distance along the ray (origin `ro`, unit direction `rd`) to the capsule pa–pb of radius `r`, or −1 on a miss; 0 when
 * the ray starts inside. Inigo Quilez, "Intersectors: capsule" (iquilezles.org/articles/intersectors, MIT).
 */
export function rayCapsule(ro: THREE.Vector3, rd: THREE.Vector3, pa: THREE.Vector3, pb: THREE.Vector3, r: number): number {
  ba.subVectors(pb, pa);
  oa.subVectors(ro, pa);
  const baba = ba.dot(ba);
  const baoa = ba.dot(oa);
  // Inside already: the nearest point of the segment is within r.
  const along = baba > 0 ? THREE.MathUtils.clamp(baoa / baba, 0, 1) : 0;
  if (oc.copy(ba).multiplyScalar(along).sub(oa).lengthSq() <= r * r) return 0;
  const bard = ba.dot(rd);
  const a = baba - bard * bard;
  // Where along the axis the ray meets the infinite cylinder; a ray along the axis (or a sphere) meets a cap first.
  let y = baoa;
  if (a > 1e-9) {
    const b = baba * rd.dot(oa) - baoa * bard;
    const c = baba * oa.dot(oa) - baoa * baoa - r * r * baba;
    const h = b * b - a * c;
    if (h < 0) return -1;
    const t = (-b - Math.sqrt(h)) / a;
    y = baoa + t * bard;
    if (y > 0 && y < baba) return t;
  }
  // The cap sphere at whichever end the ray reaches.
  if (y <= 0) oc.copy(oa);
  else oc.subVectors(ro, pb);
  const b = rd.dot(oc);
  const h = b * b - (oc.dot(oc) - r * r);
  return h >= 0 ? -b - Math.sqrt(h) : -1;
}

/** Half the whale's girth at its widest (about 1.2 m, see the model's outline), with a little room. */
export const WHALE_RADIUS = 1.3;

/** The whale's capsule: head to fluke tips along its heading and pitch, written into `out`. */
export function whaleCapsule(state: Pick<WhaleState, 'x' | 'y' | 'z' | 'heading' | 'pitch'>, out = new Capsule()): Capsule {
  // The head is on the model's −X: yaw, then nose-up pitch, carry it to this direction.
  const cp = Math.cos(state.pitch);
  const fx = -Math.cos(state.heading) * cp;
  const fy = Math.sin(state.pitch);
  const fz = Math.sin(state.heading) * cp;
  const head = -HEAD_X - WHALE_RADIUS;
  const tail = WHALE_LENGTH + HEAD_X - WHALE_RADIUS;
  out.start.set(state.x + fx * head, state.y + fy * head, state.z + fz * head);
  out.end.set(state.x - fx * tail, state.y - fy * tail, state.z - fz * tail);
  out.radius = WHALE_RADIUS;
  return out;
}

const shipAxis = new THREE.Vector3();

/** A ship's capsule: bow to stern along the hull, half the beam wide, at the waterline; written into `out`. */
export function shipCapsule(ship: Pick<ShipHandle, 'group' | 'size'>, out = new Capsule()): Capsule {
  const { position, quaternion, scale } = ship.group;
  const radius = (ship.size.beam / 2) * scale.x;
  const half = Math.max(0, (ship.size.length / 2) * scale.x - radius);
  // The hull is drawn along its own X; the group sits a quarter of its scale below the waterline.
  shipAxis.set(1, 0, 0).applyQuaternion(quaternion).multiplyScalar(half);
  out.start.copy(position).add(shipAxis);
  out.end.copy(position).sub(shipAxis);
  out.start.y += 0.25 * scale.x;
  out.end.y += 0.25 * scale.x;
  out.radius = radius;
  return out;
}

/** The analytic surfaces movers collide with. Both are exact height fields, so sampling them is exact collision. */
export type Surfaces = {
  /** Ground height in metres: land above the sea, the seafloor (negative) below it. */
  groundAt: (x: number, z: number) => number;
  /** Sea surface height at time `t` seconds of the swell's clock. */
  seaAt: (x: number, z: number, t: number) => number;
};

export function createSurfaces(seafloor: { heightAt: (x: number, z: number) => number }): Surfaces {
  const sample: SwellSample = { height: 0, slopeX: 0, slopeZ: 0 };
  return {
    groundAt: seafloor.heightAt,
    seaAt: (x, z, t) => swellAt(x, z, t, sample).height,
  };
}

/** Least height of a capsule's skin above the ground, sampled at its ends and middle: negative when it is inside. */
export function groundClearance(surfaces: Pick<Surfaces, 'groundAt'>, capsule: Capsule): number {
  let least = Infinity;
  for (const u of [0, 0.5, 1]) {
    const x = THREE.MathUtils.lerp(capsule.start.x, capsule.end.x, u);
    const y = THREE.MathUtils.lerp(capsule.start.y, capsule.end.y, u);
    const z = THREE.MathUtils.lerp(capsule.start.z, capsule.end.z, u);
    least = Math.min(least, y - capsule.radius - surfaces.groundAt(x, z));
  }
  return least;
}

/** Registers the whale and the ships afloat where they are now; call once a frame, after they move. */
export function createMoverSync(obstacles: Obstacles): (whale: WhaleState, ships: readonly ShipHandle[]) => void {
  const whaleObstacle: Obstacle = { kind: 'whale', capsule: new Capsule() };
  const shipObstacles = new WeakMap<ShipHandle, Obstacle>();
  return (whale, ships) => {
    obstacles.clear();
    whaleCapsule(whale, whaleObstacle.capsule);
    obstacles.add(whaleObstacle);
    for (const ship of ships) {
      let obstacle = shipObstacles.get(ship);
      if (!obstacle) shipObstacles.set(ship, (obstacle = { kind: 'ship', capsule: new Capsule() }));
      shipCapsule(ship, obstacle.capsule);
      obstacles.add(obstacle);
    }
  };
}
