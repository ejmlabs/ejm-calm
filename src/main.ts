import * as THREE from 'three';
import { resolveSeed, seedURL, nextSeed } from './seed.js';
import { createQuality, updateQuality } from './quality.js';
import { layoutWorld } from './terrain.js';
import { createSky, HAZE_ANGLES } from './sky.js';
import { createWhale } from './whale.js';
import { createWorld } from './world.js';
import { createBirds } from './birds.js';
import { FollowCamera } from './camera.js';
import { clamp } from './math.js';
import { createUI } from './ui.js';
import { OceanAudio } from './audio.js';
import { loadMemory, saveMemory, VERSION } from './persistence.js';
import { cycleDuration } from './whale.js';
import { createUnderwater } from './underwater.js';
import { feedSitesNear } from './feed-sites.js';

type CalmReview = {
  time: number;
  advance: (seconds: number) => void;
  /** Swims the whale on for this many seconds of simulation (30 Hz steps), streaming the world as it goes. */
  travel: (seconds: number) => void;
  /** Optional normalised start time; 0 starts below the surface so the exit splash is visible. */
  forceBreach: (at?: number) => void;
  forceSpout: () => void;
  /** Optional yaw offset from broadside, pitch and distance for close-up review. */
  frameWhale: (kind?: 'breach' | 'spout', yawOffset?: number, pitch?: number, distance?: number) => void;
  /** Review view relative to the whale's heading (yaw 0 = behind); `follow()` returns to the chase. */
  frame: (yaw: number, pitch: number, distance: number) => void;
  follow: () => void;
  setWaterVisible: (visible: boolean) => void;
  setWhaleVisible: (visible: boolean) => void;
  setLandVisible: (visible: boolean) => void;
  setShipsVisible: (visible: boolean) => void;
  /** Start the long deep dive now (whale holds position while forced). */
  forceDeepDive: (at?: number) => void;
  /** Debug camera `depth` metres under the surface (negative is above), looking at the whale; null releases it. */
  peekUnderwater: (depth: number | null, site?: boolean) => void;
  stats: () => Record<string, number | string | boolean | number[]>;
};

const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';

let storage: Storage | null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}

const memory = loadMemory(storage);
const resolved = resolveSeed(location.search, memory?.seed, () => {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return word[0]! / 0x100000000;
});
let seed = resolved.seed;
history.replaceState(null, '', seedURL(location.href, seed));

const mobile = matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
const quality = createQuality({
  mobile,
  dpr: window.devicePixelRatio || 1,
  maxDpr: mobile ? 2 : 2,
  cores: navigator.hardwareConcurrency || 8,
  memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8,
});

const audio = new OceanAudio(memory?.sound ?? { enabled: false, volume: 0.35 }, seed);
const ui = createUI({
  share: () => `${location.origin}${location.pathname}?seed=${seed >>> 0}`,
  newSeed() {
    const next = nextSeed(seed);
    location.href = seedURL(location.href, next).href;
  },
  sound() {
    audio.enabled = !audio.enabled;
    sync();
    persist();
    ui.announce(audio.enabled ? 'sound on' : 'sound off');
  },
});

