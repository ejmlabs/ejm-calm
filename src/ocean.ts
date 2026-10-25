import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { makeNoise4D, fbm4 } from './noise.js';
import { hash } from './rng.js';
import type { ShelfMap } from './land.js';

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
  options: {
    textureSize?: number;
    waterColor?: number;
    shelves?: { near: ShelfMap; far: ShelfMap; light?: number };
    /** Horizon haze colour; scattered light lifts dark reflections toward it. */
    reflectionHaze?: THREE.Color;
    /**
     * Gain for dark reflected land. The land is drawn without tone mapping but
     * its reflection passes through the water's tone mapping, so it needs about
     * 1 / exposure to match.
     */
    reflectionGain?: number;
  } = {},
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
  if (material.uniforms?.distortionScale) material.uniforms.distortionScale.value = 4.2;
  // Slightly muted water so the far plane fades into fog without a bright seam.
  if (material.uniforms?.waterColor) material.uniforms.waterColor.value.set(0x1a4e68);
  if (material.uniforms?.alpha) material.uniforms.alpha.value = 1.0;
  if (material.uniforms?.sunColor) material.uniforms.sunColor.value.set(0xe8dcc0);

  const shelfTextures = applyWaterLook(material, options.shelves, options.reflectionHaze, options.reflectionGain ?? 1);

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
      for (const texture of shelfTextures) texture.dispose();
      (water.material as THREE.Material).dispose();
      const mirror = (water as unknown as { mirror?: THREE.WebGLRenderTarget }).mirror
        ?? (water.material as THREE.ShaderMaterial).uniforms?.mirrorSampler?.value;
      if (mirror && typeof (mirror as THREE.WebGLRenderTarget).dispose === 'function') {
        (mirror as THREE.WebGLRenderTarget).dispose();
      }
    },
  };
}

