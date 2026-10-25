import * as THREE from 'three';
import art from './look.js';
import { softGlowTexture } from './textures.js';
import type { FlightState } from './flight.js';
import type { QualityTier } from './quality.js';

const radians = (value: number): number => value * Math.PI / 180;
const position = ([x, y, z]: number[]): [number, number, number] => [x!, y!, -z!];

function extruded(outline: number[][], thickness: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1, curveSegments: 1 });
}

function lightSprite(map: THREE.Texture, tint: THREE.ColorRepresentation, size: number, opacity: number): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map, color: tint, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true,
  }));
  sprite.scale.setScalar(size);
  return sprite;
}

export type ShipEngine = {
  plume: THREE.Sprite;
  halo: THREE.Sprite;
  nozzle: THREE.Mesh;
};

export type ShipNavLight = {
  kind: string;
  lamp: THREE.Mesh;
  halo: THREE.Sprite;
  spec: { pos?: number[]; color: string; blinkPeriod?: number; blinkOn?: number };
};

export type ShipUserData = {
  engines: ShipEngine[];
  navigation: ShipNavLight[];
  settings: typeof art.ship;
  pitch: number;
  roll: number;
  panels: THREE.MeshStandardMaterial;
};

export type ShipGroup = THREE.Group & { userData: ShipUserData };

export function createShip(
  settings: typeof art.ship,
  glow: THREE.Texture | null,
  mobile: boolean,
  physical: typeof art.realism = art.realism,
  _tier: QualityTier = mobile ? 'low' : 'high',
): ShipGroup {
  const ship = new THREE.Group() as ShipGroup;
  const materials = physical.shipMaterials;
  const glowMap = glow ?? softGlowTexture();
  const hull = new THREE.MeshStandardMaterial({
    color: materials.hull.color,
    metalness: materials.hull.metalness,
    roughness: Math.max(0.22, materials.hull.roughness - 0.06),
  });
  const panels = new THREE.MeshStandardMaterial({
    color: materials.graphite.color,
    metalness: materials.graphite.metalness,
    roughness: Math.max(0.32, materials.graphite.roughness - 0.08),
  });
  const accent = new THREE.MeshStandardMaterial({
    color: materials.copper.color,
    metalness: materials.copper.metalness ?? 0.8,
    roughness: materials.copper.roughness ?? 0.35,
  });

  const profile = [...settings.hull.profile].reverse().map(([z, radius]) => new THREE.Vector2(radius, z));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, settings.hull.segments[mobile ? 'low' : 'high']), hull);
  body.name = 'hull';
  body.rotation.x = -Math.PI / 2;
  body.scale.set(settings.hull.squash[0], 1, settings.hull.squash[1]);
  ship.add(body);

  const cap = new THREE.Mesh(new THREE.CircleGeometry(settings.hull.profile.at(-1)![1], 20), panels);
  cap.scale.y = settings.hull.squash[1];
  cap.position.z = -settings.hull.profile.at(-1)![0];
  ship.add(cap);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), panels);
  belly.scale.set(0.082, 0.045, 0.35);
  belly.position.set(0, -0.038, 0.08);
  ship.add(belly);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshStandardMaterial({
    color: materials.canopy.color,
    roughness: materials.canopy.roughness,
    metalness: materials.canopy.metalness,
    emissive: materials.canopy.interiorGlow,
    emissiveIntensity: materials.canopy.interiorIntensity,
  }));
  canopy.scale.fromArray(settings.canopy.size);
  canopy.position.fromArray(position(settings.canopy.center));
  ship.add(canopy);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.105, settings.accent.stripeZ[1] - settings.accent.stripeZ[0], 24, 1, true), accent);
  band.rotation.x = Math.PI / 2;
  band.scale.z = settings.hull.squash[1];
  band.position.z = -(settings.accent.stripeZ[0] + settings.accent.stripeZ[1]) / 2;
  ship.add(band);

  const wingGeometry = extruded(settings.wings.outline, settings.wings.thickness);
  const engines: ShipEngine[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeometry, panels);
    wing.name = side > 0 ? 'wing-right' : 'wing-left';
    wing.rotation.set(-Math.PI / 2, 0, side * radians(settings.wings.dihedralDeg), 'ZYX');
    wing.scale.x = side;
    wing.position.y = settings.wings.y;
    ship.add(wing);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.09), accent);
    stripe.position.set(side * 0.455, settings.wings.y + Math.sin(radians(settings.wings.dihedralDeg)) * 0.455 + 0.01, 0.33);
    ship.add(stripe);

    const pods = settings.nacelles;
    const length = pods.z[1] - pods.z[0];
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(pods.radius * 0.85, pods.radius, length, mobile ? 10 : 16), panels);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * pods.x, pods.y, -(pods.z[0] + pods.z[1]) / 2);
    ship.add(engine);

    const nozzle = new THREE.Mesh(
      new THREE.CircleGeometry(settings.engine.nozzleRadius, 16),
      new THREE.MeshBasicMaterial({ color: materials.engine.core, transparent: true, opacity: 0.9 }),
    );
    nozzle.position.set(side * pods.x, pods.y, -pods.z[0] + 0.001);
    ship.add(nozzle);

    // Additive soft sprites only — avoids HalfFloat Inf/NaN bloom black boxes on phones.
    const plume = lightSprite(glowMap, settings.engine.outer, settings.engine.plumeLength[0] * 0.9, 0.65);
    plume.position.set(side * pods.x, pods.y, -pods.z[0] + settings.engine.plumeLength[0] * 0.35);
    ship.add(plume);
    const halo = lightSprite(glowMap, materials.engine.core, 0.22, 0.7);
    halo.position.copy(nozzle.position);
    ship.add(halo);
    engines.push({ plume, halo, nozzle });
  }

  const finGeometry = extruded(settings.fin.outline, settings.fin.thickness);
  finGeometry.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)));
  const fin = new THREE.Mesh(finGeometry, hull);
  fin.position.x = settings.fin.thickness / 2;
  ship.add(fin);

  const navigation: ShipNavLight[] = [];
  for (const [kind, spec] of Object.entries(settings.navLights) as Array<[string, { pos?: number[]; color?: string; blinkPeriod?: number; blinkOn?: number } | number]>) {
    if (!spec || typeof spec !== 'object' || !spec.pos) continue;
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 8, 6),
      new THREE.MeshBasicMaterial({ color: spec.color! }),
    );
    lamp.position.fromArray(position(spec.pos));
    ship.add(lamp);
    const halo = lightSprite(glowMap, spec.color!, 0.08, settings.navLights.intensity);
    halo.position.copy(lamp.position);
    halo.visible = false;
    ship.add(halo);
    navigation.push({ kind, lamp, halo, spec: spec as ShipNavLight['spec'] });
  }

  ship.userData = { engines, navigation, settings, pitch: 0, roll: 0, panels };
  return ship;
}

