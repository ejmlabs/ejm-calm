import * as THREE from 'three';
import { smoothstep } from './math.js';

/** Where a wake is made: world metres, heading as the whale's (forward = (−cos h, sin h)), height of the body and speed in m/s. */
export type WakeSource = { x: number; y: number; z: number; heading: number; speed: number };

export type WakeOptions = {
  /** Points of the trail, one per `interval` seconds. */
  points?: number;
  interval?: number;
  /** Metres from the source back to where the trail starts (the stern). */
  stern?: number;
  /** Metres from the source forward to the bow. */
  bow?: number;
  /** Half-width of the trail at its start and the growth per second of age. */
  width?: number;
  spread?: number;
  /** Wake strength follows speed over this range (m/s). */
  speeds?: readonly [number, number];
};

export type Wake = {
  /** A trail ribbon and a bow wave: two draws, added to the world group (world coordinates, floating origin applied by the parent). */
  group: THREE.Group;
  update: (source: WakeSource, dt: number) => void;
  /** Daylight, 0 to 1: the foam darkens with the sea at dusk and night. */
  setLight: (level: number) => void;
  /** Metres of trail drawn at more than `alpha` opacity right now (debug and tests). */
  length: (alpha?: number) => number;
  /** Draws made last frame. */
  draws: () => number;
  dispose: () => void;
};

const COLOR = new THREE.Color(0xeaf3f6);
/** Foam rides just above the flat water plane. */
const LIFT = 0.04;
/** Seconds of age at which the trail has faded out. */
const LIFE = 6.4;
const PEAK = 0.4;
/** Columns across the trail and how strong each is: a soft ridge down the middle that melts into the sea at both edges. */
const ACROSS = [-1, -0.5, 0, 0.5, 1] as const;
const ACROSS_ALPHA = [0, 0.4, 1, 0.4, 0] as const;
const COLUMNS = ACROSS.length;

/** Strength of the wake of a body: none when slow or under water, full when fast and at the surface. */
export function wakeStrength(speed: number, y: number, speeds: readonly [number, number] = [3, 14]): number {
  return smoothstep(speeds[0], speeds[1], speed) * smoothstep(-2.6, -0.9, y);
}

/**
 * A foam trail and a bow wave for something that swims or sails: soft ribbons on the water, one vertex colour
 * alpha per point, no texture. The trail's points are kept relative to the source so far coordinates stay exact.
 */
