import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BONE_COUNT,
  FLIPPER_LENGTH,
  FLUKE_BONE,
  FLUKE_HALF_SPAN,
  ROOT_BONE,
  WHALE_DETAIL,
  WHALE_LENGTH,
  WHALE_LOD,
  buildWhaleGeometry,
  createWhaleBones,
  flukeStation,
  sampleProfile,
  type WhaleDetail,
} from '../src/whale-model.js';
import {
  BREACH_APEX,
  BREACH_EXIT,
  BREACH_LAND,
  BREACH_SPLASH,
  GRAVITY,
  PHASE_LEN,
  PHASE_ORDER,
  POSE_KEYS,
  breachHeight,
  spineAngles,
  whaleOrientation,
  whalePose,
} from '../src/whale-motion.js';
import { whaleForward } from '../src/whale-course.js';

const DETAILS: WhaleDetail[] = ['high', 'medium', 'low'];

test('whale geometry is finite, closed-ish and skinned at every detail level', () => {
  let previous = Infinity;
  for (const detail of DETAILS) {
    const { geometry, ranges } = buildWhaleGeometry(detail);
    const pos = geometry.getAttribute('position');
    const nrm = geometry.getAttribute('normal');
    const idx = geometry.getAttribute('skinIndex');
    const wgt = geometry.getAttribute('skinWeight');
    const tris = geometry.getIndex()!.count / 3;
    assert.ok(tris < previous, `${detail} must be lighter than the level above`);
    previous = tris;
    for (let i = 0; i < pos.count; i++) {
      assert.ok(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i)), `${detail} vertex ${i}`);
      assert.ok(Math.abs(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i)) - 1) < 1e-3, `${detail} normal ${i}`);
      const sum = wgt.getX(i) + wgt.getY(i) + wgt.getZ(i) + wgt.getW(i);
      assert.ok(Math.abs(sum - 1) < 1e-5, `${detail} skin weights sum to 1`);
      for (const k of [idx.getX(i), idx.getY(i), idx.getZ(i), idx.getW(i)]) assert.ok(k >= 0 && k < BONE_COUNT);
    }
    // Body normals point away from the spine.
    let outward = 0;
    const [b0, b1] = ranges.body;
    for (let i = b0; i < b1; i++) {
      const p = sampleProfile(THREE.MathUtils.clamp((pos.getX(i) + 6) / 10.6, 0, 1));
      if ((pos.getY(i) - p.mid) * nrm.getY(i) + pos.getZ(i) * nrm.getZ(i) > 0) outward++;
    }
    assert.ok(outward / (b1 - b0) > 0.97, `${detail} body normals face out (${outward / (b1 - b0)})`);

    const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
    const size = box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x - WHALE_LENGTH) < 0.3, `${detail} length ${size.x}`);
    // Flippers and flukes are the widest parts, as on a humpback.
    assert.ok(size.z > FLUKE_HALF_SPAN * 2 && size.z < 8, `${detail} span ${size.z}`);
  }
  assert.ok(WHALE_DETAIL.high.rings * WHALE_DETAIL.high.radial > 6000, 'close-ups keep a smooth silhouette');
});

test('whale proportions read as a humpback', () => {
  const { geometry, ranges } = buildWhaleGeometry('high');
  const pos = geometry.getAttribute('position');
  // Long pectoral flippers: about a third of the body.
  assert.ok(FLIPPER_LENGTH / WHALE_LENGTH > 0.28 && FLIPPER_LENGTH / WHALE_LENGTH < 0.38);
  const [f0, f1] = ranges.flipperL;
  let reach = 0;
  for (let i = f0; i < f1; i++) for (let j = f0; j < f1; j += 7) {
    reach = Math.max(reach, Math.hypot(pos.getX(i) - pos.getX(j), pos.getY(i) - pos.getY(j), pos.getZ(i) - pos.getZ(j)));
  }
  assert.ok(reach > 3.6 && reach < 4.6, `flipper reach ${reach}`);
  // Fluke has a central notch and pointed tips.
  assert.ok(flukeStation(0).chord < flukeStation(0.15).chord - 0.3, 'notched trailing edge');
  assert.ok(flukeStation(1).chord < 0.05, 'pointed fluke tips');
  // Deep head and throat, compressed tail stock, small dorsal fin over a hump.
  const head = sampleProfile(0.2);
  const stock = sampleProfile(0.85);
  assert.ok(head.top - head.bot > 2, 'deep head');
  assert.ok(stock.width * 2 < (stock.top - stock.bot) * 0.9, 'laterally compressed tail stock');
  assert.ok(stock.width > 0.3, 'tail stock keeps some body from below');
  const fin = sampleProfile(0.664);
  assert.ok(fin.fin > 0.2 && fin.fin < 0.45, 'small dorsal fin');
});

test('whale geometry is deterministic and LOD tables are ordered', () => {
  const a = buildWhaleGeometry('medium').geometry.getAttribute('position').array;
  const b = buildWhaleGeometry('medium').geometry.getAttribute('position').array;
  assert.deepEqual(Array.from(a), Array.from(b));
  for (const tier of ['high', 'medium', 'low'] as const) {
    const levels = WHALE_LOD[tier];
    assert.equal(levels[0]!.distance, 0);
    for (let i = 1; i < levels.length; i++) {
      assert.ok(levels[i]!.distance > levels[i - 1]!.distance);
      assert.ok(WHALE_DETAIL[levels[i]!.detail].rings < WHALE_DETAIL[levels[i - 1]!.detail].rings);
    }
  }
  assert.ok(!WHALE_LOD.low.some((l) => l.detail === 'high'), 'phones never build the densest mesh');
});

