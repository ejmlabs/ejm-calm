import * as THREE from 'three';
import { resolveSeed, seedURL, nextSeed } from './seed.js';
import { createQuality, updateQuality } from './quality.js';
import { layoutWorld } from './terrain.js';
import { createSky, HAZE_ANGLES } from './sky.js';
import { createWhale } from './whale.js';
import { createWorld } from './world.js';
import { createBirds } from './birds.js';
import { FOV, FollowCamera } from './camera.js';
import { clamp, smoothstep } from './math.js';
import { createUI } from './ui.js';
import { OceanAudio } from './audio.js';
import { loadMemory, saveMemory, VERSION } from './persistence.js';
import { createUnderwater, UNDERWATER_LAYER } from './underwater.js';
import { createFishShowcase } from './fish-mesh.js';
import { feedSitesNear } from './feed-sites.js';
import { createSeafloor } from './seafloor.js';
import { createRegionLook } from './region-look.js';
import { REGION_LOOKS } from './regions.js';
import { setSea, swellAt, swellRate } from './swell.js';
import { TRAVEL_MAX } from './whale-behavior.js';
import { createWeather, type WeatherState } from './weather.js';
import { createRoute } from './route.js';
import { createWake } from './wake.js';
import { createShipFx } from './ship-fx.js';
import { createWeatherFx } from './weather-fx.js';
import { PACES, type Pace } from './pace.js';
import { createViewControls } from './view-controls.js';

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
  /** Where in the day (0 is the preset the seed began in, 1 a full day on), and the weather to hold. */
  setDay: (day: number) => void;
  setWeather: (state: WeatherState) => void;
  /** Hold the sea at a level, 0 glassy to 1 rough, or null to let the weather drive it. */
  setSea: (level: number | null) => void;
  setRoute: (on: boolean) => void;
  /** Puts the whale in open water near world (x, z) and loads the sea around it. */
  jumpTo: (x: number, z: number) => void;
  stats: () => Record<string, number | string | boolean | number[]>;
};

const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';

/** Metres swum since the page opened (the route indicator's distance); in debug also the straight line from the start and how often the whale is back near an earlier spot (`path`, `net`, `revisit`). */
const journey = { path: 0, x: NaN, z: NaN, fromX: NaN, fromZ: NaN, fixes: [] as number[], fixAt: -Infinity, back: 0 };
/** A fix within this distance of one at least this many fixes (seconds) earlier counts as a revisit. */
const REVISIT_RADIUS = 500;
const REVISIT_AFTER = 120;
function markJourney(): void {
  const { x, z } = whale.state;
  if (Number.isNaN(journey.x)) Object.assign(journey, { x, z, fromX: x, fromZ: z });
  journey.path += Math.hypot(x - journey.x, z - journey.z);
  journey.x = x;
  journey.z = z;
  if (!debug || time - journey.fixAt < 1) return;
  journey.fixAt = time;
  const fixes = journey.fixes;
  for (let i = 0; i + 2 * REVISIT_AFTER < fixes.length; i += 2) {
    if (Math.hypot(x - fixes[i]!, z - fixes[i + 1]!) < REVISIT_RADIUS) {
      journey.back++;
      break;
    }
  }
  fixes.push(x, z);
}

/** Metres to the nearest land sampled on rings around (x, z) out to `reach`, or `reach` when there is none. */
function landWithin(x: number, z: number, reach: number): number {
  for (let d = 250; d <= reach; d += 250) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if (world.land.maskAt(x + Math.cos(a) * d, z + Math.sin(a) * d) > 0) return d;
    }
  }
  return reach;
}

let storage: Storage | null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}

