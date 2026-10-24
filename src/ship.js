import * as THREE from '../vendor/three/three.module.js';
import art from './look.js';
import { panelMaterial } from './ship-materials.js';

const radians = (value) => value * Math.PI / 180;
const position = ([x, y, z]) => [x, y, -z];

function extruded(outline, thickness) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1, curveSegments: 1 });
}

function lightSprite(map, tint, size, opacity) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: tint, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sprite.scale.setScalar(size); return sprite;
}

export function createShip(settings, glow, mobile, physical = art.realism, tier = mobile ? 'low' : 'high') {
  const ship = new THREE.Group();
  const materials = physical.shipMaterials;
  const hull = panelMaterial(materials.hull, materials.panelLines);
  const panels = panelMaterial({ color: materials.graphite.color, metalness: materials.graphite.metalness, roughness: materials.graphite.roughness, anisotropy: materials.graphite.anisotropy[tier] }, materials.panelLines);
  const accent = new THREE.MeshPhysicalMaterial(materials.copper);
  const profile = [...settings.hull.profile].reverse().map(([z, radius]) => new THREE.Vector2(radius, z));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, settings.hull.segments[mobile ? 'low' : 'high']), hull);
  body.name = 'hull'; body.rotation.x = -Math.PI / 2; body.scale.set(settings.hull.squash[0], 1, settings.hull.squash[1]); ship.add(body);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(settings.hull.profile.at(-1)[1], 20), panels);
  cap.scale.y = settings.hull.squash[1]; cap.position.z = -settings.hull.profile.at(-1)[0]; ship.add(cap);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), panels);
  belly.scale.set(0.082, 0.045, 0.35); belly.position.set(0, -0.038, 0.08); ship.add(belly);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshPhysicalMaterial({
    color: materials.canopy.color, roughness: materials.canopy.roughness, metalness: materials.canopy.metalness, clearcoat: materials.canopy.clearcoat,
    emissive: materials.canopy.interiorGlow, emissiveIntensity: materials.canopy.interiorIntensity,
  }));
  canopy.scale.fromArray(settings.canopy.size); canopy.position.fromArray(position(settings.canopy.center)); ship.add(canopy);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.105, settings.accent.stripeZ[1] - settings.accent.stripeZ[0], 24, 1, true), accent);
  band.rotation.x = Math.PI / 2; band.scale.z = settings.hull.squash[1]; band.position.z = -(settings.accent.stripeZ[0] + settings.accent.stripeZ[1]) / 2; ship.add(band);
  const wingGeometry = extruded(settings.wings.outline, settings.wings.thickness);
  const engines = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeometry, panels); wing.name = side > 0 ? 'wing-right' : 'wing-left';
    wing.rotation.set(-Math.PI / 2, 0, side * radians(settings.wings.dihedralDeg), 'ZYX'); wing.scale.x = side; wing.position.y = settings.wings.y; ship.add(wing);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.09), accent);
    stripe.position.set(side * 0.455, settings.wings.y + Math.sin(radians(settings.wings.dihedralDeg)) * 0.455 + 0.01, 0.33); ship.add(stripe);
    const pods = settings.nacelles, length = pods.z[1] - pods.z[0];
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(pods.radius * 0.85, pods.radius, length, mobile ? 10 : 16), panels);
    engine.rotation.x = Math.PI / 2; engine.position.set(side * pods.x, pods.y, -(pods.z[0] + pods.z[1]) / 2); ship.add(engine);
    const nozzle = new THREE.Mesh(new THREE.CircleGeometry(settings.engine.nozzleRadius, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(materials.engine.core).multiplyScalar(materials.engine.hdrIntensity), transparent: true, opacity: 0.85 }));
    nozzle.position.set(side * pods.x, pods.y, -pods.z[0] + 0.001); ship.add(nozzle);
    const plumeGeometry = new THREE.ConeGeometry(settings.engine.nozzleRadius, 1, 16, 1, true);
    const plume = new THREE.Mesh(plumeGeometry, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { core: { value: new THREE.Color(materials.engine.core).multiplyScalar(materials.engine.hdrIntensity) }, outer: { value: new THREE.Color(materials.engine.outer).multiplyScalar(materials.engine.hdrIntensity) }, intensity: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 core;uniform vec3 outer;uniform float intensity;varying vec2 vUv;void main(){float a=pow(1.0-vUv.y,1.8)*0.6;gl_FragColor=vec4(mix(outer,core,1.0-vUv.y),a*intensity);\n#include <colorspace_fragment>\n}',
    }));
    plume.rotation.x = Math.PI / 2; plume.scale.y = settings.engine.plumeLength[0];
    plume.position.set(side * pods.x, pods.y, -pods.z[0] + settings.engine.plumeLength[0] / 2); ship.add(plume);
    const halo = lightSprite(glow, settings.engine.outer, 0.17, 0.55);
    halo.position.copy(nozzle.position); halo.visible = false; ship.add(halo); engines.push({ plume, halo, nozzle });
  }
  const finGeometry = extruded(settings.fin.outline, settings.fin.thickness);
  finGeometry.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)));
  const fin = new THREE.Mesh(finGeometry, hull);
  // Shape coordinates are [height, longitudinal position]; extrusion is the thin X axis.
  fin.position.x = settings.fin.thickness / 2; ship.add(fin);
  const navigation = [];
  for (const [kind, spec] of Object.entries(settings.navLights)) {
    if (!spec.pos) continue;
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.color).multiplyScalar(materials.navLights.hdrIntensity) });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), material); lamp.position.fromArray(position(spec.pos)); ship.add(lamp);
    const halo = lightSprite(glow, spec.color, 0.08, settings.navLights.intensity); halo.position.copy(lamp.position); ship.add(halo);
    halo.visible = false; navigation.push({ kind, lamp, halo, spec });
  }
  ship.userData = { engines, navigation, settings, pitch: 0, roll: 0, panels };
  return ship;
}

