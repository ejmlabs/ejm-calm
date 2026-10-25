import * as THREE from 'three';
import { clamp } from './math.js';
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

export const DEFAULT_FRAMING: CameraFraming = { yaw: 0, pitch: 0.17, distance: 22 };
export const FRAMING_DISTANCE: readonly [number, number] = [14, 40];
const FRAMING_PITCH: readonly [number, number] = [0.1, 0.4];

/** The eye never rests closer than this to the waterline. */
export const EYE_CLEARANCE = SURFACE_BAND + 0.15;
/** Hysteresis on the whale's depth for following it under (and back up). */
export const DIVE_BELOW = -3;
export const RISE_ABOVE = -2;
const UNDER_EYE = 1.5;
const UNDER_DISTANCE = 0.7;
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

  update(dt: number, _time: number, reducedMotion = false): void {
    const t = this.target;
    const snap = (this.snapNow = this.snapping || reducedMotion);
    this.snapping = false;
    const step = (this.stepDt = dt > 0 ? dt : 0);
    const go = this.go;

    // Follow the whale under, with hysteresis so a shallow swim does not flip it.
    if (this.under ? t.y > RISE_ABOVE : t.y < DIVE_BELOW) {
      this.under = !this.under;
      this.crossing = true;
    }

    this.idle += step;
    const peekReturn = this.idle > PEEK_IDLE;
    if (peekReturn) {
      this.peekYawTarget = 0;
      this.peekPitchTarget = 0;
    }
    const peekOmega = peekReturn ? W_PEEK_RETURN : W_PEEK;

    const h = snap ? springSet(this.heading, nearestAngle(t.heading, this.heading.x)) : springStepAngle(this.heading, t.heading, W_HEADING, step);
    const sx = go(this.px, t.x, W_POSITION);
    const sz = go(this.pz, t.z, W_POSITION);
    const distGoal = this.framing.distance * (this.portrait ? 1.12 : 1) * (this.under ? UNDER_DISTANCE : 1);
    const dist = go(this.dist, distGoal, W_FRAMING);
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
    const ground = this.groundAt ? this.groundAt(eyeX, eyeZ) : -Infinity;
    if (Number.isFinite(ground)) goalY = Math.max(goalY, ground + (this.under ? FLOOR_CLEARANCE : LAND_CLEARANCE));
    goalY = this.under ? Math.min(goalY, WATER_LEVEL - EYE_CLEARANCE) : Math.max(goalY, WATER_LEVEL + EYE_CLEARANCE);

    let eyeY: number;
    if (snap) {
      this.crossing = false;
      eyeY = springSet(this.eyeY, goalY);
    } else {
      const nearBand = Math.abs(this.eyeY.x - WATER_LEVEL) < EYE_CLEARANCE + 1.5;
      eyeY = springStep(this.eyeY, goalY, this.crossing && nearBand ? W_EYE_Y_CROSS : W_EYE_Y, step);
      const side = eyeY - WATER_LEVEL;
      if (this.crossing && (this.under ? side < -EYE_CLEARANCE : side > EYE_CLEARANCE)) this.crossing = false;
      if (!this.crossing) {
        // Settled on one side: never drift back into the band.
        if (this.under && side > -EYE_CLEARANCE) {
          eyeY = this.eyeY.x = WATER_LEVEL - EYE_CLEARANCE;
          this.eyeY.v = Math.min(0, this.eyeY.v);
        } else if (!this.under && side < EYE_CLEARANCE) {
          eyeY = this.eyeY.x = WATER_LEVEL + EYE_CLEARANCE;
          this.eyeY.v = Math.max(0, this.eyeY.v);
        }
      }
    }

    const lookGoal = this.under ? t.y + 0.4 : clamp(t.y * 0.6 + 1.6, 0.6, 4.4);
    const lookY = go(this.lookY, lookGoal, W_LOOK_Y);
    let lookX = sx + fx * LOOK_AHEAD;
    let lookZ = sz + fz * LOOK_AHEAD;

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
      this.lookAt.y = lookY + (focusY - lookY) * s;
    } else {
      this.lookAt.y = lookY;
    }
    this.lookAt.x = lookX;
    this.lookAt.z = lookZ;
    this.camera.position.set(eyeX, eyeY, eyeZ);
    this.camera.lookAt(this.lookAt);
  }
}
