import * as art from './look.js';
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
import { engineSettings } from './settings.js';
import { reviewSettings } from './debug.js';
import { findSpawn } from './systems.js';

const look = engineSettings(art.default ?? art.LOOK ?? art.look ?? art, window.innerHeight > window.innerWidth);
look.debug = reviewSettings(location.search, location.hostname);
let storage;
try { storage = window.localStorage; } catch { storage = null; }
const memory = loadMemory(storage);
const resolved = resolveSeed(location.search, memory?.seed, () => {
  const word = new Uint32Array(1); crypto.getRandomValues(word); return word[0] / 0x100000000;
});
const seed = resolved.seed;
history.replaceState(null, '', seedURL(location.href, seed));
const flight = createFlight(!resolved.explicit && memory?.seed === seed ? memory.flight : null);
const spawn = findSpawn(seed); look.focusPlanetId = spawn.planet.id;
if (resolved.explicit || !memory) { flight.speed = look.pacing.speed; flight.position = [...spawn.position]; flight.yaw = spawn.yaw; flight.pitch = spawn.pitch; }
const audio = new AmbientAudio(memory?.sound ?? { enabled: true, volume: look.ui?.defaultVolume ?? 0.5 });
const mobile = matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
const quality = createQuality({ mobile, dpr: window.devicePixelRatio || 1,
  maxDpr: look.quality?.tiers?.[mobile ? 'low' : 'high']?.dprCap });
const universe = new Universe(seed, { radius: 2, cellBudget: mobile ? 1 : 2, timeBudget: mobile ? 2 : 3 });
universe.systems.set(spawn.system.key, spawn.system);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let started = false, paused = motion.matches, disposed = false, frame = null, last = 0, renderedAt = 0, lastSave = 0;
let renderer, camera, input, starRevision = -1, steps = 0;

const ui = createUI({
  begin() {
    if (started || !renderer) return;
    started = true; ui.begin(); sync(); schedule();
  },
  pause: togglePause,
  sound() { audio.enabled = !audio.enabled; sync(); persist(); ui.announce(audio.enabled ? 'sound on' : 'sound off'); },
  volume(value) { audio.volume = Math.max(0, Math.min(1, value)); sync(); persist(); },
  share: () => seedURL(location.href, seed).href,
}, look.ui);

function sync() {
  ui.sync({ paused, sound: audio.enabled, volume: audio.volume, seed });
  audio.sync(started && !paused && !document.hidden).catch(() => {});
}

function persist() {
  if (!camera) return;
  saveMemory(storage, { version: VERSION, seed, sound: audio.settings(), framing: camera.framing, flight });
}

function togglePause() {
  if (!started) return;
  paused = !paused; last = 0; sync(); persist(); ui.wake();
  ui.announce(paused ? 'paused' : 'resumed');
  if (paused && frame !== null) { cancelAnimationFrame(frame); frame = null; }
  else schedule();
}

function schedule() {
  if (!disposed && !document.hidden && frame === null) frame = requestAnimationFrame(tick);
}

function tick(now) {
  frame = null;
  if (disposed || document.hidden || !renderer) return;
  const interval = 1000 / (quality.tier === 'low' ? 30 : 60);
  if (started && !paused && now - renderedAt < interval - 1) { schedule(); return; }
  const elapsed = last ? now - last : interval;
  const dt = Math.min(0.05, elapsed / 1000); last = now; renderedAt = now;
  const flying = started && !paused;
  if (flying) {
    input.update(dt);
    stepFlight(flight, dt, universe.pointsOfInterest(), universe.obstacles(flight.position), { ...(look.pacing ?? {}), lightDirection: renderer.lightWorld.toArray() });
    if (renderer.observeQuality(elapsed) || updateQuality(quality, elapsed)) renderer.applyQuality(quality);
  }
  stream();
  renderer.nearestSystem = universe.nearestSystem(flight.position);
  if (starRevision !== universe.revision && (++steps % 5 === 0 || starRevision < 0 || !universe.pending.length)) {
    renderer.updateStars(universe, flight.position); starRevision = universe.revision;
  }
  camera.update(flight, dt, { active: flying, reducedMotion: motion.matches }); renderer.render(flight);
  document.body.dataset.ready = 'true';
  if (renderer.ready) ui.ready();
  if (flying && now - lastSave > 5000) { persist(); lastSave = now; }
  if (flying || universe.pending.length || universe.coarseQueue.length || (!started && renderer.needsWork) || (started && !camera.settled())) schedule();
}