const memory = loadMemory(storage);
let routeOn = memory?.route ?? false;
let pace: Pace = memory?.pace ?? 'normal';
const indicator = createRoute(REGION_LOOKS.map((look) => look.name));
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
  route(on) {
    routeOn = on;
    indicator.setEnabled(on, world.land.regions.dominantAt(whale.state.x, whale.state.z), journey.path);
    ui.showRoute(indicator.visible, indicator.text);
    persist();
  },
  pace(choice) {
    pace = choice;
    whale.setPace(PACES[pace]);
    persist();
    ui.announce(`${pace} speed`);
  },
  resetView() {
    view.reset();
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
const camera = new THREE.PerspectiveCamera(portrait ? FOV[1] : FOV[0], 1, 0.5, 12000);
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
/** Seafloor height (world): pure per seed, so it matches the underwater view's own copy exactly. */
let seafloor: ReturnType<typeof createSeafloor>;
let regionLook: ReturnType<typeof createRegionLook>;
let wake: ReturnType<typeof createWake>;
let weather: ReturnType<typeof createWeather>;
let shipFx: ReturnType<typeof createShipFx>;
let weatherFx: ReturnType<typeof createWeatherFx>;
/** The swell's own clock: it runs faster as the whale swims faster. */
let swellClock = 0;
const swellSample = { height: 0, slopeX: 0, slopeZ: 0 };
/** Height of the sea at world (x, z) now: what the wakes lie on. */
const surface = (x: number, z: number) => swellAt(x, z, swellClock, swellSample).height;
const fishTime = { value: 0 };
let fishShowcase: ReturnType<typeof createFishShowcase> | null = null;

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
    groundAt: (x, z) => seafloor.heightAt(x + world.origin.x, z + world.origin.z),
  });
  world = createWorld(seed, layout, scene, {
    sunDirection: sky.sunDirection,
    hazeColor: sky.hazeColor,
    hazeDensity: sky.hazeDensity,
    hazeGradient: { angles: HAZE_ANGLES, colors: sky.hazeGradient },
    // The sky sets how much light the shallows get as the day goes (a low sun lights them less).
    shallowLight: 1,
    // Slightly under 1 / exposure: reflections sit a touch darker than the land itself.
    reflectionGain: 0.8 / renderer.toneMappingExposure,
    waterSize: quality.waterSize,
    landSegments: quality.landSegments,
    mobile,
    worker: true,
  });
  seafloor = createSeafloor(seed, world.land);
  regionLook = createRegionLook(world.land.regions);
  // Head along the composed opening view (forward = look direction), so the chase opens on the coast.
  whale = createWhale(seed, layout.whaleHome, {
    tier: quality.tier,
    heading: layout.viewYaw - Math.PI / 2,
    journey: layout.journey,
    floorAt: seafloor.heightAt,
  });
  whale.setPace(PACES[pace]);
  world.root.add(whale.group);
  weather = createWeather(seed, sky.clearCover);
  // A visitor who asked for the indicator sees it on the first change of region, not at once.
  indicator.setEnabled(routeOn, world.land.regions.dominantAt(layout.whaleHome.x, layout.whaleHome.z), 0, false);
  sky.setEnvironmentRefresh(quality.tier !== 'low');
  wake = createWake({ surface });
  world.root.add(wake.group);
  shipFx = createShipFx(surface);
  world.root.add(shipFx.group);
  weatherFx = createWeatherFx(seed, quality.tier, world.ocean.waves);
  scene.add(weatherFx.group);
  birds = createBirds(seed, quality.tier);
  world.root.add(birds.group);
  // The floating origin moved: shift the camera with the world so the chase does not jump.
  world.origin.onRecenter((dx, dz) => rig.shift(dx, dz));
  underwater = createUnderwater(scene, renderer, { sky, heightAt: world.land.heightAt, origin: world.origin, tier: quality.tier, seed });
  // Review only (`?debug=1&fish=1`): every fish species in a small school ahead of the camera.
  if (debug && params.get('fish') === '1') fishShowcase = createFishShowcase(fishTime, UNDERWATER_LAYER);
  if (fishShowcase) scene.add(fishShowcase.group);
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
  camera.fov = isPortrait ? FOV[1] : FOV[0];
  camera.far = 12000;
  camera.updateProjectionMatrix();
  rig.setPortrait(isPortrait);
}

