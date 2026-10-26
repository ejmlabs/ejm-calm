import { test } from 'vitest';
import assert from 'node:assert/strict';
import { layoutWorld } from '../src/terrain.js';
import { createSeafloor } from '../src/seafloor.js';
import { circleShore, type Circle, type Shore } from '../src/shore.js';
import { random } from '../src/rng.js';
import { TRAVEL_MAX, TRAVEL_MIN, createWhaleMover } from '../src/whale-behavior.js';
import { WHALE_ISLAND_MARGIN } from '../src/whale-course.js';

const SEEDS = [42, 7, 1234, 99, 2024, 31337];
const DT = 1 / 30;
const HOUR = 3600;

type Fix = { t: number; x: number; z: number; speed: number; clear: number };

/** One fix per second of a whole hour of the real mover over `shore`. */
function swim(seed: number, home: { x: number; z: number }, heading: number, shore: Shore, floorAt: (x: number, z: number) => number, prefetch?: (x: number, z: number) => void): Fix[] {
  const mover = createWhaleMover(seed, home, heading, floorAt);
  const m = mover.motion;
  const fixes: Fix[] = [];
  for (let i = 0; i < HOUR / DT; i++) {
    const t = i * DT;
    if (prefetch && i % 150 === 0) prefetch(m.x, m.z);
    mover.step(DT, t, shore);
    if (i % 30 === 0) fixes.push({ t, x: m.x, z: m.z, speed: m.speed, clear: shore.clearance(m.x, m.z) });
  }
  return fixes;
}

const path = (f: Fix[]) => f.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - f[i - 1]!.x, p.z - f[i - 1]!.z) : 0), 0);
const net = (f: Fix[]) => Math.hypot(f.at(-1)!.x - f[0]!.x, f.at(-1)!.z - f[0]!.z);
/** Share of fixes within 200 m of one at least two minutes earlier. */
function revisits(f: Fix[]): number {
  let back = 0;
  for (let i = 120; i < f.length; i++) {
    for (let j = 0; j < i - 120; j += 3) {
      if (Math.hypot(f[i]!.x - f[j]!.x, f[i]!.z - f[j]!.z) < 200) {
        back++;
        break;
      }
    }
  }
  return back / f.length;
}

test('over real coasts the whale cruises at the new pace for an hour and never beaches', () => {
  for (const seed of SEEDS) {
    const layout = layoutWorld(seed);
    const land = layout.land;
    land.nav.prefetch(layout.whaleHome.x, layout.whaleHome.z, 700, Infinity);
    const fixes = swim(seed, layout.whaleHome, layout.viewYaw - Math.PI / 2, land, createSeafloor(seed, land).heightAt, (x, z) => land.nav.prefetch(x, z, 3400, Infinity));
    const mean = path(fixes) / (fixes.length - 1);
    assert.ok(mean > 0.7 * TRAVEL_MIN && mean < TRAVEL_MAX, `seed ${seed} mean speed ${mean.toFixed(1)} m/s`);
    for (const f of fixes) assert.ok(f.clear >= WHALE_ISLAND_MARGIN - 1e-3, `seed ${seed} within ${f.clear.toFixed(1)} m of land at ${f.t}`);
  }
}, 120000);

test('over open water the route is a steady heading: straight, never back over its own track', () => {
  const cell = 4000;
  for (const seed of SEEDS) {
    // One round island of 150 to 700 m per 4 km cell (about 7 percent land), the start left open.
    const rng = random(seed ^ 0x5eed);
    const buckets = new Map<string, Circle[]>();
    for (let i = -40; i <= 40; i++) {
      for (let j = -40; j <= 40; j++) {
        const x = (i + rng()) * cell;
        const z = (j + rng()) * cell;
        if (Math.hypot(x, z) < 700) continue;
        const key = `${Math.floor(x / cell)}:${Math.floor(z / cell)}`;
        const list = buckets.get(key) ?? [];
        list.push({ x, z, radius: 150 + rng() * 550 });
        buckets.set(key, list);
      }
    }
    const near = (x: number, z: number) => {
      const out: Circle[] = [];
      for (let i = Math.floor(x / cell) - 2; i <= Math.floor(x / cell) + 2; i++) for (let j = Math.floor(z / cell) - 2; j <= Math.floor(z / cell) + 2; j++) out.push(...(buckets.get(`${i}:${j}`) ?? []));
      return out;
    };
    const shore: Shore = { clearance: (x, z) => circleShore(near(x, z)).clearance(x, z), away: (x, z) => circleShore(near(x, z)).away(x, z) };
    const fixes = swim(seed, { x: 0, z: 0 }, 0.4 + (seed % 5), shore, () => -60);
    const ten = fixes.slice(0, 601);
    assert.ok(net(ten) > 8000, `seed ${seed} net in 10 min ${net(ten).toFixed(0)} m`);
    assert.ok(net(fixes) / path(fixes) > 0.85, `seed ${seed} net over path ${(net(fixes) / path(fixes)).toFixed(2)}`);
    assert.ok(revisits(fixes) < 0.02, `seed ${seed} back near an earlier spot ${(100 * revisits(fixes)).toFixed(1)} percent of the time`);
  }
}, 120000);