function shelfTexture(shelf: ShelfMap): THREE.DataTexture {
  const texture = new THREE.DataTexture(shelf.data, shelf.size, shelf.size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export type ShaderPatch = { find: string; replace: string };

/**
 * Applies every patch to a shader source, or returns null if any target text is
 * missing, so a three.js upgrade can never leave a half-patched shader.
 */
export function patchShader(source: string, patches: readonly ShaderPatch[]): string | null {
  let out = source;
  for (const patch of patches) {
    if (!out.includes(patch.find)) return null;
    out = out.replace(patch.find, () => patch.replace);
  }
  return out;
}

/** Calm, slightly rough water: reflections streak and lift toward the haze instead of mirroring dark land. */
const reflectionPatches: ShaderPatch[] = [
  {
    find: 'uniform vec3 waterColor;',
    replace: `uniform vec3 waterColor;
      uniform vec3 reflectionHaze;
      uniform float reflectionLift;
      uniform float reflectionGain;`,
  },
  {
    find: 'vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;',
    // Stretch the ripple vertically on screen, as wind lanes do to real reflections.
    replace: 'vec2 distortion = surfaceNormal.xz * ( 0.0016 + 1.3 / distance ) * distortionScale * vec2( 1.0, 1.7 );',
  },
  {
    find: 'vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );',
    replace: `vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );
      // Skylight scattered off the ripples lifts dark reflected land; bright sky stays as it is.
      float reflectionLuma = dot( reflectionSample, vec3( 0.2126, 0.7152, 0.0722 ) );
      float reflectionDark = 1.0 - smoothstep( 0.05, 0.6, reflectionLuma );
      reflectionSample *= mix( 1.0, reflectionGain, reflectionDark );
      reflectionSample = mix( reflectionSample, reflectionHaze * reflectionGain, reflectionLift * reflectionDark );`,
  },
];

/**
 * Depth-based colour: turquoise over sandy shelves, teal over the slope,
 * open-ocean blue beyond. Texel centres map to world via min + uv * extent.
 */
function shelfPatches(): ShaderPatch[] {
  return [
    {
      find: 'uniform vec3 waterColor;',
      replace: `uniform vec3 waterColor;
      uniform sampler2D shelfNear;
      uniform sampler2D shelfFar;
      uniform vec4 shelfNearBounds;
      uniform vec4 shelfFarBounds;
      uniform vec3 shallowColor;
      uniform vec3 shelfColor;
      uniform float shallowLight;`,
    },
    {
      find: 'vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;',
      replace: `vec2 nearUv = ( worldPosition.xz - shelfNearBounds.xy ) * shelfNearBounds.zw;
      vec2 farUv = ( worldPosition.xz - shelfFarBounds.xy ) * shelfFarBounds.zw;
      vec2 inside = step( vec2( 0.0 ), nearUv ) * step( nearUv, vec2( 1.0 ) );
      float shelf = mix( texture2D( shelfFar, farUv ).r, texture2D( shelfNear, nearUv ).r, inside.x * inside.y );
      float shallow = smoothstep( 0.45, 0.85, shelf );
      float slope = smoothstep( 0.45, 0.75, shelf );
      vec3 tint = mix( waterColor, shelfColor, slope );
      tint = mix( tint, shallowColor, shallow );
      vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * tint;`,
    },
    {
      find: 'vec3 outgoingLight = albedo;',
      replace: `// Light coming up through clear shallows, blended under the reflection (Fresnel):
      // strong where the view is steep, gone at grazing angles and with distance.
      float facing = mix( 0.12, 1.0, smoothstep( 0.004, 0.03, eyeDirection.y ) );
      float nearby = 1.0 - smoothstep( 500.0, 1500.0, distance );
      float shelfMix = ( shallow * 0.9 + slope * 0.25 ) * facing * nearby * ( 1.0 - reflectance * 0.6 );
      // HDR so the turquoise survives the scene's low exposure.
      vec3 under = mix( shelfColor, shallowColor, shallow ) * shallowLight * 2.4;
      albedo = mix( albedo, under, clamp( shelfMix, 0.0, 0.9 ) );
      vec3 outgoingLight = albedo;`,
    },
  ];
}

/**
 * Patches three's Water shader with reflection lift and (optionally) shelf tints.
 * All or nothing: if any patch misses (a changed three.js), development builds
 * throw and production keeps the stock water with a warning.
 */
function applyWaterLook(
  material: THREE.ShaderMaterial,
  shelves: { near: ShelfMap; far: ShelfMap; light?: number } | undefined,
  haze: THREE.Color | undefined,
  gain: number,
): THREE.DataTexture[] {
  const patched = patchShader(material.fragmentShader, [...reflectionPatches, ...(shelves ? shelfPatches() : [])]);
  if (patched === null) {
    const message = 'calm: Water shader did not match the expected source; using the stock water.';
    if (import.meta.env.DEV) throw new Error(message);
    console.warn(message);
    return [];
  }
  material.fragmentShader = patched;
  material.uniforms.reflectionHaze = { value: (haze ?? new THREE.Color(0x8a9aa4)).clone() };
  material.uniforms.reflectionLift = { value: 0.25 };
  material.uniforms.reflectionGain = { value: Number.isFinite(gain) ? Math.min(3, Math.max(1, gain)) : 1 };
  material.needsUpdate = true;
  if (!shelves) return [];

  const near = shelfTexture(shelves.near);
  const far = shelfTexture(shelves.far);
  const bounds = (shelf: ShelfMap) => {
    // Map world XZ onto texel centres.
    const texel = shelf.extent / (shelf.size - 1);
    const span = texel * shelf.size;
    return new THREE.Vector4(shelf.min - texel * 0.5, shelf.min - texel * 0.5, 1 / span, 1 / span);
  };
  material.uniforms.shelfNear = { value: near };
  material.uniforms.shelfFar = { value: far };
  material.uniforms.shelfNearBounds = { value: bounds(shelves.near) };
  material.uniforms.shelfFarBounds = { value: bounds(shelves.far) };
  material.uniforms.shallowColor = { value: new THREE.Color(0x58aaa0) };
  material.uniforms.shelfColor = { value: new THREE.Color(0x1d6f7c) };
  material.uniforms.shallowLight = { value: shelves.light ?? 1 };
  return [near, far];
}
