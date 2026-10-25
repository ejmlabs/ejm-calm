import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './math.js';

export type WhalePhase = 'swim' | 'surface' | 'spout' | 'dive' | 'breach' | 'splash';

export const PHASE_LEN: Record<WhalePhase, number> = {
  swim: 18,
  surface: 6,
  spout: 3.5,
  dive: 5,
  breach: 5.5,
  splash: 2.5,
};

export const PHASE_ORDER: WhalePhase[] = ['swim', 'surface', 'spout', 'dive', 'swim', 'surface', 'spout', 'dive', 'breach', 'splash', 'dive'];

/**
 * Body-origin heights and resting trim. Near the surface the whale rides
 * slightly nose-up with its tail stock sagging: only the head crown, blowholes,
 * a low back line and the fin break the water (about 0.2–0.3 m); the tail stays under.
 */
export const DEEP_Y = -4.5;
export const SWIM_Y = -1.2;
export const SURFACE_Y = -1.02;
export const SWIM_PITCH = 0.04;
export const SURFACE_PITCH = 0.085;
export const REST_ARCH = -0.4;
export const GRAVITY = 9.81;

/**
 * Breach timeline as fractions of the breach phase: a powered rise from depth,
 * a ballistic flight, then re-entry and a slow recovery under the splash.
 */
export const BREACH_EXIT = 0.16;
export const BREACH_EXIT_Y = -1;
export const BREACH_APEX_Y = 4.2;
export const BREACH_V0 = Math.sqrt(2 * GRAVITY * (BREACH_APEX_Y - BREACH_EXIT_Y));
export const BREACH_AIR_TIME = (2 * BREACH_V0) / GRAVITY;
export const BREACH_LAND = BREACH_EXIT + BREACH_AIR_TIME / PHASE_LEN.breach;
export const BREACH_APEX = (BREACH_EXIT + BREACH_LAND) * 0.5;
/** Body-origin height where the falling whale first strikes the water. */
export const BREACH_CONTACT_Y = 1;
/** Phase time of that strike: the re-entry splash fires here. */
export const BREACH_SPLASH =
  BREACH_EXIT + (BREACH_V0 + Math.sqrt(BREACH_V0 ** 2 - 2 * GRAVITY * (BREACH_CONTACT_Y - BREACH_EXIT_Y))) / GRAVITY / PHASE_LEN.breach;
const BREACH_LOW = BREACH_LAND + 0.08;
const BREACH_END_Y = -2.2;
const BREACH_LOW_Y = -4.6;
const EXIT_PITCH = 1.22;
/** Still nose-down when it hits: the body crashes through instead of landing flat. */
export const LAND_PITCH = -0.5;
/** Roll at re-entry; the whale comes down on its side. */
export const BREACH_ROLL = 1.75;
/** Extra forward speed (m/s) through the rise and flight, on top of the cruise. */
export const BREACH_SURGE = 2.4;

export type WhalePose = {
  /** Body-origin height. */
  y: number;
  /** Nose-up angle, radians. */
  pitch: number;
  /** Roll about the body axis, radians (breach roll is unsigned; callers pick a side). */
  roll: number;
  /** Dorsal arch: head down, tail up. */
  arch: number;
  /** Fluke stroke amplitude multiplier. */
  stroke: number;
  /** Stroke rate multiplier. */
  rate: number;
  /** Flipper abduction away from the rest droop (negative lifts them out). */
  flipLift: number;
  /** Flipper sweep away from rest (negative brings them forward). */
  flipSweep: number;
  /** Weight of the idle bob/roll that only makes sense near the surface. */
  bob: number;
  /** Extra forward speed along the heading, m/s. */
  surge: number;
};

export function emptyPose(): WhalePose {
  return { y: 0, pitch: 0, roll: 0, arch: 0, stroke: 1, rate: 1, flipLift: 0, flipSweep: 0, bob: 1, surge: 0 };
}

