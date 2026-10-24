import * as THREE from '../vendor/three/three.module.js';
import { random, hash } from './rng.js';
import { fractalNoise } from './noise.js';
import { weightedChoice } from './planet-data.js';
import * as shaders from './shaders.js';

export function glowTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot(x / 63 * 2 - 1, y / 63 * 2 - 1), index = (y * size + x) * 4;
    data[index] = data[index + 1] = data[index + 2] = 255; data[index + 3] = Math.round(Math.max(0, Math.exp(-r * r * 6) - Math.exp(-6)) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size); texture.needsUpdate = true;
  texture.magFilter = texture.minFilter = THREE.LinearFilter; return texture;
}

export function densityTexture(seed, mobile, settings) {
  const size = mobile ? 192 : 384, pixels = new Uint8Array(size * size * 4);
  const octaves = settings.octaves[mobile ? 'low' : 'high'];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * settings.filamentScale, v = y / size * settings.filamentScale;
    const warp = fractalNoise(u * 0.8, v * 0.8, 3, seed, 2);
    const density = fractalNoise(u + warp * 1.1, v * 1.3 - warp * 0.7, 7, seed, octaves);
    const fine = fractalNoise(u * 5, v * 5, 4, seed + 9, 2), index = (y * size + x) * 4;
    pixels[index] = Math.round(density * 255); pixels[index + 1] = Math.round(fine * 255); pixels[index + 2] = 255; pixels[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size); texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
}

function galaxyTexture(kind) {
  const size = 256, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / 255 * 2 - 1, v = y / 255 * 2 - 1, radius = Math.hypot(u, v);
    const angle = Math.atan2(v, u), arms = Math.pow(Math.cos(angle * 2 - radius * 12) * 0.5 + 0.5, 3);
    let density = Math.exp(-radius * radius * 6) * (0.12 + arms * 0.58) + Math.exp(-radius * radius * 75) * 0.9;
    if (kind === 'elliptical') density = Math.exp(-radius * radius * 10) * 0.75;
    if (kind === 'edgeOn') density = Math.exp(-u * u * 6 - v * v * 45) * (1 - Math.exp(-v * v * 900) * 0.65);
    const index = (y * size + x) * 4; pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
    pixels[index + 3] = Math.round(Math.min(1, density) * Math.max(0, 1 - radius * radius) ** 2 * 255);
  }
  const texture = new THREE.DataTexture(pixels, size, size); texture.needsUpdate = true;
  texture.magFilter = texture.minFilter = THREE.LinearFilter; return texture;
}

export function starMaterial(look, ratio, shell = false) {
  return new THREE.ShaderMaterial({ vertexShader: shaders.starVertex, fragmentShader: shaders.starFragment, transparent: true,
    depthWrite: false, depthTest: !shell, blending: THREE.AdditiveBlending,
    uniforms: { pixelRatio: { value: ratio }, shell: { value: Number(shell) }, palette: { value: look.REGIONS.tidepool.starTint.map((c) => new THREE.Color(c)) },
      fadeNear: { value: look.stars.field.fadeNear }, viewRadius: { value: look.stars.field.viewRadius } } });
}

export function starsGeometry(positions, sizes, tints, halos) {
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1)); geometry.setAttribute('tint', new THREE.Float32BufferAttribute(tints, 3));
  geometry.setAttribute('halo', new THREE.Float32BufferAttribute(halos, 1)); return geometry;
}

