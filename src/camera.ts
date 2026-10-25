import * as THREE from 'three';
import { clamp, damp } from './math.js';
import type { FlightState } from './flight.js';

export type CameraFraming = { yaw: number; pitch: number; distance: number };

export type CameraDriftChannel = {
  periodSeconds: number;
  amplitude?: number;
  amplitudeDeg?: number;
};

export type CameraDrift = {
  yaw: CameraDriftChannel;
  pitch: CameraDriftChannel;
  dolly: CameraDriftChannel;
  fovBreath: CameraDriftChannel;
  fadeOutOnInputSeconds: number;
  resumeAfterSeconds: number;
  fadeInSeconds: number;
};

export type CameraSettings = {
  distance: number;
  pitch: number;
  minDistance: number;
  maxDistance: number;
  damping: number;
  lookAhead: number;
  height: number;
  fov?: number;
  drift?: CameraDrift | false | null;
};

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  settings: CameraSettings;
  framing: CameraFraming;
  current: CameraFraming;
  initialized: boolean;
  target: THREE.Vector3;
  time: number;
  lastInput: number;
  driftWeight: number;
  driftSettling: boolean;

  constructor(camera: THREE.PerspectiveCamera, settings: Partial<CameraSettings> = {}, saved?: CameraFraming | null) {
    this.camera = camera;
    this.settings = { distance: 21, pitch: 0.22, minDistance: 9, maxDistance: 55, damping: 7, lookAhead: 9, height: 1.2, ...settings };
    this.framing = saved ? { ...saved } : { yaw: 0, pitch: this.settings.pitch, distance: this.settings.distance };
    this.framing.distance = clamp(this.framing.distance, this.settings.minDistance, this.settings.maxDistance);
    this.current = { ...this.framing }; this.initialized = false;
    this.target = new THREE.Vector3();
    this.time = 0; this.lastInput = -Infinity; this.driftWeight = this.settings.drift ? 1 : 0; this.driftSettling = false;
  }

  orbit(x: number, y: number): void {
    this.noteInput();
    this.framing.yaw = Math.atan2(Math.sin(this.framing.yaw - x * 0.004), Math.cos(this.framing.yaw - x * 0.004));
    this.framing.pitch = clamp(this.framing.pitch + y * 0.003, -0.65, 1.15);
  }

  zoom(amount: number): void {
    this.noteInput();
    this.framing.distance = clamp(this.framing.distance * Math.exp(amount), this.settings.minDistance, this.settings.maxDistance);
  }

  settled(): boolean {
    const yaw = Math.atan2(Math.sin(this.current.yaw - this.framing.yaw), Math.cos(this.current.yaw - this.framing.yaw));
    return !this.driftSettling && Math.abs(yaw) < 0.0005 && (['pitch', 'distance'] as const).every((key) => Math.abs(this.current[key] - this.framing[key]) < 0.0005);
  }
  noteInput(): void { this.lastInput = this.time; }

  update(flight: FlightState, dt: number, { active = false, reducedMotion = false }: { active?: boolean; reducedMotion?: boolean } = {}): void {
    this.time = flight.time; const drift = this.settings.drift;
    if (reducedMotion) this.driftWeight = 0;
    else if (drift && this.time - this.lastInput < drift.resumeAfterSeconds) this.driftWeight = Math.max(0, this.driftWeight - dt / drift.fadeOutOnInputSeconds);
    else if (drift && active) this.driftWeight = Math.min(1, this.driftWeight + dt / drift.fadeInSeconds);
    this.driftSettling = Boolean(drift && this.time - this.lastInput < drift.resumeAfterSeconds && this.driftWeight > 0);
    const factor = this.initialized ? dt : 10;
    for (const key of ['yaw', 'pitch', 'distance'] as const) {
      const target = key === 'yaw' ? this.current.yaw + Math.atan2(Math.sin(this.framing.yaw - this.current.yaw), Math.cos(this.framing.yaw - this.current.yaw)) : this.framing[key];
      this.current[key] = damp(this.current[key], target, this.settings.damping, factor);
    }
    const offset = (key: keyof CameraDrift) => {
      if (!drift || key === 'fadeOutOnInputSeconds' || key === 'resumeAfterSeconds' || key === 'fadeInSeconds') return 0;
      const channel = drift[key];
      return Math.sin(this.time * Math.PI * 2 / channel.periodSeconds) * this.driftWeight * (channel.amplitude ?? channel.amplitudeDeg! * Math.PI / 180);
    };
    const bearing = flight.yaw + this.current.yaw + offset('yaw'), elevation = this.current.pitch + offset('pitch');
    const range = this.current.distance * (1 + offset('dolly'));
    const fov = ((this.camera.userData as { baseFov?: number }).baseFov ?? this.settings.fov ?? 52) + offset('fovBreath') * 180 / Math.PI;
    if (Math.abs(this.camera.fov - fov) > 0.001) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.position.set(-Math.sin(bearing) * Math.cos(elevation) * range,
      Math.sin(elevation) * range + this.settings.height, Math.cos(bearing) * Math.cos(elevation) * range);
    const ahead = this.settings.lookAhead;
    this.target.set(Math.sin(flight.yaw) * ahead, 1.4 + Math.sin(flight.pitch) * ahead, -Math.cos(flight.yaw) * ahead);
    this.camera.lookAt(this.target); this.initialized = true;
  }
}
