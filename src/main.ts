import * as THREE from 'three';
import { resolveSeed, seedURL, nextSeed } from './seed.js';
import { createQuality, updateQuality } from './quality.js';
import { layoutWorld } from './terrain.js';
import { createOcean } from './ocean.js';
import { createSky, HAZE_ANGLES } from './sky.js';
import { createWhale } from './whale.js';
import { createShips } from './ships.js';
import { createLandMesh } from './landmesh.js';
import { nearShelf, farShelf } from './land.js';
import { createBirds } from './birds.js';
import { CalmCamera } from './camera.js';
import { createUI } from './ui.js';
import { OceanAudio } from './audio.js';
import { loadMemory, saveMemory, VERSION } from './persistence.js';
import { cycleDuration } from './whale.js';

type CalmReview = {
  time: number;
  advance: (seconds: number) => void;
  /** Optional normalised start time; 0 starts below the surface so the exit splash is visible. */
  forceBreach: (at?: number) => void;
  forceSpout: () => void;
  /** Optional yaw offset from broadside, pitch and distance for close-up review. */
  frameWhale: (kind?: 'breach' | 'spout', yawOffset?: number, pitch?: number, distance?: number) => void;
  frame: (yaw: number, pitch: number, distance: number) => void;
  setWaterVisible: (visible: boolean) => void;
  setWhaleVisible: (visible: boolean) => void;
  setLandVisible: (visible: boolean) => void;
  setShipsVisible: (visible: boolean) => void;
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

const audio = new OceanAudio(memory?.sound ?? { enabled: false, volume: 0.35 });
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
let ocean: ReturnType<typeof createOcean>;
let whale: ReturnType<typeof createWhale>;
let ships: ReturnType<typeof createShips>;
let landMesh: ReturnType<typeof createLandMesh>;
let buildMs = 0;
let birds: ReturnType<typeof createBirds>;
let layout: ReturnType<typeof layoutWorld>;
let rig: CalmCamera;

try {
  const buildStart = performance.now();
  sky = createSky(seed, renderer, scene);
  layout = layoutWorld(seed, sky.sunAzimuthDeg);
  const savedFraming = memory?.framing;
  // Subject-derived yaw always; keep saved pitch/distance when present.
  const framing = {
    yaw: layout.viewYaw,
    pitch: savedFraming?.pitch ?? (portrait ? 0.08 : 0.12),
    distance: savedFraming?.distance ?? (portrait ? 42 : 40),
  };
  rig = new CalmCamera(camera, {
    initialYaw: layout.viewYaw,
    sunAzimuthDeg: sky.sunAzimuthDeg,
    portrait,
    saved: framing,
  });
  ocean = createOcean(seed, sky.sunDirection, {
    textureSize: quality.waterSize,
    waterColor: 0x1c5470,
    shelves: {
      near: nearShelf(layout.land),
      far: farShelf(layout.land),
      // Low sun lights the shallows less.
      light: sky.timeOfDay === 'golden' || sky.timeOfDay === 'dusk' ? 0.55 : 1,
    },
  });
  scene.add(ocean.mesh);
  landMesh = createLandMesh(layout.land, {
    segments: quality.landSegments,
    sunDirection: sky.sunDirection,
    hazeColor: sky.hazeColor,
    hazeDensity: sky.hazeDensity,
    hazeGradient: { angles: HAZE_ANGLES, colors: sky.hazeGradient },
  });
  scene.add(landMesh.group);
  ships = createShips(layout.ships);
  for (const ship of ships) scene.add(ship.group);
  whale = createWhale(seed, layout.whaleHome, { tier: quality.tier });
  scene.add(whale.group);
  birds = createBirds(seed, mobile ? 3 : 6);
  scene.add(birds.group);
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
  rig.orbit(dx, dy);
});
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

/** When set, camera locks onto the whale for spout/breach review framing. */
let eventFrame: 'breach' | 'spout' | null = null;

