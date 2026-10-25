import { normalize } from './math.js';
import type { Vec3 } from './math.js';

/** View-light angle in degrees between observer→subject and light direction (from subject toward star). */
export function viewLightAngleDeg(observer: readonly number[], subject: readonly number[], lightFromSubject: readonly number[]): number {
  const view = normalize(subject.map((n, i) => n - observer[i]!) as Vec3);
  const light = normalize(lightFromSubject as Vec3);
  const cosine = Math.max(-1, Math.min(1, view.reduce((sum, n, i) => sum + n * light[i]!, 0)));
  return Math.acos(cosine) * 180 / Math.PI;
}

export type FrameBodyOptions = {
  subject: readonly number[];
  radius: number;
  lightFromSubject: readonly number[];
  fill?: number;
  fovDeg?: number;
  lightingDeg?: number;
  ringOpenDeg?: number;
  ringNormal?: readonly number[];
};

export type FrameBodyResult = {
  position: number[];
  yaw: number;
  pitch: number;
  range: number;
  angle: number;
};

/**
 * Observer pose that frames a body at ~fill of vertical FOV with a preferred lighting angle
 * and optional ring opening (degrees from edge-on).
 */
export function frameBody({
  subject,
  radius,
  lightFromSubject,
  fill = 0.35,
  fovDeg = 52,
  lightingDeg = 90,
  ringOpenDeg = 0,
  ringNormal = [0, 1, 0],
}: FrameBodyOptions): FrameBodyResult {
  const light = normalize(lightFromSubject as Vec3);
  const up: Vec3 = Math.abs(light[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let tangent = normalize([
    light[1] * up[2] - light[2] * up[1],
    light[2] * up[0] - light[0] * up[2],
    light[0] * up[1] - light[1] * up[0],
  ]);
  let binormal = normalize([
    light[1] * tangent[2] - light[2] * tangent[1],
    light[2] * tangent[0] - light[0] * tangent[2],
    light[0] * tangent[1] - light[1] * tangent[0],
  ]);
  const lighting = lightingDeg * Math.PI / 180;
  const open = Math.max(0.12, ringOpenDeg) * Math.PI / 180;
  // Start from a lighting-aware equatorial direction, then lift by `open` above the ring plane.
  let observation = normalize(tangent.map((n, i) => n * Math.sin(lighting) - light[i]! * Math.cos(lighting) + binormal[i]! * 0.08) as Vec3);
  if (ringOpenDeg > 0) {
    const rn = normalize(ringNormal as Vec3);
    // Remove normal component, then re-add so |dot(observation, rn)| = sin(open).
    const along = observation.reduce((sum, n, i) => sum + n * rn[i]!, 0);
    const planar = normalize(observation.map((n, i) => n - rn[i]! * along) as Vec3);
    const sign = along >= 0 ? 1 : -1;
    observation = normalize(planar.map((n, i) => n * Math.cos(open) + rn[i]! * Math.sin(open) * sign) as Vec3);
  }
  // Keep the full disc in frame with ~4% margin when fill is large.
  const safeFill = Math.min(fill, 0.42);
  const angular = Math.max(0.05, safeFill * fovDeg * Math.PI / 180);
  const range = radius / Math.tan(angular / 2);
  const position = subject.map((n, i) => n + observation[i]! * range);
  // Bias aim slightly downward so the body sits in the middle 60% vertically (above the HUD).
  const aim = subject.map((n, i) => n + tangent[i]! * radius * 0.05 - (i === 1 ? radius * 0.12 : 0));
  const direction = normalize(aim.map((n, i) => n - position[i]!) as Vec3);
  return {
    position,
    yaw: Math.atan2(direction[0], -direction[2]),
    pitch: Math.asin(Math.max(-1, Math.min(1, direction[1]))),
    range,
    angle: viewLightAngleDeg(position as Vec3, subject, lightFromSubject),
  };
}

/** Keep a chase-cam height/lookAhead so the ship sits above the HUD band. */
export function chaseShipFraming({ portrait = false }: { portrait?: boolean } = {}) {
  // Lowest ship point ≥10% of frame height above the bottom (desktop); ≥4% above HUD pill (mobile).
  return {
    distance: portrait ? 6.4 : 6.0,
    height: portrait ? 1.85 : 1.7,
    lookAhead: portrait ? 1.2 : 1.35,
    pitch: portrait ? 0.12 : 0.1,
  };
}

/** Vertical margin so a disc of angular radius alpha fits with marginFraction of frame height. */
export function discFitsFrame(angularRadius: number, fovDeg: number, marginFraction = 0.04): boolean {
  const half = (fovDeg * Math.PI / 180) / 2;
  return angularRadius + marginFraction * (fovDeg * Math.PI / 180) < half;
}