const canvasEl = document.getElementById('space') as HTMLCanvasElement | null;
if (!canvasEl) {
  ui.error('canvas missing');
  throw new Error('canvas missing');
}
const canvas = canvasEl;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: 'low-power',
});
renderer.setClearColor(0x7a9bb0, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(quality.ratio);
renderer.autoClear = true;

const scene = new THREE.Scene();
const portrait = window.innerHeight > window.innerWidth;
const camera = new THREE.PerspectiveCamera(portrait ? 62 : 48, 1, 0.5, 12000);
// Layer 1 is the spout mist. Water's mirror camera stays on layer 0, so the plume is not reflected.
camera.layers.enable(1);

let sky: ReturnType<typeof createSky>;
let world: ReturnType<typeof createWorld>;
let whale: ReturnType<typeof createWhale>;
let buildMs = 0;
let birds: ReturnType<typeof createBirds>;
let layout: ReturnType<typeof layoutWorld>;
let rig: FollowCamera;
let underwater: ReturnType<typeof createUnderwater>;

try {
  const buildStart = performance.now();
  sky = createSky(seed, renderer, scene);
  layout = layoutWorld(seed, sky.sunAzimuthDeg);
  // yaw 0 marks a follow-camera framing; older orbit framings (yaw = view yaw) are ignored.
  const savedFraming = memory?.framing?.yaw === 0 ? memory.framing : null;
  rig = new FollowCamera(camera, {
    portrait,
    saved: savedFraming,
    // Render coordinates in, world coordinates for the land field.
    groundAt: (x, z) => world.land.heightAt(x + world.origin.x, z + world.origin.z),
  });
  world = createWorld(seed, layout, scene, {
    sunDirection: sky.sunDirection,
    hazeColor: sky.hazeColor,
    hazeDensity: sky.hazeDensity,
    hazeGradient: { angles: HAZE_ANGLES, colors: sky.hazeGradient },
    // Low sun lights the shallows less.
    shallowLight: sky.timeOfDay === 'golden' || sky.timeOfDay === 'dusk' ? 0.55 : 1,
    // Slightly under 1 / exposure: reflections sit a touch darker than the land itself.
    reflectionGain: 0.8 / renderer.toneMappingExposure,
    waterSize: quality.waterSize,
    landSegments: quality.landSegments,
    mobile,
    worker: true,
  });
  // Head along the composed opening view (forward = look direction), so the chase opens on the coast.
  whale = createWhale(seed, layout.whaleHome, { tier: quality.tier, heading: layout.viewYaw - Math.PI / 2 });
  world.root.add(whale.group);
  birds = createBirds(seed, mobile ? 3 : 6);
  world.root.add(birds.group);
  // The floating origin moved: shift the camera with the world so the chase does not jump.
  world.origin.onRecenter((dx, dz) => rig.shift(dx, dz));
  underwater = createUnderwater(scene, renderer, { sky, heightAt: world.land.heightAt, origin: world.origin, tier: quality.tier, seed });
  buildMs = performance.now() - buildStart;
} catch (error) {
  const message = error instanceof Error ? error.message : 'failed to build the scene';
  ui.error(message);
  throw error;
}

function resize(): void {
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  const isPortrait = height > width;
  renderer.setPixelRatio(quality.ratio);
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.fov = isPortrait ? 62 : 48;
  camera.far = 12000;
  camera.updateProjectionMatrix();
  rig.setPortrait(isPortrait);
}

resize();
window.addEventListener('resize', resize);

// Pointer look-around.
let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;
  rig.look(dx, dy);
});
canvas.addEventListener('wheel', (event) => rig.zoom(event.deltaY), { passive: true });
const endDrag = (event: PointerEvent) => {
  dragging = false;
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    /* already released */
  }
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

const motion = matchMedia('(prefers-reduced-motion: reduce)');
let time = 0;
let last = performance.now();
let frame: number | null = null;
let disposed = false;
let lastSave = 0;

function sync(): void {
  ui.sync({ seed, sound: audio.enabled });
  audio.sync(!document.hidden).catch(() => {});
}

function persist(): void {
  saveMemory(storage, {
    version: VERSION,
    seed,
    sound: audio.settings(),
    framing: { ...rig.framing },
  });
}

/** Chase target from the whale, in render coordinates. */
function followWhale(): void {
  const w = whale.state;
  rig.setTarget({ x: w.x - world.origin.x, y: w.y, z: w.z - world.origin.z, heading: w.heading });
}

