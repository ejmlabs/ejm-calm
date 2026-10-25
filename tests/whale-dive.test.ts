import { test } from 'vitest';
import assert from 'node:assert/strict';
import { cycleDuration, phaseAtCycleTime } from '../src/whale.js';
import { DEEP_DIVE_Y, FLOOR_CLEARANCE, PHASE_LEN, SURFACE_Y, floorLimit, whalePose } from '../src/whale-motion.js';

test('the long dive happens once every cycle and reaches below −10 m', () => {
  const duration = cycleDuration();
  for (let c = 0; c < 3; c++) {
    let deepTime = 0;
    for (let t = c * duration; t < (c + 1) * duration; t += 0.25) if (phaseAtCycleTime(t).phase === 'deep') deepTime += 0.25;
    assert.ok(Math.abs(deepTime - PHASE_LEN.deep) < 0.5, `cycle ${c}: ${deepTime}`);
  }
  let lowest = 0;
  for (let x = 0; x <= 1; x += 0.005) lowest = Math.min(lowest, whalePose('deep', x).y);
  assert.ok(lowest < -10 && lowest > DEEP_DIVE_Y - 1.5, `${lowest}`);
});

test('floor limit keeps clearance, is continuous, and leaves surface riding alone', () => {
  for (const floorY of [-40, -18, -12, -8, -6]) {
    let prev = floorLimit(-20, floorY);
    for (let y = -20; y <= 2; y += 0.01) {
      const v = floorLimit(y, floorY);
      assert.ok(v >= y - 1e-9 && v >= floorY + FLOOR_CLEARANCE - 1e-9, `${floorY} ${y} → ${v}`);
      assert.ok(Math.abs(v - prev) < 0.02, 'continuous');
      prev = v;
    }
  }
  assert.equal(floorLimit(-14, undefined), -14);
  assert.equal(floorLimit(SURFACE_Y, -3), SURFACE_Y);
  assert.equal(floorLimit(-30, -100), -30);
});

/** Body height through the cycle exactly as whale.update composes it (pose, then floor limit). */
function heights(floorY: number | undefined, seconds: number, offset = 0): number[] {
  const ys: number[] = [];
  for (let t = 0; t < seconds; t += 1 / 20) {
    const { phase, phaseT } = phaseAtCycleTime(t + offset);
    ys.push(floorLimit(whalePose(phase, phaseT).y, floorY));
  }
  return ys;
}

test('the whale dives deep through a cycle, respects the floor, and the schedule is deterministic', () => {
  const span = cycleDuration() + 5;
  assert.ok(Math.min(...heights(undefined, span)) < -10);
  const floored = heights(-15, span);
  for (const y of floored) assert.ok(y >= -15 + FLOOR_CLEARANCE - 1e-9, `y ${y}`);
  for (let i = 1; i < floored.length; i++) assert.ok(Math.abs(floored[i]! - floored[i - 1]!) < 0.8, 'no jumps (the breach is the fastest move)');
  assert.deepEqual(heights(-30, 60, 3.3), heights(-30, 60, 3.3));
});
