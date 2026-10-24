import test from 'node:test';
import assert from 'node:assert/strict';
import art from '../src/look.js';
import { random } from '../src/rng.js';
import { blackbodyColor, linearColor, magnitudeFlux, sampleMagnitude, sampleStar } from '../src/astrophysics.js';
import { generateSystem, generateNebula, updateSystem, findSpawn } from '../src/systems.js';
import { Universe } from '../src/universe.js';
import { selectQualityTier, createQuality, observePassQuality } from '../src/quality.js';

test('blackbody ramp interpolates in linear space, stays finite, and clamps at its endpoints', () => {
  for (const [temperature, hex] of art.blackbody) assert.deepEqual(blackbodyColor(temperature), linearColor(hex));
  assert.deepEqual(blackbodyColor(0), linearColor(art.blackbody[0][1]));
  assert.deepEqual(blackbodyColor(100000), linearColor(art.blackbody.at(-1)[1]));
  const [a, b] = art.blackbody.slice(5, 7), middle = blackbodyColor((a[0] + b[0]) / 2);
  linearColor(a[1]).forEach((value, i) => assert.ok(Math.abs(middle[i] - (value + linearColor(b[1])[i]) / 2) < 1e-12));
  assert.ok(blackbodyColor(3000)[0] > blackbodyColor(3000)[2]);
  assert.ok(blackbodyColor(20000)[2] > blackbodyColor(20000)[0]);
});

test('magnitude samples follow the inverse power-law CDF and flux ratios', () => {
  const rng = random(73), samples = Array.from({ length: 100000 }, () => sampleMagnitude(rng));
  const { range: [min, max], slope } = art.realism.magnitudes;
  for (const edge of [1, 3.5, 5, 6.5]) {
    const expected = (10 ** (slope * edge) - 10 ** (slope * min)) / (10 ** (slope * max) - 10 ** (slope * min));
    assert.ok(Math.abs(samples.filter((m) => m <= edge).length / samples.length - expected) < 0.004);
  }
  assert.ok(samples.every((m) => m >= min && m <= max));
  assert.ok(Math.abs(magnitudeFlux(2) / magnitudeFlux(7) - 100) < 1e-10);
  const stars = Array.from({ length: 10000 }, () => sampleStar(rng));
  const red = stars.filter((star) => star.spectralClass === 'M').length / stars.length;
  assert.ok(red > 0.74 && red < 0.79);
});

test('systems, binaries, orbits, and nebula volumes are seed-stable', () => {
  let systems = 0, binaries = 0;
  for (let x = -600; x < 600; x++) {
    const data = generateSystem(42, x, 0, 0);
    assert.deepEqual(data, generateSystem(42, x, 0, 0));
    assert.deepEqual(generateNebula(42, x, 0, 0), generateNebula(42, x, 0, 0));
    if (!data) continue; systems++;
    assert.ok(data.planets.length >= 1 && data.planets.length <= 6);
    assert.ok(data.stars.every((star) => star.color.every(Number.isFinite)));
    if (data.binary) { binaries++; assert.equal(data.stars.length, 2); }
    const before = structuredClone(data);
    updateSystem(data, 1700); const copy = updateSystem(before, 1700);
    assert.deepEqual(data, copy);
    assert.ok(data.planets.every((planet) => planet.position.every(Number.isFinite)));
  }
  assert.ok(systems > 300 && systems < 430);
  assert.ok(binaries / systems > 0.015 && binaries / systems < 0.07);
  assert.notDeepEqual(Array.from({ length: 12 }, (_, x) => generateNebula(7, x, 0, 0)), Array.from({ length: 12 }, (_, x) => generateNebula(42, x, 0, 0)));
});

test('streamed chunks return to the same content across seeds and visiting orders', () => {
  const snapshot = (world) => ({ cells: [...world.cells].sort(([a], [b]) => a.localeCompare(b)), systems: [...world.systems].sort(([a], [b]) => a.localeCompare(b)), nebulae: [...world.nebulae].sort(([a], [b]) => a.localeCompare(b)) });
  for (const seed of [0, 42, 7, 1234, 98765, 0xffffffff]) {
    const world = new Universe(seed, { radius: 1, cellBudget: 10, timeBudget: 10000 });
    const settle = (position) => { for (let i = 0; i < 40; i++) world.update(position, { now: () => 0, time: 123 }); };
    settle([0, 0, 0]); const before = structuredClone(snapshot(world));
    settle([120000, -70000, 48000]); settle([0, 0, 0]);
    assert.deepEqual(snapshot(world), before); assert.ok(world.coarse.size <= 27);
  }
});

test('spawn points are derived from generated planets and keep clear of their stars', () => {
  for (const seed of [42, 7, 1234, 98765, 0, 0xffffffff]) {
    const spawn = findSpawn(seed); assert.deepEqual(spawn, findSpawn(seed));
    assert.ok(spawn.position.every(Number.isFinite));
    for (const star of spawn.system.stars) assert.ok(Math.hypot(...spawn.position.map((n, i) => n - star.position[i])) > star.radius * 8);
  }
});

test('quality selection and pass degradation preserve composition before reducing DPR', () => {
  assert.equal(selectQualityTier({ mobile: true }), 'low'); assert.equal(selectQualityTier({ software: true }), 'low');
  assert.equal(selectQualityTier({ cores: 4 }), 'medium'); assert.equal(selectQualityTier({ memory: 16, cores: 12 }), 'high');
  const state = createQuality({ dpr: 2 }); const before = state.ratio;
  for (let i = 0; i < 200; i++) observePassQuality(state, 'nebula', 5, 17, 2.5);
  assert.equal(state.nebulaLevel, 1); assert.equal(state.ratio, before);
});
