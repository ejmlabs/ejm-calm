import * as THREE from 'three';
import { clamp, damp } from './math.js';

export type CameraFraming = { yaw: number; pitch: number; distance: number };

export type CalmCameraOptions = {
  /** Preferred initial yaw from subjects (radians). Sun is only a tiebreak upstream. */
  initialYaw?: number;
  sunAzimuthDeg?: number;
  portrait?: boolean;
  saved?: CameraFraming | null;
};

export class CalmCamera {
  camera: THREE.PerspectiveCamera;
  framing: CameraFraming;
  current: CameraFraming;
  lookAt = new THREE.Vector3();
  time = 0;
  lastInput = -Infinity;
  driftWeight = 1;
  baseYaw: number;
  portrait: boolean;
  private focus = new THREE.Vector3();
  private initialized = false;

  constructor(camera: THREE.PerspectiveCamera, options: CalmCameraOptions = {}) {
    this.camera = camera;
    this.portrait = Boolean(options.portrait);
    const fallbackYaw = options.initialYaw ?? (
      options.sunAzimuthDeg !== undefined
        ? THREE.MathUtils.degToRad(options.sunAzimuthDeg)
        : 0.85
    );
    const defaultDist = this.portrait ? 42 : 40;
    this.framing = options.saved
      ? { ...options.saved }
      : { yaw: fallbackYaw, pitch: this.portrait ? 0.08 : 0.12, distance: defaultDist };
    this.baseYaw = this.framing.yaw;
    this.framing.pitch = clamp(this.framing.pitch, 0.02, 0.55);
    this.framing.distance = clamp(this.framing.distance, 16, 80);
    this.current = { ...this.framing };
  }

  orbit(dx: number, dy: number): void {
    this.noteInput();
    this.framing.yaw -= dx * 0.004;
    this.baseYaw = this.framing.yaw;
    this.framing.pitch = clamp(this.framing.pitch + dy * 0.003, 0.02, 0.62);
  }

  noteInput(): void {
    this.lastInput = this.time;
  }

  setFocus(x: number, y: number, z: number): void {
    this.focus.set(x, y, z);
  }

  setPortrait(portrait: boolean): void {
    this.portrait = portrait;
  }

  update(dt: number, time: number, reducedMotion = false): void {
    this.time = time;
    if (reducedMotion) this.driftWeight = 0;
    else if (time - this.lastInput < 4) this.driftWeight = Math.max(0, this.driftWeight - dt / 1.2);
    else this.driftWeight = Math.min(1, this.driftWeight + dt / 5);

    // Swing ±40° around the sun-biased heading instead of a full 360° orbit.
    if (this.driftWeight > 0.01) {
      const swing = Math.sin(time * 0.02) * 0.7;
      const targetYaw = this.baseYaw + swing;
      const yawRate = this.portrait ? 0.018 : 0.028;
      const delta = Math.atan2(Math.sin(targetYaw - this.framing.yaw), Math.cos(targetYaw - this.framing.yaw));
      this.framing.yaw += delta * Math.min(1, yawRate * this.driftWeight * 8 * dt);
      const targetDist = this.portrait ? 42 + Math.sin(time * 0.05) * 2 : 40 + Math.sin(time * 0.05) * 3;
      this.framing.pitch = damp(this.framing.pitch, 0.08 + Math.sin(time * 0.07) * 0.02, 0.4, dt);
      this.framing.distance = damp(this.framing.distance, targetDist, 0.3, dt);
    }

    const factor = this.initialized ? dt : 8;
    for (const key of ['yaw', 'pitch', 'distance'] as const) {
      if (key === 'yaw') {
        const delta = Math.atan2(Math.sin(this.framing.yaw - this.current.yaw), Math.cos(this.framing.yaw - this.current.yaw));
        this.current.yaw = damp(this.current.yaw, this.current.yaw + delta, 3.2, factor);
      } else {
        this.current[key] = damp(this.current[key], this.framing[key], 3.2, factor);
      }
    }

    const yaw = this.current.yaw;
    const pitch = this.current.pitch;
    const dist = this.current.distance;
    // When focus.y is elevated (breach/spout event framing), orbit in 3D around the
    // focus point so the subject stays centred — do not pin eyeY to a waterline height.
    const eventOrbit = this.focus.y > 1.8;
    if (eventOrbit) {
      const eyeHeight = this.focus.y + Math.sin(pitch) * dist * 0.35 + 1.2;
      this.camera.position.set(
        this.focus.x + Math.sin(yaw) * Math.cos(pitch) * dist,
        eyeHeight,
        this.focus.z + Math.cos(yaw) * Math.cos(pitch) * dist,
      );
      this.lookAt.copy(this.focus);
    } else {
      const eyeY = this.portrait
        ? clamp(3.8 + pitch * 3.5, 3.4, 5.5)
        : clamp(3.2 + pitch * 5, 2.6, 7);
      this.camera.position.set(
        this.focus.x + Math.sin(yaw) * Math.cos(pitch) * dist,
        eyeY,
        this.focus.z + Math.cos(yaw) * Math.cos(pitch) * dist,
      );
      // Horizon ~55–60% down; keep look low enough that the whale back reads.
      this.lookAt.set(this.focus.x, clamp(this.focus.y + 2.2, 1.6, 4.5), this.focus.z);
    }
    this.camera.lookAt(this.lookAt);
    this.initialized = true;
  }
}