export function createWake(options: WakeOptions = {}): Wake {
  const count = options.points ?? 64;
  const interval = options.interval ?? 0.1;
  const stern = options.stern ?? 5;
  const bow = options.bow ?? 6;
  const width = options.width ?? 0.9;
  const spread = options.spread ?? 0.55;
  const speeds = options.speeds ?? [3, 14];

  // Trail points, newest first in ring order: world x, z, heading, strength, age.
  const px = new Float64Array(count);
  const pz = new Float64Array(count);
  const ph = new Float64Array(count);
  const ps = new Float64Array(count);
  const pa = new Float64Array(count);
  const pn = new Float64Array(count);
  let serial = 0;
  let head = 0;
  let filled = 0;
  let since = interval;
  let strength = 0;

  const trailPositions = new Float32Array(count * COLUMNS * 3);
  const trailColors = new Float32Array(count * COLUMNS * 4);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 4).setUsage(THREE.DynamicDrawUsage));
  const trailIndex: number[] = [];
  for (let i = 0; i + 1 < count; i++) {
    for (let c = 0; c + 1 < COLUMNS; c++) {
      const a = i * COLUMNS + c;
      const b = a + COLUMNS;
      trailIndex.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  trailGeometry.setIndex(trailIndex);
  trailGeometry.setDrawRange(0, 0);

  // Bow wave: a flat chevron whose two arms sweep back from the nose.
  const ARM = 5;
  const bowBase = new Float32Array(ARM * 2 * 2 * 3);
  const bowColors = new Float32Array(ARM * 2 * 2 * 4);
  const bowGeometry = new THREE.BufferGeometry();
  const bowPos = new THREE.BufferAttribute(bowBase, 3).setUsage(THREE.DynamicDrawUsage);
  bowGeometry.setAttribute('position', bowPos);
  bowGeometry.setAttribute('color', new THREE.BufferAttribute(bowColors, 4).setUsage(THREE.DynamicDrawUsage));
  const bowIndex: number[] = [];
  // Two arms (port and starboard), each a strip of ARM segments of two vertices.
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i + 1 < ARM; i++) {
      const a = arm * ARM * 2 + i * 2;
      bowIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  bowGeometry.setIndex(bowIndex);

  const material = new THREE.MeshBasicMaterial({
    color: COLOR,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // White water should stay white, as the whale's own spray does.
    toneMapped: false,
    fog: false,
  });
  const trail = new THREE.Mesh(trailGeometry, material);
  const bowMesh = new THREE.Mesh(bowGeometry, material);
  for (const mesh of [trail, bowMesh]) {
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.visible = false;
  }
  const group = new THREE.Group();
  group.name = 'wake';
  group.add(trail, bowMesh);

  /** Opacity of a point of this age and strength. */
  const fade = (age: number, s: number): number => PEAK * s * (1 - smoothstep(0, LIFE, age)) ** 1.5 * smoothstep(0, 0.4, age);

  function writeTrail(source: WakeSource): void {
    // The mesh sits on the source, so vertices are small offsets.
    trail.position.set(source.x, LIFT, source.z);
    let written = 0;
    for (let k = 0; k < filled; k++) {
      const i = (head - 1 - k + count * 2) % count;
      const age = pa[i]!;
      // Churned water is patchy: each point is a little stronger or weaker than its neighbours.
      const a = fade(age, ps[i]!) * (0.72 + 0.28 * Math.sin(pn[i]!));
      const half = width + spread * age;
      // Across the heading: the whale's right is (−fz, fx) with forward (−cos h, sin h).
      const fx = -Math.cos(ph[i]!);
      const fz = Math.sin(ph[i]!);
      const cx = px[i]! - source.x;
      const cz = pz[i]! - source.z;
      for (let c = 0; c < COLUMNS; c++) {
        const o = (written * COLUMNS + c) * 3;
        const side = ACROSS[c]! * half;
        trailPositions[o] = cx - fz * side;
        trailPositions[o + 1] = 0;
        trailPositions[o + 2] = cz + fx * side;
        const q = (written * COLUMNS + c) * 4;
        trailColors[q] = 1;
        trailColors[q + 1] = 1;
        trailColors[q + 2] = 1;
        trailColors[q + 3] = a * ACROSS_ALPHA[c]!;
      }
      written++;
    }
    trailGeometry.setDrawRange(0, Math.max(0, written - 1) * (COLUMNS - 1) * 6);
    trailGeometry.attributes['position']!.needsUpdate = true;
    trailGeometry.attributes['color']!.needsUpdate = true;
  }

  function writeBow(source: WakeSource, s: number): void {
    const fx = -Math.cos(source.heading);
    const fz = Math.sin(source.heading);
    bowMesh.position.set(source.x + fx * bow, LIFT, source.z + fz * bow);
    // Longer and wider the faster it goes.
    const run = 2.2 + 5 * s;
    const open = 0.28 + 0.12 * s;
    for (let arm = 0; arm < 2; arm++) {
      const side = arm === 0 ? 1 : -1;
      for (let i = 0; i < ARM; i++) {
        const u = i / (ARM - 1);
        // Back along the heading and out to the side; each station is a thin strip of growing width.
        const back = u * run;
        const out = side * (back * open + 0.1);
        const thick = 0.18 + 0.5 * u * s;
        const o = (arm * ARM + i) * 6;
        for (let edge = 0; edge < 2; edge++) {
          const w = out + side * (edge === 0 ? -thick : thick) * 0.5;
          // Right of the heading is (−fz, fx).
          bowBase[o + edge * 3] = -fx * back + -fz * w;
          bowBase[o + edge * 3 + 1] = 0;
          bowBase[o + edge * 3 + 2] = -fz * back + fx * w;
        }
        const a = PEAK * 1.3 * s * (1 - u) ** 1.2;
        const c = (arm * ARM + i) * 8;
        for (let edge = 0; edge < 2; edge++) {
          bowColors[c + edge * 4] = 1;
          bowColors[c + edge * 4 + 1] = 1;
          bowColors[c + edge * 4 + 2] = 1;
          bowColors[c + edge * 4 + 3] = a * (edge === 0 ? 1 : 0.35);
        }
      }
    }
    bowPos.needsUpdate = true;
    bowGeometry.attributes['color']!.needsUpdate = true;
  }

  let drawn = 0;
  return {
    group,
    update(source, dt) {
      strength = wakeStrength(source.speed, source.y, speeds);
      const fx = -Math.cos(source.heading);
      const fz = Math.sin(source.heading);
      for (let k = 0; k < filled; k++) pa[(head - 1 - k + count * 2) % count]! += dt;
      since += dt;
      // A jump (a recentre of the debug travel) leaves the old trail behind: start again.
      if (filled > 0) {
        const last = (head - 1 + count) % count;
        if (Math.hypot(source.x - px[last]!, source.z - pz[last]!) > 120) filled = 0;
      }
      if (since >= interval && strength > 0.02) {
        since = 0;
        px[head] = source.x - fx * stern;
        pz[head] = source.z - fz * stern;
        ph[head] = source.heading;
        ps[head] = strength;
        pa[head] = 0;
        pn[head] = serial++ * 1.9;
        head = (head + 1) % count;
        filled = Math.min(count, filled + 1);
      }
      // Anything that has faded out is no longer drawn.
      let live = 0;
      for (let k = 0; k < filled; k++) {
        if (pa[(head - 1 - k + count * 2) % count]! < LIFE) live++;
        else break;
      }
      filled = live;
      const showTrail = filled > 1;
      trail.visible = showTrail;
      if (showTrail) writeTrail(source);
      const showBow = strength > 0.02;
      bowMesh.visible = showBow;
      if (showBow) writeBow(source, strength);
      drawn = (showTrail ? 1 : 0) + (showBow ? 1 : 0);
    },
    length(alpha = 0.1) {
      let metres = 0;
      for (let k = 1; k < filled; k++) {
        const i = (head - 1 - k + count * 2) % count;
        const j = (head - k + count * 2) % count;
        // The newest points are still fading in; only the fade-out ends the count.
        if (pa[i]! > 0.4 && fade(pa[i]!, ps[i]!) < alpha) break;
        metres += Math.hypot(px[i]! - px[j]!, pz[i]! - pz[j]!);
      }
      return metres;
    },
    setLight(level) {
      material.color.setScalar(0.1 + 0.9 * level);
    },
    draws: () => drawn,
    dispose() {
      trailGeometry.dispose();
      bowGeometry.dispose();
      material.dispose();
    },
  };
}
