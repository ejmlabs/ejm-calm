import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { makeNoise4D, fbm4 } from './noise.js';
import { hash } from './rng.js';
import type { ShelfMap } from './land.js';

export type OceanHandle = {
  water: Water;
  mesh: THREE.Mesh;
  /** With a camera, the plane follows it (render space) while ripples stay fixed to the world. */
  update: (dt: number, sunDirection: THREE.Vector3, camera?: THREE.Camera) => void;
  /** World X/Z of render (0, 0); keeps ripples and shelf maps on the world after a recentre. */
  setOrigin: (x: number, z: number) => void;
  /** Swaps in shelf maps baked elsewhere in the world (maps are in world coordinates). */
  setShelves: (shelves: { near?: ShelfMap; far?: ShelfMap }) => void;
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
  const maps = { near: options.shelves?.near, far: options.shelves?.far };
  const origin = { x: 0, z: 0 };

  function place(): void {
    const uniforms = material.uniforms;
    // Ripple texture offsets for the origin, reduced to their period in float64 so the GPU never sees large numbers.
    const size = uniforms.size?.value ?? 1;
    const fract = (v: number) => v - Math.floor(v);
    const ox = origin.x * size;
    const oz = origin.z * size;
    uniforms.rippleShiftA?.value.set(fract(ox / 103), fract(oz / 103), fract(ox / 107), fract(oz / 107));
    uniforms.rippleShiftB?.value.set(fract(ox / 8907), fract(oz / 9803), fract(ox / 1091), fract(oz / 1027));
    if (maps.near && uniforms.shelfNearBounds) uniforms.shelfNearBounds.value.copy(shelfBounds(maps.near, origin));
    if (maps.far && uniforms.shelfFarBounds) uniforms.shelfFarBounds.value.copy(shelfBounds(maps.far, origin));
  }
  place();

  let time = 0;
  return {
    water,
    mesh: water,
    update(dt: number, sun: THREE.Vector3, camera?: THREE.Camera) {
      time += dt;
      const uniforms = (water.material as THREE.ShaderMaterial).uniforms;
      if (uniforms.time) uniforms.time.value = time * 0.35;
      if (uniforms.sunDirection) uniforms.sunDirection.value.copy(sun).normalize();
      if (camera) {
        water.position.x = camera.position.x;
        water.position.z = camera.position.z;
      }
    },
    setOrigin(x: number, z: number) {
      origin.x = x;
      origin.z = z;
      place();
    },
    setShelves(next: { near?: ShelfMap; far?: ShelfMap }) {
      const uniforms = material.uniforms;
      for (const which of ['near', 'far'] as const) {
        const shelf = next[which];
        const name = which === 'near' ? 'shelfNear' : 'shelfFar';
        if (!shelf || !uniforms[name]) continue;
        const old = uniforms[name].value as THREE.DataTexture;
        const texture = shelfTexture(shelf);
        uniforms[name].value = texture;
        const at = shelfTextures.indexOf(old);
        if (at >= 0) shelfTextures[at] = texture;
        old.dispose();
        maps[which] = shelf;
      }
      place();
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

/** Maps render XZ onto a world-coordinate shelf map's texel centres. */
export function shelfBounds(shelf: ShelfMap, origin: { x: number; z: number }): THREE.Vector4 {
  const texel = shelf.extent / (shelf.size - 1);
  const span = texel * shelf.size;
  return new THREE.Vector4(shelf.min - texel * 0.5 - origin.x, (shelf.minZ ?? shelf.min) - texel * 0.5 - origin.z, 1 / span, 1 / span);
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
  // Ripples are sampled in render space; these shifts carry the floating origin so they never jump.
  { find: 'vec2 uv0 = ( uv / 103.0 )', replace: 'vec2 uv0 = ( uv / 103.0 ) + rippleShiftA.xy' },
  { find: 'vec2 uv1 = uv / 107.0', replace: 'vec2 uv1 = uv / 107.0 + rippleShiftA.zw' },
  { find: 'vec2 uv2 = uv / vec2( 8907.0, 9803.0 )', replace: 'vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + rippleShiftB.xy' },
  { find: 'vec2 uv3 = uv / vec2( 1091.0, 1027.0 )', replace: 'vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) + rippleShiftB.zw' },
  { find: 'vec4 getNoise( vec2 uv ) {', replace: `uniform vec4 rippleShiftA;
				uniform vec4 rippleShiftB;
				vec4 getNoise( vec2 uv ) {` },
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
    // Clamp the near term so close reflections (the whale) ripple instead of breaking up.
    replace: 'vec2 distortion = surfaceNormal.xz * ( 0.0016 + min( 1.3 / distance, 0.012 ) ) * distortionScale * vec2( 1.0, 1.7 );',
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
      // Wide, overlapping ramps: deep blue eases through teal into turquoise.
      float shallow = smoothstep( 0.4, 1.0, shelf );
      float slope = smoothstep( 0.15, 0.75, shelf );
      vec3 tint = mix( waterColor, shelfColor, slope );
      tint = mix( tint, shallowColor, shallow );
      vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * tint;`,
    },
    {
      find: 'vec3 outgoingLight = albedo;',
      replace: `// Light coming up through clear shallows, blended under the reflection (Fresnel):
      // strong where the view is steep, gone at grazing angles and with distance.
      // The camera sits a few metres up, so everything past ~100 m crowds into a thin band
      // above the horizon: keep a soft, capped grazing wash there so it never reads as a stripe.
      float facing = mix( 0.15, 1.0, smoothstep( 0.002, 0.04, eyeDirection.y ) );
      float nearby = 1.0 - smoothstep( 300.0, 1400.0, distance );
      float shelfMix = ( shallow * 0.9 + slope * 0.35 ) * facing * nearby * ( 1.0 - reflectance * 0.6 );
      shelfMix = min( shelfMix, mix( 0.25, 0.8, smoothstep( 0.002, 0.04, eyeDirection.y ) ) );
      // HDR so the turquoise survives the scene's low exposure.
      vec3 under = mix( shelfColor, shallowColor, shallow ) * shallowLight * 2.1;
      albedo = mix( albedo, under, clamp( shelfMix, 0.0, 0.8 ) );
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
  material.uniforms.rippleShiftA = { value: new THREE.Vector4() };
  material.uniforms.rippleShiftB = { value: new THREE.Vector4() };
  material.uniforms.reflectionHaze = { value: (haze ?? new THREE.Color(0x8a9aa4)).clone() };
  material.uniforms.reflectionLift = { value: 0.25 };
  material.uniforms.reflectionGain = { value: Number.isFinite(gain) ? Math.min(3, Math.max(1, gain)) : 1 };
  material.needsUpdate = true;
  if (!shelves) return [];

  const near = shelfTexture(shelves.near);
  const far = shelfTexture(shelves.far);
  material.uniforms.shelfNear = { value: near };
  material.uniforms.shelfFar = { value: far };
  material.uniforms.shelfNearBounds = { value: shelfBounds(shelves.near, { x: 0, z: 0 }) };
  material.uniforms.shelfFarBounds = { value: shelfBounds(shelves.far, { x: 0, z: 0 }) };
  material.uniforms.shallowColor = { value: new THREE.Color(0x58aaa0) };
  material.uniforms.shelfColor = { value: new THREE.Color(0x1d6f7c) };
  material.uniforms.shallowLight = { value: shelves.light ?? 1 };
  return [near, far];
}