/** Side-on, close framing so the whale fills ~35–50% of screen width. */
function frameWhaleEvent(kind: 'breach' | 'spout', view: { yawOffset?: number; pitch?: number; distance?: number } = {}): void {
  // Review yaw is relative to the heading (0 = behind); −π/2 is a broadside on the whale's
  // left, and the small negative offset swings toward the head for a three-quarter view.
  // Debug overrides are clamped to the ranges the camera rig itself allows.
  const yaw = -Math.PI / 2 - 0.22 + clamp(view.yawOffset ?? 0, -Math.PI, Math.PI);
  // Close enough that a ~12 m whale fills ~35–50% of portrait width.
  const distance = clamp(view.distance ?? (kind === 'breach' ? (portrait ? 27 : 17) : portrait ? 24 : 14), 6, 80);
  const pitch = clamp(view.pitch ?? (kind === 'breach' ? 0.12 : 0.02), 0.02, 0.62);
  rig.setReview({ yaw, pitch, distance, minLookY: kind === 'breach' ? 2.5 : 2.4 });
  followWhale();
  // Snap so the first screenshot is already framed.
  rig.snap();
  rig.update(0, time);
}

/** Debug-only camera override for reviewing the underwater view without the follow camera. */
let peekDepth: number | null = null;
let peekSite: { x: number; y: number; z: number; radius: number } | null = null;

function peekCamera(depth: number): void {
  const w = peekSite ? { ...peekSite, heading: 0.6 } : whale.state;
  const x = w.x - world.origin.x;
  const z = w.z - world.origin.z;
  const side = w.heading + Math.PI / 2;
  const y = -depth;
  const back = peekSite ? 12 + peekSite.radius * 2 : 16;
  camera.position.set(x + Math.cos(side) * back, y, z - Math.sin(side) * back);
  // From below the whale, look straight at it so the surface and Snell's window fill the top of the frame.
  camera.lookAt(x, y + (w.y - y) * (y < w.y ? 1 : 0.45), z);
}

function tick(now: number): void {
  if (disposed) return;
  frame = requestAnimationFrame(tick);
  if (document.hidden) {
    last = now;
    return;
  }
  // The first rAF timestamp can predate `last` (set after the synchronous build); never step backwards.
  const raw = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  const dt = motion.matches ? 0 : raw;
  if (!motion.matches) time += dt;

  if (updateQuality(quality, raw * 1000)) {
    renderer.setPixelRatio(quality.ratio);
    resize();
  }

  sky.update(dt);
  world.update(whale.state.x, whale.state.z, camera, dt, time);
  world.ocean.update(dt, sky.sunDirection, camera);
  whale.update(dt, time, world.shore, world.land.heightAt(whale.state.x, whale.state.z));
  birds.update(time, whale.state.x, whale.state.z, dt);

  followWhale();
  rig.update(dt, time, motion.matches);
  if (peekDepth !== null) peekCamera(peekDepth);

  const signal = underwater.update(dt, time, camera, whale.state);
  audio.update(dt, { camera, signal, whale: whale.state, ships: world.ships.active(), shore: world.shore, origin: world.origin });
  renderer.render(scene, camera);

  if (now - lastSave > 4000) {
    lastSave = now;
    persist();
  }
}

function start(): void {
  ui.ready();
  sync();
  persist();
  last = performance.now();
  frame = requestAnimationFrame(tick);
}

document.addEventListener('visibilitychange', () => {
  sync();
  if (!document.hidden) last = performance.now();
});

