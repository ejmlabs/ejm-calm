import test from 'node:test';
import assert from 'node:assert/strict';
import { hash, random } from '../src/rng.js';
import { noise3, fractalNoise } from '../src/noise.js';
import { parseSeed, resolveSeed, seedURL } from '../src/seed.js';
import { CELL_SIZE, Universe, cellOf, generateCell, regionAt, regionWeights } from '../src/universe.js';
import { createFlight, stepFlight, steerFlight } from '../src/flight.js';
import { STORAGE_KEY, VERSION, loadMemory, saveMemory, validateMemory } from '../src/persistence.js';
import { createQuality, updateQuality } from '../src/quality.js';

const memory = () => ({ version: VERSION, seed: 42, sound: { enabled: true, volume: 0.5 },
  framing: { yaw: 0, pitch: 0.22, distance: 21 }, flight: createFlight() });

test('random streams are repeatable, independent, and unsigned', () => {
  const a = random(42), b = random(42), c = random(43);
  const values = Array.from({ length: 2000 }, () => a());
  assert.deepEqual(values, Array.from({ length: 2000 }, () => b()));
  assert.notDeepEqual(values, Array.from({ length: 2000 }, () => c()));
  assert.ok(values.every((n) => n >= 0 && n < 1));
  assert.notEqual(hash(42, -1, 2, 3), hash(42, 1, 2, 3));
  assert.notEqual(hash(0, 0, 0), hash(0xffffffff, 0, 0));
});

test('seeds parse complete unsigned decimals and reject ambiguous input', () => {
  for (const [input, expected] of [['0', 0], ['42', 42], ['00042', 42], ['4294967295', 0xffffffff]]) assert.equal(parseSeed(input), expected);
  for (const input of [null, undefined, 42, '', ' ', '42x', '-1', '1.5', '1e2', 'Infinity', '0x10', '4294967296']) assert.equal(parseSeed(input), null);
  assert.deepEqual(resolveSeed('?seed=0', 12), { seed: 0, explicit: true });
  assert.deepEqual(resolveSeed('?seed=oops', 12), { seed: 12, explicit: false });
  assert.deepEqual(resolveSeed('', -1, () => 0.5), { seed: 0x80000000, explicit: false });
  assert.equal(seedURL('https://example.test/voyage/?other=1#about', 42).href, 'https://example.test/voyage/?other=1&seed=42#about');
});

test('noise remains continuous, finite, and bounded across negative cell boundaries', () => {
  for (let i = -40; i <= 40; i++) {
    const value = noise3(i / 7, i / 11, -i / 5, 42);
    assert.ok(value >= 0 && value <= 1);
    assert.equal(value, noise3(i / 7, i / 11, -i / 5, 42));
    const fractal = fractalNoise(i / 7, i / 11, -i / 5, 42);
    assert.ok(fractal >= 0 && fractal <= 1);
  }
  assert.ok(Math.abs(noise3(-1 - 1e-6, 0.2, 0.3) - noise3(-1 + 1e-6, 0.2, 0.3)) < 1e-4);
});

test('cells are seed-stable, bounded, and independent of visiting order', () => {
  const counts = { planets: 0, asteroids: 0, nebulae: 0, galaxies: 0, events: 0 };
  for (const seed of [0, 42, 0xffffffff]) for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
    const cell = generateCell(seed, x, 0, z);
    generateCell(seed, z, 1, x);
    assert.deepEqual(cell, generateCell(seed, x, 0, z));
    assert.ok(cell.stars.length >= 32 && cell.stars.length <= 60);
    assert.ok(cell.planets.length <= 1 && cell.asteroids.length <= 36 && cell.nebulae.length <= 1 && cell.galaxies.length <= 1 && cell.events.length <= 1);
    for (const kind of ['stars', ...Object.keys(counts)]) for (const body of cell[kind]) {
      assert.equal(body.position.length, 3);
      body.position.forEach((n, i) => assert.ok(Number.isFinite(n) && Math.abs(n - cell.coordinates[i] * CELL_SIZE) <= CELL_SIZE / 2));
      if (body.radius) assert.ok(body.radius > 0 && body.radius <= 560);
    }
    for (const kind of Object.keys(counts)) counts[kind] += cell[kind].length;
  }
  assert.notDeepEqual(generateCell(41, 0, 0, 0), generateCell(42, 0, 0, 0));
  // Rare events need a larger fixed sample than everyday scenery.
  for (let x = 5; x < 505 && counts.events === 0; x++) counts.events += generateCell(42, x, 0, 0).events.length;
  for (const [kind, count] of Object.entries(counts)) assert.ok(count > 0, `${kind} occurs in a representative sample`);
  assert.deepEqual(cellOf([-601, 600, -600]), [-1, 1, 0]);
  assert.ok(regionAt(42, [0, 0, 0]) >= 0 && regionAt(42, [0, 0, 0]) <= 2);
  const weights = regionWeights(42, [0, 0, 0]);
  assert.ok(weights.every((n) => n > 0 && n <= 1));
  assert.ok(Math.abs(weights.reduce((a, b) => a + b) - 1) < 1e-12);
  assert.ok(weights.every((n, i) => Math.abs(n - regionWeights(42, [0.1, 0.1, 0.1])[i]) < 1e-4));
});

