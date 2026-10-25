import * as THREE from 'three';
import { fork, hash } from './rng.js';
import { clamp, damp, lerp, smoothstep } from './math.js';
import type { Shore } from './shore.js';
import { createWhalePilot, type WhaleCourse } from './whale-course.js';

export type WhalePhase = 'swim' | 'surface' | 'spout' | 'dive' | 'breach' | 'splash';

export type WhaleState = {
  phase: WhalePhase;
  phaseT: number;
  cycle: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  roll: number;
  spout: number;
  splash: number;
};

export type WhaleHandle = {
  group: THREE.Group;
  state: WhaleState;
  update: (dt: number, time: number, shore: Shore) => void;
  forcePhase: (phase: WhalePhase) => void;
  dispose: () => void;
};

const PHASE_LEN: Record<WhalePhase, number> = {
  swim: 18,
  surface: 6,
  spout: 3.5,
  dive: 5,
  breach: 5.5,
  splash: 2.5,
};

const PHASE_ORDER: WhalePhase[] = ['swim', 'surface', 'spout', 'dive', 'swim', 'surface', 'spout', 'dive', 'breach', 'splash', 'dive'];

export function phaseAtCycleTime(t: number): { phase: WhalePhase; phaseT: number; cycle: number } {
  const total = PHASE_ORDER.reduce((sum, p) => sum + PHASE_LEN[p], 0);
  const cycle = Math.floor(t / total);
  let local = ((t % total) + total) % total;
  for (const phase of PHASE_ORDER) {
    const len = PHASE_LEN[phase];
    if (local < len) return { phase, phaseT: local / len, cycle };
    local -= len;
  }
  return { phase: 'swim', phaseT: 0, cycle };
}

export function cycleDuration(): number {
  return PHASE_ORDER.reduce((sum, p) => sum + PHASE_LEN[p], 0);
}

function buildWhaleGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];
  const samples = 36;
  // ~4.5:1 length:width. Max radius 1 → diameter 2, length 9.
  // Profile is closed: radius is exactly 0 at both ends so the lathe is not a tube.
  const length = 9;
  const maxR = 1;
  for (let i = 0; i <= samples; i++) {
    const along = i / samples;
    let radius = 0;
    if (along > 0 && along < 1) {
      if (along < 0.08) radius = Math.sin((along / 0.08) * Math.PI * 0.5) * 0.72;
      else if (along < 0.2) radius = lerp(0.72, maxR, (along - 0.08) / 0.12);
      else if (along < 0.62) radius = maxR;
      // Tail stock is the last ~30% of length: gentle taper into the flukes, ending on the axis.
      else radius = maxR * Math.sin(((1 - along) / 0.38) * Math.PI * 0.5);
    }
    points.push(new THREE.Vector2(radius, along * length - length / 2));
  }
  points[0]!.set(0, -length / 2);
  points[points.length - 1]!.set(0, length / 2);

  const body = new THREE.LatheGeometry(points, 28);
  // Head at −X, tail at +X. Positive scale keeps winding outward.
  body.rotateZ(-Math.PI / 2);
  body.scale(1, 0.9, 1);
  body.computeVertexNormals();

  // If a mid-body normal points inward, flip winding and recompute.
  const pos = body.attributes.position!;
  const nrm = body.attributes.normal!;
  let far = 0;
  let farD = 0;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getY(i), pos.getZ(i));
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const outward = nrm.getY(far) * pos.getY(far) + nrm.getZ(far) * pos.getZ(far);
  if (outward < 0 && body.index) {
    const idx = body.index;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i);
      idx.setX(i, idx.getX(i + 1));
      idx.setX(i + 1, a);
    }
    body.computeVertexNormals();
  }

  const colors = new Float32Array(pos.count * 3);
  const back = new THREE.Color(0x3a4d5c);
  const belly = new THREE.Color(0x9aa3ab);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const mix = smoothstep(-0.55, -0.12, y);
    tmp.copy(belly).lerp(back, mix);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  body.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return body;
}

