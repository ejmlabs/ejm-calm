import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSpring, springStep, springStepAngle } from '../src/spring.js';
import { DIVE_BELOW, EYE_CLEARANCE, FollowCamera, PEEK_IDLE, RISE_ABOVE } from '../src/camera.js';
import { WATER_LEVEL, type FollowTarget } from '../src/seams.js';

const fwd = (h: number) => ({ x: -Math.cos(h), z: Math.sin(h) });

function rig(portrait = false) {
  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 12000);
  return { camera, rig: new FollowCamera(camera, { portrait }) };
}

/** Camera view yaw (direction of eye → lookAt) in whale-heading convention. */
function viewYaw(r: FollowCamera): number {
  const p = r.camera.position;
  return Math.atan2(r.lookAt.z - p.z, -(r.lookAt.x - p.x));
}

test('spring from rest never overshoots and converges', () => {
  const s = createSpring(0);
  let prev = 0;
  for (let i = 0; i < 600; i++) {
    const x = springStep(s, 10, 2, 1 / 60);
    assert.ok(x <= 10 + 1e-12, `overshoot ${x}`);
    assert.ok(x >= prev - 1e-12, 'not monotonic');
    prev = x;
  }
  assert.ok(Math.abs(prev - 10) < 1e-3);
});

test('spring is frame-rate independent', () => {
  const a = createSpring(-3);
  const b = createSpring(-3);
  a.v = b.v = 4;
  for (let i = 0; i < 60; i++) springStep(a, 7, 1.7, 1 / 30);
  for (let i = 0; i < 120; i++) springStep(b, 7, 1.7, 1 / 60);
  assert.ok(Math.abs(a.x - b.x) < 1e-6, `${a.x} vs ${b.x}`);
  assert.ok(Math.abs(a.v - b.v) < 1e-6);
});

test('angle spring takes the short way across ±π', () => {
  const s = createSpring(Math.PI - 0.1);
  let prev = s.x;
  for (let i = 0; i < 300; i++) {
    const x = springStepAngle(s, -Math.PI + 0.1, 3, 1 / 60);
    assert.ok(x >= prev - 1e-12, 'turned the long way');
    prev = x;
  }
  assert.ok(Math.abs(prev - (Math.PI + 0.1)) < 1e-3);
});

test('rig settles behind a target moving straight, without oscillation', () => {
  const { rig: r, camera } = rig();
  const h = 0.7;
  const f = fwd(h);
  const t: FollowTarget = { x: 0, y: -1.2, z: 0, heading: h };
  const along: number[] = [];
  for (let i = 0; i < 60 * 20; i++) {
    t.x += f.x * 2 / 60;
    t.z += f.z * 2 / 60;
    r.setTarget(t);
    r.update(1 / 60, i / 60);
    along.push((camera.position.x - t.x) * f.x + (camera.position.z - t.z) * f.z);
  }
  const dx = camera.position.x - t.x;
  const dz = camera.position.z - t.z;
  const len = Math.hypot(dx, dz);
  assert.ok((-dx * f.x - dz * f.z) / len > 0.99, 'not behind the whale');
  assert.ok(len > 20 && len < 40, `distance ${len}`);
  assert.ok(camera.position.y > 3, 'eye too low above water');
  // Trailing distance grows monotonically to the steady lag: no ringing.
  for (let i = 1; i < along.length; i++) assert.ok(along[i]! <= along[i - 1]! + 1e-9, `oscillation at ${i}`);
});

test('a 90° heading change turns the view monotonically', () => {
  const { rig: r } = rig();
  const t: FollowTarget = { x: 5, y: -1.2, z: -3, heading: 0.2 };
  r.setTarget(t);
  r.update(1 / 60, 0);
  t.heading = 0.2 + Math.PI / 2;
  r.setTarget(t);
  let prev = viewYaw(r);
  for (let i = 0; i < 60 * 15; i++) {
    r.update(1 / 60, i / 60);
    const y = viewYaw(r);
    assert.ok(y >= prev - 1e-9, `yaw went back at ${i}`);
    prev = y;
  }
  assert.ok(Math.abs(prev - viewYaw(r)) < 1e-9);
});

test('target noise gives bounded, smooth camera motion', () => {
  const { rig: r, camera } = rig();
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.1;
  const t: FollowTarget = { x: 0, y: -1.2, z: 0, heading: 1 };
  const pos: THREE.Vector3[] = [];
  for (let i = 0; i < 600; i++) {
    r.setTarget({ x: t.x + noise(), y: t.y + noise(), z: t.z + noise(), heading: t.heading + noise() * 0.2 });
    r.update(1 / 60, i / 60);
    pos.push(camera.position.clone());
  }
  for (let i = 120; i < pos.length; i++) {
    assert.ok(pos[i]!.distanceTo(pos[i - 1]!) < 0.02, `step ${i} too large`);
    const accel = pos[i]!.clone().sub(pos[i - 1]!).sub(pos[i - 1]!.clone().sub(pos[i - 2]!)).length();
    assert.ok(accel < 0.005, `jerky at ${i}`);
  }
});