export function animateShip(ship, flight, dt, camera, viewportHeight) {
  const { engines, navigation, settings } = ship.userData, motion = settings.motion;
  const bank = Math.max(-radians(motion.maxBankDeg), Math.min(radians(motion.maxBankDeg), -flight.turn * motion.bankPerTurnRate));
  ship.userData.roll += (bank - ship.userData.roll) * (1 - Math.exp(-dt / motion.bankTau));
  ship.userData.pitch += (flight.pitch - ship.userData.pitch) * (1 - Math.exp(-dt / motion.pitchTau));
  ship.position.y = Math.sin(flight.time * Math.PI * 2 / motion.bob.period) * motion.bob.amplitude;
  ship.rotation.set(ship.userData.pitch, -flight.yaw, ship.userData.roll + radians(motion.sway.amplitudeDeg) * Math.sin(flight.time * Math.PI * 2 / motion.sway.period), 'YXZ');
  const flicker = 1 + settings.engine.flickerAmp * Math.sin(flight.time * Math.PI * 2 * 2.3);
  for (const engine of engines) {
    const length = settings.engine.plumeLength[0] + Math.min(1, flight.speed / 11) * (settings.engine.plumeLength[1] - settings.engine.plumeLength[0]);
    engine.plume.scale.y = length * flicker; engine.plume.position.z = engine.nozzle.position.z + length / 2;
    engine.plume.material.uniforms.intensity.value = flicker; engine.halo.material.opacity = 0.5 * flicker;
  }
  const unitsPerPixel = 2 * camera.position.length() * Math.tan(camera.fov * Math.PI / 360) / viewportHeight;
  for (const light of navigation) {
    const visible = light.kind !== 'tail' || flight.time % light.spec.blinkPeriod < light.spec.blinkOn;
    light.lamp.visible = visible; light.halo.visible = false;
    light.halo.scale.setScalar(Math.max(0.018, unitsPerPixel * settings.navLights.spriteSizePx));
  }
}
