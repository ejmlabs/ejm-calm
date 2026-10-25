import { test } from 'vitest';
import assert from 'node:assert/strict';
import { hash, random } from '../src/rng.js';
import { parseSeed, resolveSeed, seedURL, nextSeed } from '../src/seed.js';
import { createQuality, updateQuality, selectQualityTier } from '../src/quality.js';
import {
  layoutWorld,
  islandsOverlap,
  shipHitsIsland,
  buildHeightfield,
  sampleIslandHeight,
  inPortraitViewCone,
  computeViewYaw,
} from '../src/terrain.js';
import { phaseAtCycleTime, cycleDuration, type WhalePhase } from '../src/whale.js';
import { validateMemory, VERSION } from '../src/persistence.js';
import { fbm2, makeNoise2D, ridged2 } from '../src/noise.js';

test('random streams are repeatable, independent, and unsigned', () => {
  const a = random(42), b = random(42), c = random(43);
  const values = Array.from({ length: 2000 }, () => a());
  assert.deepEqual(values, Array.from({ length: 2000 }, () => b()));
  assert.notDeepEqual(values, Array.from({ length: 2000 }, () => c()));
  assert.ok(values.every((n) => n >= 0 && n < 1));
  assert.notEqual(hash(42, -1, 2, 3), hash(42, 1, 2, 3));
});

test('seeds parse complete unsigned decimals and reject ambiguous input', () => {
  for (const [input, expected] of [['0', 0], ['42', 42], ['00042', 42], ['4294967295', 0xffffffff]] as const) {
    assert.equal(parseSeed(input), expected);
  }
  for (const input of [null, undefined, '', ' ', '42x', '-1', '1.5', '1e2', 'Infinity', '0x10', '4294967296'] as const) {
    assert.equal(parseSeed(input), null);
  }
  assert.deepEqual(resolveSeed('?seed=0', 12), { seed: 0, explicit: true });
  assert.deepEqual(resolveSeed('?seed=oops', 12), { seed: 12, explicit: false });
  assert.deepEqual(resolveSeed('', -1, () => 0.5), { seed: 0x80000000, explicit: false });
  assert.equal(seedURL('https://example.test/calm/?other=1#about', 42).href, 'https://example.test/calm/?other=1&seed=42#about');
  assert.notEqual(nextSeed(42, () => 0.5), 42);
});

test('noise and heightfields stay finite, deterministic, and non-negative on islands', () => {
  const noise = makeNoise2D(42, 0);
  for (let i = -20; i <= 20; i++) {
    const f = fbm2(noise, i / 7, -i / 5, 4);
    const r = ridged2(noise, i / 7, -i / 5, 3);
    assert.ok(Number.isFinite(f) && f >= -1 && f <= 1);
    assert.ok(Number.isFinite(r) && r >= 0 && r <= 1);
  }
  const layout = layoutWorld(42);
  assert.ok(layout.islands.length >= 2 && layout.islands.length <= 4);
  for (const island of layout.islands) {
    const field = buildHeightfield(island, 32);
    assert.equal(field.heights.length, 33 * 33);
    assert.ok(field.maxHeight >= 0);
    assert.ok([...field.heights].every((h) => Number.isFinite(h) && h >= 0));
    assert.equal(sampleIslandHeight(island, island.radius * 2, 0), 0);
  }
});

test('world layout keeps ships clear of islands and islands apart', () => {
  for (const seed of [0, 7, 42, 1234, 99991]) {
    const world = layoutWorld(seed);
    assert.deepEqual(world, layoutWorld(seed));
    assert.ok(world.ships.length >= 2 && world.ships.length <= 5);
    for (let i = 0; i < world.islands.length; i++) {
      for (let j = i + 1; j < world.islands.length; j++) {
        assert.equal(islandsOverlap(world.islands[i]!, world.islands[j]!), false, `islands overlap seed ${seed}`);
      }
    }
    for (const ship of world.ships) {
      for (const island of world.islands) {
        assert.equal(shipHitsIsland(ship, island, 8), false, `ship hits island seed ${seed}`);
      }
    }
    assert.ok(Number.isFinite(world.whaleHome.x) && Number.isFinite(world.whaleHome.z));
  }
});

test('seeds 1..50 put hero ship and one island in the portrait view cone at t=0', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const world = layoutWorld(seed, 185);
    const hero = world.ships[0]!;
    assert.ok(hero, `seed ${seed} missing hero ship`);
    const focus = {
      x: world.whaleHome.x * 0.78 + hero.x * 0.22,
      z: world.whaleHome.z * 0.78 + hero.z * 0.22,
    };
    assert.equal(
      world.viewYaw,
      computeViewYaw(world.whaleHome, hero, world.islands, 185),
      `seed ${seed} viewYaw mismatch`,
    );
    assert.ok(
      inPortraitViewCone(world.viewYaw, focus, hero),
      `seed ${seed}: hero ship outside portrait view cone`,
    );
    const islandInCone = world.islands.some((island) =>
      inPortraitViewCone(world.viewYaw, focus, island),
    );
    assert.ok(islandInCone, `seed ${seed}: no island in portrait view cone`);
  }
});

test('whale behaviour cycle stays finite and periodic', () => {
  const duration = cycleDuration();
  assert.ok(duration > 0 && Number.isFinite(duration));
  const seen = new Set<WhalePhase>();
  for (let t = 0; t < duration * 3; t += 0.5) {
    const { phase, phaseT, cycle } = phaseAtCycleTime(t);
    seen.add(phase);
    assert.ok(phaseT >= 0 && phaseT <= 1);
    assert.ok(Number.isInteger(cycle) && cycle >= 0);
    assert.ok(['swim', 'surface', 'spout', 'dive', 'breach', 'splash'].includes(phase));
  }
  assert.ok(seen.has('breach') && seen.has('spout') && seen.has('swim'));
  assert.deepEqual(phaseAtCycleTime(0).phase, phaseAtCycleTime(duration).phase);
  assert.equal(phaseAtCycleTime(duration * 10 + 1).cycle, 10);
});

test('quality tiers and adaptive DPR stay bounded', () => {
  assert.equal(selectQualityTier({ mobile: true }), 'low');
  assert.equal(selectQualityTier({ software: true }), 'low');
  const state = createQuality({ mobile: true, dpr: 3 });
  assert.ok(state.ratio <= 2);
  assert.ok(state.waterSize <= 256);
  for (let i = 0; i < 20; i++) updateQuality(state, 50);
  assert.ok(state.ratio >= state.minimum && state.ratio <= state.maximum);
});

test('persistence rejects corrupt memory', () => {
  assert.ok(validateMemory({ version: VERSION, seed: 42 }));
  assert.equal(validateMemory({ version: 2, seed: 42 }), false);
  assert.equal(validateMemory({ version: VERSION, seed: -1 }), false);
  assert.equal(validateMemory(null), false);
});
