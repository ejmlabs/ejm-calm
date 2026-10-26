import { layoutWorld } from '../src/terrain.js';
import { createSeafloor } from '../src/seafloor.js';
import { createWhaleMover } from '../src/whale-behavior.js';
import { PLAN_REACH } from '../src/whale-course.js';

/**
 * Route gate over many seeds: the real whale mover for an hour on each, with the navigation tiles prefetched as the
 * page does. Reports the net distance, net over path and the five-minute windows that make under 1.5 km good, and
 * fails when a seed's net over path is under 0.6.
 *
 * usage: npx tsx tools/seed-sweep.ts [first seed] [last seed] [minutes]    (defaults: 1 24 60)
 */
const first = Number(process.argv[2] ?? 1);
const last = Number(process.argv[3] ?? 24);
const minutes = Number(process.argv[4] ?? 60);
const DT = 1 / 30;
const MIN_RATIO = 0.6;
const STALL = 1500;

const rows: Array<{ seed: number; net: number; ratio: number; stalled: number; longest: number }> = [];
for (let seed = first; seed <= last; seed++) {
  const layout = layoutWorld(seed);
  const land = layout.land;
  const mover = createWhaleMover(seed, layout.whaleHome, layout.viewYaw - Math.PI / 2, createSeafloor(seed, land).heightAt, layout.journey);
  const m = mover.motion;
  land.nav.prefetch(m.x, m.z, 1100, Infinity);
  let path = 0;
  let px = m.x;
  let pz = m.z;
  let mark = { x: m.x, z: m.z };
  let vx = 0;
  let vz = 0;
  let stalled = 0;
  let run = 0;
  let longest = 0;
  for (let i = 1; i <= (minutes * 60) / DT; i++) {
    mover.step(DT, i * DT, land);
    path += Math.hypot(m.x - px, m.z - pz);
    if (i % 15 === 0) {
      vx = (m.x - px) / (15 * DT);
      vz = (m.z - pz) / (15 * DT);
      const k = Math.min(20, 700 / Math.max(1e-6, Math.hypot(vx, vz)));
      land.nav.prefetch(m.x + vx * k, m.z + vz * k, PLAN_REACH + 700, 4);
    }
    px = m.x;
    pz = m.z;
    if (i % (300 / DT) === 0) {
      const slow = Math.hypot(m.x - mark.x, m.z - mark.z) < STALL;
      stalled += slow ? 1 : 0;
      run = slow ? run + 1 : 0;
      longest = Math.max(longest, run * 5);
      mark = { x: m.x, z: m.z };
    }
  }
  const net = Math.hypot(m.x - layout.whaleHome.x, m.z - layout.whaleHome.z);
  rows.push({ seed, net, ratio: net / path, stalled, longest });
  console.log(`seed ${seed}: net ${(net / 1000).toFixed(1)} km, net/path ${(net / path).toFixed(2)}, ${stalled} stalled 5-minute windows, longest ${longest} min`);
}
const worst = rows.reduce((a, b) => (b.ratio < a.ratio ? b : a));
const mean = rows.reduce((s, r) => s + r.net, 0) / rows.length;
console.log(`seeds ${first}-${last}, ${minutes} min: mean net ${(mean / 1000).toFixed(1)} km, worst net/path ${worst.ratio.toFixed(2)} (seed ${worst.seed}), longest stall ${Math.max(...rows.map((r) => r.longest))} min`);
if (worst.ratio < MIN_RATIO) {
  console.error(`seed ${worst.seed} makes ${worst.ratio.toFixed(2)} net over path, under ${MIN_RATIO}`);
  process.exitCode = 1;
}