test('shift keeps the pose relative to the target', () => {
  const { rig: r, camera } = rig();
  const t: FollowTarget = { x: 10, y: -1.2, z: 20, heading: 2 };
  for (let i = 0; i < 120; i++) {
    t.x += 0.03;
    r.setTarget(t);
    r.update(1 / 60, i / 60);
  }
  const before = camera.position.clone().sub(new THREE.Vector3(t.x, 0, t.z));
  r.shift(512, -256);
  t.x -= 512;
  t.z += 256;
  const after = camera.position.clone().sub(new THREE.Vector3(t.x, 0, t.z));
  assert.ok(before.distanceTo(after) < 1e-9);
  // Keep going and compare with an unshifted run.
  for (let i = 0; i < 60; i++) {
    t.x += 0.03;
    r.setTarget(t);
    r.update(1 / 60, i / 60);
  }
  const ref = rig();
  const rt: FollowTarget = { x: 10, y: -1.2, z: 20, heading: 2 };
  for (let i = 0; i < 180; i++) {
    rt.x += 0.03;
    ref.rig.setTarget(rt);
    ref.rig.update(1 / 60, i / 60);
  }
  const a = camera.position.clone().sub(new THREE.Vector3(t.x, t.y, t.z));
  const b = ref.camera.position.clone().sub(new THREE.Vector3(rt.x, rt.y, rt.z));
  assert.ok(a.distanceTo(b) < 1e-6, `drifted ${a.distanceTo(b)}`);
});

test('follows the whale under water and never rests in the surface band', () => {
  const { rig: r, camera } = rig();
  const t: FollowTarget = { x: 0, y: -1.2, z: 0, heading: 0 };
  const settle = (y: number, seconds = 12) => {
    t.y = y;
    for (let i = 0; i < seconds * 60; i++) {
      r.setTarget(t);
      r.update(1 / 60, 0);
    }
  };
  settle(-1);
  assert.ok(camera.position.y > WATER_LEVEL + EYE_CLEARANCE, 'shallow whale: eye should stay above');
  assert.equal(r.mode, 'chase');
  settle(-10);
  assert.ok(camera.position.y < WATER_LEVEL - EYE_CLEARANCE, `deep: eye at ${camera.position.y}`);
  assert.equal(r.mode, 'under');
  // Between the hysteresis thresholds it stays where it is.
  settle((DIVE_BELOW + RISE_ABOVE) / 2);
  assert.equal(r.mode, 'under');
  assert.ok(camera.position.y < WATER_LEVEL - EYE_CLEARANCE);
  // A target whose natural eye height is inside the band is held outside it.
  settle(-2.4);
  r.look(0, 200); // a peek upward would lift the eye into the band
  for (let i = 0; i < 150; i++) {
    r.update(1 / 60, 0);
    assert.ok(camera.position.y <= WATER_LEVEL - EYE_CLEARANCE + 1e-9, `in band: ${camera.position.y}`);
  }
  settle(-1);
  assert.equal(r.mode, 'chase');
  assert.ok(camera.position.y > WATER_LEVEL + EYE_CLEARANCE);
  settle((DIVE_BELOW + RISE_ABOVE) / 2);
  assert.equal(r.mode, 'chase');
});

test('crossing the surface is brisk', () => {
  const { rig: r, camera } = rig();
  const t: FollowTarget = { x: 0, y: -1.2, z: 0, heading: 0 };
  r.setTarget(t);
  r.update(1 / 60, 0);
  t.y = -4.5;
  let inBand = 0;
  for (let i = 0; i < 60 * 15; i++) {
    r.setTarget(t);
    r.update(1 / 60, 0);
    if (Math.abs(camera.position.y - WATER_LEVEL) < EYE_CLEARANCE) inBand++;
  }
  assert.ok(inBand > 0 && inBand < 30, `${inBand} frames inside the band`);
});

test('a drag peek springs back to the heading after idle', () => {
  const { rig: r } = rig();
  const t: FollowTarget = { x: 0, y: -1.2, z: 0, heading: 1.3 };
  r.setTarget(t);
  r.update(1 / 60, 0);
  const locked = viewYaw(r);
  r.look(-400, 0);
  for (let i = 0; i < 60; i++) r.update(1 / 60, 0);
  const peek = viewYaw(r) - locked;
  assert.ok(peek > 0.4 && peek <= 0.6 + 1e-6, `peek ${peek}`);
  for (let i = 0; i < 60 * (PEEK_IDLE + 8); i++) r.update(1 / 60, 0);
  assert.ok(Math.abs(viewYaw(r) - locked) < 0.01, 'did not return');
});

test('reduced motion with dt = 0 freezes the pose', () => {
  const { rig: r, camera } = rig();
  r.setTarget({ x: 3, y: -1.2, z: 4, heading: 0.5 });
  r.update(0, 0, true);
  const p = camera.position.clone();
  r.update(0, 0, true);
  assert.ok(camera.position.distanceTo(p) < 1e-12);
});