function focusPoint(): THREE.Vector3 {
  const w = whale.state;
  if (eventFrame) {
    // Whale-only focus at the body centre (triggers camera event-orbit when y > 1.8).
    const lift =
      eventFrame === 'breach'
        ? Math.max(2.5, w.y * 0.7 + 1.4)
        : Math.max(1.9, Math.max(0.8, w.y) + 1.6);
    return new THREE.Vector3(w.x, lift, w.z);
  }
  // Keep the whale centred (≥0.75 weight); glance toward the hero ship.
  const focus = new THREE.Vector3(w.x, Math.max(0.4, Math.min(2.2, w.y * 0.2 + 0.5)), w.z);
  const hero = ships[0];
  if (hero) {
    const pull = 0.22;
    focus.x = focus.x * (1 - pull) + hero.group.position.x * pull;
    focus.z = focus.z * (1 - pull) + hero.group.position.z * pull;
  }
  return focus;
}

/** Side-on, close framing so the whale fills ~35–50% of screen width. */
function frameWhaleEvent(kind: 'breach' | 'spout', view: { yawOffset?: number; pitch?: number; distance?: number } = {}): void {
  eventFrame = kind;
  const w = whale.state;
  // Camera sits at focus + (sin yaw, cos yaw), so yaw = heading is a broadside on the
  // whale's left; a small negative offset swings toward the head for a three-quarter view.
  const yaw = (Number.isFinite(w.heading) ? w.heading - 0.22 : layout.viewYaw) + (view.yawOffset ?? 0);
  // Close enough that a ~12 m whale fills ~35–50% of portrait width.
  const dist = view.distance ?? (kind === 'breach' ? (portrait ? 27 : 17) : portrait ? 24 : 14);
  const pitch = view.pitch ?? (kind === 'breach' ? 0.12 : 0.02);
  rig.framing.yaw = yaw;
  rig.framing.pitch = pitch;
  rig.framing.distance = dist;
  rig.current.yaw = yaw;
  rig.current.pitch = pitch;
  rig.current.distance = dist;
  rig.baseYaw = yaw;
  rig.driftWeight = 0;
  rig.lastInput = Infinity; // keep drift off for the whole review shot
  const focus = focusPoint();
  rig.setFocus(focus.x, focus.y, focus.z);
  // Snap camera (large dt) so the first screenshot is already framed.
  rig.update(8, time, true);
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
  ocean.update(dt, sky.sunDirection);
  whale.update(dt, time, layout.land);
  for (const ship of ships) ship.update(dt, time, layout.land);
  birds.update(time);

  const focus = focusPoint();
  rig.setFocus(focus.x, focus.y, focus.z);
  rig.update(dt || 1 / 60, time, motion.matches);

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
      if (Number.isFinite(seconds)) time += Math.max(0, seconds);
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
      ocean.mesh.visible = visible;
    },
    setWhaleVisible(visible: boolean) {
      whale.group.visible = visible;
    },
    setLandVisible(visible: boolean) {
      landMesh.group.visible = visible;
    },
    setShipsVisible(visible: boolean) {
      for (const ship of ships) ship.group.visible = visible;
    },
    frame(yaw: number, pitch: number, distance: number) {
      eventFrame = null;
      rig.framing.yaw = yaw;
      rig.framing.pitch = pitch;
      rig.framing.distance = distance;
      rig.current.yaw = yaw;
      rig.current.pitch = pitch;
      rig.current.distance = distance;
      rig.baseYaw = yaw;
      rig.driftWeight = 0;
      rig.noteInput();
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
        dist: rig.current.distance,
        landTriangles: landMesh.triangles,
        buildMs: Math.round(buildMs),
        ships: layout.ships.length,
        cycle: cycleDuration(),
        exposure: renderer.toneMappingExposure,
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
  ui.dispose();
  ocean.dispose();
  sky.dispose();
  whale.dispose();
  for (const ship of ships) ship.dispose();
  landMesh.dispose();
  birds.dispose();
  renderer.dispose();
});
