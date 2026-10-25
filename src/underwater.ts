import * as THREE from 'three';
import type { SkyHandle } from './sky.js';
import type { QualityTier } from './quality.js';
import { clamp, lerp } from './math.js';
import { hash } from './rng.js';
import { WATER_LEVEL, underwaterUniforms, waterSignal, type FloatingOrigin, type WaterSignal } from './seams.js';
import { WATER_IOR, blendFog, radianceFor, surfaceLight, waterTint, type FogState } from './underwater-optics.js';
import { createSeafloor } from './underwater-floor.js';
import { GLSL_WATER_COMMON } from './underwater-glsl.js';

/**
 * The view from under the surface: absorption fog, the surface seen from below
 * with Snell's window, light shafts, drifting particles, a caustic-lit seafloor
 * and a waterline overlay that hides the near-plane split while crossing.
 *
 * Everything here lives in render space and follows the camera. Patterns are
 * keyed to render position plus the origin modulo PATTERN_PERIOD, so a floating
 * origin recenter (always a multiple of that period) leaves them in place and
 * nothing needs to be shifted; the seafloor rebuilds from world positions.
 */

/** Objects on this layer are drawn by the main camera only, never by the water's mirror. */
export const UNDERWATER_LAYER = 2;
/** Every procedural pattern repeats over this many metres; the origin always snaps to a multiple of it. */
export const PATTERN_PERIOD = 256;

export type UnderwaterOptions = {
  sky: SkyHandle;
  /** Ground height at world X/Z (negative under the sea). */
  heightAt: (x: number, z: number, lod?: number) => number;
  origin: FloatingOrigin;
  tier: QualityTier;
  seed?: number;
};

export type UnderwaterHandle = {
  update: (dt: number, time: number, camera: THREE.PerspectiveCamera) => WaterSignal;
  readonly signal: WaterSignal;
  dispose: () => void;
};

const DAYLIGHT: Record<SkyHandle['timeOfDay'], number> = { golden: 0.62, morning: 0.92, afternoon: 1, dusk: 0.5 };

const TIER = {
  low: { rays: 9, snow: 140, floorCells: 48, floorStep: 2.6, caustics: 1, budget: 500 },
  medium: { rays: 13, snow: 260, floorCells: 64, floorStep: 2.2, caustics: 2, budget: 900 },
  high: { rays: 16, snow: 380, floorCells: 72, floorStep: 2, caustics: 2, budget: 1400 },
} as const;