resize();
window.addEventListener('resize', resize);

const view = createViewControls(canvas, rig, (orbiting) => ui.showReset(orbiting));

const motion = matchMedia('(prefers-reduced-motion: reduce)');
let routeClock = performance.now();
let time = 0;
let last = performance.now();
let frame: number | null = null;
let disposed = false;
let lastSave = 0;

function sync(): void {
  ui.sync({ seed, sound: audio.enabled, route: routeOn, pace });
  audio.sync(!document.hidden).catch(() => {});
}

function persist(): void {
  saveMemory(storage, {
    version: VERSION,
    seed,
    sound: audio.settings(),
    framing: { ...rig.framing },
    route: routeOn,
    pace,
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
    birds.setTier(quality.tier);
    weatherFx.setTier(quality.tier);
    sky.setEnvironmentRefresh(quality.tier !== 'low');
    renderer.setPixelRatio(quality.ratio);
    resize();
  }

  regionLook.update(whale.state.x, whale.state.z);
  // No lightning under reduced motion.
  const weatherLook = weather.update(dt, time, regionLook.weights, !motion.matches);
  setSea(weatherLook.sea, sky.windAngle);
  sky.setWeather(weatherLook);
  sky.setFog(regionLook.fogTint, regionLook.fogMix, regionLook.fogDensity);
  sky.update(dt, motion.matches ? 0.5 : 1);
  world.ocean.setSky(sky.hazeColor, sky.level, sky.shallowLight);
  world.ocean.setWaterColor(regionLook.water);
  world.landStream.setSky(sky.sunDirection, sky.hazeGradient, sky.hazeDensity, sky.level);
  world.landStream.setLook(regionLook.hazeDensity * weatherLook.haze, regionLook.land);
  wake.setLight(sky.daylight);
  birds.setMix(regionLook.birds);
  const swell = swellRate(whale.state.speed / TRAVEL_MAX);
  swellClock += dt * swell;
  world.update(whale.state.x, whale.state.z, camera, dt, swellClock);
  world.ocean.update(dt * swell, sky.sunDirection, camera);
  whale.update(dt, time, world.shore);
  // The whale rides the swell while near the surface; deeper down it is free of it.
  whale.group.position.y = surface(whale.state.x, whale.state.z) * smoothstep(-7, -1.5, whale.state.y);
  wake.update(whale.state, dt);
  shipFx.update(world.ships.active(), sky.level);
  markJourney();
  if (routeOn) {
    // Six seconds of the clock on the wall, not of the simulation: slow frames and reduced motion do not stretch it.
    indicator.update(Math.min(1, (now - routeClock) / 1000), world.land.regions.dominantAt(whale.state.x, whale.state.z), journey.path);
    ui.showRoute(indicator.visible, indicator.text);
  }
  routeClock = now;
  world.ocean.setWhale(whale.state.x - world.origin.x, whale.state.y, whale.state.z - world.origin.z, whale.state.heading);
  birds.update(time, whale.state.x, whale.state.z, dt, { x: camera.position.x + world.origin.x, y: camera.position.y, z: camera.position.z + world.origin.z }, motion.matches);

  followWhale();
  view.update(motion.matches);
  rig.update(dt, time, motion.matches);
  if (peekDepth !== null) peekCamera(peekDepth);

  world.ocean.setSea(swellClock, weatherLook.wind, camera.position.y);
  weatherFx.update({
    camera,
    time,
    rain: weatherLook.rain,
    wind: weatherLook.wind,
    sea: weatherLook.sea,
    windAngle: sky.windAngle,
    light: sky.level,
    height: renderer.domElement.height,
  });
  const signal = underwater.update(dt, time, camera, whale.state);
  fishTime.value = time;
  fishShowcase?.follow(camera);
  audio.update(dt, { camera, signal, whale: whale.state, ships: world.ships.active(), shore: world.shore, origin: world.origin, weather: weatherLook });
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
        swellClock += swellRate(whale.state.speed / TRAVEL_MAX) / 30;
        world.update(whale.state.x, whale.state.z, camera, 1 / 30, swellClock);
        whale.update(1 / 30, time, world.shore);
        markJourney();
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
    setDay(day: number) {
      if (Number.isFinite(day)) sky.setDay(day);
    },
    setWeather(state: WeatherState) {
      weather.set(state);
    },
    setSea(level: number | null) {
      weather.setSea(typeof level === 'number' && Number.isFinite(level) ? level : null);
    },
    jumpTo(x: number, z: number) {
      if (![x, z].every(Number.isFinite)) return;
      // The nearest spot with room round it: a spiral out from the asked-for one.
      let best = { x, z };
      search: for (let ring = 0; ring < 40; ring++) {
        for (let k = 0; k < Math.max(1, ring * 8); k++) {
          const a = (k / Math.max(1, ring * 8)) * Math.PI * 2;
          const px = x + Math.cos(a) * ring * 200;
          const pz = z + Math.sin(a) * ring * 200;
          if (world.land.clearance(px, pz) > 400) {
            best = { x: px, z: pz };
            break search;
          }
        }
      }
      whale.place(best.x, best.z);
      world.landStream.prime(best.x, best.z);
      world.land.nav.prefetch(best.x, best.z, 1100, Infinity);
      // The jump is not swimming: the distance travelled starts again from here.
      journey.x = journey.z = NaN;
      markJourney();
      rig.snap();
    },
    setRoute(on: boolean) {
      routeOn = Boolean(on);
      indicator.setEnabled(routeOn, world.land.regions.dominantAt(whale.state.x, whale.state.z), journey.path);
      ui.showRoute(indicator.visible, indicator.text);
      sync();
    },
    stats() {
      const size = whale.measure();
      const flock = birds.stats();
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
        birds: flock.birds,
        birdDraws: flock.draws,
        birdTriangles: flock.triangles,
        ...world.stats(),
        path: journey.path,
        revisit: journey.fixes.length ? journey.back / (journey.fixes.length / 2) : 0,
        region: world.land.regions.dominantAt(whale.state.x, whale.state.z),
        regionName: REGION_LOOKS[world.land.regions.dominantAt(whale.state.x, whale.state.z)]!.name,
        landNear: landWithin(whale.state.x, whale.state.z, 4500),
        net: Math.hypot(journey.x - journey.fromX, journey.z - journey.fromZ) || 0,
        speed: whale.state.speed,
        behavior: whale.state.behavior,
        exposure: renderer.toneMappingExposure,
        dayPhase: sky.phase().name,
        stars: sky.stars,
        day: sky.phase().day,
        sunElevation: (Math.asin(sky.sunDirection.y) * 180) / Math.PI,
        sun: [sky.sunDirection.x, sky.sunDirection.y, sky.sunDirection.z],
        weather: weather.target(),
        cloudCover: weather.look.coverage,
        sea: weather.look.sea,
        rain: weather.look.rain,
        wind: weather.look.wind,
        flash: weather.look.flash,
        glow: sky.glow,
        weatherDraws: weatherFx.draws(),
        fogDensity: (scene.fog as THREE.FogExp2).density,
        fov: camera.fov,
        wakeDraws: wake.draws(),
        addedDraws: wake.draws() + (sky.stars > 0.01 ? 1 : 0) + shipFx.draws() + weatherFx.draws(),
        wakeLength: wake.length(),
        envMs: sky.environment().ms,
        envRefreshes: sky.environment().count,
        route: indicator.visible ? indicator.text : '',
        swellClock,
        // Last rendered frame (three resets these per render).
        draws: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
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
  view.dispose();
  sky.dispose();
  whale.dispose();
  wake.dispose();
  shipFx.dispose();
  weatherFx.dispose();
  world.dispose();
  birds.dispose();
  underwater.dispose();
  fishShowcase?.dispose();
  renderer.dispose();
});