function makeFluke(): THREE.BufferGeometry {
  // One simple non-crossing outline. Thin extrude, then laid flat in the horizontal plane.
  const shape = new THREE.Shape();
  shape.moveTo(0.05, 0);
  shape.lineTo(1.15, 0.42);
  shape.lineTo(1.7, 0.08);
  shape.lineTo(0.15, -0.02);
  shape.lineTo(-1.7, 0.08);
  shape.lineTo(-1.15, 0.42);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.03,
    bevelEnabled: false,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function makeFin(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.95, -0.08);
  shape.quadraticCurveTo(0.7, -0.45, 0.12, -0.38);
  shape.lineTo(0, 0);
  return new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
}

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

export function createWhale(seed: number, home: { x: number; z: number }): WhaleHandle {
  const rng = fork(seed, 'whale');
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.02,
    envMapIntensity: 0.35,
    flatShading: false,
    side: THREE.FrontSide,
    emissive: new THREE.Color(0x1a2834),
    emissiveIntensity: 0.18,
  });
  const bodyGeo = buildWhaleGeometry();
  // Ensure colour attribute survived lathe + scale and reaches the material.
  if (!bodyGeo.getAttribute('color')) {
    throw new Error('whale body missing vertex colors');
  }
  bodyMat.vertexColors = true;
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);
  group.scale.setScalar(1.2);

  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x3a4d5c,
    roughness: 0.65,
    metalness: 0.02,
    side: THREE.DoubleSide,
    envMapIntensity: 0.3,
    emissive: new THREE.Color(0x1a2834),
    emissiveIntensity: 0.14,
  });
  const flukeGeo = makeFluke();
  const fluke = new THREE.Mesh(flukeGeo, darkMat);
  // Tail is +X after the lathe is rotated. Flukes lie flat on that tip.
  fluke.position.set(4.25, 0.02, 0);
  fluke.scale.setScalar(0.95);
  group.add(fluke);

  // Low ridge, not a cone.
  const dorsalGeo = new THREE.BoxGeometry(0.45, 0.08, 0.16);
  const dorsal = new THREE.Mesh(dorsalGeo, darkMat);
  dorsal.position.set(1.4, 0.72, 0);
  dorsal.rotation.z = -0.5;
  group.add(dorsal);

  const finGeo = makeFin();
  const finL = new THREE.Mesh(finGeo, darkMat);
  finL.position.set(1.6, -0.45, 0.55);
  finL.scale.setScalar(0.55);
  finL.rotation.y = 0.8;
  finL.rotation.z = -0.9;
  group.add(finL);
  const finR = finL.clone();
  finR.position.z = -0.55;
  finR.rotation.y = -0.8;
  finR.rotation.z = 0.9;
  group.add(finR);

  // Spout: narrow mist column. Layer 1 is omitted by Water's mirror camera (layer 0 only).
  const MIST_LAYER = 1;
  const mistTex = mistTexture();
  const spoutGroup = new THREE.Group();
  spoutGroup.visible = false;
  spoutGroup.position.set(-2.6, 0.85, 0);
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
    sprite.scale.set(0.8, 0.7, 1);
    sprite.layers.set(MIST_LAYER);
    sprite.renderOrder = 2;
    spoutGroup.add(sprite);
    spoutSprites.push(sprite);
  }
  group.add(spoutGroup);

  const spoutTex = softCircleTexture();
  // Splash: ring + outward spray sprites.
  const splashGeo = new THREE.RingGeometry(0.5, 2.2, 32);
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xeef4f8,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const splash = new THREE.Mesh(splashGeo, splashMat);
  splash.rotation.x = -Math.PI / 2;
  splash.visible = false;
  group.add(splash);

  const splashSprites: THREE.Sprite[] = [];
  const splashSpray = new THREE.Group();
  splashSpray.visible = false;
  for (let i = 0; i < 20; i++) {
    const mat = new THREE.SpriteMaterial({
      map: spoutTex,
      color: 0xeef4f8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    splashSpray.add(sprite);
    splashSprites.push(sprite);
  }
  group.add(splashSpray);

  // Back breaks the surface in swim so the default frame shows the whale.
  const restY = -0.32;
  const state: WhaleState = {
    phase: 'surface',
    phaseT: 0.45,
    cycle: 0,
    x: home.x,
    y: -0.22,
    z: home.z,
    heading: rng() * Math.PI * 2,
    roll: 0,
    spout: 0,
    splash: 0,
  };

  const bindY = new Float32Array(bodyGeo.attributes.position!.count);
  for (let i = 0; i < bindY.length; i++) bindY[i] = bodyGeo.attributes.position!.getY(i);

  const course: WhaleCourse = { x: state.x, z: state.z, heading: state.heading, leg: state.heading };
  const pilot = createWhalePilot(seed, home, state.heading);
  let forced: WhalePhase | null = null;
  let forcedT = 0;

  const handle: WhaleHandle = {
    group,
    state,
    forcePhase(phase: WhalePhase) {
      forced = phase;
      // Mid-rise breach (nose-up ~40°) and mid-spout for review shots.
      const breachT = 0.22;
      forcedT = phase === 'breach' ? PHASE_LEN.breach * breachT : phase === 'spout' ? PHASE_LEN.spout * 0.5 : 0;
      if (phase === 'breach') {
        const arc = Math.sin(breachT * Math.PI);
        state.y = lerp(restY, 6.5, arc);
        state.roll = 1.2 * arc;
        state.phase = 'breach';
        state.phaseT = breachT;
        // Sync mesh immediately so review framing sees the body in air.
        group.position.set(state.x, state.y, state.z);
        group.rotation.order = 'YXZ';
        group.rotation.y = state.heading;
        group.rotation.x = lerp(1.1, -0.9, breachT);
        group.rotation.z = state.roll;
      }
      if (phase === 'spout' || phase === 'surface') {
        state.y = -0.15;
        state.spout = 1;
        state.phase = phase;
        state.phaseT = phase === 'spout' ? 0.5 : 0.45;
        group.position.set(state.x, state.y, state.z);
        group.rotation.order = 'YXZ';
        group.rotation.y = state.heading;
        group.rotation.x = -0.08;
        group.rotation.z = 0;
      }
    },
    update(dt: number, time: number, shore: Shore) {
      // Start mid-surface so t≈0 shows the back; then follow the cycle.
      const phaseOffset = PHASE_LEN.swim + PHASE_LEN.surface * 0.45;
      const schedule = forced
        ? { phase: forced, phaseT: clamp(forcedT / PHASE_LEN[forced], 0, 1), cycle: state.cycle }
        : phaseAtCycleTime(time + phaseOffset);
      if (forced) {
        forcedT += dt;
        if (forcedT >= PHASE_LEN[forced]) forced = null;
      }
      state.phase = schedule.phase;
      state.phaseT = schedule.phaseT;
      state.cycle = schedule.cycle;

      // Freeze the cruise while a review phase is forced so event framing stays locked.
      if (!forced) {
        pilot.step(course, dt, time, shore);
        state.x = course.x;
        state.z = course.z;
        state.heading = course.heading;
      }

      let targetY = restY;
      let pitch = Math.sin(time * 0.55) * 0.05;
      let targetRoll = Math.sin(time * 0.9) * 0.04;
      let yDamp = 2.4;
      state.spout = 0;
      state.splash = damp(state.splash, 0, 1.4, dt);

      switch (state.phase) {
        case 'swim':
          targetY = restY + Math.sin(time * 0.7) * 0.12;
          pitch = Math.sin(time * 0.55) * 0.05;
          break;
        case 'surface':
          targetY = lerp(restY, -0.25, smooth(state.phaseT));
          pitch = -0.06 + Math.sin(time * 0.55) * 0.05;
          break;
        case 'spout':
          targetY = -0.25;
          pitch = -0.1 + Math.sin(time * 0.55) * 0.05;
          state.spout = Math.sin(state.phaseT * Math.PI);
          break;
        case 'dive':
          targetY = lerp(-0.25, restY - 0.5, smooth(state.phaseT));
          pitch = 0.22 * (1 - state.phaseT);
          break;
        case 'breach': {
          const t = state.phaseT;
          const arc = Math.sin(t * Math.PI);
          targetY = lerp(restY, 6.5, arc);
          pitch = lerp(1.1, -0.9, t);
          targetRoll = 1.2 * arc;
          yDamp = 6;
          if (t > 0.8) state.splash = Math.max(state.splash, (t - 0.8) / 0.2);
          break;
        }
        case 'splash':
          targetY = lerp(0.2, restY, smooth(state.phaseT));
          state.splash = Math.max(0.35, 1 - state.phaseT);
          pitch = 0.08;
          yDamp = 6;
          break;
      }

      state.y = damp(state.y, targetY, yDamp, dt);
      state.roll = damp(state.roll, targetRoll, yDamp, dt);

      group.position.set(state.x, state.y, state.z);
      group.rotation.order = 'YXZ';
      group.rotation.y = state.heading;
      group.rotation.x = pitch;
      group.rotation.z = state.roll;

      const posAttr = bodyGeo.attributes.position!;
      const wave = Math.sin(time * 2.2) * 0.16;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const along = (x + 4.5) / 9;
        const amp = along * along;
        posAttr.setY(i, bindY[i]! + Math.sin(time * 2.2 - along * 3.2) * wave * amp * 1.2);
      }
      posAttr.needsUpdate = true;
      fluke.rotation.z = Math.sin(time * 2.2 - 3.2) * 0.3;

      // Thin mist column. Local sizes are multiplied by group.scale 1.2, so the
      // world column is ~0.8 wide at the base, ~2.5 at the top, and ~5 tall.
      // It rises over ~2.2 s of the 3.5 s spout, then disperses. Peak opacity ≤ 0.34.
      {
        const t = state.phase === 'spout' ? state.phaseT : 0;
        const rising = t < 0.62;
        const rise = clamp(t / 0.62, 0, 1);
        const fade = rising ? rise : clamp(1 - (t - 0.62) / 0.38, 0, 1);
        const columnH = lerp(0.35, 4.5, rise);
        spoutGroup.visible = fade > 0.02;
        for (let i = 0; i < spoutSprites.length; i++) {
          const sprite = spoutSprites[i]!;
          const mat = sprite.material as THREE.SpriteMaterial;
          if (fade <= 0.02) {
            mat.opacity = 0;
            continue;
          }
          const u = i / Math.max(1, spoutSprites.length - 1);
          const jitter = (hash(seed, i, 'spout') / 0x100000000 - 0.5);
          const spread = (0.12 + u * 0.7) * (rising ? 0.28 : 0.65 + (1 - fade));
          sprite.position.set(jitter * spread, u * columnH, jitter * 0.4 * spread);
          const width = lerp(0.7, 2.15, u);
          sprite.scale.set(width, lerp(1.25, 1.9, u), 1);
          mat.opacity = fade * lerp(0.34, 0.16, u);
        }
      }

      // Splash ring + spray.
      const splashStrength = state.splash;
      splash.visible = splashStrength > 0.02;
      splash.position.set(0, -state.y + 0.04, 0);
      splashMat.opacity = splashStrength * 0.55;
      const ring = lerp(1, 4, splashStrength);
      splash.scale.set(ring, ring, 1);

      splashSpray.visible = splashStrength > 0.02;
      splashSpray.position.set(0, -state.y + 0.3, 0);
      for (let i = 0; i < splashSprites.length; i++) {
        const sprite = splashSprites[i]!;
        const mat = sprite.material as THREE.SpriteMaterial;
        if (splashStrength <= 0.02) {
          mat.opacity = 0;
          continue;
        }
        const a = (i / splashSprites.length) * Math.PI * 2;
        const reach = splashStrength * (2.5 + (hash(seed, i, 'splash') / 0x100000000) * 2.5);
        const lift = splashStrength * (1.2 + (i % 5) * 0.35);
        sprite.position.set(Math.cos(a) * reach, lift, Math.sin(a) * reach);
        sprite.scale.setScalar(0.6 + splashStrength * 1.8);
        mat.opacity = splashStrength * 0.55;
      }
    },
    dispose() {
      bodyGeo.dispose();
      bodyMat.dispose();
      flukeGeo.dispose();
      dorsalGeo.dispose();
      finGeo.dispose();
      darkMat.dispose();
      splashGeo.dispose();
      splashMat.dispose();
      mistTex.dispose();
      spoutTex.dispose();
      for (const sprite of spoutSprites) (sprite.material as THREE.Material).dispose();
      for (const sprite of splashSprites) (sprite.material as THREE.Material).dispose();
    },
  };
  return handle;
}

function smooth(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}