if (debug) {
  const review: CalmReview = {
    get time() {
      return time;
    },
    advance(seconds: number) {
      if (Number.isFinite(seconds)) time += Math.min(3600, Math.max(0, seconds));
    },
    travel(seconds: number) {
      for (let t = 0; t < Math.min(3600, Math.max(0, seconds || 0)); t += 1 / 30) {
        time += 1 / 30;
        world.update(whale.state.x, whale.state.z, camera, 1 / 30, time);
        whale.update(1 / 30, time, world.shore, world.land.heightAt(whale.state.x, whale.state.z));
      }
      rig.snap();
    },
    forceBreach(at?: number) {
      whale.forcePhase('breach', typeof at === 'number' && Number.isFinite(at) ? at : undefined);
      frameWhaleEvent('breach');
    },
    forceSpout() {
      whale.forcePhase('spout');
      frameWhaleEvent('spout');
    },
    frameWhale(kind: 'breach' | 'spout' = 'breach', yawOffset?: number, pitch?: number, distance?: number) {
      const finite = (v?: number) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      frameWhaleEvent(kind, { yawOffset: finite(yawOffset), pitch: finite(pitch), distance: finite(distance) });
    },
    setWaterVisible(visible: boolean) {
      world.ocean.mesh.visible = visible;
    },
    setWhaleVisible(visible: boolean) {
      whale.group.visible = visible;
    },
    setLandVisible(visible: boolean) {
      world.landStream.group.visible = visible;
    },
    setShipsVisible(visible: boolean) {
      world.ships.setVisible(visible);
    },
    forceDeepDive(at?: number) {
      whale.forcePhase('deep', typeof at === 'number' && Number.isFinite(at) ? at : undefined);
    },
    peekUnderwater(depth: number | null, site?: boolean) {
      peekDepth = typeof depth === 'number' && Number.isFinite(depth) ? clamp(depth, -20, 40) : null;
      // Review a swarm: the nearest feed site, viewed from its side at the given depth.
      peekSite = site ? (feedSitesNear(seed, whale.state.x, whale.state.z, 2400, underwater.seafloor.heightAt)[0] ?? null) : null;
    },
    frame(yaw: number, pitch: number, distance: number) {
      if (![yaw, pitch, distance].every(Number.isFinite)) return;
      yaw = clamp(yaw, -4 * Math.PI, 4 * Math.PI);
      pitch = clamp(pitch, 0.02, 0.62);
      distance = clamp(distance, 6, 80);
      rig.setReview({ yaw, pitch, distance });
      rig.snap();
    },
    follow() {
      rig.setReview(null);
    },
    stats() {
      const size = whale.measure();
      return {
        seed,
        time,
        tier: quality.tier,
        dpr: quality.ratio,
        phase: whale.state.phase,
        phaseT: whale.state.phaseT,
        whale: [whale.state.x, whale.state.y, whale.state.z],
        whaleHeading: whale.state.heading,
        whaleSize: [size.x, size.y, size.z],
        whaleDetail: whale.detail(),
        cam: [camera.position.x, camera.position.y, camera.position.z],
        focus: [rig.lookAt.x, rig.lookAt.y, rig.lookAt.z],
        dist: rig.distance,
        camMode: rig.mode,
        buildMs: Math.round(buildMs),
        ships: world.ships.active().length,
        ...world.stats(),
        cycle: cycleDuration(),
        exposure: renderer.toneMappingExposure,
        submersion: underwater.signal.submersion,
        depth: underwater.signal.depth,
        underwaterLife: Object.values(underwater.stats()),
        feedSites: underwater.sites.map((site) => site.id),
        audio: audio.stats(),
      };
    },
  };
  (window as unknown as { __calmReview: CalmReview }).__calmReview = review;
  const at = params.get('at');
  if (at === 'breach') {
    time = 0;
    whale.forcePhase('breach');
    frameWhaleEvent('breach');
  } else if (at === 'breach-start') {
    // Review only: rise from depth so the exit splash and the full arc can be watched.
    time = 0;
    whale.forcePhase('breach', 0);
    frameWhaleEvent('breach');
  } else if (at === 'spout') {
    time = 0;
    whale.forcePhase('spout');
    frameWhaleEvent('spout');
  }
}

start();

window.addEventListener('pagehide', () => {
  disposed = true;
  if (frame !== null) cancelAnimationFrame(frame);
  persist();
  audio.dispose();
  ui.dispose();
  sky.dispose();
  whale.dispose();
  world.dispose();
  birds.dispose();
  underwater.dispose();
  renderer.dispose();
});
