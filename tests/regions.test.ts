import { test } from 'vitest';
import assert from 'node:assert/strict';
import { REGION_BLEND, REGION_CELL, REGION_LOOKS, createRegions } from '../src/regions.js';
import { createRegionLook } from '../src/region-look.js';
import { layoutWorld } from '../src/terrain.js';
import { shipSpecsForCell } from '../src/world-ships.js';

const SEEDS = [42, 7, 1234, 99, 2024, 31337];

test('regions are deterministic per seed, weights sum to one, the start is temperate', () => {
  const a = createRegions(42);
  const b = createRegions(42);
  const c = createRegions(43);
  let differs = false;
  for (let i = 0; i < 200; i++) {
    const x = (i - 100) * 3100;
    const z = Math.sin(i) * 90000;
    const wa = a.weightsAt(x, z);
    assert.deepEqual(wa, b.weightsAt(x, z));
    assert.ok(Math.abs(wa[0] + wa[1] + wa[2] + wa[3] - 1) < 1e-9);
    assert.ok(wa.every((w) => w >= 0 && w <= 1 + 1e-12));
    if (c.dominantAt(x, z) !== a.dominantAt(x, z)) differs = true;
  }
  assert.ok(differs);
  for (const seed of SEEDS) {
    const r = createRegions(seed);
    for (let a = 0; a < 16; a++) assert.equal(r.dominantAt(Math.cos(a) * 5000, Math.sin(a) * 5000), 0, `seed ${seed} start region`);
  }
});

test('region weights change by under 0.01 between samples 10 m apart, along any straight line', () => {
  for (const seed of SEEDS) {
    const r = createRegions(seed);
    for (let line = 0; line < 6; line++) {
      const angle = line * 1.1 + 0.3;
      const dx = Math.cos(angle) * 10;
      const dz = Math.sin(angle) * 10;
      let last = r.weightsAt(0, 0).slice();
      for (let i = 1; i <= 16000; i++) {
        const w = r.weightsAt(dx * i, dz * i);
        for (let k = 0; k < 4; k++) assert.ok(Math.abs(w[k]! - last[k]!) < 0.01, `seed ${seed} line ${line} step ${i} region ${k}`);
        last = w.slice();
      }
    }
  }
});

test('all four regions occur, in cells of about 40 km blended over about 5 km', () => {
  const seen = new Set<number>();
  for (const seed of SEEDS) {
    const r = createRegions(seed);
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) seen.add(r.cellRegion(i, j));
  }
  assert.equal(seen.size, 4);
  assert.equal(REGION_CELL, 40000);
  assert.equal(REGION_BLEND, 5000);
});

test('the look changes by under 2 percent between frames at 28 m/s', () => {
  // Frames are 28 / 30 m apart at 30 fps; sampling every sixth of them, the allowance is six times as wide.
  const frame = 28 / 30;
  const stride = 6;
  for (const seed of SEEDS) {
    const look = createRegionLook(createRegions(seed));
    let last: number[] | null = null;
    for (let i = 0; i <= 8000; i++) {
      look.update(i * frame * stride, 900 + i * 0.3);
      const now = [look.water.r, look.water.g, look.water.b, look.fogTint.r, look.fogTint.g, look.fogTint.b, look.fogMix, look.fogDensity, look.hazeDensity, look.land.r, look.land.g, look.land.b, ...look.birds];
      if (last) now.forEach((v, k) => assert.ok(Math.abs(v - last![k]!) <= 0.02 * Math.max(Math.abs(last![k]!), 0.05) * stride, `seed ${seed} step ${i} channel ${k}`));
      last = now;
    }
  }
});

test('open ocean dominates: land is 3 to 12 percent of 60 km, and no 10 km disc along a 100 km line is over 40 percent', () => {
  let total = 0;
  for (const seed of SEEDS) {
    const land = layoutWorld(seed).land;
    let count = 0;
    let samples = 0;
    for (let z = -30000; z < 30000; z += 600) {
      for (let x = -30000; x < 30000; x += 600) {
        samples++;
        if (land.maskAt(x, z) > 0) count++;
      }
    }
    const share = count / samples;
    assert.ok(share > 0.03 && share < 0.12, `seed ${seed} land share ${(100 * share).toFixed(1)} percent`);
    total += share;
    for (const angle of [0.2, 1.4, 2.6, 3.8, 5.0]) {
      for (let d = 0; d <= 100000; d += 5000) {
        let hit = 0;
        let n = 0;
        for (let u = -5000; u <= 5000; u += 400) {
          for (let v = -5000; v <= 5000; v += 400) {
            if (u * u + v * v > 25e6) continue;
            n++;
            if (land.maskAt(Math.cos(angle) * d + u, Math.sin(angle) * d + v) > 0) hit++;
          }
        }
        assert.ok(hit / n <= 0.4, `seed ${seed} angle ${angle} at ${d} m: ${(100 * hit / n).toFixed(0)} percent land`);
      }
    }
  }
  const mean = total / SEEDS.length;
  assert.ok(mean >= 0.05 && mean <= 0.08, `mean land share ${(100 * mean).toFixed(1)} percent`);
}, 120000);

test('the opening keeps its bay: open water around the start and the way out', () => {
  for (const seed of SEEDS) {
    const { land, whaleHome, journey } = layoutWorld(seed);
    for (let a = 0; a < 24; a++) assert.ok(land.maskAt(Math.cos(a) * 200, Math.sin(a) * 200) < 0, `seed ${seed} land within 200 m of the start`);
    assert.ok(land.clearance(whaleHome.x, whaleHome.z) > 60);
    assert.ok(Number.isFinite(journey));
  }
});

test('regions set the ship density', () => {
  const land = layoutWorld(42).land;
  let sparse = 0;
  let dense = 0;
  for (let cx = -20; cx < 20; cx++) {
    for (let cz = -20; cz < 20; cz++) {
      if (Math.hypot(cx, cz) < 2) continue;
      sparse += shipSpecsForCell(42, cx, cz, land.maskAt, REGION_LOOKS[2]!.ships).length;
      dense += shipSpecsForCell(42, cx, cz, land.maskAt, REGION_LOOKS[3]!.ships).length;
    }
  }
  assert.ok(sparse < dense * 0.7, `polar ${sparse} ships against deep blue ${dense}`);
});