export class Sky {
  constructor(seed, look, mobile, ratio) {
    this.scene = new THREE.Scene(); this.look = look; this.galaxies = []; this.textures = [];
    const rng = random(hash(seed, 778)), settings = look.stars.shell;
    const tilt = (look.sky.bandTiltDeg + (rng() - 0.5) * look.sky.bandJitterDeg * 2) * Math.PI / 180;
    this.bandNormal = new THREE.Vector3(0.3, Math.cos(tilt), Math.sin(tilt)).normalize();
    this.material = new THREE.ShaderMaterial({ vertexShader: shaders.skyVertex, fragmentShader: shaders.skyFragment, depthTest: false, depthWrite: false,
      uniforms: { inverseProjection: { value: new THREE.Matrix4() }, cameraRotation: { value: new THREE.Matrix3() },
        baseColor: { value: new THREE.Color() }, horizonColor: { value: new THREE.Color() }, mistColor: { value: new THREE.Color() },
        bandNormal: { value: this.bandNormal }, bandOpacity: { value: look.sky.bandOpacity }, seedPhase: { value: seed % 997 },
        grain: { value: look.grade.grainAmount ?? look.sky.grainAmount }, vignette: { value: look.grade.vignette.amount }, softness: { value: look.grade.vignette.softness } } });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material); plane.frustumCulled = false; plane.renderOrder = -1000; this.scene.add(plane);
    const positions = [], sizes = [], tints = [], halos = [], direction = new THREE.Vector3();
    for (let i = 0; i < settings.count[mobile ? 'low' : 'high']; i++) {
      do {
        const angle = rng() * Math.PI * 2, height = rng() * 2 - 1, radius = Math.sqrt(1 - height * height);
        direction.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
      } while (rng() > (Math.abs(direction.dot(this.bandNormal)) < Math.sin(settings.bandWidthDeg * Math.PI / 180) ? 1 : 1 / settings.bandBoost));
      positions.push(...direction.clone().multiplyScalar(30000).toArray());
      const bright = rng() < 0.03, size = bright ? 2 + rng() * 1.5 : 0.9 + rng() * 0.3;
      sizes.push(size); tints.push(rng(), settings.brightness[0] + rng() ** 2 * (settings.brightness[1] - settings.brightness[0]), 0);
      halos.push(bright ? 8 + rng() * 6 : 0);
    }
    this.stars = new THREE.Points(starsGeometry(positions, sizes, tints, halos), starMaterial(look, ratio, true));
    this.stars.frustumCulled = false; this.stars.renderOrder = -900; this.scene.add(this.stars);
    const kinds = ['spiral', 'elliptical', 'edgeOn'];
    const textures = Object.fromEntries(kinds.map((kind) => [kind, galaxyTexture(kind)])); this.textures.push(...Object.values(textures));
    const count = look.galaxies.visible[0] + Math.floor(rng() * (look.galaxies.visible[1] - look.galaxies.visible[0] + 1));
    for (let i = 0; i < count + look.galaxies.hollowBonus; i++) {
      const kind = weightedChoice(Object.entries(look.galaxies.kinds), rng);
      const angle = (look.galaxies.angularSizeDeg[0] + rng() * (look.galaxies.angularSizeDeg[1] - look.galaxies.angularSizeDeg[0])) * Math.PI / 180;
      const material = new THREE.ShaderMaterial({ vertexShader: shaders.nebulaVertex, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
        uniforms: { map: { value: textures[kind] }, core: { value: new THREE.Color(look.galaxies.core[i % 2]) }, arms: { value: new THREE.Color(look.galaxies.arms[i % 3]) }, opacity: { value: 0.6 } },
        fragmentShader: 'uniform sampler2D map;uniform vec3 core;uniform vec3 arms;uniform float opacity;varying vec2 vUv;void main(){float r=length(vUv*2.0-1.0);gl_FragColor=vec4(mix(arms,core,exp(-r*r*35.0)),texture2D(map,vUv).a*opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
      const galaxy = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      const directions = [[-0.34, 0.22, -1], [0.30, 0.36, -1], [-0.48, -0.18, -1], [0.45, -0.23, -1], [0.08, 0.48, -1], [-0.7, 0.1, -1]];
      galaxy.userData.direction = new THREE.Vector3(...directions[i]).normalize().multiplyScalar(28000);
      galaxy.userData.bonus = i >= count; galaxy.userData.roll = rng() * Math.PI;
      galaxy.scale.setScalar(2 * Math.tan(angle / 2) * 28000); galaxy.frustumCulled = false; galaxy.renderOrder = -800;
      this.galaxies.push(galaxy); this.scene.add(galaxy);
    }
  }

  update(camera, palette, hollow) {
    this.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    this.material.uniforms.cameraRotation.value.setFromMatrix4(camera.matrixWorld);
    this.material.uniforms.baseColor.value.copy(palette.deep); this.material.uniforms.horizonColor.value.copy(palette.horizon); this.material.uniforms.mistColor.value.copy(palette.band);
    this.stars.position.copy(camera.position); this.stars.material.uniforms.palette.value = palette.stars;
    for (const galaxy of this.galaxies) {
      galaxy.position.copy(galaxy.userData.direction).add(camera.position); galaxy.quaternion.copy(camera.quaternion); galaxy.rotateZ(galaxy.userData.roll);
      galaxy.visible = !galaxy.userData.bonus || hollow > 0.5;
    }
  }
}
