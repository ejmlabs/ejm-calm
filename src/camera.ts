import * as THREE from 'three';
import { clamp, smoothstep } from './math.js';
import { SURFACE_BAND, WATER_LEVEL, type FollowTarget } from './seams.js';
import { createSpring, nearestAngle, springSet, springStep, springStepAngle, type Spring } from './spring.js';

/** Persisted framing. `yaw` is always 0: the chase camera is locked to the whale's heading. */
export type CameraFraming = { yaw: number; pitch: number; distance: number };

/**
 * Debug review view around the target. `yaw` is relative to the whale's heading
 * (0 = straight behind, −π/2 ≈ broadside on its left), `pitch` lifts the eye.
 */
export type ReviewView = { yaw: number; pitch: number; distance: number; minLookY?: number };

export type CameraMode = 'chase' | 'under' | 'review';

export type FollowCameraOptions = {
  portrait?: boolean;
  saved?: CameraFraming | null;
  /** Ground or seabed height in render coordinates; keeps the eye clear of land and floor. */
  groundAt?: (x: number, z: number) => number;
};

export const DEFAULT_FRAMING: CameraFraming = { yaw: 0, pitch: 0.3, distance: 16 };
export const FRAMING_DISTANCE: readonly [number, number] = [14, 40];
const FRAMING_PITCH: readonly [number, number] = [0.1, 0.4];

/** The eye never rests closer than this to the waterline. */
export const EYE_CLEARANCE = SURFACE_BAND + 0.15;
/** Hysteresis on the whale's depth for following it under (and back up). */
export const DIVE_BELOW = -3;
export const RISE_ABOVE = -2;
/** Seconds below DIVE_BELOW before the camera follows, so short shallow dips do not flip it. */
export const DIVE_DWELL = 0.35;
const UNDER_EYE = 1.5;
const UNDER_DISTANCE = 0.7;
/** Under water the haze is thick: never trail further than this. */
const UNDER_MAX_DISTANCE = 18;
/** Distance and look-ahead grow with speed up to this many m/s. */
const SPEED_CAP = 14;
const SPEED_DISTANCE = 0.015;
const SPEED_LOOK_AHEAD = 0.6;
/** Below about this speed the camera holds its bearing instead of following the heading. */
const COUPLING_SPEED: readonly [number, number] = [0.6, 3];
/** Never closer to the whale's body than this. */
export const MIN_DISTANCE = 6;
/** Half the whale's length: the framed points are the centre and ± this along the heading. */
export const WHALE_HALF = 6;
/** Framing safe area in NDC: corrections start at SOFT, HARD is never exceeded. */
const SAFE_SOFT = 0.7;
export const SAFE_HARD = 0.88;
const SIGHT_CLEARANCE = 0.5;
const SHOULDER = 2;
const LOOK_AHEAD = 7;
const LAND_CLEARANCE = 2;
const FLOOR_CLEARANCE = 1.5;

const PEEK_YAW = 0.6;
const PEEK_PITCH: readonly [number, number] = [-0.1, 0.3];
export const PEEK_IDLE = 3;

// Angular frequencies (1/s). A critically damped spring settles in about 5/ω.
const W_HEADING = 1; // turns read as curves; no swing-out
const W_POSITION = 2.6;
const W_LOOK_Y = 2.2;
const W_EYE_Y = 1.1; // soft, so a breach does not yank the camera
const W_EYE_Y_CROSS = 3.4; // brisk through the waterline
const W_FRAMING = 1.6;
const W_PEEK = 9;
const W_PEEK_RETURN = 1.1;
const W_REVIEW = 1.4;
const W_SPEED = 1.2;
const W_AIM = 2.5;
const W_FIT = 1.5;
const W_LIFT_UP = 3;
const W_LIFT_DOWN = 0.8;

