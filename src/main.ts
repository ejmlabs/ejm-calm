import art from './look.js';
import { resolveSeed, seedURL } from './seed.js';
import { createFlight, stepFlight, steerFlight } from './flight.js';
import { Universe } from './universe.js';
import { loadMemory, saveMemory, VERSION } from './persistence.js';
import { createQuality, updateQuality } from './quality.js';
import { CameraRig } from './camera.js';
import { SpaceRenderer } from './renderer.js';
import { AmbientAudio } from './audio.js';
import { bindInput } from './input.js';
import { createUI } from './ui.js';
import { engineSettings, type EngineLook } from './settings.js';
import { reviewSettings } from './debug.js';
import { findSpawn } from './systems.js';

const look = engineSettings(art, window.innerHeight > window.innerWidth) as EngineLook;
look.debug = reviewSettings(location.search, location.hostname);
let storage: Storage | null;
try { storage = window.localStorage; } catch { storage = null; }
const memory = loadMemory(storage as never);
const resolved = resolveSeed(location.search, memory?.seed, () => {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return word[0]! / 0x100000000;
});
const seed = resolved.seed;
history.replaceState(null, '', seedURL(location.href, seed));
const flight = createFlight(!resolved.explicit && memory?.seed === seed ? memory.flight : null);
const spawn = findSpawn(seed, {
  preferType: look.debug?.planet,
  preferRings: Boolean(look.debug?.planet) || Boolean(look.debug?.ring),
  fill: look.debug?.ring ? 0.17 : look.debug?.planet ? 0.3 : 0.26,
  ringOpenDeg: look.debug?.ring ? 22 : 18,
});
if (look.debug?.planet) {
  spawn.planet.type = look.debug.planet;
  look.focusPlanetId = spawn.planet.id;
} else look.focusPlanetId = spawn.planet.id;
if (resolved.explicit || !memory || look.debug?.planet || look.debug?.event || look.debug?.region || look.debug?.ring) {
  flight.speed = look.pacing?.speed ?? look.flight.cruise;
  flight.position = [...spawn.position];
  flight.yaw = spawn.yaw;
  flight.pitch = spawn.pitch;
}
const audio = new AmbientAudio(memory?.sound ?? { enabled: true, volume: look.ui?.defaultVolume ?? 0.5 });
const mobile = matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
const quality = createQuality({
  mobile,
  dpr: window.devicePixelRatio || 1,
  maxDpr: look.quality?.tiers?.[mobile ? 'low' : 'high']?.dprCap,
});
const universe = new Universe(seed, { radius: 2, cellBudget: mobile ? 1 : 2, timeBudget: mobile ? 2 : 3 });
universe.systems.set(spawn.system.key, spawn.system);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let started = false, paused = motion.matches, disposed = false, frame: number | null = null, last = 0, renderedAt = 0, lastSave = 0;
let renderer: SpaceRenderer | undefined, camera: CameraRig | undefined, input: ReturnType<typeof bindInput> | undefined;
let starRevision = -1, steps = 0;

const ui = createUI({
  begin() {
    if (started || !renderer) return;
    started = true; ui.begin(); sync(); schedule();
  },
  pause: togglePause,
  sound() { audio.enabled = !audio.enabled; sync(); persist(); ui.announce(audio.enabled ? 'sound on' : 'sound off'); },
  volume(value) { audio.volume = Math.max(0, Math.min(1, value)); sync(); persist(); },
  share: () => `${location.origin}${location.pathname}?seed=${seed >>> 0}`,
}, look.ui);

function sync(): void {
  ui.sync({ paused, sound: audio.enabled, volume: audio.volume, seed });
  audio.sync(started && !paused && !document.hidden).catch(() => {});
}

function persist(): void {
  if (!camera) return;
  saveMemory(storage as never, { version: VERSION, seed, sound: audio.settings(), framing: camera.framing, flight });
}

