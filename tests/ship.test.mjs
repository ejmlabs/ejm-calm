import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import art from '../src/look.js';
import { createShip, animateShip } from '../src/ship.js';
import { createFlight } from '../src/flight.js';

test('courier proportions follow the hull profile and both wings have upward dihedral', () => {
  const ship = createShip(art.ship, null, true); ship.updateMatrixWorld(true);
  const hull = new THREE.Box3().setFromObject(ship.getObjectByName('hull')).getSize(new THREE.Vector3());
  assert.ok(Math.abs(hull.z - 1) < 1e-6);
  const tips = [];
  for (const name of ['wing-left', 'wing-right']) {
    const wing = ship.getObjectByName(name), points = wing.geometry.getAttribute('position');
    const vertices = Array.from({ length: points.count }, (_, i) => wing.localToWorld(new THREE.Vector3().fromBufferAttribute(points, i)));
    const tip = vertices.reduce((best, point) => Math.abs(point.x) > Math.abs(best.x) ? point : best);
    assert.ok(tip.y > art.ship.wings.y + 0.04, 'Each tip rises above its wing root'); tips.push(tip);
  }
  assert.ok(Math.abs(tips[1].x - tips[0].x) / hull.z < 1.02, 'The wings stay narrower than the old fighter silhouette');
});

test('ship banking respects its limit and returns smoothly to level', () => {
  const ship = createShip(art.ship, null, true), flight = createFlight();
  const camera = new THREE.PerspectiveCamera(52); camera.position.set(0, 1.3, 5.5);
  flight.turn = 1;
  for (let i = 0; i < 100; i++) animateShip(ship, flight, 0.1, camera, 900);
  const limit = art.ship.motion.maxBankDeg * Math.PI / 180;
  assert.ok(Math.abs(ship.userData.roll) <= limit && Math.abs(ship.userData.roll) > limit * 0.99);
  flight.turn = 0;
  for (let i = 0; i < 100; i++) animateShip(ship, flight, 0.1, camera, 900);
  assert.ok(Math.abs(ship.userData.roll) < 0.001);
});
