import * as THREE from '../vendor/three/three.module.js';
import * as shaders from './planet-shaders.js';
import { planetAppearance } from './planet-data.js';
import { recipeName, surfaceFbm } from './surface-recipe.js';
import { random } from './rng.js';

const kinds = ['rocky', 'ocean', 'gas', 'ice', 'ember'];
function lights() { return { lightPositions: { value: [new THREE.Vector3(), new THREE.Vector3()] }, lightColors: { value: [new THREE.Color(), new THREE.Color()] }, lightIntensity: { value: new THREE.Vector2(1, 0) } }; }
function ringTexture(seed, look) {
  const rng = random(seed + 51), spec = look.realism.rings, width = spec.radialTexture, data = new Uint8Array(width * 4);
  const count = Math.floor(spec.gaps.count[0] + rng() * (spec.gaps.count[1] - spec.gaps.count[0] + 1));
  const gaps = Array.from({ length: count }, () => ({ center: 0.12 + rng() * 0.76, width: spec.gaps.width[0] + rng() * (spec.gaps.width[1] - spec.gaps.width[0]) }));
  for (let i = 0; i < width; i++) {
    const t = i / (width - 1), noise = surfaceFbm(t * spec.densityNoise.frequency, 0, 0, seed, spec.densityNoise.octaves);
    let tau = spec.opticalDepth[0] + noise * (spec.opticalDepth[1] - spec.opticalDepth[0]);
    for (const gap of gaps) {
      const distance = Math.abs(t - gap.center), fade = THREE.MathUtils.smoothstep(distance, gap.width * 0.35, gap.width * 0.7);
      tau *= spec.gaps.density + (1 - spec.gaps.density) * fade;
    }
    tau *= THREE.MathUtils.smoothstep(t, 0, 0.05) * (1 - THREE.MathUtils.smoothstep(t, 0.92, 1));
    data[i * 4] = Math.round(tau / 1.4 * 255); data[i * 4 + 1] = Math.round(noise * 255);
    data[i * 4 + 2] = Math.round(surfaceFbm(t * 7, 2, 0, seed + 3, 2) * 255); data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  // Height-1 data textures break under mipmapping on SwiftShader; keep a single level.
  texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false; texture.needsUpdate = true; texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace; texture.unpackAlignment = 1;
  return texture;
}
function surface(data, look, geometry, bakes, tier, moon = false, ringMap) {
  const name = recipeName(data.type), spec = look.realism.planets[name], atmosphere = look.realism.atmosphere;
  const bake = bakes.planet(data, { moon });
  const uniforms = { ...lights(), albedoMap: { value: bake.albedo }, surfaceMap: { value: bake.surface }, normalMap: { value: bake.normals }, ringMap: { value: ringMap ?? bake.surface },
    ready: { value: 0 }, kind: { value: kinds.indexOf(data.type) }, normalTaps: { value: look.realism.planets.normals.tapsByTier[tier] }, texel: { value: new THREE.Vector2(1 / bake.width, 1 / bake.height) }, relief: { value: spec.reliefStrength * 1.55 },
    radius: { value: data.radius }, fallbackColor: { value: new THREE.Color(data.palette[0]) }, ambient: { value: new THREE.Color().setScalar(look.realism.planets.nightSide.ambient) }, atmosphere: { value: new THREE.Color(atmosphere.rayleigh[name]) }, atmosphereDensity: { value: moon ? 0 : atmosphere.density[name] },
    sunsetWidth: { value: look.realism.planets.terminator.sunsetBand.width }, sunsetColor: { value: new THREE.Color(look.realism.planets.terminator.sunsetBand.color) }, sunsetStrength: { value: look.realism.planets.terminator.sunsetBand.strength },
    softness: { value: look.realism.planets.terminator.softness }, limbDarkening: { value: spec.limbDarkening ?? 0 }, emissionStrength: { value: spec.seams?.hdrIntensity ?? 0 },
    glintRoughness: { value: spec.glint?.roughness ?? 0.3 }, glintStrength: { value: spec.glint?.strength ?? 0.4 }, time: { value: 0 }, ringActive: { value: 0 }, ringBounds: { value: new THREE.Vector2() },
    surfaceToRing: { value: new THREE.Matrix3() }, ringLights: { value: [new THREE.Vector3(), new THREE.Vector3()] }, parentSphere: { value: new THREE.Vector4() }, moon: { value: Number(moon) } };
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ vertexShader: shaders.surfaceVertex, fragmentShader: shaders.surfaceFragment, uniforms }));
  mesh.scale.setScalar(data.radius); mesh.userData.bake = bake; return mesh;
}