/**
 * Chase camera: sits behind and slightly beside the whale, looking along its
 * heading. Every degree of freedom is a critically damped spring, so motion is
 * smooth at any frame rate and never overshoots on its own.
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly framing: CameraFraming;
  readonly lookAt = new THREE.Vector3();
  portrait: boolean;
  private groundAt?: (x: number, z: number) => number;
  private readonly target: FollowTarget = { x: 0, y: 0, z: 0, heading: 0 };
  private review: ReviewView | null = null;
  private lastReview: ReviewView = { yaw: 0, pitch: 0, distance: 20 };
  private under = false;
  private crossing = false;
  private snapping = true;
  private idle = Infinity;
  private peekYawTarget = 0;
  private peekPitchTarget = 0;
  private below = 0;

  private readonly heading = createSpring();
  private readonly px = createSpring();
  private readonly pz = createSpring();
  private readonly lookY = createSpring();
  private readonly eyeY = createSpring();
  private readonly dist = createSpring();
  private readonly pitch = createSpring();
  private readonly peekYaw = createSpring();
  private readonly peekPitch = createSpring();
  private readonly reviewBlend = createSpring();
  /** Smoothed whale height; its velocity is the vertical speed. */
  private readonly py = createSpring();
  private readonly speed = createSpring();
  /** 0 looks ahead along the bearing, 1 looks straight at the whale. */
  private readonly aim = createSpring();
  /** Extra eye height and distance factor that keep land or seabed out of the line of sight. */
  private readonly lift = createSpring();
  private readonly tighten = createSpring(1);
  /** Distance factor ≥ 1 that backs off when the whale is wider than the frame (broadside, portrait). */
  private readonly fit = createSpring(1);
  /** Framed whale points (centre, head, tail) in render coordinates. */
  private readonly wx = new Float64Array(3);
  private readonly wy = new Float64Array(3);
  private readonly wz = new Float64Array(3);

  constructor(camera: THREE.PerspectiveCamera, options: FollowCameraOptions = {}) {
    this.camera = camera;
    this.portrait = Boolean(options.portrait);
    this.groundAt = options.groundAt;
    const saved = options.saved;
    this.framing = {
      yaw: 0,
      pitch: clamp(saved?.pitch ?? DEFAULT_FRAMING.pitch, FRAMING_PITCH[0], FRAMING_PITCH[1]),
      distance: clamp(saved?.distance ?? DEFAULT_FRAMING.distance, FRAMING_DISTANCE[0], FRAMING_DISTANCE[1]),
    };
  }

  get mode(): CameraMode {
    return this.review ? 'review' : this.under ? 'under' : 'chase';
  }

  /** Smoothed horizontal speed of the target, m/s, derived from successive targets. */
  get targetSpeed(): number {
    return this.speed.x;
  }

  /** Eye-to-target distance right now. */
  get distance(): number {
    const p = this.camera.position;
    return Math.hypot(p.x - this.target.x, p.y - this.target.y, p.z - this.target.z);
  }

  setTarget(t: FollowTarget): void {
    this.target.x = t.x;
    this.target.y = t.y;
    this.target.z = t.z;
    this.target.heading = t.heading;
  }

  setPortrait(portrait: boolean): void {
    this.portrait = portrait;
  }

  setGround(groundAt: ((x: number, z: number) => number) | undefined): void {
    this.groundAt = groundAt;
  }

  /** Drag: a brief peek around the locked heading that springs back after PEEK_IDLE seconds. */
  look(dx: number, dy: number): void {
    this.idle = 0;
    this.peekYawTarget = clamp(this.peekYawTarget - dx * 0.004, -PEEK_YAW, PEEK_YAW);
    this.peekPitchTarget = clamp(this.peekPitchTarget + dy * 0.003, PEEK_PITCH[0], PEEK_PITCH[1]);
  }

  /** Wheel zoom; persisted through `framing.distance`. */
  zoom(delta: number): void {
    this.framing.distance = clamp(this.framing.distance * Math.exp(delta * 0.001), FRAMING_DISTANCE[0], FRAMING_DISTANCE[1]);
  }

  /** Debug framing; null returns to the chase with a smooth blend. */
  setReview(view: ReviewView | null): void {
    this.review = view ? { ...view } : null;
    if (view) this.lastReview = this.review!;
  }

  /** Jump every spring to its goal on the next update (first frame, review shots). */
  snap(): void {
    this.snapping = true;
  }

  /** The floating origin moved by (dx, dz): translate everything by (−dx, −dz) without smoothing. */
  shift(dx: number, dz: number): void {
    this.target.x -= dx;
    this.target.z -= dz;
    this.px.x -= dx;
    this.pz.x -= dz;
    this.camera.position.x -= dx;
    this.camera.position.z -= dz;
    this.lookAt.x -= dx;
    this.lookAt.z -= dz;
  }

  private snapNow = false;
  private stepDt = 0;
  private readonly go = (s: Spring, goal: number, omega: number): number =>
    this.snapNow ? springSet(s, goal) : springStep(s, goal, omega, this.stepDt);

  /** Position springs keep their velocity on a snap, so a teleport mid-swim keeps the speed estimate. */
  private track(s: Spring, goal: number): number {
    if (!this.snapNow) return springStep(s, goal, W_POSITION, this.stepDt);
    s.x = goal;
    return goal;
  }

  update(dt: number, _time: number, reducedMotion = false): void {
    const t = this.target;
    const snap = (this.snapNow = this.snapping || reducedMotion);
    this.snapping = false;
    const step = (this.stepDt = dt > 0 ? dt : 0);
    const go = this.go;

    // Velocity comes from the smoothed position springs: robust to noise, dt = 0 and shift().
    const sx = this.track(this.px, t.x);
    const sz = this.track(this.pz, t.z);
    this.track(this.py, t.y);
    const speed = Math.max(0, snap ? this.speed.x : springStep(this.speed, Math.hypot(this.px.v, this.pz.v), W_SPEED, step));
    const climb = Math.abs(this.py.v);

    // Follow the whale under after a short dwell; come back up as soon as it rises.
    if (this.under) {
      if (t.y > RISE_ABOVE) {
        this.under = false;
        this.crossing = true;
      }
    } else {
      this.below = t.y < DIVE_BELOW ? this.below + step : 0;
      if (t.y < DIVE_BELOW && (snap || this.below >= DIVE_DWELL)) {
        this.under = true;
        this.crossing = true;
      }
    }

    this.idle += step;
    const peekReturn = this.idle > PEEK_IDLE;
    if (peekReturn) {
      this.peekYawTarget = 0;
      this.peekPitchTarget = 0;
    }
    const peekOmega = peekReturn ? W_PEEK_RETURN : W_PEEK;

    // Slow or circling: hold the bearing (the goal stays near the current bearing) and just look at the whale.
    const coupling = 0.08 + 0.92 * smoothstep(COUPLING_SPEED[0], COUPLING_SPEED[1], speed);
    const toHeading = nearestAngle(t.heading, this.heading.x);
    const h = snap
      ? springSet(this.heading, toHeading)
      : springStep(this.heading, this.heading.x + (toHeading - this.heading.x) * coupling, W_HEADING, step);
    const fast = Math.min(speed, SPEED_CAP);
    let distGoal = this.framing.distance * (this.portrait ? 1.12 : 1) * (1 + SPEED_DISTANCE * fast);
    if (this.under) distGoal = Math.min(distGoal * UNDER_DISTANCE, UNDER_MAX_DISTANCE);
    const dist = go(this.dist, distGoal, W_FRAMING) * this.tighten.x * this.fit.x;
    const pitch = go(this.pitch, this.framing.pitch + (this.portrait ? 0.02 : 0), W_FRAMING);
    const peekYaw = go(this.peekYaw, this.peekYawTarget, peekOmega);
    const peekPitch = go(this.peekPitch, this.peekPitchTarget, peekOmega);

    // Chase pose: forward = whaleForward(heading) = (−cos h, sin h); right = (−fz, fx).
    const he = h + peekYaw;
    const fx = -Math.cos(he);
    const fz = Math.sin(he);
    const back = dist * Math.cos(pitch);
    let eyeX = sx - fx * back - fz * SHOULDER;
    let eyeZ = sz - fz * back + fx * SHOULDER;
    let goalY = this.under
      ? t.y + UNDER_EYE + Math.sin(peekPitch) * back * 0.5
      : WATER_LEVEL + dist * Math.sin(pitch) + Math.max(0, t.y) * 0.5 + Math.sin(peekPitch) * back;
    goalY += this.lift.x;
    const ground = this.groundAt ? this.groundAt(eyeX, eyeZ) : -Infinity;
    const minY = Number.isFinite(ground) ? ground + (this.under ? FLOOR_CLEARANCE : LAND_CLEARANCE) : -Infinity;
    goalY = this.bandClamp(Math.max(goalY, minY));

    // Vertical stiffness follows the whale's vertical speed, so fast dives and resurfacing stay in step.
    let eyeY: number;
    if (snap) {
      this.crossing = false;
      eyeY = springSet(this.eyeY, goalY);
    } else {
      const nearBand = Math.abs(this.eyeY.x - WATER_LEVEL) < EYE_CLEARANCE + 1.5;
      const omega = Math.min(W_EYE_Y_CROSS, W_EYE_Y + 0.5 * climb);
      eyeY = springStep(this.eyeY, goalY, this.crossing && nearBand ? W_EYE_Y_CROSS + 0.3 * climb : omega, step);
      const side = eyeY - WATER_LEVEL;
      if (this.crossing && (this.under ? side < -EYE_CLEARANCE : side > EYE_CLEARANCE)) this.crossing = false;
      if (!this.crossing) {
        // Settled on one side: never below the ground, never drift back into the band.
        const held = this.bandClamp(Math.max(eyeY, minY));
        if (held !== eyeY) {
          this.eyeY.v = held > eyeY ? Math.max(0, this.eyeY.v) : Math.min(0, this.eyeY.v);
          eyeY = this.eyeY.x = held;
        }
      }
    }

    const lookGoal = this.under ? t.y + 0.4 : clamp(t.y * 0.6 + 1.6, 0.6, 4.4);
    const lookY = go(this.lookY, lookGoal, Math.min(5, W_LOOK_Y + 0.6 * climb));
    const ahead = LOOK_AHEAD + SPEED_LOOK_AHEAD * fast;
    let lookX = sx + fx * ahead;
    let lookZ = sz + fz * ahead;
    let lookAtY = lookY;

    // Review framing blends in and out over ~2 s (or snaps for screenshots).
    const b = clamp(go(this.reviewBlend, this.review ? 1 : 0, W_REVIEW), 0, 1);
    if (b > 1e-4) {
      const s = b * b * (3 - 2 * b);
      const v = this.lastReview;
      const a = h + Math.PI / 2 + v.yaw;
      const focusY = Math.max(v.minLookY ?? 1.2, t.y * 0.7 + 1.4);
      const rx = t.x + Math.sin(a) * Math.cos(v.pitch) * v.distance;
      const rz = t.z + Math.cos(a) * Math.cos(v.pitch) * v.distance;
      const ry = Math.max(WATER_LEVEL + EYE_CLEARANCE, focusY + Math.sin(v.pitch) * v.distance * 0.35 + 1.2);
      eyeX += (rx - eyeX) * s;
      eyeY += (ry - eyeY) * s;
      eyeZ += (rz - eyeZ) * s;
      lookX += (t.x - lookX) * s;
      lookZ += (t.z - lookZ) * s;
      lookAtY += (focusY - lookY) * s;
    }

    // The whale as three points along its true heading.
    const wfx = -Math.cos(t.heading);
    const wfz = Math.sin(t.heading);
    const wx = this.wx;
    const wy = this.wy;
    const wz = this.wz;
    wx[0] = t.x;
    wz[0] = t.z;
    wx[1] = t.x + wfx * WHALE_HALF;
    wz[1] = t.z + wfz * WHALE_HALF;
    wx[2] = t.x - wfx * WHALE_HALF;
    wz[2] = t.z - wfz * WHALE_HALF;
    wy[0] = wy[1] = wy[2] = t.y;

    // Never inside the whale: push the eye out horizontally from the nearest body point.
    const along = clamp((eyeX - t.x) * wfx + (eyeZ - t.z) * wfz, -WHALE_HALF, WHALE_HALF);
    const nx = t.x + wfx * along;
    const nz = t.z + wfz * along;
    const dy = eyeY - t.y;
    let ox = eyeX - nx;
    let oz = eyeZ - nz;
    const horizontal = Math.hypot(ox, oz);
    if (horizontal * horizontal + dy * dy < MIN_DISTANCE * MIN_DISTANCE) {
      if (horizontal < 1e-6) {
        ox = -fx;
        oz = -fz;
      } else {
        ox /= horizontal;
        oz /= horizontal;
      }
      const need = Math.sqrt(Math.max(0, MIN_DISTANCE * MIN_DISTANCE - dy * dy));
      eyeX = nx + ox * need;
      eyeZ = nz + oz * need;
    }

    // Line of sight: raise (and under water also shorten) while land or seabed hides the whale.
    if (this.groundAt) {
      let need = -Infinity;
      for (let k = 1; k <= 4; k++) {
        const u = k / 5;
        const qy = eyeY + (t.y - eyeY) * u;
        const g = this.groundAt(eyeX + (t.x - eyeX) * u, eyeZ + (t.z - eyeZ) * u) + SIGHT_CLEARANCE;
        need = Math.max(need, (g - qy) / (1 - u));
      }
      const liftGoal = clamp(this.lift.x + need, 0, 30);
      if (snap) springSet(this.lift, liftGoal);
      else springStep(this.lift, liftGoal, liftGoal > this.lift.x ? W_LIFT_UP : W_LIFT_DOWN, step);
      go(this.tighten, this.under && need > 0 ? 0.6 : 1, W_FRAMING);
    }

    // Too wide even when looking straight at it: back off smoothly, and at once past SAFE_HARD.
    let full = this.framingError(eyeX, eyeY, eyeZ, t.x, t.y, t.z);
    go(this.fit, Math.max(1, this.fit.x * (full / SAFE_SOFT)), W_FIT);
    for (let i = 0; i < 3 && full > SAFE_HARD; i++) {
      const k = (full / SAFE_HARD) * 1.02;
      eyeX = t.x + (eyeX - t.x) * k;
      eyeZ = t.z + (eyeZ - t.z) * k;
      full = this.framingError(eyeX, eyeY, eyeZ, t.x, t.y, t.z);
    }

    // Keep the whale in the safe area: ease the look toward it, and never let it pass SAFE_HARD.
    const aimGoal = this.aimFor(eyeX, eyeY, eyeZ, lookX, lookAtY, lookZ, 0, SAFE_SOFT);
    let aim = clamp(go(this.aim, aimGoal, W_AIM), 0, 1);
    const hard = this.aimFor(eyeX, eyeY, eyeZ, lookX, lookAtY, lookZ, aim, SAFE_HARD);
    if (hard > aim) {
      aim = this.aim.x = hard;
      this.aim.v = Math.max(0, this.aim.v);
    }
    this.lookAt.set(lookX + (t.x - lookX) * aim, lookAtY + (t.y - lookAtY) * aim, lookZ + (t.z - lookZ) * aim);
    this.camera.position.set(eyeX, eyeY, eyeZ);
    this.camera.lookAt(this.lookAt);
  }

  /** Keep a height out of the surface band, on the side the camera is following. */
  private bandClamp(y: number): number {
    return this.under ? Math.min(y, WATER_LEVEL - EYE_CLEARANCE) : Math.max(y, WATER_LEVEL + EYE_CLEARANCE);
  }

  /** Largest NDC coordinate of the whale points seen from the eye toward the look point. */
  framingError(ex: number, ey: number, ez: number, lx: number, ly: number, lz: number): number {
    let fx = lx - ex;
    let fy = ly - ey;
    let fz = lz - ez;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl;
    fy /= fl;
    fz /= fl;
    // right = forward × up, up' = right × forward (three's lookAt basis).
    let rx = -fz;
    let rz = fx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    const ux = -rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const tanH = tanV * this.camera.aspect;
    let worst = 0;
    for (let i = 0; i < 3; i++) {
      const dx = this.wx[i]! - ex;
      const dy = this.wy[i]! - ey;
      const dz = this.wz[i]! - ez;
      const depth = dx * fx + dy * fy + dz * fz;
      if (depth < 0.5) return Infinity;
      const nx = (dx * rx + dz * rz) / (depth * tanH);
      const ny = (dx * ux + dy * uy + dz * uz) / (depth * tanV);
      worst = Math.max(worst, Math.abs(nx), Math.abs(ny));
    }
    return worst;
  }

  /** Smallest aim ≥ `from` whose look point keeps the whale within `limit` (bisection). */
  private aimFor(ex: number, ey: number, ez: number, lx: number, ly: number, lz: number, from: number, limit: number): number {
    const t = this.target;
    if (this.framingError(ex, ey, ez, lx + (t.x - lx) * from, ly + (t.y - ly) * from, lz + (t.z - lz) * from) <= limit) return from;
    let lo = from;
    let hi = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (this.framingError(ex, ey, ez, lx + (t.x - lx) * mid, ly + (t.y - ly) * mid, lz + (t.z - lz) * mid) <= limit) hi = mid;
      else lo = mid;
    }
    return hi;
  }
}