test('whale phases join without jumps across the whole cycle', () => {
  for (let i = 0; i < PHASE_ORDER.length; i++) {
    const from = PHASE_ORDER[i]!;
    const to = PHASE_ORDER[(i + 1) % PHASE_ORDER.length]!;
    const end = whalePose(from, 1);
    const start = whalePose(to, 0);
    for (const key of POSE_KEYS) {
      assert.ok(Math.abs(end[key] - start[key]) < 1e-6, `${from}→${to} ${key}: ${end[key]} vs ${start[key]}`);
    }
  }
  // And within each phase, no single step jumps.
  for (const phase of Object.keys(PHASE_LEN) as Array<keyof typeof PHASE_LEN>) {
    const dt = 1 / 60 / PHASE_LEN[phase];
    let prev = whalePose(phase, 0);
    for (let t = dt; t <= 1; t += dt) {
      const pose = whalePose(phase, t);
      assert.ok(Math.abs(pose.y - prev.y) < 0.25, `${phase} y step at ${t}`);
      assert.ok(Math.abs(pose.pitch - prev.pitch) < 0.05, `${phase} pitch step at ${t}`);
      assert.ok(Math.abs(pose.roll - prev.roll) < 0.05, `${phase} roll step at ${t}`);
      prev = pose;
    }
  }
});

test('breach follows a ballistic arc with nose-up exit and a rolled re-entry', () => {
  const T = PHASE_LEN.breach;
  const h = 0.02 / T;
  for (let t = BREACH_EXIT + h; t < BREACH_LAND - h; t += 0.05) {
    const accel = (breachHeight(t + h) - 2 * breachHeight(t) + breachHeight(t - h)) / (0.02 * 0.02);
    assert.ok(Math.abs(accel + GRAVITY) < 0.05, `free fall at ${t}: ${accel}`);
  }
  assert.ok(breachHeight(BREACH_APEX) > 3.5, 'body clears the water');
  assert.ok(whalePose('breach', BREACH_EXIT).pitch > 1, 'leaves the water nose-up');
  assert.ok(BREACH_SPLASH > BREACH_APEX && BREACH_SPLASH < BREACH_LAND, 'splash fires as the falling body meets the water');
  assert.ok(Math.abs(whalePose('breach', BREACH_SPLASH).roll) > 1.4, 'on its side at re-entry');
  assert.ok(whalePose('breach', BREACH_SPLASH).pitch < -0.4, 'crashes in nose-down, not flat');
  // Under within half a second of impact: no floating on the surface.
  assert.ok(breachHeight(BREACH_SPLASH + 0.5 / T) < -2.5, `submerges after impact (${breachHeight(BREACH_SPLASH + 0.5 / T)})`);
  let travel = 0;
  for (let t = 0; t < 1; t += 0.001) travel += whalePose('breach', t).surge * 0.001 * T;
  assert.ok(travel > 3 && travel < 7, `breach carries the whale forward (${travel} m extra)`);
  assert.ok(whalePose('breach', (BREACH_EXIT + BREACH_LAND) / 2).flipLift < -0.8, 'flippers spread in the air');
});

test('dive lifts the flukes clear of the water', () => {
  const holder = new THREE.Object3D();
  const bones = createWhaleBones();
  holder.add(bones[ROOT_BONE]!);
  let peak = -Infinity;
  for (let t = 0; t <= 1; t += 0.02) {
    const pose = whalePose('dive', t);
    holder.position.set(0, pose.y, 0);
    whaleOrientation(0.7, pose.pitch, 0, holder.quaternion);
    const angles = spineAngles(0, 0, pose.arch);
    bones[1]!.rotation.z = angles.head[0]!;
    bones[0]!.rotation.z = angles.head[1]!;
    for (let i = 0; i < 5; i++) bones[3 + i]!.rotation.z = angles.tail[i]!;
    holder.updateMatrixWorld(true);
    peak = Math.max(peak, bones[FLUKE_BONE]!.getWorldPosition(new THREE.Vector3()).y);
  }
  assert.ok(peak > 0.6, `fluke root rises above the surface (${peak})`);
});

test('whale faces its direction of travel and the stroke wave runs head to tail', () => {
  for (const heading of [0, 0.8, 2.5, -1.9]) {
    const head = new THREE.Vector3(-1, 0, 0).applyQuaternion(whaleOrientation(heading, 0, 0));
    const fwd = whaleForward(heading);
    assert.ok(Math.abs(head.x - fwd.x) < 1e-6 && Math.abs(head.z - fwd.z) < 1e-6 && Math.abs(head.y) < 1e-6);
    const up = new THREE.Vector3(-1, 0, 0).applyQuaternion(whaleOrientation(heading, 0.5, 0.3));
    assert.ok(up.y > 0.47, 'positive pitch lifts the nose');
  }
  // Each tail bone peaks later than the one before it.
  const peakPhase = (bone: number) => {
    let best = 0;
    let bestV = -Infinity;
    for (let p = 0; p < Math.PI * 2; p += 0.01) {
      const v = spineAngles(p, 1, 0).tail[bone]!;
      if (v > bestV) {
        bestV = v;
        best = p;
      }
    }
    return best;
  };
  for (let i = 1; i < 5; i++) {
    const lag = (peakPhase(i) - peakPhase(i - 1) + Math.PI * 2) % (Math.PI * 2);
    assert.ok(lag > 0.3 && lag < 1.2, `bone ${i} lags (${lag})`);
  }
});