export function createPlanet(data, look, geometry, mobile, debugType, bakes, tier = mobile ? 'low' : 'high') {
  const appearance = debugType ? { ...data, ...planetAppearance(data.seed, [1, 0, 0], look.planets, debugType) } : data;
  const group = new THREE.Group(), texture = appearance.rings ? ringTexture(data.seed, look) : null;
  const body = surface(appearance, look, geometry, bakes, tier, false, texture); body.rotation.z = data.tilt; group.add(body);
  const name = recipeName(appearance.type), atmo = look.realism.atmosphere;
  const atmosphere = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ vertexShader: shaders.surfaceVertex, fragmentShader: shaders.atmosphereFragment,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...lights(), tint: { value: new THREE.Color(atmo.rayleigh[name]) }, thickness: { value: atmo.thickness[name] }, density: { value: atmo.density[name] },
      exponent: { value: atmo.limbExponent }, scatterG: { value: atmo.forwardScatterG }, backlitBoost: { value: atmo.backlitBoost } } }));
  atmosphere.scale.setScalar(data.radius * (1 + atmo.thickness[name])); group.add(atmosphere);
  let cloud;
  if (appearance.type === 'ocean') {
    cloud = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ vertexShader: shaders.surfaceVertex, fragmentShader: shaders.cloudFragment, transparent: true, depthWrite: false,
      uniforms: { ...lights(), surfaceMap: { value: body.userData.bake.surface }, ready: { value: 0 }, time: { value: 0 } } }));
    cloud.scale.setScalar(data.radius * 1.006); cloud.renderOrder = 1; group.add(cloud);
  }
  const moons = appearance.moons.map((moon) => {
    const moonData = { ...moon, radius: moon.radius * data.radius, type: 'rocky', palette: look.planets.moons.palette };
    const mesh = surface(moonData, look, geometry, bakes, tier, true); mesh.renderOrder = 0; group.add(mesh); return { data: moon, mesh };
  });
  let ring;
  if (appearance.rings) {
    const spec = appearance.ring, settings = look.realism.rings;
    ring = new THREE.Mesh(new THREE.RingGeometry(data.radius * spec.inner, data.radius * spec.outer, mobile ? 160 : 256, 1), new THREE.ShaderMaterial({
      vertexShader: shaders.ringVertex, fragmentShader: shaders.ringFragment, side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: true,
      uniforms: { ...lights(), densityMap: { value: texture }, colors: { value: settings.particleColor.map((c) => new THREE.Color(c)) }, bounds: { value: new THREE.Vector2(data.radius * spec.inner, data.radius * spec.outer) },
        radius: { value: data.radius }, scatterG: { value: settings.forwardScatterG }, backlitBoost: { value: settings.backlitBoost }, localLights: { value: [new THREE.Vector3(), new THREE.Vector3()] } } }));
    ring.rotation.set(-Math.PI / 2 + spec.tilt, data.tilt * 0.4, data.tilt + 0.15); ring.renderOrder = 2; ring.frustumCulled = false; group.add(ring);
    body.material.uniforms.ringActive.value = 1; body.material.uniforms.ringBounds.value.set(spec.inner, spec.outer);
  }
  atmosphere.renderOrder = 1;
  group.userData.planet = { data, appearance, surface: body, atmosphere, ring, moons, cloud, bakes, ringMap: texture,
    inverseRing: new THREE.Quaternion(), rotation: new THREE.Matrix4(), quaternion: new THREE.Quaternion(), parent: new THREE.Vector3() };
  return group;
}

