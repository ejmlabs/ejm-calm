import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import {
  OBSTACLE_CELL,
  WHALE_RADIUS,
  capsulesOverlap,
  createMoverSync,
  createObstacles,
  createSurfaces,
  groundClearance,
  rayCapsule,
  segmentDistanceSq,
  shipCapsule,
  whaleCapsule,
  type Obstacle,
} from '../src/obstacles.js';
import { random } from '../src/rng.js';
import { layoutWorld } from '../src/terrain.js';
import { createSeafloor } from '../src/seafloor.js';
import { swellAt } from '../src/swell.js';
import { createShip, SHIP_SIZE } from '../src/ships.js';
import { WHALE_LENGTH } from '../src/whale-model.js';
import { whaleForward } from '../src/whale-course.js';

const land = layoutWorld(42, 140).land;
const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const capsule = (a: THREE.Vector3, b: THREE.Vector3, r: number): Capsule => new Capsule(a, b, r);

test('segment distance covers crossing, parallel, end-to-end and point cases', () => {
  assert.equal(segmentDistanceSq(v(-1, 0, 0), v(1, 0, 0), v(0, 2, -1), v(0, 2, 1)), 4);
  assert.equal(segmentDistanceSq(v(0, 0, 0), v(4, 0, 0), v(1, 0, 3), v(3, 0, 3)), 9);
  assert.equal(segmentDistanceSq(v(0, 0, 0), v(1, 0, 0), v(3, 0, 0), v(5, 0, 0)), 4);
  assert.equal(segmentDistanceSq(v(2, 0, 0), v(2, 0, 0), v(0, 1, 0), v(4, 1, 0)), 1);
  assert.equal(segmentDistanceSq(v(0, 0, 0), v(0, 0, 0), v(3, 4, 0), v(3, 4, 0)), 25);
});

test('ray meets a capsule on its body, its caps, as a sphere, from inside, or not at all', () => {
  const a = v(0, 0, -5);
  const b = v(0, 0, 5);
  const close = (got: number, want: number) => assert.ok(Math.abs(got - want) < 1e-9, `${got} vs ${want}`);
  close(rayCapsule(v(-10, 0, 0), v(1, 0, 0), a, b, 1), 9);
  close(rayCapsule(v(0, 0, -20), v(0, 0, 1), a, b, 1), 14);
  close(rayCapsule(v(0, 0, 20), v(0, 0, -1), a, b, 1), 14);
  close(rayCapsule(v(-10, 0, 7), v(1, 0, 0), a, b, 3), 10 - Math.sqrt(5));
  close(rayCapsule(v(0, 0, -10), v(0, 0, 1), v(0, 0, 0), v(0, 0, 0), 2), 8);
  assert.equal(rayCapsule(v(0, 0.5, 0), v(1, 0, 0), a, b, 1), 0);
  assert.equal(rayCapsule(v(-10, 3, 0), v(1, 0, 0), a, b, 1), -1);
  assert.ok(rayCapsule(v(10, 0, 0), v(1, 0, 0), a, b, 1) < 0, 'behind the ray');
});

test('the registry answers overlap and feeler queries exactly as a brute-force check does', () => {
  const rng = random(7);
  const span = OBSTACLE_CELL * 6;
  const pick = () => (rng() - 0.5) * span;
  const obstacles = createObstacles();
  const placed: Obstacle[] = [];
  for (let i = 0; i < 120; i++) {
    const at = v(pick(), (rng() - 0.5) * 20, pick());
    const sphere = i % 3 === 0;
    const reach = sphere ? 0 : 4 + rng() * 40;
    const yaw = rng() * Math.PI * 2;
    const tip = at.clone().add(v(Math.cos(yaw) * reach, 0, Math.sin(yaw) * reach));
    const obstacle: Obstacle = { kind: sphere ? 'rock' : 'ship', capsule: capsule(at, tip, 1 + rng() * 6) };
    obstacles.add(obstacle);
    placed.push(obstacle);
  }
  assert.equal(obstacles.size, placed.length);

  let overlapping = 0;
  let hits = 0;
  for (let q = 0; q < 300; q++) {
    const probe = capsule(v(pick(), 0, pick()), v(pick() * 0.2, 0, pick() * 0.2), 2 + rng() * 6);
    probe.end.add(probe.start);
    const ignore = placed[q % placed.length]!;
    const got = obstacles.overlaps(probe, ignore);
    const want = placed.filter((o) => o !== ignore && capsulesOverlap(probe, o.capsule));
    assert.deepEqual(new Set(got), new Set(want));
    assert.equal(got.length, new Set(got).size, 'an obstacle across cells is reported once');
    overlapping += got.length;

    const origin = v(pick(), (rng() - 0.5) * 10, pick());
    const direction = v(rng() - 0.5, (rng() - 0.5) * 0.2, rng() - 0.5).normalize();
    const length = 20 + rng() * 200;
    const radius = rng() * 3;
    const hit = obstacles.feeler(origin, direction, length, radius);
    let nearest = Infinity;
    for (const o of placed) {
      const t = rayCapsule(origin, direction, o.capsule.start, o.capsule.end, o.capsule.radius + radius);
      if (t >= 0 && t <= length) nearest = Math.min(nearest, t);
    }
    if (nearest === Infinity) assert.equal(hit, null);
    else {
      assert.ok(hit);
      assert.ok(Math.abs(hit.distance - nearest) < 1e-9);
      hits++;
    }
  }
  assert.ok(overlapping > 20 && hits > 20, `queries exercised: ${overlapping} overlaps, ${hits} hits`);

  obstacles.clear();
  assert.equal(obstacles.size, 0);
  assert.equal(obstacles.feeler(v(0, 0, 0), v(1, 0, 0), span), null);
});

