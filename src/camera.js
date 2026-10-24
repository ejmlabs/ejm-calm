import * as THREE from '../vendor/three/three.module.js';
import { clamp, damp } from './math.js';

export class CameraRig {
  constructor(camera, settings = {}, saved) {
    this.camera = camera;
    this.settings = { distance: 21, pitch: 0.22, minDistance: 9, maxDistance: 55, damping: 7, lookAhead: 9, height: 1.2, ...settings };
    this.framing = saved ? { ...saved } : { yaw: 0, pitch: this.settings.pitch, distance: this.settings.distance };
    this.framing.distance = clamp(this.framing.distance, this.settings.minDistance, this.settings.maxDistance);
    this.current = { ...this.framing }; this.initialized = false;
    this.target = new THREE.Vector3();
    this.time = 0; this.lastInput = -Infinity; this.driftWeight = this.settings.drift ? 1 : 0; this.driftSettling = false;
  }

  orbit(x, y) {
    this.noteInput();
    this.framing.yaw = Math.atan2(Math.sin(this.framing.yaw - x * 0.004), Math.cos(this.framing.yaw - x * 0.004));
    this.framing.pitch = clamp(this.framing.pitch + y * 0.003, -0.65, 1.15);
  }

  zoom(amount) {
    this.noteInput();
    this.framing.distance = clamp(this.framing.distance * Math.exp(amount), this.settings.minDistance, this.settings.maxDistance);
  }

  settled() {
    const yaw = Math.atan2(Math.sin(this.current.yaw - this.framing.yaw), Math.cos(this.current.yaw - this.framing.yaw));
    return !this.driftSettling && Math.abs(yaw) < 0.0005 && ['pitch', 'distance'].every((key) => Math.abs(this.current[key] - this.framing[key]) < 0.0005);
  }
  noteInput() { this.lastInput = this.time; }

  update(flight, dt, { active = false, reducedMotion = false } = {}) {
    this.time = flight.time; const drift = this.settings.drift;
    if (reducedMotion) this.driftWeight = 0;
    else if (drift && this.time - this.lastInput < drift.resumeAfterSeconds) this.driftWeight = Math.max(0, this.driftWeight - dt / drift.fadeOutOnInputSeconds);
    else if (drift && active) this.driftWeight = Math.min(1, this.driftWeight + dt / drift.fadeInSeconds);
    this.driftSettling = Boolean(drift && this.time - this.lastInput < drift.resumeAfterSeconds && this.driftWeight > 0);
    const factor = this.initialized ? dt : 10;
    for (const key of ['yaw', 'pitch', 'distance']) {
      const target = key === 'yaw' ? this.current.yaw + Math.atan2(Math.sin(this.framing.yaw - this.current.yaw), Math.cos(this.framing.yaw - this.current.yaw)) : this.framing[key];
      this.current[key] = damp(this.current[key], target, this.settings.damping, factor);
    }
    const offset = (key) => !drift ? 0 : Math.sin(this.time * Math.PI * 2 / drift[key].periodSeconds) * this.driftWeight * (drift[key].amplitude ?? drift[key].amplitudeDeg * Math.PI / 180);
    const bearing = flight.yaw + this.current.yaw + offset('yaw'), elevation = this.current.pitch + offset('pitch');
    const range = this.current.distance * (1 + offset('dolly'));
    const fov = (this.camera.userData.baseFov ?? this.settings.fov ?? 52) + offset('fovBreath') * 180 / Math.PI;
    if (Math.abs(this.camera.fov - fov) > 0.001) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.position.set(-Math.sin(bearing) * Math.cos(elevation) * range,
      Math.sin(elevation) * range + this.settings.height, Math.cos(bearing) * Math.cos(elevation) * range);
    const ahead = this.settings.lookAhead;
    this.target.set(Math.sin(flight.yaw) * ahead, 1.4 + Math.sin(flight.pitch) * ahead, -Math.cos(flight.yaw) * ahead);
    this.camera.lookAt(this.target); this.initialized = true;
  }
}