function togglePause(): void {
  if (!started) return;
  paused = !paused; last = 0; sync(); persist(); ui.wake();
  ui.announce(paused ? 'paused' : 'resumed');
  if (paused && frame !== null) { cancelAnimationFrame(frame); frame = null; }
  else schedule();
}

function schedule(): void {
  if (!disposed && !document.hidden && frame === null) frame = requestAnimationFrame(tick);
}

function tick(now: number): void {
  frame = null;
  if (disposed || document.hidden || !renderer || !camera || !input) return;
  const interval = 1000 / (quality.tier === 'low' ? 30 : 60);
  if (started && !paused && now - renderedAt < interval - 1) { schedule(); return; }
  const elapsed = last ? now - last : interval;
  const dt = Math.min(0.05, elapsed / 1000); last = now; renderedAt = now;
  const flying = started && !paused;
  if (flying) {
    input.update(dt);
    stepFlight(flight, dt, universe.pointsOfInterest() as never, universe.obstacles(flight.position) as never, {
      ...(look.pacing ?? {}),
      lightDirection: renderer.lightWorld.toArray() as number[],
    });
    if (renderer.observeQuality(elapsed) || updateQuality(quality, elapsed)) renderer.applyQuality(quality);
  }
  stream();
  renderer.nearestSystem = universe.nearestSystem(flight.position) as never;
  if (starRevision !== universe.revision && (++steps % 5 === 0 || starRevision < 0 || !universe.pending.length)) {
    renderer.updateStars(universe as never, flight.position); starRevision = universe.revision;
  }
  camera.update(flight, dt, { active: flying, reducedMotion: motion.matches });
  renderer.render(flight);
  document.body.dataset.ready = 'true';
  if (renderer.ready) ui.ready();
  if (flying && now - lastSave > 5000) { persist(); lastSave = now; }
  if (flying || universe.pending.length || universe.coarseQueue.length || (!started && renderer.needsWork) || (started && !camera.settled())) schedule();
}

function stream(): number {
  if (!renderer) return 0;
  return universe.update(flight.position, {
    time: flight.time,
    onLoad: (cell) => renderer!.loadCell(cell as never),
    onUnload: (cell) => renderer!.unloadCell(cell as never),
    onLoadSystem: (system) => renderer!.loadSystem(system as never),
    onUnloadSystem: (system) => renderer!.unloadSystem(system as never),
    onLoadNebula: (nebula) => renderer!.loadNebula(nebula as never),
    onUnloadNebula: (nebula) => renderer!.unloadNebula(nebula as never),
  });
}

