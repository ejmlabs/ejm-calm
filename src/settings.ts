import artDefault from './look.js';
import { chaseShipFraming } from './vantage.js';

export type ArtLook = typeof artDefault;

export function engineSettings(art: Partial<ArtLook> & Record<string, unknown> = {}, portrait = false) {
  const camera = (art.camera ?? {}) as Partial<ArtLook['camera']> & Record<string, unknown>;
  const flight = (art.flight ?? (art as { pacing?: unknown }).pacing ?? {}) as Partial<ArtLook['flight']> & Record<string, unknown>;
  const chase = chaseShipFraming({ portrait });
  const regions = art.REGIONS ?? artDefault.REGIONS;
  const grade = art.grade ?? artDefault.grade;
  return { ...artDefault, ...art,
    exposure: grade?.exposure ?? (art as { exposure?: number }).exposure ?? 1.1,
    background: regions?.tidepool?.sky.deep ?? (art as { background?: string }).background ?? '#080e19',
    mist: regions?.tidepool?.sky.band ?? (art as { mist?: string }).mist ?? '#142531',
    camera: { ...camera, drift: art.realism?.cameraDrift ?? artDefault.realism.cameraDrift, fov: (camera as { fovDeg?: { portrait: number; landscape: number }; fov?: number }).fovDeg?.[portrait ? 'portrait' : 'landscape'] ?? (camera as { fov?: number }).fov ?? 52,
      distance: chase.distance, pitch: chase.pitch,
      minDistance: (camera as { zoom?: { min?: number }; minDistance?: number }).zoom?.min ?? (camera as { minDistance?: number }).minDistance ?? 2.2,
      maxDistance: (camera as { zoom?: { max?: number }; maxDistance?: number }).zoom?.max ?? (camera as { maxDistance?: number }).maxDistance ?? 26,
      damping: (camera as { orbit?: { damping?: number } }).orbit?.damping ? 1 / (camera as { orbit: { damping: number } }).orbit.damping : 7,
      lookAhead: chase.lookAhead, height: chase.height },
    pacing: { ...flight, speed: (flight as { cruise?: number; speed?: number }).cruise ?? (flight as { speed?: number }).speed ?? 8,
      turnRate: (flight as { turnRateMaxDeg?: number; turnRate?: number }).turnRateMaxDeg ? (flight as { turnRateMaxDeg: number }).turnRateMaxDeg * Math.PI / 180 : (flight as { turnRate?: number }).turnRate ?? 0.045 },
  };
}

export type EngineLook = ReturnType<typeof engineSettings> & {
  debug?: {
    region?: string;
    event?: string;
    planet?: string;
    ring?: boolean;
    hideNebula?: boolean;
    hideSky?: boolean;
  };
  focusPlanetId?: string;
  pacing?: Record<string, unknown> & { speed?: number; turnRate?: number };
};
