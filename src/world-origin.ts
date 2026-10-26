import type { FloatingOrigin, RecenterListener } from './seams.js';

/** Render distance from the origin at which the world is recentred on the whale. */
export const RECENTER_RADIUS = 3840;
/** The origin only moves in steps of this many metres, so recentres stay rare and tidy: at most one every two minutes at the top cruise speed (28 m/s). */
export const ORIGIN_SNAP = 512;

/**
 * Where the origin should move for a whale at world (wx, wz), as a world delta,
 * or null while the whale is still inside the radius.
 */
export function recenterDelta(
  ox: number,
  oz: number,
  wx: number,
  wz: number,
  radius = RECENTER_RADIUS,
  snap = ORIGIN_SNAP,
): { dx: number; dz: number } | null {
  if (!(Math.hypot(wx - ox, wz - oz) > radius)) return null;
  const dx = Math.round(wx / snap) * snap - ox;
  const dz = Math.round(wz / snap) * snap - oz;
  return dx === 0 && dz === 0 ? null : { dx, dz };
}

export type WorldOrigin = FloatingOrigin & {
  /** Moves the origin if the whale has strayed too far; returns true when it did. */
  maybeRecenter: (wx: number, wz: number) => boolean;
};

export function createWorldOrigin(radius = RECENTER_RADIUS, snap = ORIGIN_SNAP): WorldOrigin {
  const listeners = new Set<RecenterListener>();
  const origin: WorldOrigin = {
    x: 0,
    z: 0,
    onRecenter(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    maybeRecenter(wx, wz) {
      const delta = recenterDelta(origin.x, origin.z, wx, wz, radius, snap);
      if (!delta) return false;
      (origin as { x: number }).x += delta.dx;
      (origin as { z: number }).z += delta.dz;
      for (const listener of listeners) listener(delta.dx, delta.dz);
      return true;
    },
  };
  return origin;
}
