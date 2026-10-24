export function engineSettings(art = {}, portrait = false) {
  const camera = art.camera ?? {};
  const flight = art.flight ?? art.pacing ?? {};
  return { ...art,
    exposure: art.grade?.exposure ?? art.exposure ?? 1.1,
    background: art.REGIONS?.tidepool?.sky.deep ?? art.background ?? '#080e19',
    mist: art.REGIONS?.tidepool?.sky.band ?? art.mist ?? '#142531',
    camera: { ...camera, drift: art.realism?.cameraDrift, fov: camera.fovDeg?.[portrait ? 'portrait' : 'landscape'] ?? camera.fov ?? 52,
      distance: camera.distance ?? 5.5, pitch: camera.pitch ?? 0.12,
      minDistance: camera.zoom?.min ?? camera.minDistance ?? 2.2, maxDistance: camera.zoom?.max ?? camera.maxDistance ?? 26,
      damping: camera.orbit?.damping ? 1 / camera.orbit.damping : 7, lookAhead: camera.lookAhead ?? 1.8, height: camera.height ?? 1.3 },
    pacing: { ...flight, speed: flight.cruise ?? flight.speed ?? 8, turnRate: flight.turnRateMaxDeg ? flight.turnRateMaxDeg * Math.PI / 180 : flight.turnRate ?? 0.045 },
  };
}
