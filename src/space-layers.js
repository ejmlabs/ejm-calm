import * as THREE from '../vendor/three/three.module.js';
import { random, hash } from './rng.js';
import { fractalNoise } from './noise.js';
import { GalaxySky } from './galaxies.js';
import * as shaders from './shaders.js';
import * as starShaders from './star-shaders.js';
import { sampleStar, sampleMagnitude, magnitudeFlux, blackbodyColor } from './astrophysics.js';

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

export function starMaterial(look, ratio, shell = false) {
  const psf = look.realism.starPsf;
  return new THREE.ShaderMaterial({ vertexShader: starShaders.vertex, fragmentShader: starShaders.fragment, transparent: true,
    depthWrite: false, depthTest: !shell, blending: THREE.AdditiveBlending,
    uniforms: { pixelRatio: { value: ratio }, shell: { value: Number(shell) }, palette: { value: look.REGIONS.tidepool.starTint.map((c) => new THREE.Color(c)) },
      fadeNear: { value: look.stars.field.fadeNear }, viewRadius: { value: look.stars.field.viewRadius },
      referenceDistance: { value: look.realism.lighting.illuminance.referenceDistance * 0.01 }, minFlux: { value: magnitudeFlux(look.realism.magnitudes.range[1]) },
      peak: { value: psf.hdrPeak }, regionTint: { value: new THREE.Color(1, 1, 1) },
      coreSigma: { value: psf.coreSigmaPx * 0.9 }, haloFrom: { value: psf.halo.fromMagnitude }, haloRadius: { value: new THREE.Vector2(psf.halo.radiusPx[0] * 0.45, psf.halo.radiusPx[1] * 0.5) },
      haloPeak: { value: psf.halo.peak * 0.55 }, glareFrom: { value: psf.glare.fromMagnitude }, glareRadius: { value: psf.glare.radiusPx * 0.45 }, glarePeak: { value: psf.glare.peak * 0.5 } } });
}

export function starsGeometry(positions, sizes, tints, halos, physical = {}) {
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1)); geometry.setAttribute('tint', new THREE.Float32BufferAttribute(tints, 3));
  geometry.setAttribute('halo', new THREE.Float32BufferAttribute(halos, 1));
  geometry.setAttribute('stellarColor', new THREE.Float32BufferAttribute(physical.colors ?? positions.map(() => 1), 3));
  geometry.setAttribute('flux', new THREE.Float32BufferAttribute(physical.fluxes ?? sizes.map(() => 0.1), 1)); return geometry;
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
        grain: { value: 0 }, vignette: { value: 0 }, softness: { value: look.grade.vignette.softness },
        bandGlow: { value: new THREE.Color().setRGB(...blackbodyColor(4500)) } } });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material); plane.frustumCulled = false; plane.renderOrder = -1000; this.scene.add(plane);
    const positions = [], sizes = [], tints = [], halos = [], colors = [], fluxes = [], direction = new THREE.Vector3();
    for (let i = 0; i < look.realism.magnitudes.countByTier.high; i++) {
      do {
        const angle = rng() * Math.PI * 2, height = rng() * 2 - 1, radius = Math.sqrt(1 - height * height);
        direction.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
      } while (rng() > (Math.abs(direction.dot(this.bandNormal)) < Math.sin(settings.bandWidthDeg * Math.PI / 180) ? 1 : 1 / settings.bandBoost));
      positions.push(...direction.clone().multiplyScalar(30000).toArray());
      const stellar = sampleStar(rng, 'apparent'), magnitude = sampleMagnitude(rng);
      sizes.push(1); tints.push(0, 1, 0); halos.push(0); colors.push(...stellar.color); fluxes.push(magnitudeFlux(magnitude));
    }
    const order = fluxes.map((_, index) => index).sort((a, b) => fluxes[b] - fluxes[a]);
    const sorted = (values, stride) => order.flatMap((index) => values.slice(index * stride, (index + 1) * stride));
    this.stars = new THREE.Points(starsGeometry(sorted(positions, 3), sorted(sizes, 1), sorted(tints, 3), sorted(halos, 1), { colors: sorted(colors, 3), fluxes: sorted(fluxes, 1) }), starMaterial(look, ratio, true));
    this.stars.frustumCulled = false; this.stars.renderOrder = -900; this.scene.add(this.stars);
    this.catalog = new GalaxySky(this.scene, seed, look);
  }

  update(camera, palette, hollow, dt = 0) {
    this.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    this.material.uniforms.cameraRotation.value.setFromMatrix4(camera.matrixWorld);
    this.material.uniforms.baseColor.value.copy(palette.deep); this.material.uniforms.horizonColor.value.copy(palette.horizon); this.material.uniforms.mistColor.value.copy(palette.band);
    this.stars.position.copy(camera.position); this.stars.material.uniforms.palette.value = palette.stars;
    this.stars.material.uniforms.regionTint.value.copy(palette.stars[0]);
    this.catalog.update(camera, hollow, dt);
  }
}