function stream() {
  return universe.update(flight.position, { time: flight.time, onLoad: (cell) => renderer.loadCell(cell), onUnload: (cell) => renderer.unloadCell(cell),
    onLoadSystem: (system) => renderer.loadSystem(system), onUnloadSystem: (system) => renderer.unloadSystem(system),
    onLoadNebula: (nebula) => renderer.loadNebula(nebula), onUnloadNebula: (nebula) => renderer.unloadNebula(nebula) });
}

try {
  renderer = new SpaceRenderer(ui.elements.canvas, seed, look, quality);
  renderer.loadSystem(spawn.system);
  renderer.bakes.onReady = () => { if (!started || !paused) schedule(); };
  camera = new CameraRig(renderer.camera, look.camera, memory?.framing);
  if (Object.keys(look.debug).length) window.__flightReview = {
    get time() { return flight.time; },
    stats() { return renderer.report(); },
    advance(seconds) {
      const target = flight.time + Math.max(0, Math.min(3600, seconds));
      while (flight.time < target - 1e-6) {
        stream();
        stepFlight(flight, Math.min(1 / 30, target - flight.time), universe.pointsOfInterest(), universe.obstacles(flight.position), { ...(look.pacing ?? {}), lightDirection: renderer.lightWorld.toArray() });
      }
      renderer.updateStars(universe, flight.position); camera.update(flight, 1); persist(); last = 0; schedule();
    },
    place(position, yaw = flight.yaw, pitch = flight.pitch) {
      flight.position = position.map(Number); flight.yaw = yaw; flight.pitch = pitch; flight.target = null; flight.targetTime = 0;
      for (let i = 0; i < 24; i++) stream();
      renderer.nearestSystem = universe.nearestSystem(flight.position);
      renderer.updateStars(universe, flight.position); camera.update(flight, 1); last = 0; schedule();
    },
    nebulae() { return [...universe.nebulae.values()].map((nebula) => ({ key: nebula.key, position: [...nebula.position], radius: nebula.radius })); },
  };
  input = bindInput(ui.elements.canvas, {
    orbit: (x, y) => camera.orbit(x, y), steer: (yaw, pitch) => { camera.noteInput(); steerFlight(flight, yaw, pitch); }, zoom: (amount) => camera.zoom(amount),
    pause: togglePause, wake: ui.wake, active: () => started,
    change: () => { if (paused) schedule(); },
  });
  ui.elements.canvas.tabIndex = 0;
  // Keyboard focus must keep the full viewport rectangular.
  ui.elements.canvas.style.borderRadius = '0';
  ui.elements.canvas.setAttribute('aria-label', 'A spacecraft gliding through a generated universe. Drag to orbit; arrow keys steer.');
  ui.elements.canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); paused = true; sync(); ui.announce('The view was interrupted. Reload to resume your journey.'); persist();
  });
  window.addEventListener('resize', () => { renderer.resize(quality.ratio); schedule(); });
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
    if (!event.persisted) { disposed = true; input.dispose(); ui.dispose(); renderer.dispose(); audio.dispose(); }
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) { last = 0; sync(); schedule(); } });
  sync(); schedule();
} catch (error) {
  console.error(error);
  renderer?.dispose();
  ui.error('This view needs WebGL 2. Try another browser.');
}
