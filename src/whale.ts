import * as THREE from 'three';
import { fork, hash } from './rng.js';
import { clamp, lerp, smoothstep } from './math.js';
import { makeNoise2D } from './noise.js';
import type { Shore } from './shore.js';
import type { QualityTier } from './quality.js';
import { createWhaleMover, type WhaleBehavior } from './whale-behavior.js';
import {
  FLIPPER_DROOP,
  FLIPPER_L,
  FLIPPER_R,
  FLIPPER_SWEEP,
  FLUKE_BONE,
  ROOT_BONE,
  WHALE_LOD,
  buildWhaleGeometry,
  createWhaleBones,
  flipperQuaternion,
  sampleProfile,
  type WhaleDetail,
} from './whale-model.js';
import {
  BREACH_EXIT,
  BREACH_SPLASH,
  SURFACE_Y,
  floorLimit,
  spineAngles,
  whaleOrientation,
  type WhalePhase,
  type WhalePose,
} from './whale-motion.js';
import { BLOWHOLE_U, BLOWHOLE_X, createWhaleSkin } from './whale-skin.js';

export type { WhalePhase } from './whale-motion.js';
export type { WhaleBehavior } from './whale-behavior.js';

export type WhaleState = {
  phase: WhalePhase;
  phaseT: number;
  behavior: WhaleBehavior;
  /** Horizontal speed, m/s. */
  speed: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
  spout: number;
  splash: number;
};

export type WhaleHandle = {
  group: THREE.Group;
  state: WhaleState;
  update: (dt: number, time: number, shore: Shore) => void;
  /** Jump to a phase for review; `at` overrides the normalised start time. */
  forcePhase: (phase: WhalePhase, at?: number) => void;
  /** World-space size of the posed body (skinned), for debug stats. */
  measure: () => THREE.Vector3;
  /** Detail level currently drawn by the LOD. */
  detail: () => WhaleDetail;
  dispose: () => void;
};

export type WhaleOptions = {
  tier?: QualityTier;
  /** Starting heading; defaults to a seeded random one. */
  heading?: number;
  /** Heading of the long journey (defaults to the starting heading). */
  journey?: number;
  /** Seafloor height (negative under water): the whale keeps FLOOR_CLEARANCE above it and feeds over it. */
  floorAt?: (x: number, z: number) => number;
};

/** Base stroke frequency (Hz): slow, heavy beats for a 12 m animal. */
const STROKE_HZ = 0.3;
/** Forced review breach starts just after the exit so the shot lands near the apex. */
const FORCED_BREACH_T = 0.26;

function softCircleTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.35, 'rgba(238,244,248,0.5)');
  gradient.addColorStop(1, 'rgba(220,230,240,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Tight bright core with a short falloff: reads as a clump of droplets, not fog. */
function dropletTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.75, 'rgba(255,255,255,0.25)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Continuous, irregular foam patch: noise thresholded against a radial falloff,
 * densest in the middle. Black is transparent under additive blending.
 * `rim` > 0 hollows the centre into a band (for the waterline wash).
 */
function foamTexture(seed: number, channel: number, rim = 0): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const noise = makeNoise2D(seed, channel);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const d = Math.hypot(dx, dy);
      const n = 0.6 * noise(dx * 3.2, dy * 3.2) + 0.3 * noise(dx * 8 + 9, dy * 8) + 0.1 * noise(dx * 20, dy * 20 + 4);
      const radial = rim > 0 ? Math.exp(-(((d - 0.82) / rim) ** 2)) : 1 - smoothstep(0.25, 0.95, d);
      // Threshold rises toward the edge so the patch breaks up into lacework, not a disc.
      const v = clamp((n * 0.5 + 0.5 + radial - (rim > 0 ? 1.2 : 0.95)) * 2.6, 0, 1) * radial;
      const i = (y * size + x) * 4;
      const c = Math.round(v * 255);
      image.data[i] = c;
      image.data[i + 1] = c;
      image.data[i + 2] = c;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Vertical streak: bright core near the base, breaking into droplets toward the tip. */
function streakTexture(seed: number): THREE.CanvasTexture {
  const w = 32;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(w, h);
  const noise = makeNoise2D(seed, 77);
  for (let y = 0; y < h; y++) {
    const up = 1 - (y + 0.5) / h; // 0 at the base, 1 at the tip
    for (let x = 0; x < w; x++) {
      const across = ((x + 0.5) / w) * 2 - 1;
      const core = Math.exp(-((across / (0.55 - 0.3 * up)) ** 2));
      const breakup = smoothstep(0.35 - up * 0.5, 0.75 - up * 0.3, noise(across * 3, up * 9) * 0.5 + 0.5);
      const a = core * (1 - smoothstep(0.7, 1, up)) * lerp(1, breakup, smoothstep(0.2, 0.6, up)) * smoothstep(0, 0.06, up);
      const i = (y * w + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Soft disc. Center stays under 1 so stacked sprites cannot climb to white. */
function mistTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.28)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createWhale(seed: number, home: { x: number; z: number }, options: WhaleOptions = {}): WhaleHandle {
  const rng = fork(seed, 'whale');
  // First draw is the starting heading; tests rely on that order.
  // Always draw, so the rest of the seeded stream is the same either way.
  const randomHeading = rng() * Math.PI * 2;
  const startHeading = options.heading ?? randomHeading;
  const rollSide = hash(seed, 0x0b4e) & 1 ? 1 : -1;
  const tier = options.tier ?? 'high';

  // The root group stays at the origin. `body` carries the pose; effects live in world space.
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const skin = createWhaleSkin(seed, tier === 'high' ? 1024 : 512);
  const material = new THREE.MeshStandardMaterial({
    map: skin.map,
    normalMap: skin.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.42,
    metalness: 0,
    envMapIntensity: 0.6,
  });

  const bones = createWhaleBones();
  body.add(bones[ROOT_BONE]!);
  body.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const restFlip = [
    flipperQuaternion(1, FLIPPER_DROOP, FLIPPER_SWEEP, 0),
    flipperQuaternion(-1, FLIPPER_DROOP, FLIPPER_SWEEP, 0),
  ];

  // LOD levels share one skeleton; only one level draws per frame.
  const lod = new THREE.LOD();
  const levels: Array<{ detail: WhaleDetail; mesh: THREE.SkinnedMesh }> = [];
  for (const level of WHALE_LOD[tier]) {
    const { geometry } = buildWhaleGeometry(level.detail);
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.bind(skeleton, new THREE.Matrix4());
    // Bends and the fluke lift reach past the bind-pose bounds.
    mesh.frustumCulled = false;
    lod.addLevel(mesh, level.distance);
    levels.push({ detail: level.detail, mesh });
  }
  body.add(lod);

  // Spout: narrow mist column. Layer 1 is omitted by Water's mirror camera (layer 0 only).
  const MIST_LAYER = 1;
  const mistTex = mistTexture();
  const spoutGroup = new THREE.Group();
  spoutGroup.visible = false;
  spoutGroup.layers.set(MIST_LAYER);
  const spoutSprites: THREE.Sprite[] = [];
  const SPOUT_N = 10;
  for (let i = 0; i < SPOUT_N; i++) {
    const mat = new THREE.SpriteMaterial({
      map: mistTex,
      color: 0xb4c3cc,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      // The ocean draws the water plane over anything that fails the depth test,
      // which clips the column back down to a sky wisp. Draw the mist after the
      // water and skip the depth test so the plume stays in front of the surface.
      depthTest: false,
      blending: THREE.NormalBlending,
      toneMapped: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.layers.set(MIST_LAYER);
    sprite.renderOrder = 2;
    spoutGroup.add(sprite);
    spoutSprites.push(sprite);
  }
  group.add(spoutGroup);

  // Splash, all in world space: a crown of white water streaks, droplets thrown
  // off its rim, a little mist, and an irregular foam patch left on the water.
  const sprayTex = softCircleTexture();
  const dropTex = dropletTexture();
  const streakTex = streakTexture(seed);
  const foamTex = foamTexture(seed, 61);
  const washTex = foamTexture(seed, 62, 0.16);
  const splashGeo = new THREE.PlaneGeometry(2, 2);
  const foamMaterial = (map: THREE.Texture) =>
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      // Additive so foam can only brighten the water, never darken it.
      blending: THREE.AdditiveBlending,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
  const splashMat = foamMaterial(foamTex);
  const splash = new THREE.Mesh(splashGeo, splashMat);
  splash.rotation.x = -Math.PI / 2;
  splash.visible = false;
  group.add(splash);

  // Soft wet line where the hull meets the water while the whale is at the surface.
  const washMat = foamMaterial(washTex);
  const wash = new THREE.Mesh(splashGeo, washMat);
  wash.rotation.x = -Math.PI / 2;
  const washPivot = new THREE.Group();
  washPivot.add(wash);
  washPivot.visible = false;
  group.add(washPivot);

  type Spray = { sprite: THREE.Sprite; kind: 'crown' | 'drop' | 'mist'; angle: number; out: number; up: number; size: number };
  const CROWN_N = 34;
  const DROP_N = 16;
  const MIST_N = 3;
  const spray = new THREE.Group();
  spray.visible = false;
  const sprays: Spray[] = [];
  for (let i = 0; i < CROWN_N + DROP_N + MIST_N; i++) {
    const kind = i < CROWN_N ? 'crown' : i < CROWN_N + DROP_N ? 'drop' : 'mist';
    const mat = new THREE.SpriteMaterial({
      map: kind === 'crown' ? streakTex : kind === 'drop' ? dropTex : sprayTex,
      color: kind === 'mist' ? 0xdde7ec : 0xe9eff2,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      // White water should stay white; tone mapping greys it out against the sky.
      toneMapped: kind === 'mist',
    });
    const sprite = new THREE.Sprite(mat);
    // Streaks stand on the water: anchor the sprite at its base.
    if (kind === 'crown') sprite.center.set(0.5, 0);
    spray.add(sprite);
    const r = (k: number) => hash(seed, i, k, 'spray') / 0x100000000;
    const n = kind === 'crown' ? CROWN_N : kind === 'drop' ? DROP_N : MIST_N;
    const j = kind === 'crown' ? i : kind === 'drop' ? i - CROWN_N : i - CROWN_N - DROP_N;
    sprays.push({
      sprite,
      kind,
      angle: (j / n) * Math.PI * 2 + (r(1) - 0.5) * (kind === 'crown' ? 0.4 : 0.8),
      out: kind === 'crown' ? 0.55 + r(2) * 0.8 : kind === 'drop' ? 2 + r(2) * 3.5 : 0.5 + r(2),
      up: kind === 'crown' ? 6.5 + r(3) * 5.5 : kind === 'drop' ? 6 + r(3) * 4 : 1.5 + r(3),
      size: kind === 'crown' ? 1.3 + r(4) * 1.4 : kind === 'drop' ? 0.45 + r(4) * 0.5 : 1.8 + r(4) * 0.6,
    });
  }
  group.add(spray);

  // Water sheeting off the flanks as the body leaves the surface; rides on the body.
  const SHEET_N = 8;
  const sheet = new THREE.Group();
  sheet.visible = false;
  const sheetSprites: Array<{ sprite: THREE.Sprite; x: number; y: number; z: number; speed: number }> = [];
  for (let i = 0; i < SHEET_N; i++) {
    const r = (k: number) => hash(seed, i, k, 'sheet') / 0x100000000;
    const mat = new THREE.SpriteMaterial({ map: streakTex, color: 0xf2f7f9, transparent: true, opacity: 0, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sheet.add(sprite);
    const side = i % 2 === 0 ? 1 : -1;
    const x = -4 + r(1) * 5;
    const prof = sampleProfile(clamp((x + 6) / 10.6, 0, 1));
    sheetSprites.push({ sprite, x, y: prof.mid + (r(2) - 0.3) * 0.8, z: side * prof.width * 1.02, speed: 3 + r(3) * 3 });
  }
  body.add(sheet);
  const splashFx = { age: Infinity, power: 0, x: 0, z: 0, radius: 2, exit: false, sheetAge: Infinity };

  const mover = createWhaleMover(seed, home, startHeading, options.floorAt, options.journey);
  const motion = mover.motion;
  const state: WhaleState = {
    phase: motion.phase,
    phaseT: motion.phaseT,
    behavior: motion.behavior,
    speed: motion.speed,
    x: motion.x,
    y: motion.pose.y,
    z: motion.z,
    heading: startHeading,
    pitch: motion.pose.pitch,
    roll: 0,
    spout: 0,
    splash: 0,
  };

  let strokePhase = (hash(seed, 0x57) / 0x100000000) * Math.PI * 2;
  let lastBreachT = -1;
  const angles = spineAngles(0, 0, 0);
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const blowhole = new THREE.Vector3(BLOWHOLE_X, sampleProfile(BLOWHOLE_U).top + 0.05, 0);

  function applyPose(p: WhalePose, time: number): void {
    const bob = p.bob;
    state.y = floorLimit(p.y + bob * 0.07 * Math.sin(time * 0.7), motion.floor);
    state.pitch = p.pitch + bob * 0.035 * Math.sin(time * 0.55);
    const roll = p.roll * (state.phase === 'breach' ? rollSide : 1);
    // Slow, lazy roll while cruising near the surface.
    state.roll = roll + bob * (0.035 * Math.sin(time * 0.21 + seed) + 0.015 * Math.sin(time * 0.9));

    body.position.set(state.x, state.y, state.z);
    whaleOrientation(state.heading, state.pitch, state.roll, body.quaternion);

    spineAngles(strokePhase, p.stroke, p.arch, angles);
    // Spine order in SPINE: H2, H1, B0, B1..B5.
    bones[1]!.rotation.set(0, 0, angles.head[0]!);
    bones[0]!.rotation.set(0, 0, angles.head[1]!);
    for (let i = 0; i < 5; i++) bones[3 + i]!.rotation.set(0, 0, angles.tail[i]!);
    // Flukes trail the stroke and tip up through the dive.
    bones[FLUKE_BONE]!.rotation.z += p.arch * 0.1;

    // Flippers sweep with the stroke and spread wide in the air.
    const sweep = Math.sin(strokePhase + 1.1) * p.stroke;
    for (const [index, side] of [[FLIPPER_L, 1], [FLIPPER_R, -1]] as const) {
      flipperQuaternion(
        side,
        FLIPPER_DROOP + p.flipLift + 0.1 * sweep,
        FLIPPER_SWEEP + p.flipSweep + 0.07 * Math.sin(strokePhase + 0.4) * p.stroke,
        0.12 * sweep,
        tmpQ,
      );
      bones[index]!.quaternion.copy(tmpQ);
    }
  }

  function sync(time: number): void {
    state.phase = motion.phase;
    state.phaseT = motion.phaseT;
    state.behavior = motion.behavior;
    state.speed = motion.speed;
    state.x = motion.x;
    state.z = motion.z;
    state.heading = motion.heading;
    applyPose(motion.pose, time);
  }

  let clock = 0;

  const handle: WhaleHandle = {
    group,
    state,
    forcePhase(phase: WhalePhase, at?: number) {
      const preset = phase === 'breach' ? FORCED_BREACH_T : phase === 'spout' ? 0.5 : phase === 'surface' ? 0.45 : phase === 'deep' ? 0.3 : 0;
      const t = typeof at === 'number' && Number.isFinite(at) ? clamp(at, 0, 0.99) : preset;
      mover.force(phase, t);
      // Starting exactly at 0 still fires the exit splash on the way up.
      lastBreachT = phase === 'breach' ? t - 1e-6 : -1;
      // Sync the mesh now so review framing sees the right pose immediately.
      sync(clock);
      body.updateMatrixWorld(true);
    },
    update(rawDt: number, time: number, shore: Shore) {
      const dt = Number.isFinite(rawDt) ? Math.max(0, rawDt) : 0;
      clock = time;
      mover.step(dt, time, shore);
      strokePhase += dt * Math.PI * 2 * STROKE_HZ * motion.pose.rate;
      sync(time);

      // Splash events: the body bursting out, then the much larger re-entry.
      if (state.phase === 'breach') {
        const t = state.phaseT;
        if (lastBreachT < BREACH_EXIT && t >= BREACH_EXIT) startSplash(0.75, true);
        if (lastBreachT < BREACH_SPLASH && t >= BREACH_SPLASH) startSplash(1, false);
        lastBreachT = t;
      } else {
        lastBreachT = -1;
      }

      updateSpout();
      updateSplash(dt);
      updateWash(motion.pose);
    },
    measure() {
      body.updateMatrixWorld(true);
      const mesh = levels[Math.max(0, lod.getCurrentLevel())]!.mesh;
      skeleton.update();
      return new THREE.Box3().setFromObject(mesh, true).getSize(new THREE.Vector3());
    },
    detail() {
      return levels[Math.max(0, lod.getCurrentLevel())]!.detail;
    },
    dispose() {
      for (const level of levels) level.mesh.geometry.dispose();
      material.dispose();
      skin.dispose();
      skeleton.dispose();
      splashGeo.dispose();
      splashMat.dispose();
      mistTex.dispose();
      sprayTex.dispose();
      dropTex.dispose();
      streakTex.dispose();
      foamTex.dispose();
      washTex.dispose();
      washMat.dispose();
      for (const s of sheetSprites) (s.sprite.material as THREE.Material).dispose();
      for (const sprite of spoutSprites) (sprite.material as THREE.Material).dispose();
      for (const s of sprays) (s.sprite.material as THREE.Material).dispose();
    },
  };

  function startSplash(power: number, atNose: boolean): void {
    body.updateMatrixWorld(true);
    // Exit: where the rising body cuts the surface. Re-entry: under the body's centre.
    const local = atNose ? tmpV.set(-1.2, 0, 0) : tmpV.set(-2.2, 0, 0);
    local.applyMatrix4(body.matrixWorld);
    splashFx.age = 0;
    splashFx.power = power;
    splashFx.x = local.x;
    splashFx.z = local.z;
    splashFx.radius = atNose ? 1.3 : 2.4;
    splashFx.exit = atNose;
    if (atNose) splashFx.sheetAge = 0;
  }

  function updateSpout(): void {
    // Thin mist column rising from the blowholes; vertical in world space.
    // ~1 m wide at the base, a bushy ~3.4 m crown and ~5.4 m tall. Peak opacity ≤ 0.5.
    const t = state.phase === 'spout' ? state.phaseT : 0;
    state.spout = state.phase === 'spout' ? Math.sin(t * Math.PI) : 0;
    const rising = t < 0.62;
    const rise = clamp(t / 0.62, 0, 1);
    // Hold the full plume ~0.45 s after it tops out before it disperses.
    const fade = rising ? clamp(rise * 2.5, 0, 1) : clamp(1 - (t - 0.75) / 0.25, 0, 1);
    spoutGroup.visible = fade > 0.02;
    if (!spoutGroup.visible) return;
    tmpV.copy(blowhole).applyMatrix4(body.matrixWorld);
    spoutGroup.position.set(tmpV.x, Math.max(0.05, tmpV.y), tmpV.z);
    const columnH = lerp(0.4, 5.4, rise);
    for (let i = 0; i < spoutSprites.length; i++) {
      const sprite = spoutSprites[i]!;
      const mat = sprite.material as THREE.SpriteMaterial;
      const u = i / Math.max(1, spoutSprites.length - 1);
      const jx = hash(seed, i, 1, 'spout') / 0x100000000 - 0.5;
      const jz = hash(seed, i, 2, 'spout') / 0x100000000 - 0.5;
      // Narrow stem, then a crown that spreads as it rises.
      const spread = (0.15 + u * u * 1.6) * (rising ? 0.45 : 0.8 + (1 - fade));
      sprite.position.set(jx * spread, u * columnH, jz * spread);
      sprite.scale.set(lerp(0.85, 3.4, u * u), lerp(1.5, 2.6, u), 1);
      mat.opacity = fade * lerp(0.5, 0.3, u);
    }
  }

  function updateSplash(dt: number): void {
    splashFx.age += dt;
    splashFx.sheetAge += dt;
    const age = splashFx.age;
    const power = splashFx.power;
    const exit = splashFx.exit;
    // Foam lingers on the water for a few seconds after the spray falls back.
    const foam = Number.isFinite(age) ? power * Math.exp(-age * 0.4) * clamp(age * 4, 0, 1) : 0;
    state.splash = foam;
    splash.visible = foam > 0.02;
    if (splash.visible) {
      splash.position.set(splashFx.x, 0.06, splashFx.z);
      const size = splashFx.radius * (1.6 + age * 0.6);
      splash.scale.set(size, size, 1);
      splashMat.opacity = foam * 0.85;
    }

    // Exit sheeting: streaks slide down the flanks toward the tail and thin out.
    sheet.visible = splashFx.sheetAge < 1.1;
    if (sheet.visible) {
      const a = splashFx.sheetAge;
      for (const s of sheetSprites) {
        const mat = s.sprite.material as THREE.SpriteMaterial;
        s.sprite.position.set(s.x + s.speed * a, s.y, s.z);
        s.sprite.scale.set(0.5, 1.6 + a * 1.5, 1);
        mat.opacity = 0.85 * (1 - smoothstep(0.3, 1.1, a));
      }
    }

    spray.visible = Number.isFinite(age) && age < 3;
    if (!spray.visible) return;
    spray.position.set(splashFx.x, 0, splashFx.z);
    const lift = exit ? 0.45 : 1;
    for (const s of sprays) {
      const mat = s.sprite.material as THREE.SpriteMaterial;
      if (s.kind === 'mist' && exit) {
        mat.opacity = 0;
        continue;
      }
      const up = s.up * lift * (0.6 + 0.4 * power);
      const top = up * age - 0.5 * 9.81 * age * age;
      const falling = up - 9.81 * age < 0;
      if (s.kind === 'crown') {
        // A ring of white sheets standing on the water: rises, then slumps back.
        if (top <= 0.05) {
          mat.opacity = 0;
          continue;
        }
        const ring = splashFx.radius * s.out + age * (exit ? 0.8 : 2.2);
        s.sprite.position.set(Math.cos(s.angle) * ring, 0.02, Math.sin(s.angle) * ring);
        s.sprite.scale.set(s.size * (exit ? 0.8 : 1) * (1 + age * 0.4), top, 1);
        // Sheets thin out as they slump; the crown is gone within ~1.8 s.
        mat.opacity = 0.9 * (falling ? smoothstep(0, 1.5, top) : 1) * (1 - smoothstep(0.8, 1.8, age));
        continue;
      }
      if (falling && top < 0) {
        mat.opacity = 0;
        continue;
      }
      // Drops are flung off the crown rim and fall in an arc; mist hangs low and small.
      const reach = splashFx.radius + s.out * lift * (1 - Math.exp(-age * 1.5));
      const size = Math.min(s.size * (1 + age * (s.kind === 'mist' ? 0.4 : 0.2)), 2.4);
      const base = size * 0.6 + 0.05;
      s.sprite.position.set(Math.cos(s.angle) * reach, Math.max(base, top + base), Math.sin(s.angle) * reach);
      s.sprite.scale.set(size, size, 1);
      const life = clamp(1 - age / (s.kind === 'mist' ? 2.4 : 2.2), 0, 1);
      const settle = falling ? smoothstep(0, 1, top) : 1;
      mat.opacity = (s.kind === 'mist' ? 0.32 : 0.9) * life * settle;
    }
  }

  function updateWash(pose: WhalePose): void {
    // Only while the body rides at the surface; fades through dives and breaches.
    const w = pose.bob * clamp(1 - Math.abs(pose.y - SURFACE_Y) / 0.6, 0, 1);
    washPivot.visible = w > 0.02;
    if (!washPivot.visible) return;
    // Sized so the foam band sits on the waterline footprint (rostrum to fin).
    tmpV.set(-2.2, 0, 0).applyMatrix4(body.matrixWorld);
    washPivot.position.set(tmpV.x, 0.05, tmpV.z);
    washPivot.rotation.y = state.heading;
    wash.scale.set(4.7, 1.05, 1);
    washMat.opacity = 0.28 * w;
  }

  sync(0);
  body.updateMatrixWorld(true);
  return handle;
}