export function animateShip(ship: ShipGroup, flight: FlightState, dt: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
  const { engines, navigation, settings } = ship.userData;
  const motion = settings.motion;
  const bank = Math.max(-radians(motion.maxBankDeg), Math.min(radians(motion.maxBankDeg), -flight.turn * motion.bankPerTurnRate));
  ship.userData.roll += (bank - ship.userData.roll) * (1 - Math.exp(-dt / motion.bankTau));
  ship.userData.pitch += (flight.pitch - ship.userData.pitch) * (1 - Math.exp(-dt / motion.pitchTau));
  ship.position.y = Math.sin(flight.time * Math.PI * 2 / motion.bob.period) * motion.bob.amplitude;
  ship.rotation.set(
    ship.userData.pitch,
    -flight.yaw,
    ship.userData.roll + radians(motion.sway.amplitudeDeg) * Math.sin(flight.time * Math.PI * 2 / motion.sway.period),
    'YXZ',
  );
  const flicker = 1 + settings.engine.flickerAmp * Math.sin(flight.time * Math.PI * 2 * 2.3);
  const length = settings.engine.plumeLength[0] + Math.min(1, flight.speed / 11) * (settings.engine.plumeLength[1] - settings.engine.plumeLength[0]);
  for (const engine of engines) {
    engine.plume.scale.setScalar(length * 0.85 * flicker);
    engine.plume.position.z = engine.nozzle.position.z + length * 0.35;
    (engine.plume.material as THREE.SpriteMaterial).opacity = 0.55 * flicker;
    (engine.halo.material as THREE.SpriteMaterial).opacity = 0.6 * flicker;
    engine.halo.scale.setScalar(0.2 * flicker);
  }
  const unitsPerPixel = 2 * camera.position.length() * Math.tan(camera.fov * Math.PI / 360) / viewportHeight;
  for (const light of navigation) {
    const visible = light.kind !== 'tail' || flight.time % light.spec.blinkPeriod! < light.spec.blinkOn!;
    light.lamp.visible = visible;
    light.halo.visible = false;
    light.halo.scale.setScalar(Math.max(0.018, unitsPerPixel * settings.navLights.spriteSizePx));
  }
}