export function createUnderwater(scene: THREE.Scene, renderer: THREE.WebGLRenderer, options: UnderwaterOptions): UnderwaterHandle {
  const { sky, origin } = options;
  const tier = TIER[options.tier];
  const seed = options.seed ?? 1;
  const signal: WaterSignal = { depth: 0, submersion: 0, underwater: false };
  const daylight = DAYLIGHT[sky.timeOfDay];
  const exposure = () => renderer.toneMappingExposure;

  // Above-water state to blend from and restore to.
  const fog = scene.fog instanceof THREE.FogExp2 ? scene.fog : null;
  const above: FogState = { color: fog ? fog.color.clone() : sky.horizonColor.clone(), density: fog?.density ?? 0.00034 };
  let writtenDensity = NaN;
  const clearBase = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const lights = [sky.sun, sky.hemi, sky.ambient].map((light) => ({ light, intensity: light.intensity, color: light.color.clone() }));
  const lightTint = new THREE.Color().setHex(0x7fd0dc, THREE.SRGBColorSpace);

  // Underwater state, in display colour (for the clear) and scene radiance (for fog and shaders).
  const tint: FogState = { color: new THREE.Color(), density: 0 };
  const below: FogState = { color: new THREE.Color(), density: 0 };
  const blended: FogState = { color: new THREE.Color(), density: 0 };
  const clearColor = new THREE.Color();
  let tintDepth = NaN;

  // Light that made it through the surface, refracted toward the vertical.
  const sunWater = new THREE.Vector3();
  function refractSun(): void {
    const s = sky.sunDirection;
    const horizontal = Math.hypot(s.x, s.z);
    const sinAir = clamp(horizontal / Math.max(1e-6, s.length()), 0, 1);
    const sinWater = sinAir / WATER_IOR;
    const cosWater = Math.sqrt(1 - sinWater * sinWater);
    const hx = horizontal > 1e-6 ? s.x / horizontal : 0;
    const hz = horizontal > 1e-6 ? s.z / horizontal : 0;
    // Direction the light travels: down and away from the sun.
    sunWater.set(-hx * sinWater, -cosWater, -hz * sinWater).normalize();
  }
  refractSun();

  const display = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  const skyHorizon = radianceFor(sky.hazeGradient[0] ?? sky.hazeColor, exposure(), renderer.toneMapping);
  const zenithDisplay = (sky.hazeGradient[sky.hazeGradient.length - 1] ?? sky.hazeColor).clone().lerp(display(0x5f97c9), 0.45);
  const skyZenith = radianceFor(zenithDisplay, exposure(), renderer.toneMapping);
  const sunGlow = radianceFor(display(0xfff4dc), exposure(), renderer.toneMapping).multiplyScalar(1.4);

  /** Uniforms every underwater material reads; updated once per frame. */
  const shared = {
    uTime: { value: 0 },
    uPattern: { value: new THREE.Vector2() },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.03 },
    uLight: { value: 1 },
    uSunWater: { value: sunWater },
    uSunDir: { value: sky.sunDirection },
  };

  const group = new THREE.Group();
  group.name = 'underwater';
  scene.add(group);
  const layered = <T extends THREE.Object3D>(object: T): T => {
    object.layers.set(UNDERWATER_LAYER);
    object.frustumCulled = false;
    group.add(object);
    return object;
  };

  /* -------------------------------------------------------------- surface from below */

  const surfaceMaterial = new THREE.ShaderMaterial({
    name: 'underwater-surface',
    uniforms: {
      ...shared,
      uSkyHorizon: { value: skyHorizon },
      uSkyZenith: { value: skyZenith },
      uSunGlow: { value: sunGlow },
      uReflect: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4( position, 1.0 );
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_WATER_COMMON}
      uniform vec3 uSkyHorizon;
      uniform vec3 uSkyZenith;
      uniform vec3 uSunGlow;
      uniform vec3 uReflect;
      varying vec3 vWorld;

      void main() {
        vec3 toFrag = vWorld - cameraPosition;
        float dist = length( toFrag );
        vec3 v = toFrag / max( dist, 1e-4 );
        // Ripples fade with distance so the far surface does not shimmer into noise.
        vec2 slope = rippleSlope( vWorld.xz + uPattern, uTime ) / ( 1.0 + dist * 0.04 );
        vec3 n = normalize( vec3( slope.x, -1.0, slope.y ) );
        vec3 r = refract( v, n, ${WATER_IOR.toFixed(3)} );
        float through = step( 1e-5, dot( r, r ) );
        // Transmission falls toward the window edge (grazing exit), where the bright ring of horizon sits.
        float edge = smoothstep( 0.0, 0.32, r.y ) * through;
        float elevation = clamp( r.y, 0.0, 1.0 );
        vec3 skyColor = mix( uSkyHorizon, uSkyZenith, pow( elevation, 0.55 ) );
        float sunDot = max( dot( r, uSunDir ), 0.0 );
        vec3 window = skyColor * ( 0.75 + 0.5 * edge ) + uSunGlow * ( pow( sunDot, 900.0 ) * 6.0 + pow( sunDot, 24.0 ) * 0.35 ) * through;
        // Outside the window the surface mirrors the dim water below, a little lighter where waves tilt.
        vec3 mirror = uReflect * ( 0.9 + 3.0 * length( slope ) );
        vec3 color = mix( mirror, window, edge );
        gl_FragColor = vec4( waterFog( color, dist ), 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.FrontSide,
  });
  // Plane normal faces down: drawn only from below, culled from above.
  const surfaceGeometry = new THREE.PlaneGeometry(8000, 8000, 1, 1).rotateX(Math.PI / 2);
  const surface = layered(new THREE.Mesh(surfaceGeometry, surfaceMaterial));
  surface.renderOrder = -1;

  /* -------------------------------------------------------------- light shafts */

  const RAY_CELL = 64;
  const RAY_LENGTH = 34;
  const rayBase = new THREE.PlaneGeometry(1, 1, 1, 6).translate(0, -0.5, 0);
  const rayGeometry = new THREE.InstancedBufferGeometry();
  rayGeometry.index = rayBase.index;
  rayGeometry.setAttribute('position', rayBase.getAttribute('position'));
  rayGeometry.instanceCount = tier.rays;
  const rayData = new Float32Array(tier.rays * 4);
  for (let i = 0; i < tier.rays; i++) {
    const r = (k: number) => hash(seed, 0x5241, i, k) / 0x100000000;
    rayData[i * 4] = r(1) * RAY_CELL;
    rayData[i * 4 + 1] = r(2) * RAY_CELL;
    rayData[i * 4 + 2] = 0.6 + r(3) * 1.8;
    rayData[i * 4 + 3] = r(4);
  }
  rayGeometry.setAttribute('aRay', new THREE.InstancedBufferAttribute(rayData, 4));
  // Additive in display space: shafts only ever brighten, by a predictable amount.
  const rayColor = display(0xd8f1ea);
  const rayMaterial = new THREE.ShaderMaterial({
    name: 'underwater-rays',
    uniforms: { ...shared, uRayColor: { value: rayColor }, uIntensity: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform vec3 uSunWater;
      uniform float uTime;
      attribute vec4 aRay;
      varying vec3 vWorld;
      varying vec2 vShaft;
      varying float vFade;
      const float CELL = ${RAY_CELL.toFixed(1)};
      const float LENGTH = ${RAY_LENGTH.toFixed(1)};
      void main() {
        vec3 axis = uSunWater;
        // Slow sway, then wrap the shaft's middle into a cell around the camera.
        vec2 base = aRay.xy + vec2( sin( uTime * 0.05 + aRay.w * 6.283 ), cos( uTime * 0.043 + aRay.w * 4.1 ) ) * 2.0;
        vec2 mid = base + axis.xz * LENGTH * 0.5;
        vec2 rel = mid - cameraPosition.xz;
        rel -= CELL * floor( rel / CELL + 0.5 );
        vec3 top = vec3( cameraPosition.x + rel.x, 0.0, cameraPosition.z + rel.y ) - vec3( axis.x, 0.0, axis.z ) * LENGTH * 0.5;
        float along = -position.y;
        vec3 centre = top + axis * LENGTH * 0.5;
        vec3 side = normalize( cross( axis, normalize( cameraPosition - centre ) ) );
        float width = aRay.z * ( 1.0 + along * 0.9 );
        vec3 p = top + axis * along * LENGTH + side * position.x * width;
        vWorld = p;
        vShaft = vec2( position.x * 2.0, along );
        float wrapEdge = max( abs( rel.x ), abs( rel.y ) ) / CELL;
        float flicker = 0.65 + 0.35 * sin( uTime * ( 0.21 + aRay.w * 0.17 ) + aRay.w * 40.0 );
        vFade = ( 1.0 - smoothstep( 0.3, 0.48, wrapEdge ) ) * flicker;
        gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uRayColor;
      uniform float uIntensity;
      uniform float uFogDensity;
      varying vec3 vWorld;
      varying vec2 vShaft;
      varying float vFade;
      void main() {
        float across = 1.0 - smoothstep( 0.0, 1.0, abs( vShaft.x ) );
        float along = smoothstep( 0.0, 0.08, vShaft.y ) * ( 1.0 - smoothstep( 0.25, 1.0, vShaft.y ) );
        float dist = distance( vWorld, cameraPosition );
        float near = smoothstep( 2.0, 9.0, dist );
        float fogT = exp( -pow( uFogDensity * dist, 2.0 ) );
        float light = exp( -0.05 * max( 0.0, -vWorld.y ) );
        float a = across * across * along * near * fogT * light * vFade * uIntensity;
        gl_FragColor = vec4( uRayColor * a, 1.0 );
        #include <colorspace_fragment>
      }`,
    toneMapped: false,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const rays = layered(new THREE.Mesh(rayGeometry, rayMaterial));
  rays.renderOrder = 2;

  /* -------------------------------------------------------------- drifting particles */

  const SNOW_CELL = 32;
  const snowPositions = new Float32Array(tier.snow * 3);
  const snowSeeds = new Float32Array(tier.snow);
  for (let i = 0; i < tier.snow; i++) {
    const r = (k: number) => hash(seed, 0x534e, i, k) / 0x100000000;
    snowPositions[i * 3] = r(1) * SNOW_CELL;
    snowPositions[i * 3 + 1] = r(2) * SNOW_CELL;
    snowPositions[i * 3 + 2] = r(3) * SNOW_CELL;
    snowSeeds[i] = r(4);
  }
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  snowGeometry.setAttribute('aSeed', new THREE.BufferAttribute(snowSeeds, 1));
  const snowColor = radianceFor(display(0xb9d9d6), exposure(), renderer.toneMapping);
  const snowMaterial = new THREE.ShaderMaterial({
    name: 'underwater-particles',
    uniforms: { ...shared, uScale: { value: 400 }, uColor: { value: snowColor } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uScale;
      attribute float aSeed;
      varying float vAlpha;
      varying float vDist;
      const float CELL = ${SNOW_CELL.toFixed(1)};
      void main() {
        vec3 drift = vec3( sin( uTime * 0.11 + aSeed * 31.0 ) * 0.6, -uTime * 0.035 * ( 0.5 + aSeed ), cos( uTime * 0.09 + aSeed * 17.0 ) * 0.6 );
        vec3 rel = position + drift - cameraPosition;
        rel -= CELL * floor( rel / CELL + 0.5 );
        vec3 p = cameraPosition + rel;
        vec4 view = viewMatrix * vec4( p, 1.0 );
        vDist = -view.z;
        float size = ( 0.025 + 0.035 * aSeed ) * uScale / max( 0.5, vDist );
        // Below a pixel, shrink the alpha rather than the point, so dots never flicker.
        vAlpha = clamp( size, 0.0, 1.0 ) * ( 1.0 - smoothstep( 0.3, 0.48, length( rel ) / CELL ) ) * ( 1.0 - smoothstep( -0.6, -0.1, p.y ) );
        gl_PointSize = clamp( size, 1.0, 6.0 );
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uLight;
      varying float vAlpha;
      varying float vDist;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float dot = 1.0 - smoothstep( 0.15, 0.5, length( c ) );
        float fogT = exp( -pow( uFogDensity * vDist, 2.0 ) );
        gl_FragColor = vec4( uColor * ( 0.4 + 0.6 * uLight ), dot * vAlpha * fogT * 0.55 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const snow = layered(new THREE.Points(snowGeometry, snowMaterial));
  snow.renderOrder = 3;

  /* -------------------------------------------------------------- seafloor */

  const floor = createSeafloor({
    heightAt: options.heightAt,
    cells: tier.floorCells,
    step: tier.floorStep,
    budget: tier.budget,
    caustics: tier.caustics,
    shared,
    sand: radianceFor(display(0xc9b48a), exposure(), renderer.toneMapping),
    sandDark: radianceFor(display(0x8f8466), exposure(), renderer.toneMapping),
    rock: radianceFor(display(0x5d6660), exposure(), renderer.toneMapping),
    caustic: radianceFor(display(0xfff6e2), exposure(), renderer.toneMapping),
  });
  layered(floor.mesh);

  /* -------------------------------------------------------------- waterline overlay */

  const overlayMaterial = new THREE.ShaderMaterial({
    name: 'underwater-waterline',
    uniforms: {
      ...shared,
      uNearToWorld: { value: new THREE.Matrix4() },
      uWater: { value: new THREE.Color() },
      uAir: { value: new THREE.Color() },
      uWaterAlpha: { value: 0 },
      uAirAlpha: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform mat4 uNearToWorld;
      varying vec3 vNear;
      void main() {
        vec4 w = uNearToWorld * vec4( position.xy, -1.0, 1.0 );
        vNear = w.xyz / w.w;
        gl_Position = vec4( position.xy, 0.0, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_WATER_COMMON}
      uniform vec3 uWater;
      uniform vec3 uAir;
      uniform float uWaterAlpha;
      uniform float uAirAlpha;
      varying vec3 vNear;
      void main() {
        // The waterline where the swell crosses the lens, a few centimetres high.
        vec2 p = vNear.xz + uPattern;
        float level = 0.018 * sin( dot( p, vec2( 2.9, 1.7 ) ) + uTime * 1.9 ) + 0.012 * sin( dot( p, vec2( -1.3, 3.7 ) ) + uTime * 2.6 );
        float h = vNear.y - level;
        float aa = max( fwidth( h ), 1e-4 );
        float under = 1.0 - smoothstep( -aa, aa, h );
        float meniscus = exp( -abs( h ) / ( aa * 2.5 + 0.004 ) );
        vec3 color = mix( mix( uAir, uWater, under ), uWater * 0.45, meniscus * 0.8 );
        float alpha = max( mix( uAirAlpha, uWaterAlpha, under ), meniscus * 0.75 );
        gl_FragColor = vec4( color, alpha );
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const overlay = layered(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), overlayMaterial));
  overlay.renderOrder = 1000;
  const nearCorner = new THREE.Vector3();
  const nearMatrix = overlayMaterial.uniforms['uNearToWorld']!.value as THREE.Matrix4;

  /** Height range the near plane spans; the overlay only runs while it straddles the water. */
  function nearSpan(camera: THREE.PerspectiveCamera): [number, number] {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      nearCorner.set(x, y, -1).applyMatrix4(nearMatrix);
      lo = Math.min(lo, nearCorner.y);
      hi = Math.max(hi, nearCorner.y);
    }
    return [lo, hi];
  }

  /* -------------------------------------------------------------- update */

  const restoreState = () => {
    if (fog) {
      fog.color.copy(above.color);
      fog.density = above.density;
      writtenDensity = fog.density;
    }
    sky.sky.visible = true;
    renderer.setClearColor(clearBase, clearAlpha);
    for (const l of lights) {
      l.light.intensity = l.intensity;
      l.light.color.copy(l.color);
    }
    underwaterUniforms.underwaterMix.value = 0;
    group.visible = false;
  };
  let resting = false;

  function update(dt: number, time: number, camera: THREE.PerspectiveCamera): WaterSignal {
    camera.layers.enable(UNDERWATER_LAYER);
    waterSignal(camera.position.y, signal);
    // sky.update rewrites the density each frame; anything else is our own write from last frame.
    if (fog && fog.density !== writtenDensity) above.density = fog.density;

    const s = signal.submersion;
    const depth = signal.depth;
    const camWorldX = camera.position.x + origin.x;
    const camWorldZ = camera.position.z + origin.z;

    // Warm the seafloor cache whenever the camera is near the water, so the first dive has a floor.
    if (camera.position.y < 4) floor.prepare(camWorldX, camWorldZ, origin);

    if (s <= 0 && depth < -0.6) {
      if (!resting) restoreState();
      resting = true;
      return signal;
    }
    resting = false;
    group.visible = true;

    if (!(Math.abs(depth - tintDepth) < 0.05)) {
      tintDepth = depth;
      waterTint(Math.max(0, depth), daylight, tint);
      radianceFor(tint.color, exposure(), renderer.toneMapping, below.color);
      below.density = tint.density;
    }
    // Whatever the camera sees through the lens is on its own side of the surface: hold the
    // murk back while above and go fully under soon after crossing; the waterline overlay
    // carries the visual transition across the split itself.
    blendFog(above, below, fogMix(depth, s), blended);
    if (fog) {
      fog.color.copy(blended.color);
      fog.density = blended.density;
      writtenDensity = fog.density;
    }

    const light = lerp(1, surfaceLight(Math.max(0, depth)) * 0.9, s);
    for (const l of lights) {
      l.light.intensity = l.intensity * light;
      l.light.color.copy(l.color).lerp(lightTint, s * 0.55);
    }

    // Exponential-fog equivalent of the FogExp2 visibility, for shaders that fade linearly.
    underwaterUniforms.underwaterMix.value = s;
    // The land (the only reader) skips tone mapping, so it takes the display colour, like the clear colour.
    underwaterUniforms.underwaterColor.value.copy(tint.color);
    underwaterUniforms.underwaterDensity.value = below.density * 1.73;

    const below0 = depth > 0;
    sky.sky.visible = !below0;
    if (below0) renderer.setClearColor(clearColor.copy(tint.color), 1);
    else renderer.setClearColor(clearBase, clearAlpha);

    shared.uTime.value = time;
    shared.uPattern.value.set(mod(origin.x, PATTERN_PERIOD), mod(origin.z, PATTERN_PERIOD));
    shared.uFogColor.value.copy(blended.color);
    shared.uFogDensity.value = blended.density;
    shared.uLight.value = surfaceLight(Math.max(0, depth)) * daylight;
    refractSun();

    surface.visible = below0;
    rays.visible = below0;
    snow.visible = below0;
    if (below0) {
      surface.position.set(camera.position.x, WATER_LEVEL, camera.position.z);
      const reflect = surfaceMaterial.uniforms['uReflect']!.value as THREE.Color;
      reflect.copy(below.color).multiplyScalar(0.8);
      rayMaterial.uniforms['uIntensity']!.value = 0.22 * smoothstep01(depth / 0.8) * daylight * (0.35 + 0.65 * clamp(sky.sunDirection.y * 2.5, 0, 1));
      snowMaterial.uniforms['uScale']!.value = (renderer.getDrawingBufferSize(tmpSize).y * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
    }
    floor.update(camWorldX, camWorldZ, origin, below0);

    // Waterline across the lens while the near plane straddles the surface.
    camera.updateMatrixWorld();
    nearMatrix.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    const [lo, hi] = nearSpan(camera);
    overlay.visible = lo < WATER_LEVEL + 0.08 && hi > WATER_LEVEL - 0.08;
    if (overlay.visible) {
      const u = overlayMaterial.uniforms;
      (u['uWater']!.value as THREE.Color).copy(tint.color);
      (u['uAir']!.value as THREE.Color).copy(sky.hazeColor);
      u['uWaterAlpha']!.value = below0 ? 0 : 0.82;
      u['uAirAlpha']!.value = below0 ? 0.55 : 0;
    }
    void dt;
    return signal;
  }

  const tmpSize = new THREE.Vector2();
  group.visible = false;

  return {
    update,
    signal,
    dispose() {
      restoreState();
      scene.remove(group);
      surfaceGeometry.dispose();
      surfaceMaterial.dispose();
      rayBase.dispose();
      rayGeometry.dispose();
      rayMaterial.dispose();
      snowGeometry.dispose();
      snowMaterial.dispose();
      floor.dispose();
      overlay.geometry.dispose();
      overlayMaterial.dispose();
    },
  };
}

/** Fog weight for the view: a light approach haze above the surface, full water just below it. */
export function fogMix(depth: number, submersion: number): number {
  return depth > 0 ? lerp(0.9, 1, smoothstep01(depth / 0.25)) : submersion * 0.5;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function smoothstep01(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}