try {
  const canvas = ui.elements.canvas as HTMLCanvasElement;
  renderer = new SpaceRenderer(canvas, seed, look, quality);
  renderer.loadSystem(spawn.system as never);
  renderer.bakes.onReady = () => { if (!started || !paused) schedule(); };
  camera = new CameraRig(renderer.camera, look.camera, memory?.framing);
  if (look.debug && Object.keys(look.debug).length) {
    (window as unknown as { __flightReview?: unknown }).__flightReview = {
      get time() { return flight.time; },
      stats() { return renderer!.report(); },
      advance(seconds: number) {
        const target = flight.time + Math.max(0, Math.min(3600, seconds));
        while (flight.time < target - 1e-6) {
          stream();
          stepFlight(flight, Math.min(1 / 30, target - flight.time), universe.pointsOfInterest() as never, universe.obstacles(flight.position) as never, {
            ...(look.pacing ?? {}),
            lightDirection: renderer!.lightWorld.toArray() as number[],
          });
        }
        renderer!.updateStars(universe as never, flight.position);
        camera!.update(flight, 1);
        persist(); last = 0; schedule();
      },
      place(position: number[], yaw = flight.yaw, pitch = flight.pitch) {
        flight.position = position.map(Number);
        flight.yaw = yaw; flight.pitch = pitch; flight.target = null; flight.targetTime = 0;
        for (let i = 0; i < 24; i++) stream();
        renderer!.nearestSystem = universe.nearestSystem(flight.position) as never;
        renderer!.updateStars(universe as never, flight.position);
        camera!.update(flight, 1); last = 0; schedule();
      },
      nebulae() {
        return [...universe.nebulae.values()].map((nebula) => ({ key: nebula.key, position: [...nebula.position], radius: nebula.radius }));
      },
      rings() {
        const out: unknown[] = [];
        for (const group of renderer!.planetGroups) {
          const record = group.userData.planet;
          if (!record?.ring) continue;
          out.push({
            id: record.data.id,
            visible: record.ring.visible,
            radius: record.data.radius,
            inner: record.appearance.ring?.inner,
            outer: record.appearance.ring?.outer,
            pos: group.position.toArray(),
          });
        }
        return out;
      },
      systems() {
        return [...universe.systems.values()].map((system) => ({
          key: system.key,
          position: [...system.position],
          planets: system.planets.map((planet) => ({
            id: planet.id, type: planet.type, rings: Boolean(planet.rings),
            position: [...planet.position], radius: planet.radius,
            tilt: planet.tilt, ringTilt: planet.ring?.tilt ?? 0,
          })),
          stars: system.stars.map((star) => ({ position: [...star.position], radius: star.radius })),
        }));
      },
      frameRing(openDeg = 20) {
        // Simplified framing helper for shots.
        let best: { planet: { position: number[]; radius: number; rings?: boolean }; yaw: number; pitch: number } | null = null;
        let bestScore = Infinity;
        for (const system of universe.systems.values()) {
          for (const planet of system.planets) {
            if (!planet.rings) continue;
            const dist = Math.hypot(
              planet.position[0]! - flight.position[0]!,
              planet.position[1]! - flight.position[1]!,
              planet.position[2]! - flight.position[2]!,
            );
            if (dist < bestScore) {
              bestScore = dist;
              const dir = planet.position.map((n, i) => n - flight.position[i]!);
              const len = Math.hypot(...dir) || 1;
              best = {
                planet,
                yaw: Math.atan2(dir[0]! / len, -dir[2]! / len),
                pitch: Math.asin(Math.max(-1, Math.min(1, dir[1]! / len))),
              };
            }
          }
        }
        if (!best) return false;
        const range = best.planet.radius / Math.tan((0.17 * 52 * Math.PI / 180) / 2);
        const position = best.planet.position.map((n, i) => n - (best!.planet.position[i]! - flight.position[i]!) / bestScore * range);
        (window as unknown as { __flightReview: { place: (p: number[], y: number, pitch: number) => void } }).__flightReview.place(position, best.yaw, best.pitch + openDeg * 0.01);
        return true;
      },
    };
  }
  input = bindInput(canvas, {
    orbit: (x, y) => camera!.orbit(x, y),
    steer: (yaw, pitch) => { camera!.noteInput(); steerFlight(flight, yaw, pitch); },
    zoom: (amount) => camera!.zoom(amount),
    pause: togglePause, wake: ui.wake, active: () => started,
    change: () => { if (paused) schedule(); },
  });
  canvas.tabIndex = 0;
  canvas.style.borderRadius = '0';
  canvas.setAttribute('aria-label', 'A spacecraft gliding through a generated universe. Drag to orbit; arrow keys steer.');
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    paused = true; sync();
    ui.announce('The view was interrupted. Reload to resume your journey.');
    persist();
  });
  window.addEventListener('resize', () => { renderer?.resize(quality.ratio); schedule(); });
  document.addEventListener('visibilitychange', () => {
    last = 0;
    if (document.hidden) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; persist();
    } else if (started && !paused) schedule();
    sync();
  });
  motion.addEventListener('change', (event) => { if (event.matches && started && !paused) togglePause(); });
  window.addEventListener('pagehide', (event) => {
    persist();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null; audio.sync(false).catch(() => {});
    if (!event.persisted) { disposed = true; input?.dispose(); ui.dispose(); renderer?.dispose(); audio.dispose(); }
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) { last = 0; sync(); schedule(); } });
  sync(); schedule();
} catch (error) {
  console.error(error);
  renderer?.dispose();
  ui.error('This view needs WebGL 2. Try another browser.');
}
