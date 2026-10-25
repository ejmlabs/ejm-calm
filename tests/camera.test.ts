import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { CameraRig } from '../src/camera.js';
import { createFlight } from '../src/flight.js';

test('camera framing survives heading changes and settles across the angle wrap', () => {
  const camera = new PerspectiveCamera(), flight = createFlight();
  const rig = new CameraRig(camera, {}, { yaw: Math.PI - 0.01, pitch: 0.2, distance: 21 });
  rig.update(flight, 1 / 60);
  rig.orbit(-10, 20);
  assert.ok(rig.framing.yaw < 0, 'The orbit crosses the angle wrap');
  const framing = { ...rig.framing };
  for (let i = 0; i < 600; i++) { flight.yaw += 0.002; rig.update(flight, 1 / 60); }
  assert.deepEqual(rig.framing, framing, 'Autopilot never changes viewer framing');
  assert.ok(rig.settled(), 'A paused view can stop requesting frames after an orbit');
  assert.ok(camera.position.toArray().every(Number.isFinite));
  rig.zoom(-100); assert.equal(rig.framing.distance, rig.settings.minDistance);
  rig.zoom(100); assert.equal(rig.framing.distance, rig.settings.maxDistance);
});
