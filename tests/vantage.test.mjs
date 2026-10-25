import test from 'node:test';
import assert from 'node:assert/strict';
import { frameBody, viewLightAngleDeg, chaseShipFraming, discFitsFrame } from '../src/vantage.js';
import { findSpawn } from '../src/systems.js';
import { reviewSettings } from '../src/debug.js';

test('viewLightAngleDeg reports the angle between view and light', () => {
  assert.ok(Math.abs(viewLightAngleDeg([0, 0, 10], [0, 0, 0], [1, 0, 0]) - 90) < 1e-6);
  // Light toward the observer (front-lit) → ~180°; light away (backlit) → ~0°.
  assert.ok(viewLightAngleDeg([0, 0, 10], [0, 0, 0], [0, 0, 1]) > 179);
  assert.ok(viewLightAngleDeg([0, 0, 10], [0, 0, 0], [0, 0, -1]) < 1);
});

test('frameBody keeps lighting near 85° and optional ring opening', () => {
  const subject = [1000, 0, 0], light = [-1, 0, 0], radius = 200;
  const framed = frameBody({ subject, radius, lightFromSubject: light, fill: 0.35, lightingDeg: 85 });
  assert.ok(framed.angle >= 60 && framed.angle <= 120, `lighting ${framed.angle}`);
  assert.ok(framed.range > radius);
  const ringed = frameBody({
    subject, radius, lightFromSubject: light, fill: 0.28, lightingDeg: 85,
    ringOpenDeg: 20, ringNormal: [0, 1, 0],
  });
  const elev = Math.asin(Math.max(-1, Math.min(1, (subject[1] - ringed.position[1]) / ringed.range))) * 180 / Math.PI;
  assert.ok(Math.abs(elev) >= 8 && Math.abs(elev) <= 40, `ring elev ${elev}`);
});

test('discFitsFrame enforces margin when the disc is large', () => {
  assert.equal(discFitsFrame(0.1, 52, 0.04), true);
  // Half-FOV ≈ 0.45 rad; 0.45 + margin exceeds half → false.
  assert.equal(discFitsFrame(0.45, 52, 0.04), false);
});

test('chaseShipFraming raises the ship above the HUD band', () => {
  const desktop = chaseShipFraming({ portrait: false });
  const mobile = chaseShipFraming({ portrait: true });
  assert.ok(desktop.height >= 1.5);
  assert.ok(mobile.height >= 1.7);
  assert.ok(desktop.distance >= 5.5);
});

test('debugPlanet and debugRing spawn preferences frame their subjects', () => {
  for (const type of ['rocky', 'ocean', 'ice', 'ember']) {
    const spawn = findSpawn(42, { preferType: type, fill: 0.35 });
    assert.ok(spawn.lightingDeg >= 55 && spawn.lightingDeg <= 125, `${type} lighting ${spawn.lightingDeg}`);
    assert.ok(spawn.range > spawn.planet.radius);
  }
  const ringed = findSpawn(42, { preferRings: true, fill: 0.28, ringOpenDeg: 20 });
  assert.ok(ringed.planet.rings, 'preferRings should pick a ringed body');
  assert.ok(ringed.lightingDeg >= 55 && ringed.lightingDeg <= 125);
});

test('reviewSettings accepts debugRing on localhost', () => {
  assert.equal(reviewSettings('?debug=1&debugRing=1', '127.0.0.1').ring, true);
  assert.equal(reviewSettings('?debugRing=1', '127.0.0.1').ring, undefined);
  assert.equal(reviewSettings('?debug=1&debugPlanet=ocean', '127.0.0.1').planet, 'ocean');
  assert.equal(reviewSettings('?debug=1&debugEvent=comet', '127.0.0.1').event, 'comet');
});
