import * as THREE from 'three';
import { hash } from './rng.js';
import { smoothstep } from './math.js';
import type { QualityTier } from './quality.js';

/** Instances per tier: foam flecks drawn in one call. */
export const FLECKS: Record<QualityTier, number> = { low: 200, medium: 300, high: 400 };

/** The field around the whale, in its own frame (metres): flecks that fall behind or wander wide are put back ahead. */
export const FIELD = { ahead: 85, behind: 32, side: 34 };
/** Foam rides just above the flat water. */
const LIFT = 0.05;

export type FleckSource = { x: number; z: number; heading: number; speed: number };

export type Flecks = {
  mesh: THREE.InstancedMesh;
  /** `origin` is the floating origin (world position of render 0, 0). */
  update: (source: FleckSource, origin: { x: number; z: number }, dt: number) => void;
  /** Daylight, 0 to 1: the flecks darken with the sea at dusk and night. */
  setLight: (level: number) => void;
  setTier: (tier: QualityTier) => void;
  /** Flecks in the field (the instance count). */
  count: () => number;
  dispose: () => void;
};

/**
 * Small foam streaks that sit on the water around the whale. They hold still in the world, so the whale's speed
 * makes them slide past the camera; one that falls behind reappears ahead, out of sight at the field's far edge.
 */
export function createFlecks(seed: number, tier: QualityTier): Flecks {
  const max = FLECKS.high;
  let count = FLECKS[tier];
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  // A soft streak: bright in the middle, gone at the edges, made here rather than shipped.
  const soft = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const u = (x - 7.5) / 8;
      const v = (y - 7.5) / 8;
      soft.fill(Math.round(255 * Math.max(0, 1 - u * u) ** 2 * Math.max(0, 1 - v * v) ** 2), (y * 16 + x) * 4, (y * 16 + x) * 4 + 4);
    }
  }
  const alphaMap = new THREE.DataTexture(soft, 16, 16, THREE.RGBAFormat);
  alphaMap.magFilter = THREE.LinearFilter;
  alphaMap.minFilter = THREE.LinearFilter;
  alphaMap.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, fog: false });
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.count = count;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.name = 'flecks';

  const fx = new Float64Array(max);
  const fz = new Float64Array(max);
  const turn = new Float32Array(max);
  const size = new Float32Array(max);
  const age = new Float32Array(max);
  let serial = 0;
  let placed = false;
  let lastX = 0;
  let lastZ = 0;
  const roll = (): number => hash(seed, 'fleck', serial++) / 0x100000000;

  /** Puts a fleck at (forward, lateral) metres in the frame of the source. */
  function place(i: number, source: FleckSource, forward: number, lateral: number): void {
    const dx = -Math.cos(source.heading);
    const dz = Math.sin(source.heading);
    fx[i] = source.x + dx * forward - dz * lateral;
    fz[i] = source.z + dz * forward + dx * lateral;
    turn[i] = (roll() - 0.5) * 0.5;
    size[i] = 0.6 + roll() * 0.9;
    age[i] = 0;
  }

  const dummy = new THREE.Object3D();
  const lastSource: FleckSource = { x: 0, z: 0, heading: 0, speed: 0 };
  return {
    mesh,
    update(source, origin, dt) {
      const dx = -Math.cos(source.heading);
      const dz = Math.sin(source.heading);
      // A jump (debug travel, a reload) scatters the field again.
      if (placed && Math.hypot(source.x - lastX, source.z - lastZ) > FIELD.ahead) placed = false;
      lastX = source.x;
      lastZ = source.z;
      Object.assign(lastSource, { x: source.x, z: source.z, heading: source.heading, speed: source.speed });
      if (!placed) {
        // The first sight: scattered over the whole field.
        for (let i = 0; i < count; i++) place(i, source, -FIELD.behind + roll() * (FIELD.ahead + FIELD.behind), (roll() * 2 - 1) * FIELD.side);
        placed = true;
      }
      const length = 0.8 + 0.09 * Math.min(28, source.speed);
      for (let i = 0; i < count; i++) {
        const rx = fx[i]! - source.x;
        const rz = fz[i]! - source.z;
        const forward = rx * dx + rz * dz;
        const lateral = -rx * dz + rz * dx;
        if (forward < -FIELD.behind || Math.abs(lateral) > FIELD.side * 1.25 || forward > FIELD.ahead * 1.5) {
          // Behind: back to the far edge, spread over the first stretch so they arrive in a steady stream.
          place(i, source, FIELD.ahead * (0.8 + 0.2 * roll()), (roll() * 2 - 1) * FIELD.side);
        }
        age[i] = Math.min(1, age[i]! + dt * 1.5);
        // Fade in at the far edge, and out at the near and wide edges.
        const edge =
          (1 - smoothstep(FIELD.ahead * 0.75, FIELD.ahead, forward)) *
          smoothstep(-FIELD.behind, -FIELD.behind * 0.6, forward) *
          (1 - smoothstep(FIELD.side * 0.7, FIELD.side * 1.1, Math.abs(lateral)));
        const grow = edge * age[i]!;
        dummy.position.set(fx[i]! - origin.x, LIFT, fz[i]! - origin.z);
        dummy.rotation.set(0, source.heading - Math.PI / 2 + turn[i]!, 0);
        dummy.scale.set(size[i]! * 0.7 * grow, 1, size[i]! * length * grow);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    setLight(level) {
      material.color.setScalar(0.3 + 0.7 * level);
    },
    setTier(next) {
      const was = count;
      count = FLECKS[next];
      mesh.count = count;
      // Flecks switched on again start in the field, not where they were left.
      for (let i = was; i < count; i++) place(i, lastSource, -FIELD.behind + roll() * (FIELD.ahead + FIELD.behind), (roll() * 2 - 1) * FIELD.side);
    },
    count: () => count,
    dispose() {
      geometry.dispose();
      alphaMap.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
