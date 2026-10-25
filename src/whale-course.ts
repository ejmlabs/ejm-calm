import type { NoiseFunction2D } from 'simplex-noise';
import { fork } from './rng.js';
import { makeNoise2D } from './noise.js';
import { clamp, smoothstep } from './math.js';
import { clampClearOfLand, type Shore } from './shore.js';

/** Hard cap on |Δheading| / dt. Gentle enough that a turn reads as a curve, not a spin. */
export const WHALE_MAX_TURN_RATE = 0.2;

/** Hard clearance from land passed to clampClearOfLand. */
export const WHALE_ISLAND_MARGIN = 20;

export type WhaleCourse = {
  x: number;
  z: number;
  heading: number;
  /** Heading of the current crossing. Held while the whale glides back through home. */
  leg: number;
};

export type WhaleCourseParams = {
  baseHeading: number;
  homeX: number;
  homeZ: number;
  speed: number;
  turnRate: number;
  /** Inside this radius the whale follows its cruise heading. */
  comfort: number;
  /** By this radius the desired heading has swung fully back toward home. */
  leash: number;
  wanderFreq: number;
  wanderAmp: number;
  wanderPhase: number;
};

/** Shortest signed angle from `from` to `to`, in (−π, π]. */
export function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Horizontal direction the head points when `group.rotation.y = heading`
 * (lathe head sits on local −X; yaw-only YXZ).
 */
export function whaleForward(heading: number): { x: number; z: number } {
  return { x: -Math.cos(heading), z: Math.sin(heading) };
}

/** Heading whose forward matches the world XZ vector (dx, dz). */
export function headingToward(dx: number, dz: number): number {
  return Math.atan2(dz, -dx);
}

export function createWhaleCourseParams(
  seed: number,
  home: { x: number; z: number },
  heading: number,
): WhaleCourseParams {
  const rng = fork(seed, 'whale-course');
  const comfort = 34 + rng() * 10;
  return {
    baseHeading: heading,
    homeX: home.x,
    homeZ: home.z,
    speed: 1.55 + rng() * 0.45,
    turnRate: WHALE_MAX_TURN_RATE,
    comfort,
    leash: comfort + 24 + rng() * 8,
    wanderFreq: 0.013 + rng() * 0.01,
    wanderAmp: 0.42 + rng() * 0.28,
    wanderPhase: rng() * 64,
  };
}

export function createWhaleCourseNoise(seed: number): NoiseFunction2D {
  return makeNoise2D(seed, 11);
}

/** How far ahead of the hard margin the whale starts to bend away from land. */
const LAND_INFLUENCE = 34;

function avoidLand(
  x: number,
  z: number,
  heading: number,
  desired: number,
  shore: Shore,
): number {
  const gap = shore.clearance(x, z);
  const influence = WHALE_ISLAND_MARGIN + LAND_INFLUENCE;
  if (!(gap < influence)) return desired;
  const away = shore.away(x, z);
  // Direction toward the land is the reverse of the way out.
  const ndx = -away.x;
  const ndz = -away.z;
  const fwd = whaleForward(heading);
  const closeness = clamp(1 - (gap - WHALE_ISLAND_MARGIN * 0.5) / (influence - WHALE_ISLAND_MARGIN * 0.5), 0, 1);
  const ahead = fwd.x * ndx + fwd.z * ndz;
  if (ahead < 0.05 && closeness < 0.5) return desired;
  // Follow the coast on the nearer side; when very close, head straight out.
  const left = headingToward(-ndz, ndx);
  const right = headingToward(ndz, -ndx);
  const tangent = Math.abs(shortestAngle(desired, left)) <= Math.abs(shortestAngle(desired, right)) ? left : right;
  const flee = closeness > 0.72 ? headingToward(away.x, away.z) : tangent;
  const weight = clamp(closeness * (0.45 + 0.9 * clamp(ahead, 0, 1)), 0, 1);
  return desired + shortestAngle(desired, flee) * weight;
}

/**
 * Advance the cruise one step.
 * Inside the home radius the whale holds a slow leg plus low-frequency noise.
 * Outside, that leg bends toward home and, once aimed inward, locks so the whale
 * crosses the scene instead of circling. Desired heading does not use the current
 * heading — folding heading into the target made the whale spin.
 */
export function stepWhaleCourse(
  course: WhaleCourse,
  dt: number,
  time: number,
  shore: Shore,
  params: WhaleCourseParams,
  noise: NoiseFunction2D,
): void {
  if (!(dt > 0) || !Number.isFinite(dt) || !Number.isFinite(time)) return;

  const n1 = noise(time * params.wanderFreq + params.wanderPhase, 2.5);
  const n2 = noise(time * params.wanderFreq * 0.37 + 11.0, params.wanderPhase * 0.2 + 4.0);
  const wander = (n1 * 0.78 + n2 * 0.22) * params.wanderAmp;

  const homeDx = params.homeX - course.x;
  const homeDz = params.homeZ - course.z;
  const homeDist = Math.hypot(homeDx, homeDz);
  const homeH = headingToward(homeDx, homeDz);
  const urgency = smoothstep(params.comfort, params.leash, homeDist);

  // Once a far whale has turned to face home, lock that inbound leg.
  // Updating the leg every frame would chase the wander term and spin.
  if (
    homeDist > params.comfort &&
    Math.abs(shortestAngle(course.heading, homeH)) < 0.45 &&
    Math.abs(shortestAngle(course.leg, homeH)) > 0.75
  ) {
    course.leg = homeH;
  }

  let desired = course.leg + wander;
  if (urgency > 0) {
    desired += shortestAngle(desired, homeH) * urgency;
  }
  desired = avoidLand(course.x, course.z, course.heading, desired, shore);

  const delta = shortestAngle(course.heading, desired);
  const maxStep = params.turnRate * dt;
  course.heading = wrapAngle(course.heading + clamp(delta, -maxStep, maxStep));

  const fwd = whaleForward(course.heading);
  course.x += fwd.x * params.speed * dt;
  course.z += fwd.z * params.speed * dt;

  const cleared = clampClearOfLand(course.x, course.z, shore, WHALE_ISLAND_MARGIN);
  course.x = cleared.x;
  course.z = cleared.z;

  if (!Number.isFinite(course.x) || !Number.isFinite(course.z) || !Number.isFinite(course.heading) || !Number.isFinite(course.leg)) {
    course.x = params.homeX;
    course.z = params.homeZ;
    course.heading = wrapAngle(params.baseHeading);
    course.leg = course.heading;
  }
}

export type WhalePilot = {
  params: WhaleCourseParams;
  step: (course: WhaleCourse, dt: number, time: number, shore: Shore) => void;
};

export function createWhalePilot(
  seed: number,
  home: { x: number; z: number },
  heading: number,
): WhalePilot {
  const params = createWhaleCourseParams(seed, home, heading);
  const noise = createWhaleCourseNoise(seed);
  return {
    params,
    step(course, dt, time, shore) {
      stepWhaleCourse(course, dt, time, shore, params, noise);
    },
  };
}
