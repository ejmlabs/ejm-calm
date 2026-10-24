export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
export const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const forward = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
export function normalize(vector) {
  const length = Math.hypot(...vector);
  return length > 1e-9 ? vector.map((n) => n / length) : [0, 0, -1];
}