function hermite(y0: number, v0: number, y1: number, v1: number, duration: number, s: number): number {
  const t = clamp(s, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * v0 * duration + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * v1 * duration;
}

/** Smooth 0→1→0 bump that is flat at both ends. */
function bump(t: number, a: number, b: number, c: number, d: number): number {
  return smoothstep(a, b, t) * (1 - smoothstep(c, d, t));
}

/** Breach body height. Exactly ballistic between exit and re-entry. */
export function breachHeight(t: number): number {
  const T = PHASE_LEN.breach;
  if (t < BREACH_EXIT) return hermite(DEEP_Y, 0, BREACH_EXIT_Y, BREACH_V0, BREACH_EXIT * T, t / BREACH_EXIT);
  if (t <= BREACH_LAND) {
    const s = (t - BREACH_EXIT) * T;
    return BREACH_EXIT_Y + BREACH_V0 * s - 0.5 * GRAVITY * s * s;
  }
  if (t < BREACH_LOW) {
    return hermite(BREACH_EXIT_Y, -BREACH_V0, BREACH_LOW_Y, 0, (BREACH_LOW - BREACH_LAND) * T, (t - BREACH_LAND) / (BREACH_LOW - BREACH_LAND));
  }
  return hermite(BREACH_LOW_Y, 0, BREACH_END_Y, 0, (1 - BREACH_LOW) * T, (t - BREACH_LOW) / (1 - BREACH_LOW));
}

/** True while the body is clear of the water's grip and following its arc. */
export function breachAirborne(t: number): boolean {
  return t >= BREACH_EXIT && t <= BREACH_LAND;
}

/**
 * Pose for a phase at normalised time t. Each phase ends exactly where the next
 * one in PHASE_ORDER begins, so the cycle needs no smoothing to stay continuous.
 */
export function whalePose(phase: WhalePhase, t: number, out: WhalePose = emptyPose()): WhalePose {
  const x = clamp(t, 0, 1);
  out.roll = 0;
  out.arch = 0;
  out.flipLift = 0;
  out.flipSweep = 0;
  out.rate = 1;
  out.surge = 0;
  switch (phase) {
    case 'swim': {
      // Climb back from the dive, then cruise with the back awash.
      const rise = smoothstep(0, 0.3, x);
      out.y = lerp(DEEP_Y, SWIM_Y, rise);
      out.pitch = SWIM_PITCH * rise + 0.1 * Math.sin(Math.PI * clamp(x / 0.3, 0, 1));
      out.arch = REST_ARCH * rise;
      out.stroke = 1;
      out.bob = rise;
      out.flipLift = -0.12 * Math.sin(Math.PI * clamp(x / 0.3, 0, 1));
      break;
    }
    case 'surface':
      out.y = lerp(SWIM_Y, SURFACE_Y, smoothstep(0, 1, x));
      out.pitch = lerp(SWIM_PITCH, SURFACE_PITCH, smoothstep(0, 1, x));
      out.arch = REST_ARCH;
      out.stroke = lerp(1, 0.6, smoothstep(0, 1, x));
      out.bob = 1;
      break;
    case 'spout':
      out.y = SURFACE_Y;
      out.pitch = SURFACE_PITCH + 0.02 * Math.sin(Math.PI * x);
      out.arch = REST_ARCH;
      out.stroke = 0.6;
      out.bob = 1;
      break;
    case 'dive': {
      // Round out, arch the back, lift the flukes clear and slide under.
      out.y = lerp(SURFACE_Y, DEEP_Y, smoothstep(0.25, 1, x));
      out.pitch = SURFACE_PITCH * (1 - smoothstep(0, 0.3, x)) - 0.44 * bump(x, 0, 0.36, 0.66, 1);
      out.arch = REST_ARCH * (1 - smoothstep(0, 0.2, x)) + 0.6 * bump(x, 0.04, 0.42, 0.56, 0.92);
      out.stroke = lerp(0.6, 1, smoothstep(0, 1, x)) + 0.5 * bump(x, 0.1, 0.35, 0.6, 0.9);
      out.rate = 1 - 0.35 * bump(x, 0.25, 0.45, 0.55, 0.8);
      out.bob = 1 - smoothstep(0, 0.5, x);
      out.flipLift = -0.1 * bump(x, 0, 0.3, 0.6, 1);
      break;
    }
    case 'breach': {
      out.y = breachHeight(x);
      const air = bump(x, BREACH_EXIT - 0.06, BREACH_EXIT + 0.03, BREACH_SPLASH - 0.02, BREACH_SPLASH + 0.08);
      if (x < BREACH_EXIT) {
        out.pitch = EXIT_PITCH * smoothstep(0.01, BREACH_EXIT * 0.92, x);
      } else if (x <= BREACH_SPLASH) {
        const k = (x - BREACH_EXIT) / (BREACH_SPLASH - BREACH_EXIT);
        // Nose falls slowly at first, faster as the body tips over the apex.
        out.pitch = lerp(EXIT_PITCH, LAND_PITCH, smoothstep(0, 1, k) * 0.6 + k * 0.4);
      } else {
        // Keeps diving nose-first through the splash, levels out once deep.
        out.pitch = LAND_PITCH * (1 - smoothstep(BREACH_LOW, 0.85, x));
      }
      // Roll onto the side in the air; unroll only once well under.
      out.roll = BREACH_ROLL * smoothstep(BREACH_EXIT - 0.02, BREACH_SPLASH, x) * (1 - smoothstep(BREACH_LOW, 1, x));
      out.surge = BREACH_SURGE * bump(x, 0.02, 0.1, BREACH_SPLASH - 0.04, BREACH_LOW);
      out.arch = -0.12 * air;
      // Hard strokes on the way up, near-still in the air, easing back afterwards.
      const powered = 1 + 1.1 * bump(x, 0, 0.05, 0.12, BREACH_EXIT) - 0.2 * smoothstep(BREACH_LAND, 1, x);
      out.stroke = lerp(powered, 0.25, air);
      out.rate = 1 + 0.9 * bump(x, 0, 0.04, 0.12, BREACH_EXIT);
      out.flipLift = -0.95 * air;
      out.flipSweep = -0.4 * air;
      out.bob = 0;
      break;
    }
    case 'splash':
      out.y = lerp(BREACH_END_Y, SURFACE_Y, smoothstep(0, 1, x));
      out.pitch = SURFACE_PITCH * smoothstep(0, 1, x) + 0.06 * Math.sin(Math.PI * x);
      out.arch = REST_ARCH * smoothstep(0, 1, x);
      out.stroke = lerp(0.8, 0.6, x);
      out.bob = smoothstep(0, 1, x);
      break;
  }
  return out;
}

export const POSE_KEYS: Array<keyof WhalePose> = ['y', 'pitch', 'roll', 'arch', 'stroke', 'rate', 'flipLift', 'flipSweep', 'bob', 'surge'];

/* ---------------------------------------------------------------- spine */

/** Per-bone stroke amplitude (radians) and phase lag, head → tail. */
const TAIL_AMP = [0.022, 0.04, 0.065, 0.1, 0.22];
const TAIL_ARCH = [0.05, 0.09, 0.13, 0.15, 0.06];
const HEAD_AMP = [0.012, 0.008];
const WAVE_LAG = 0.62;

export type SpineAngles = { head: number[]; tail: number[] };

/**
 * Bend angles about the body Z axis for a travelling wave that runs head → fluke.
 * Positive tail angles lift the tail; positive head angles drop the head.
 */
export function spineAngles(strokePhase: number, stroke: number, arch: number, out: SpineAngles = { head: [0, 0], tail: [0, 0, 0, 0, 0] }): SpineAngles {
  for (let i = 0; i < TAIL_AMP.length; i++) {
    out.tail[i] = stroke * TAIL_AMP[i]! * Math.sin(strokePhase - (i + 1) * WAVE_LAG) + arch * TAIL_ARCH[i]!;
  }
  for (let i = 0; i < HEAD_AMP.length; i++) {
    out.head[i] = -stroke * HEAD_AMP[i]! * Math.sin(strokePhase + 0.4) + arch * 0.12;
  }
  return out;
}

/* ---------------------------------------------------------------- orientation */

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const qa = new THREE.Quaternion();

/**
 * Yaw about world Y (head along whaleForward(heading)), then nose-up pitch, then
 * roll about the body's own long axis.
 */
export function whaleOrientation(heading: number, pitch: number, roll: number, out = new THREE.Quaternion()): THREE.Quaternion {
  out.setFromAxisAngle(Y_AXIS, heading);
  // Head is on −X, so nose-up is a negative turn about Z.
  out.multiply(qa.setFromAxisAngle(Z_AXIS, -pitch));
  out.multiply(qa.setFromAxisAngle(X_AXIS, roll));
  return out;
}
