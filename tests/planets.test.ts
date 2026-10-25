import { test } from 'vitest';
import assert from 'node:assert/strict';
import art from '../src/look.js';
import { random } from '../src/rng.js';
import { planetTypeWeights, selectPlanetType, planetAppearance } from '../src/planet-data.js';
import { regionWeights } from '../src/universe.js';
import { reviewSettings } from '../src/debug.js';

test('planet frequencies follow all regional weights across a large sample', () => {
  for (const weights of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.4, 0.3, 0.3]]) {
    const rng = random(917), count = 60000, actual: Record<string, number> = {};
    const expected = planetTypeWeights(weights), sum = expected.reduce((n: number, [, weight]: [string, number]) => n + weight, 0);
    for (let i = 0; i < count; i++) { const type = selectPlanetType(rng, weights); actual[type] = (actual[type] ?? 0) + 1; }
    for (const [type, weight] of expected) assert.ok(Math.abs((actual[type] ?? 0) / count - weight / sum) < 0.008, `${type}: regional weight is respected`);
    assert.ok((actual.ember ?? 0) / count < 0.16, 'The rare hot worlds stay rare');
  }
});

test('planet details are deterministic, respect ranges, and use both gas palettes', () => {
  let gas = 0, alternate = 0;
  for (let seed = 0; seed < 5000; seed++) {
    const data = planetAppearance(seed, [1, 0, 0]);
    assert.deepEqual(data, planetAppearance(seed, [1, 0, 0]));
    assert.equal(data.palette.length, 4);
    assert.ok(data.moons.length >= art.planets.moons.count[0] && data.moons.length <= art.planets.moons.count[1]);
    if (data.type === 'gas') { gas++; if (data.palette[0] === art.planets.types.gas.altPalette[0]) alternate++; }
    for (const moon of data.moons) {
      assert.ok(moon.radius >= art.planets.moons.radius[0] && moon.radius <= art.planets.moons.radius[1]);
      assert.ok(moon.orbit >= art.planets.moons.orbit[0] && moon.orbit <= art.planets.moons.orbit[1]);
      if (data.rings) assert.ok(moon.orbit > data.ring.outer);
    }
  }
  assert.ok(alternate / gas > 0.46 && alternate / gas < 0.54);
});

test('regions change gradually over distance and review flags are local-only', () => {
  const initial = regionWeights(42, [0, 0, 0], art.regionField);
  const near = regionWeights(42, [8, 0, 0], art.regionField);
  const far = regionWeights(42, [50000, 10000, -90000], art.regionField);
  assert.ok(initial.every((n, i) => Math.abs(n - near[i]) < 0.01));
  assert.ok(initial.some((n, i) => Math.abs(n - far[i]) > 0.15));
  assert.deepEqual(reviewSettings('?debug=1&debugRegion=ember&debugEvent=comet', 'example.test'), {});
  assert.deepEqual(reviewSettings('?debugRegion=ember', '127.0.0.1'), {});
  assert.equal(reviewSettings('?debug=1&debugRegion=ember', '127.0.0.1').region, 'ember');
});
