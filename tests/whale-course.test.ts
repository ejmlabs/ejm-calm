import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fork } from '../src/rng.js';
import { layoutWorld, type IslandSpec } from '../src/terrain.js';
import {
  WHALE_ISLAND_MARGIN,
  WHALE_MAX_TURN_RATE,
  createWhalePilot,
  shortestAngle,
  whaleForward,
  type WhaleCourse,
} from '../src/whale-course.js';

const DT = 1 / 60;
const DURATION = 120;
const STEPS = Math.round(DURATION / DT);
const SEEDS = [0, 7, 42, 1234, 99991];

function initialHeading(seed: number): number {
  return fork(seed, 'whale')() * Math.PI * 2;
}

function simulate(seed: number, islands: IslandSpec[], dt = DT, seconds = DURATION) {
  const world = layoutWorld(seed);
  const heading = initialHeading(seed);
  const pilot = createWhalePilot(seed, world.whaleHome, heading);
  const course: WhaleCourse = { x: world.whaleHome.x, z: world.whaleHome.z, heading, leg: heading };
  const steps = Math.round(seconds / dt);
  const xs = new Float64Array(steps);
  const zs = new Float64Array(steps);
  let turned = 0;
  let prev = course.heading;
  let minIsland = Infinity;
  for (let i = 0; i < steps; i++) {
    pilot.step(course, dt, i * dt, islands);
    const delta = Math.abs(shortestAngle(prev, course.heading));
    assert.ok(delta <= pilot.params.turnRate * dt + 1e-8, `seed ${seed} turn ${delta} > limit`);
    assert.ok(Number.isFinite(course.heading) && Math.abs(course.heading) <= Math.PI + 1e-8);
    assert.ok(Number.isFinite(course.x) && Number.isFinite(course.z));
    turned += delta;
    prev = course.heading;
    xs[i] = course.x;
    zs[i] = course.z;
    for (const island of islands) {
      const d = Math.hypot(course.x - island.x, course.z - island.z);
      if (d < minIsland) minIsland = d;
      assert.ok(d >= island.radius + WHALE_ISLAND_MARGIN - 1e-4, `seed ${seed} clipped island ${island.id}`);
    }
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < steps; i++) {
    cx += xs[i]!;
    cz += zs[i]!;
    if (xs[i]! < minX) minX = xs[i]!;
    if (xs[i]! > maxX) maxX = xs[i]!;
    if (zs[i]! < minZ) minZ = zs[i]!;
    if (zs[i]! > maxZ) maxZ = zs[i]!;
  }
  cx /= steps;
  cz /= steps;
  let meanR = 0;
  for (let i = 0; i < steps; i++) meanR += Math.hypot(xs[i]! - cx, zs[i]! - cz);
  meanR /= steps;
  let varR = 0;
  for (let i = 0; i < steps; i++) {
    const r = Math.hypot(xs[i]! - cx, zs[i]! - cz) - meanR;
    varR += r * r;
  }
  const stdR = Math.sqrt(varR / steps);
  const diagonal = Math.hypot(maxX - minX, maxZ - minZ);
  const endDist = Math.hypot(course.x - world.whaleHome.x, course.z - world.whaleHome.z);
  let maxHome = 0;
  for (let i = 0; i < steps; i++) {
    const d = Math.hypot(xs[i]! - world.whaleHome.x, zs[i]! - world.whaleHome.z);
    if (d > maxHome) maxHome = d;
  }
  return { pilot, course, turned, diagonal, endDist, maxHome, meanR, stdR, minIsland, world };
}

test('whale mesh heading points the head along whaleForward', () => {
  for (const heading of [0, 0.6, -1.2, Math.PI, -Math.PI / 2]) {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    group.rotation.y = heading;
    const head = new THREE.Vector3(-1, 0, 0).applyQuaternion(group.quaternion);
    const fwd = whaleForward(heading);
    assert.ok(Math.abs(head.x - fwd.x) < 1e-6 && Math.abs(head.z - fwd.z) < 1e-6, `heading ${heading}`);
  }
});

test('whale cruise travels without spinning, for several seeds', () => {
  assert.ok(WHALE_MAX_TURN_RATE <= 0.25);
  for (const seed of SEEDS) {
    const world = layoutWorld(seed);
    const stats = simulate(seed, world.islands);
    assert.equal(stats.pilot.params.turnRate, WHALE_MAX_TURN_RATE);
    // A few full rotations is ~3 turns. Stay well under that.
    assert.ok(stats.turned < Math.PI * 2 * 2, `seed ${seed} heading travel ${stats.turned.toFixed(2)} rad`);
    // Extent shows a cruise, not a tight orbit around one point.
    assert.ok(stats.diagonal > 50, `seed ${seed} diagonal ${stats.diagonal.toFixed(1)}`);
    assert.ok(stats.maxHome > 32, `seed ${seed} max home dist ${stats.maxHome.toFixed(1)}`);
    assert.ok(stats.maxHome < stats.pilot.params.leash + 28, `seed ${seed} left the frame ${stats.maxHome.toFixed(1)}`);
    const circular = stats.meanR < 36 && stats.stdR < stats.meanR * 0.12;
    assert.equal(circular, false, `seed ${seed} small circle r=${stats.meanR.toFixed(1)} sd=${stats.stdR.toFixed(2)}`);
    assert.ok(stats.minIsland > 40, `seed ${seed} island dist ${stats.minIsland.toFixed(1)}`);
    assert.ok(stats.endDist > 8 || stats.diagonal > 70, `seed ${seed} displacement ${stats.endDist.toFixed(1)}`);
  }
});

test('whale course is deterministic per seed and steps clear of a blocking island', () => {
  const once = simulate(42, layoutWorld(42).islands, DT, 30);
  const twice = simulate(42, layoutWorld(42).islands, DT, 30);
  assert.equal(once.course.x, twice.course.x);
  assert.equal(once.course.z, twice.course.z);
  assert.equal(once.course.heading, twice.course.heading);

  const home = { x: 0, z: 0 };
  const heading = 0;
  const pilot = createWhalePilot(5, home, heading);
  const course: WhaleCourse = { x: 0, z: 0, heading, leg: heading };
  // Heading 0 faces −X. Park an island on that line.
  const island: IslandSpec = {
    id: 9,
    x: -42,
    z: 0,
    radius: 12,
    height: 6,
    mountain: false,
    seed: 5,
  };
  let min = Infinity;
  const steps = Math.round(50 / DT);
  for (let i = 0; i < steps; i++) {
    const prev = course.heading;
    pilot.step(course, DT, i * DT, [island]);
    assert.ok(Math.abs(shortestAngle(prev, course.heading)) <= WHALE_MAX_TURN_RATE * DT + 1e-8);
    const d = Math.hypot(course.x - island.x, course.z - island.z);
    if (d < min) min = d;
  }
  assert.ok(min >= island.radius + WHALE_ISLAND_MARGIN - 1e-4, `island clearance ${min}`);
  assert.ok(Math.hypot(course.x, course.z) > 25, 'still travelled');
});

test('whale cruise stays close across 30fps and 60fps', () => {
  const islands = layoutWorld(42).islands;
  const a = simulate(42, islands, 1 / 60, 90);
  const b = simulate(42, islands, 1 / 30, 90);
  const gap = Math.hypot(a.course.x - b.course.x, a.course.z - b.course.z);
  assert.ok(gap < 8, `frame-rate gap ${gap.toFixed(2)}`);
});