test('streaming obeys work budgets, releases old cells, and does not retain a travel history', () => {
  const universe = new Universe(42, { radius: 1, cellBudget: 2 });
  const loaded = [], removed = [];
  const callbacks = { onLoad: (cell) => loaded.push(cell.key), onUnload: (cell) => removed.push(cell.key), now: () => 0 };
  assert.equal(universe.update([0, 0, 0], callbacks), 2);
  assert.ok(universe.cells.has('0,0,0'));
  for (let i = 0; i < 15; i++) assert.ok(universe.update([0, 0, 0], callbacks) <= 2);
  assert.equal(universe.cells.size, 27); assert.equal(universe.pending.length, 0);
  for (let n = 1; n < 30; n++) {
    universe.update([n * CELL_SIZE * 3, 0, 0], callbacks);
    assert.ok(universe.cells.size <= 27 && universe.pending.length <= 27);
  }
  assert.ok(removed.length >= 27);
  let clock = 0;
  const timed = new Universe(42, { radius: 1, cellBudget: 20, timeBudget: 1 });
  assert.equal(timed.update([0, 0, 0], { now: () => clock++ }), 1);
});

test('persistence rejects corrupt, incomplete, unversioned, and out-of-range data', () => {
  assert.ok(validateMemory(memory()));
  for (const value of [null, false, [], 'data', {}, { ...memory(), version: 2 }, { ...memory(), seed: -1 },
    { ...memory(), sound: { enabled: 'yes', volume: 0.5 } }, { ...memory(), sound: { enabled: true, volume: Infinity } },
    { ...memory(), framing: { yaw: NaN, pitch: 0, distance: 21 } }, { ...memory(), framing: { yaw: 0, pitch: 2, distance: 21 } },
    { ...memory(), flight: { ...createFlight(), position: [0, null, 0] } },
    { ...memory(), flight: { ...createFlight(), position: [0, 0, 0, 0] } },
    { ...memory(), flight: { ...createFlight(), yaw: Infinity } }]) assert.equal(validateMemory(value), null);
  const clean = validateMemory(memory());
  assert.equal(clean.flight.target, undefined);
  let stored;
  const storage = { getItem: () => stored, setItem: (key, value) => { assert.equal(key, STORAGE_KEY); stored = value; } };
  assert.equal(saveMemory(storage, memory()), true); assert.deepEqual(loadMemory(storage), clean);
  stored = '{corrupt'; assert.equal(loadMemory(storage), null);
  assert.equal(loadMemory({ getItem() { throw new Error('Unavailable'); } }), null);
  assert.equal(saveMemory({ setItem() { throw new Error('Full'); } }, memory()), false);
});

test('autopilot avoids a head-on planet and remains finite through a long voyage', () => {
  const state = createFlight(), obstacle = { position: [0, 0, -80], radius: 85 };
  let minimum = Infinity;
  for (let i = 0; i < 12000; i++) {
    if (i % 600 === 0) steerFlight(state, 0.18, -0.04);
    stepFlight(state, 1 / 30, [obstacle], [obstacle]);
    minimum = Math.min(minimum, Math.hypot(...state.position.map((n, j) => n - obstacle.position[j])));
    assert.ok([...state.position, state.yaw, state.pitch, state.roll, state.speed, state.time].every(Number.isFinite));
    assert.ok(Math.abs(state.pitch) <= 0.85 && state.speed >= 0 && state.speed <= 90);
  }
  assert.ok(minimum >= obstacle.radius + 18 - 1e-7);
  assert.ok(state.time > 399);
  const embedded = createFlight(); embedded.position = [0, 0, -80];
  stepFlight(embedded, Infinity, [], [obstacle]);
  assert.ok(embedded.position.every(Number.isFinite));
  const a = createFlight(), b = createFlight();
  for (let i = 0; i < 200; i++) { stepFlight(a, 0.05, [obstacle], [obstacle]); stepFlight(b, 0.05, [obstacle], [obstacle]); }
  assert.deepEqual(a, b);
});

test('adaptive resolution reacts to sustained cost, respects caps, and ignores suspended frames', () => {
  const quality = createQuality({ mobile: true, dpr: 3 });
  assert.equal(quality.ratio, 1.25);
  for (let i = 0; i < 2000; i++) updateQuality(quality, 70);
  assert.equal(quality.ratio, quality.minimum);
  for (let i = 0; i < 4000; i++) updateQuality(quality, 15);
  assert.equal(quality.ratio, quality.maximum);
  const before = structuredClone(quality);
  for (const n of [NaN, 0, -1, Infinity, 5000]) updateQuality(quality, n);
  assert.deepEqual(quality, before);
});
