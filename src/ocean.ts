import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { makeNoise4D, fbm4 } from './noise.js';
import { hash } from './rng.js';

export type OceanHandle = {
  water: Water;
  mesh: THREE.Mesh;
  update: (dt: number, sunDirection: THREE.Vector3) => void;
  setSize: (textureSize: number) => void;
  dispose: () => void;
};

/** Seamless tiling normals via 4D simplex on a torus; heights first, then wrapped central differences. */
function buildWaterNormals(seed: number, size = 256): THREE.DataTexture {
  const base = makeNoise4D(hash(seed, 'water-normals'), 0);
  const detail = makeNoise4D(hash(seed, 'water-detail'), 1);
  const heights = new Float32Array(size * size);
  const twoPi = Math.PI * 2;
  const R = 1.5;
  const Rd = 3.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const nx = Math.cos(u * twoPi) * R;
      const ny = Math.sin(u * twoPi) * R;
      const nz = Math.cos(v * twoPi) * R;
      const nw = Math.sin(v * twoPi) * R;
      const dx = Math.cos(u * twoPi) * Rd;
      const dy = Math.sin(u * twoPi) * Rd;
      const dz = Math.cos(v * twoPi) * Rd;
      const dw = Math.sin(v * twoPi) * Rd;
      const h =
        fbm4(base, nx, ny, nz, nw, 5) * 0.72 +
        fbm4(detail, dx, dy, dz, dw, 4) * 0.28;
      heights[y * size + x] = h;
    }
  }

  const data = new Uint8Array(size * size * 4);
  const slope = 1.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = heights[y * size + ((x - 1 + size) % size)]!;
      const hR = heights[y * size + ((x + 1) % size)]!;
      const hD = heights[((y - 1 + size) % size) * size + x]!;
      const hU = heights[((y + 1) % size) * size + x]!;
      let nx = (hL - hR) * slope;
      let ny = (hD - hU) * slope;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      data[i] = Math.floor((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function createOcean(
  seed: number,
  sunDirection: THREE.Vector3,
  options: { textureSize?: number; waterColor?: number } = {},
): OceanHandle {
  const textureSize = options.textureSize ?? 256;
  const normalSize = textureSize >= 512 ? 512 : 256;
  const normals = buildWaterNormals(seed, normalSize);

  const geometry = new THREE.PlaneGeometry(20000, 20000);
  const water = new Water(geometry, {
    textureWidth: textureSize,
    textureHeight: textureSize,
    waterNormals: normals,
    sunDirection: sunDirection.clone(),
    sunColor: 0xd4c8a8,
    waterColor: options.waterColor ?? 0x163e54,
    distortionScale: 2.6,
    fog: true,
    alpha: 1,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;

  const material = water.material as THREE.ShaderMaterial;
  if (material.uniforms?.size) material.uniforms.size.value = 1.2;
  if (material.uniforms?.distortionScale) material.uniforms.distortionScale.value = 3.2;
  // Slightly muted water so the far plane fades into fog without a bright seam.
  if (material.uniforms?.waterColor) material.uniforms.waterColor.value.set(0x1a4e68);
  if (material.uniforms?.alpha) material.uniforms.alpha.value = 1.0;
  if (material.uniforms?.sunColor) material.uniforms.sunColor.value.set(0xe8dcc0);

  let time = 0;
  return {
    water,
    mesh: water,
    update(dt: number, sun: THREE.Vector3) {
      time += dt;
      const uniforms = (water.material as THREE.ShaderMaterial).uniforms;
      if (uniforms.time) uniforms.time.value = time * 0.35;
      if (uniforms.sunDirection) uniforms.sunDirection.value.copy(sun).normalize();
    },
    setSize(_textureSize: number) {
      // Water render target size is fixed at construction; quality changes adjust DPR instead.
    },
    dispose() {
      geometry.dispose();
      normals.dispose();
      (water.material as THREE.Material).dispose();
      const mirror = (water as unknown as { mirror?: THREE.WebGLRenderTarget }).mirror
        ?? (water.material as THREE.ShaderMaterial).uniforms?.mirrorSampler?.value;
      if (mirror && typeof (mirror as THREE.WebGLRenderTarget).dispose === 'function') {
        (mirror as THREE.WebGLRenderTarget).dispose();
      }
    },
  };
}