test('the whale capsule spans the whale along its heading and pitch', () => {
  for (const [heading, pitch] of [[0, 0], [1.1, 0], [-2.4, 0.3]] as const) {
    const c = whaleCapsule({ x: 100, y: -3, z: -40, heading, pitch });
    const axis = c.start.clone().sub(c.end);
    assert.ok(Math.abs(axis.length() + 2 * WHALE_RADIUS - WHALE_LENGTH) < 1e-9);
    const forward = whaleForward(heading);
    axis.normalize();
    assert.ok(Math.abs(axis.y - Math.sin(pitch)) < 1e-9);
    assert.ok(Math.abs(axis.x - forward.x * Math.cos(pitch)) < 1e-9 && Math.abs(axis.z - forward.z * Math.cos(pitch)) < 1e-9);
  }
});

test('a ship capsule lies along its hull at the waterline and blocks a feeler', () => {
  const ship = createShip({ id: 1, x: 300, z: 200, heading: 0.7, scale: 1, kind: 'tall', seed: 99 });
  ship.update(0.016, 0, land);
  const c = shipCapsule(ship);
  const length = ship.size.length * SHIP_SIZE;
  assert.ok(Math.abs(c.start.distanceTo(c.end) + 2 * c.radius - length) < 1e-9);
  assert.equal(c.radius, (ship.size.beam / 2) * SHIP_SIZE);
  const hull = new THREE.Box3().setFromObject(ship.group);
  const middle = c.start.clone().add(c.end).multiplyScalar(0.5);
  assert.ok(hull.containsPoint(middle) && Math.abs(middle.y) < 1);

  const obstacles = createObstacles();
  const obstacle: Obstacle = { kind: 'ship', capsule: c };
  obstacles.add(obstacle);
  const whale = whaleCapsule({ x: middle.x, y: -0.4, z: middle.z, heading: 0, pitch: 0 });
  assert.deepEqual(obstacles.overlaps(whale), [obstacle]);
  assert.deepEqual(obstacles.overlaps(whale, obstacle), []);
  const from = middle.clone().add(v(0, 0, -200));
  const hit = obstacles.feeler(from, v(0, 0, 1), 300, WHALE_RADIUS);
  assert.ok(hit && hit.obstacle === obstacle && hit.distance > 150 && hit.distance < 200);
  ship.dispose();
});

test('the surfaces are the seafloor and the swell, and clearance goes negative inside the ground', () => {
  const seafloor = createSeafloor(42, land);
  const surfaces = createSurfaces(seafloor);
  let onLand = 0;
  let atSea = 0;
  for (let i = 0; i < 400; i++) {
    const x = ((i * 7919) % 6000) - 3000;
    const z = ((i * 104729) % 6000) - 3000;
    const ground = seafloor.heightAt(x, z);
    assert.equal(surfaces.groundAt(x, z), ground);
    assert.equal(surfaces.seaAt(x, z, i * 0.7), swellAt(x, z, i * 0.7).height);
    if (ground > 2) {
      onLand++;
      assert.ok(groundClearance(surfaces, capsule(v(x, ground - 4, z), v(x, ground - 4, z), 1)) < 0);
    } else if (ground < -12) {
      atSea++;
      assert.ok(Math.abs(groundClearance(surfaces, capsule(v(x, -2, z), v(x, -2, z), 1)) - (-3 - ground)) < 1e-9);
    }
  }
  assert.ok(onLand > 10 && atSea > 10, `${onLand} on land, ${atSea} at sea`);
});

test('the mover sync registers the whale and the ships afloat afresh each frame', () => {
  const obstacles = createObstacles();
  const sync = createMoverSync(obstacles);
  const ship = createShip({ id: 2, x: 0, z: 0, heading: 0, scale: 1, kind: 'sloop', seed: 5 });
  ship.update(0.016, 0, land);
  const whale = { phase: 'swim', phaseT: 0, behavior: 'travel', speed: 0, x: 500, y: -0.4, z: 0, heading: 0, pitch: 0, roll: 0, spout: 0, splash: 0 } as const;
  sync(whale, [ship]);
  assert.equal(obstacles.size, 2);
  assert.deepEqual(obstacles.overlaps(whaleCapsule(whale)).map((o) => o.kind), ['whale']);
  sync({ ...whale, x: ship.group.position.x, z: ship.group.position.z }, []);
  assert.equal(obstacles.size, 1);
  assert.deepEqual(obstacles.overlaps(shipCapsule(ship)).map((o) => o.kind), ['whale']);
  ship.dispose();
});
