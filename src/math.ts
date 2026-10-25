export type Vec3 = [number, number, number];

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const damp = (value: number, target: number, rate: number, dt: number): number => value + (target - value) * (1 - Math.exp(-rate * dt));
export const angleDelta = (from: number, to: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const distance = (a: readonly [number, number, number], b: readonly [number, number, number]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const forward = (yaw: number, pitch: number): Vec3 => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
export function normalize(vector: readonly [number, number, number]): Vec3 {
  const length = Math.hypot(...vector);
  return length > 1e-9 ? vector.map((n) => n / length) as Vec3 : [0, 0, -1];
}