function setLights(material, lightView, palette, starLights) {
  const uniforms = material.uniforms;
  if (starLights) {
    for (let i = 0; i < 2; i++) { const star = starLights[i]; uniforms.lightPositions.value[i].copy(star?.viewPosition ?? lightView); uniforms.lightColors.value[i].copy(star?.color ?? palette.key); }
    uniforms.lightIntensity.value.set(starLights[0]?.intensity ?? 0, starLights[1]?.intensity ?? 0);
  } else {
    uniforms.lightPositions.value[0].copy(lightView).multiplyScalar(1e6); uniforms.lightColors.value[0].copy(palette.key); uniforms.lightIntensity.value.set(1, 0);
  }
  if (uniforms.ambient) {
    const floor = lookNightAmbient(palette);
    uniforms.ambient.value.copy(palette.fill).multiplyScalar(floor);
  }
}

function lookNightAmbient(palette) {
  // palette.camera is the THREE camera; night floor rides on the fill color from the caller.
  return palette.nightAmbient ?? 0.03;
}

export function updatePlanet(group, time, lightWorld, lightView, palette, starLights) {
  const record = group.userData.planet, { data, appearance, surface, atmosphere, ring, moons, cloud, inverseRing, rotation, quaternion } = record;
  surface.rotation.y = time * Math.PI * 2 / appearance.spinPeriod;
  record.parent.copy(group.position).applyMatrix4(group.parent.matrixWorld).applyMatrix4(palette.camera.matrixWorldInverse);
  for (const mesh of [surface, atmosphere, cloud, ...moons.map((moon) => moon.mesh)]) if (mesh) {
    setLights(mesh.material, lightView, palette, starLights);
    if (mesh.material.uniforms.ready) mesh.material.uniforms.ready.value = mesh.userData.bake?.ready || (mesh === cloud && surface.userData.bake.ready) ? 1 : 0;
    if (mesh.material.uniforms.time) mesh.material.uniforms.time.value = time;
  }
  if (ring) {
    setLights(ring.material, lightView, palette, starLights); inverseRing.copy(ring.quaternion).invert();
    for (let i = 0; i < 2; i++) {
      const direction = starLights?.[i]?.direction ?? lightWorld;
      ring.material.uniforms.localLights.value[i].copy(direction).applyQuaternion(inverseRing);
      surface.material.uniforms.ringLights.value[i].copy(ring.material.uniforms.localLights.value[i]);
    }
    quaternion.copy(inverseRing).multiply(surface.quaternion); rotation.makeRotationFromQuaternion(quaternion); surface.material.uniforms.surfaceToRing.value.setFromMatrix4(rotation);
  }
  for (const { data: moon, mesh } of moons) {
    const angle = moon.phase + time * Math.PI * 2 / moon.period, orbit = moon.orbit * data.radius;
    mesh.position.set(Math.cos(angle) * orbit, Math.sin(angle) * orbit * Math.sin(moon.tilt), Math.sin(angle) * orbit * Math.cos(moon.tilt));
    mesh.rotation.set(0.1, angle + Math.PI / 2, moon.tilt); mesh.material.uniforms.parentSphere.value.set(record.parent.x, record.parent.y, record.parent.z, data.radius);
  }
}

export function disposePlanet(group) {
  const record = group.userData.planet; if (!record) return;
  for (const mesh of [record.surface, ...record.moons.map((moon) => moon.mesh)]) record.bakes.cancel(mesh.userData.bake);
  record.ringMap?.dispose();
}
