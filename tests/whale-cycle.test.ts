import { test } from 'vitest';
import assert from 'node:assert/strict';
import { circleShore } from '../src/shore.js';
import { BLOWS, DIVE_MAX, VERTICAL_SPEED, createWhaleMover } from '../src/whale-behavior.js';
import { floorLimit, type WhalePhase } from '../src/whale-motion.js';
import { DIVE_BELOW, RISE_ABOVE } from '../src/camera.js';

const SEEDS = [0, 7, 42, 1234, 99991];
const OPEN = circleShore([]);
/** Open ocean: a deep floor far below anything the whale does. */
const DEEP = () => -600;
const DT = 1 / 30;

type Stretch = { up: boolean; start: number; end: number; blows: number; deepest: number };

/** Up and under stretches as the chase camera sees them (its dive and rise lines, with its hysteresis). */
function stretches(seed: number, seconds: number, floorAt: (x: number, z: number) => number = DEEP) {
  const mover = createWhaleMover(seed, { x: 0, z: 0 }, 0.4, floorAt);
  const m = mover.motion;
  const out: Stretch[] = [];
  let cur: Stretch = { up: true, start: 0, end: 0, blows: 0, deepest: 0 };
  let prevPhase: WhalePhase = m.phase;
  const ys: number[] = [];
  const phases: WhalePhase[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const t = i * DT;
    mover.step(DT, t, OPEN);
    const y = floorLimit(m.pose.y, m.floor);
    ys.push(y);
    phases.push(m.phase);
    if (m.phase === 'spout' && prevPhase !== 'spout') cur.blows++;
    prevPhase = m.phase;
    cur.deepest = Math.min(cur.deepest, y);
    const up = cur.up ? y > DIVE_BELOW : y > RISE_ABOVE;
    if (up !== cur.up) {
      cur.end = t;
      out.push(cur);
      cur = { up, start: t, end: t, blows: 0, deepest: y };
    }
  }
  // The first stretch starts mid-surfacing and the last is cut off: neither is a whole one.
  return { whole: out.slice(1), ys, phases };
}

test('surfacings last tens of seconds with a string of blows; dives last minutes and go deep', () => {
  const ups: number[] = [];
  const downs: number[] = [];
  for (const seed of SEEDS) {
    // A breach dips under for a moment on its way back up; that is not a dive.
    const { whole } = stretches(seed, 1800);
    const dives = whole.filter((s) => !s.up && s.end - s.start > 6);
    const surfacings = whole.filter((s) => s.up && s.end - s.start > 6);
    assert.ok(dives.length >= 4 && surfacings.length >= 4, `seed ${seed}: ${dives.length} dives, ${surfacings.length} surfacings in 30 min`);
    for (const s of surfacings) {
      const len = s.end - s.start;
      ups.push(len);
      assert.ok(len > 20 && len < 150, `seed ${seed}: surfacing of ${len.toFixed(0)} s at ${s.start.toFixed(0)}`);
      assert.ok(s.blows >= BLOWS[0] - 1, `seed ${seed}: only ${s.blows} blows at ${s.start.toFixed(0)}`);
    }
    for (const d of dives) {
      const len = d.end - d.start;
      downs.push(len);
      assert.ok(len > 100 && len < DIVE_MAX + 90, `seed ${seed}: dive of ${len.toFixed(0)} s at ${d.start.toFixed(0)}`);
      assert.ok(d.deepest < -12, `seed ${seed}: dive at ${d.start.toFixed(0)} only reached ${d.deepest.toFixed(1)} m`);
    }
  }
  // Varied, not metronomic.
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  assert.ok(spread(ups) > 30 && spread(downs) > 40, `surfacings ${spread(ups).toFixed(0)} s apart at most, dives ${spread(downs).toFixed(0)} s`);
  assert.ok(Math.min(...downs.map((d, i) => d)) > 40 && downs.some((d) => d > 120), `dive lengths ${downs.map((d) => d.toFixed(0))}`);
}, 60000);

test('between blows the whale stays above the camera dive line, and dives sink and climb at an eased, capped rate', () => {
  for (const seed of SEEDS) {
    const { ys, phases } = stretches(seed, 900);
    for (let i = 1; i < ys.length; i++) {
      if (phases[i] === 'roll' || phases[i] === 'surface' || phases[i] === 'spout') assert.ok(ys[i]! > DIVE_BELOW + 0.5, `seed ${seed}: ${phases[i]} at ${ys[i]!.toFixed(2)} m`);
      // Posed stretches (the fluke-up dive, a breach) move faster; the long dive itself never outruns the cap.
      const free = phases[i] === 'deep' && phases[i - 1] === 'deep';
      if (free && ys[i]! < -8) assert.ok(Math.abs(ys[i]! - ys[i - 1]!) / DT < VERTICAL_SPEED * 1.25, `seed ${seed}: ${((ys[i]! - ys[i - 1]!) / DT).toFixed(2)} m/s at ${(i * DT).toFixed(1)}`);
      // Vertical acceleration stays gentle outside the breach: eased starts and stops, no snaps.
      if (i > 1 && phases[i] !== 'breach' && phases[i - 1] !== 'breach' && phases[i] !== 'splash') {
        const accel = (ys[i]! - 2 * ys[i - 1]! + ys[i - 2]!) / (DT * DT);
        assert.ok(Math.abs(accel) < 5, `seed ${seed}: vertical acceleration ${accel.toFixed(2)} at ${(i * DT).toFixed(1)} ${phases[i - 1]}>${phases[i]}`);
      }
    }
  }
}, 60000);

test('over shallow water the whale stays up and keeps breathing instead of diving', () => {
  const { ys, phases } = stretches(42, 400, () => -8);
  const deepest = Math.min(...ys.slice(Math.round(30 / DT)));
  assert.ok(deepest > -6, `dived to ${deepest.toFixed(1)} m over 8 m of water`);
  const spouts = phases.filter((p, i) => p === 'spout' && phases[i - 1] !== 'spout').length;
  assert.ok(spouts >= 10, `${spouts} blows in 400 s`);
});
