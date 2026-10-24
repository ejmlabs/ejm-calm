import * as THREE from '../vendor/three/three.module.js';
import * as shaders from './shaders.js';
import { planetAppearance } from './planet-data.js';

const kinds = ['rocky', 'ocean', 'gas', 'ice', 'ember'];
function surfaceUniforms(data, look) {
  return { colors: { value: data.palette.map((n) => new THREE.Color(n)) }, atmosphere: { value: new THREE.Color(data.atmosphere?.color ?? '#000000') },
    atmosphereIntensity: { value: data.atmosphere?.intensity ?? 0 }, phase: { value: data.phase }, bands: { value: data.bands },
    turbulence: { value: data.turbulence }, kind: { value: kinds.indexOf(data.type) }, nightSide: { value: look.planets.nightSide },
    terminator: { value: look.planets.terminatorSoftness }, emissive: { value: data.emissive },
    lightDirection: { value: new THREE.Vector3() }, keyColor: { value: new THREE.Color() }, fillColor: { value: new THREE.Color() },
    ringActive: { value: 0 }, ringBounds: { value: new THREE.Vector2() }, surfaceToRing: { value: new THREE.Matrix3() }, ringLight: { value: new THREE.Vector3() } };
}

export function createPlanet(data, look, geometry, mobile, debugType) {
  const appearance = debugType ? planetAppearance(data.seed, [1, 0, 0], look.planets, debugType) : data;
  const group = new THREE.Group(), uniforms = surfaceUniforms(appearance, look);
  const surface = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ vertexShader: shaders.planetVertex, fragmentShader: shaders.planetFragment, uniforms }));
  surface.scale.setScalar(data.radius); surface.rotation.z = data.tilt; group.add(surface);
  const atmosphere = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ vertexShader: shaders.planetVertex, fragmentShader: shaders.atmosphereFragment,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color(appearance.atmosphere.color) }, lightDirection: { value: new THREE.Vector3() },
      thickness: { value: appearance.atmosphere.thickness }, intensity: { value: appearance.atmosphere.intensity } } }));
  atmosphere.scale.setScalar(data.radius * (1 + appearance.atmosphere.thickness)); group.add(atmosphere);
  let ring;
  if (appearance.rings) {
    const spec = appearance.ring, settings = look.planets.rings;
    ring = new THREE.Mesh(new THREE.RingGeometry(data.radius * spec.inner, data.radius * spec.outer, mobile ? 128 : 192), new THREE.ShaderMaterial({
      vertexShader: shaders.ringVertex, fragmentShader: shaders.ringFragment, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      uniforms: { colors: { value: settings.palette.map((value) => new THREE.Color(value)) }, innerRadius: { value: data.radius * spec.inner },
        outerRadius: { value: data.radius * spec.outer }, opacity: { value: spec.opacity }, bands: { value: spec.bands }, phase: { value: spec.phase },
        gaps: { value: new THREE.Vector2(...spec.gaps) }, localLight: { value: new THREE.Vector3() }, planetRadius: { value: data.radius }, shadows: { value: !mobile && settings.shadow ? 1 : 0 } },
    }));
    ring.rotation.set(-Math.PI / 2 + spec.tilt, data.tilt * 0.4, data.tilt + 0.15); group.add(ring);
    uniforms.ringActive.value = !mobile && settings.shadow ? 1 : 0; uniforms.ringBounds.value.set(spec.inner, spec.outer);
  }
  let moons;
  if (appearance.moons.length) {
    const moonData = { type: 'rocky', palette: look.planets.moons.palette, phase: data.phase + 20, bands: 0, turbulence: 0, emissive: 0 };
    moons = new THREE.InstancedMesh(geometry, new THREE.ShaderMaterial({ vertexShader: shaders.planetVertex, fragmentShader: shaders.planetFragment, uniforms: surfaceUniforms(moonData, look) }), appearance.moons.length);
    moons.frustumCulled = false; group.add(moons);
  }
  group.userData.planet = { data, appearance, surface, atmosphere, ring, moons, dummy: new THREE.Object3D(), inverseRing: new THREE.Quaternion(), rotation: new THREE.Matrix4(), quaternion: new THREE.Quaternion() };
  return group;
}

export function updatePlanet(group, time, lightWorld, lightView, palette) {
  const { data, appearance, surface, atmosphere, ring, moons, dummy, inverseRing, rotation, quaternion } = group.userData.planet;
  surface.rotation.y = time * Math.PI * 2 / appearance.spinPeriod;
  for (const material of [surface.material, atmosphere.material, moons?.material]) if (material) {
    material.uniforms.lightDirection.value.copy(lightView);
    if (material.uniforms.keyColor) { material.uniforms.keyColor.value.copy(palette.key); material.uniforms.fillColor.value.copy(palette.fill); }
  }
  if (ring) {
    inverseRing.copy(ring.quaternion).invert(); ring.material.uniforms.localLight.value.copy(lightWorld).applyQuaternion(inverseRing);
    surface.material.uniforms.ringLight.value.copy(ring.material.uniforms.localLight.value);
    quaternion.copy(inverseRing).multiply(surface.quaternion); rotation.makeRotationFromQuaternion(quaternion);
    surface.material.uniforms.surfaceToRing.value.setFromMatrix4(rotation);
  }
  if (moons) {
    appearance.moons.forEach((moon, index) => {
      const angle = moon.phase + time * Math.PI * 2 / moon.period, orbit = moon.orbit * data.radius;
      dummy.position.set(Math.cos(angle) * orbit, Math.sin(angle) * orbit * Math.sin(moon.tilt), Math.sin(angle) * orbit * Math.cos(moon.tilt));
      dummy.rotation.set(0.1, angle, moon.tilt); dummy.scale.setScalar(data.radius * moon.radius); dummy.updateMatrix(); moons.setMatrixAt(index, dummy.matrix);
    }); moons.instanceMatrix.needsUpdate = true;
  }
}
