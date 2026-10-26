import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { fork } from './rng.js';
import { clamp, lerp, smoothstep } from './math.js';
import { patchShader, type ShaderPatch } from './ocean.js';
import type { WeatherLook } from './weather.js';

export type TimeOfDay = 'golden' | 'morning' | 'afternoon' | 'dusk';
/** The day runs through these in order; night comes after dusk and gives way to morning. */
export type DayPhase = TimeOfDay | 'night';

/** Light that survives the weather and the time of day: what the lights are set to, before the underwater view dims them. */
export type LightBase = { intensity: number; color: THREE.Color };

export type SkyHandle = {
  sky: Sky;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  /** What the three lights were set to this frame (the underwater view dims from these, not from the lights it may have dimmed). */
  lightBase: { sun: LightBase; hemi: LightBase; ambient: LightBase };
  /** Updated in place every frame. */
  sunDirection: THREE.Vector3;
  sunAzimuthDeg: number;
  horizonColor: THREE.Color;
  /** Display colour of the sky just above the horizon; distant land hazes toward it. Updated in place. */
  hazeColor: THREE.Color;
  /** Sky colours at HAZE_ANGLES; a peak hazes toward the sky right behind it. Updated in place. */
  hazeGradient: THREE.Color[];
  /** Land haze density now. */
  hazeDensity: number;
  /** The preset the day began in. */
  timeOfDay: TimeOfDay;
  /** The preset the day is in now, and how far it is through the day (0 to 1). */
  phase: () => { name: DayPhase; day: number };
  /** How bright the day is now, 0 (night) to 1 (noon): dims what the sun does not light itself. */
  daylight: number;
  /** How much light the shallows get now (a low sun lights them less). */
  shallowLight: number;
  /** Land and water brightness now, 0 to 1. */
  level: number;
  /** The seed's own cloud cover under a clear sky. */
  clearCover: number;
  /** Milliseconds the last environment refresh took on the CPU side, and how many ran. */
  environment: () => { ms: number; count: number };
  envMap: THREE.Texture | null;
  /** The fog of the place the sea is in: pulled toward `tint` by `mix`, its density scaled. */
  setFog: (tint: THREE.Color, mix: number, density: number) => void;
  /** The weather's look; eased by the caller. */
  setWeather: (look: WeatherLook) => void;
  /** Moves the day and the clouds on by `dt` seconds. `rate` is 1 normally, 0.5 for reduced motion: half the cloud drift and a slower day. */
  update: (dt: number, rate?: number) => void;
  /** Where in the day, in whole days with the preset the day began in at 0 (review shots and tests). */
  setDay: (day: number) => void;
  /** Rebuilds the reflection environment from the sky now; at most every ENV_REFRESH seconds on its own once enabled. */
  refreshEnvironment: () => void;
  /** Turns the timed refresh on (medium and high) or off (low). */
  setEnvironmentRefresh: (on: boolean) => void;
  dispose: () => void;
};

type Preset = {
  elevation: number;
  azimuth: number;
  turbidity: number;
  rayleigh: number;
  mie: number;
  exposure: number;
  mieG: number;
  /** Sky colour at HAZE_ANGLES, sRGB. */
  haze: number[];
  hazeDensity: number;
  /** Fog colour at the horizon, before the water's pull. */
  horizon: [number, number, number];
  sun: { color: number; intensity: number };
  hemi: { sky: number; ground: number; intensity: number };
  ambient: { color: number; intensity: number };
  /** Brightness of the day for what the sun does not light, and of the shallows. */
  daylight: number;
  shallow: number;
  /** Brightness of the land and water. */
  level: number;
};

const SUN = { color: 0xfff1d6, intensity: 2.0 };
const HEMI = { sky: 0xc0d4e8, ground: 0x2a3e4e, intensity: 0.75 };
const AMBIENT = { color: 0x6a8498, intensity: 0.4 };

const presets: Record<DayPhase, Preset> = {
  // Lower turbidity/mie keep the sky horizon from blooming into a cream band.
  golden: {
    elevation: 7, azimuth: 185, turbidity: 4.2, rayleigh: 1.8, mie: 0.003, exposure: 0.5, mieG: 0.8,
    haze: [0x554644, 0x5c5347, 0x536253, 0x3a5e63, 0x274f66], hazeDensity: 0.00044,
    horizon: [0.42, 0.4, 0.38], sun: SUN, hemi: HEMI, ambient: AMBIENT, daylight: 0.62, shallow: 0.55, level: 1,
  },
  morning: {
    elevation: 22, azimuth: 140, turbidity: 2.6, rayleigh: 1.4, mie: 0.003, exposure: 0.48, mieG: 0.78,
    haze: [0xd4d9da, 0xccd9da, 0xb7d2da, 0x92bfd6, 0x6fa6ce], hazeDensity: 0.00028,
    horizon: [0.4, 0.5, 0.58], sun: SUN, hemi: HEMI, ambient: AMBIENT, daylight: 0.92, shallow: 1, level: 1,
  },
  afternoon: {
    elevation: 38, azimuth: 200, turbidity: 2.0, rayleigh: 1.4, mie: 0.0028, exposure: 0.46, mieG: 0.78,
    haze: [0xeaeeee, 0xe5edee, 0xd7e8ee, 0xbbdaea, 0x9cc8e5], hazeDensity: 0.00026,
    horizon: [0.38, 0.48, 0.58], sun: SUN, hemi: HEMI, ambient: AMBIENT, daylight: 1, shallow: 1, level: 1,
  },
  dusk: {
    elevation: 4, azimuth: 250, turbidity: 5.5, rayleigh: 2.2, mie: 0.0035, exposure: 0.45, mieG: 0.8,
    haze: [0x4b4041, 0x554a43, 0x515a4b, 0x3e5c5a, 0x2b5261], hazeDensity: 0.0005,
    horizon: [0.42, 0.4, 0.38], sun: SUN, hemi: HEMI, ambient: AMBIENT, daylight: 0.5, shallow: 0.55, level: 1,
  },
  // The sun well below the horizon: the sky keeps a faint blue glow, the moon is only a cool fill light.
  night: {
    elevation: -13, azimuth: 300, turbidity: 3, rayleigh: 1.2, mie: 0.003, exposure: 0.55, mieG: 0.78,
    haze: [0x0b1220, 0x0b1424, 0x0b1626, 0x0a1628, 0x09142a], hazeDensity: 0.00036,
    horizon: [0.045, 0.065, 0.1], sun: { color: 0x9db4e0, intensity: 0 }, hemi: { sky: 0x3a5078, ground: 0x0c1620, intensity: 0.42 },
    ambient: { color: 0x2c4262, intensity: 0.3 }, daylight: 0.12, shallow: 0.2, level: 0.16,
  },
};

/** The order of a day. */
export const DAY: readonly DayPhase[] = ['morning', 'afternoon', 'golden', 'dusk', 'night'];
/** Seconds of the experience for one full day. */
export const DAY_SECONDS = 2400;

/** Elevation angles (degrees above the horizon) of the measured sky colours. */
export const HAZE_ANGLES = [0.3, 2, 5, 10, 16];

export const FOG_DENSITY = 0.00034;
/** Seconds between environment map refreshes. */
export const ENV_REFRESH = 90;

export function pickTimeOfDay(seed: number): TimeOfDay {
  const rng = fork(seed, 'tod');
  const names: TimeOfDay[] = ['golden', 'morning', 'afternoon', 'dusk'];
  return names[Math.floor(rng() * names.length)]!;
}

function sunVector(elevationDeg: number, azimuthDeg: number, target: THREE.Vector3): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  target.setFromSphericalCoords(1, phi, theta);
  return target;
}

/** Fog colour at the horizon for a preset: sky-matched, pulled toward the water so no bright band shows at the seam. */
function horizonFor(preset: Preset, elevation: number): THREE.Color {
  const color = new THREE.Color().setRGB(preset.horizon[0], preset.horizon[1], preset.horizon[2]);
  if (preset.level >= 1) color.lerp(new THREE.Color(0.42, 0.56, 0.68), clamp(elevation / 55, 0, 0.45));
  return color.lerp(new THREE.Color(0x163e54), preset.level >= 1 ? 0.42 : 0.2);
}

/** Moves the sky's clouds along a wind vector instead of a fixed diagonal. */
export const cloudPatches: ShaderPatch[] = [
  { find: 'uniform float time;', replace: 'uniform float time;\n\t\tuniform vec2 cloudWind;' },
  { find: 'cloudUV += time * cloudSpeed;', replace: 'cloudUV += time * cloudSpeed * cloudWind;' },
];

/** Cloud speed of the three.js sky (its own default is 0.00002 along a fixed diagonal). */
const CLOUD_SPEED = 0.00008;

/** A grey of the same brightness as the colour: fog and haze pulled toward it lose their tint, not their light. */
function greyen(color: THREE.Color, amount: number): THREE.Color {
  if (amount <= 0) return color;
  const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  color.r += (luma - color.r) * amount;
  color.g += (luma - color.g) * amount;
  color.b += (luma - color.b) * amount;
  return color;
}

type Blend = {
  elevation: number;
  azimuth: number;
  turbidity: number;
  rayleigh: number;
  mie: number;
  mieG: number;
  exposure: number;
  hazeDensity: number;
  daylight: number;
  shallow: number;
  level: number;
  sun: number;
  hemi: number;
  ambient: number;
};

export function createSky(
  seed: number,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): SkyHandle {
  const timeOfDay = pickTimeOfDay(seed);
  const start = DAY.indexOf(timeOfDay);
  const rng = fork(seed, 'sky-jitter');
  const jitterElevation = (rng() - 0.5) * 4;
  const jitterAzimuth = (rng() - 0.5) * 24;
  const baseCover = 0.12 + rng() * 0.1;
  // Cloud drift: a wind direction of the seed's own.
  const windAngle = rng() * Math.PI * 2;

  const sky = new Sky();
  sky.scale.setScalar(12000);
  const patched = patchShader(sky.material.fragmentShader, cloudPatches);
  if (patched !== null) {
    sky.material.fragmentShader = patched;
    sky.material.uniforms['cloudWind'] = { value: new THREE.Vector2(Math.cos(windAngle), Math.sin(windAngle)) };
    sky.material.needsUpdate = true;
  }
  const uniforms = sky.material.uniforms;
  if (uniforms['cloudCoverage']) uniforms['cloudCoverage'].value = baseCover;
  if (uniforms['cloudDensity']) uniforms['cloudDensity'].value = 0.15;
  if (uniforms['cloudSpeed']) uniforms['cloudSpeed'].value = patched !== null ? CLOUD_SPEED : 0.00002;
  if (uniforms['showSunDisc']) uniforms['showSunDisc'].value = 1;

  const sunDirection = new THREE.Vector3();
  const sun = new THREE.DirectionalLight(SUN.color, SUN.intensity);
  sun.castShadow = false;
  const hemi = new THREE.HemisphereLight(HEMI.sky, HEMI.ground, HEMI.intensity);
  const ambient = new THREE.AmbientLight(AMBIENT.color, AMBIENT.intensity);
  scene.add(sky);
  scene.add(sun);
  scene.add(hemi);
  scene.add(ambient);

  /** A preset's sun elevation with the seed's jitter; the night's stays well below the horizon. */
  const elevationOf = (name: DayPhase): number =>
    name === 'night' ? presets.night.elevation : clamp(presets[name].elevation + jitterElevation, 2, 45);

  // Per preset colours, built once.
  const colors = DAY.map((name) => {
    const preset = presets[name];
    const elevation = elevationOf(name);
    return {
      horizon: horizonFor(preset, elevation),
      haze: preset.haze.map((hex) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace)),
      sun: new THREE.Color(preset.sun.color),
      hemiSky: new THREE.Color(preset.hemi.sky),
      hemiGround: new THREE.Color(preset.hemi.ground),
      ambient: new THREE.Color(preset.ambient.color),
    };
  });

  const horizonColor = new THREE.Color();
  const hazeGradient = HAZE_ANGLES.map(() => new THREE.Color());
  const hazeColor = hazeGradient[0]!;
  const lightBase = {
    sun: { intensity: SUN.intensity, color: new THREE.Color(SUN.color) },
    hemi: { intensity: HEMI.intensity, color: new THREE.Color(HEMI.sky) },
    ambient: { intensity: AMBIENT.intensity, color: new THREE.Color(AMBIENT.color) },
  };

  scene.fog = new THREE.FogExp2(0x000000, FOG_DENSITY);
  scene.background = null;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  let time = 0;
  /** Position in the day: whole numbers are presets, counted from morning; the seed starts at its own. */
  let cycle = start;
  const regionFog = { tint: new THREE.Color(), mix: 0, density: 1 };
  const weather: WeatherLook = { coverage: baseCover, density: 0.15, fog: 1, haze: 1, sun: 1, grey: 0 };
  const blend: Blend = {
    elevation: 0, azimuth: 0, turbidity: 0, rayleigh: 0, mie: 0, mieG: 0, exposure: 0, hazeDensity: 0,
    daylight: 1, shallow: 1, level: 1, sun: 0, hemi: 0, ambient: 0,
  };

  /** Sets everything that follows the time of day and the weather. */
  function applyDay(): void {
    const count = DAY.length;
    const wrapped = ((cycle % count) + count) % count;
    const index = Math.floor(wrapped);
    const next = (index + 1) % count;
    const t = smoothstep(0, 1, wrapped - index);
    const a = presets[DAY[index]!];
    const b = presets[DAY[next]!];
    const ca = colors[index]!;
    const cb = colors[next]!;
    blend.elevation = lerp(elevationOf(DAY[index]!), elevationOf(DAY[next]!), t);
    // The sun keeps moving the same way round: past the last preset the morning's azimuth is a turn further on.
    blend.azimuth = lerp(a.azimuth, b.azimuth + (next === 0 ? 360 : 0), t) + jitterAzimuth;
    blend.turbidity = lerp(a.turbidity, b.turbidity, t);
    blend.rayleigh = lerp(a.rayleigh, b.rayleigh, t);
    blend.mie = lerp(a.mie, b.mie, t);
    blend.mieG = lerp(a.mieG, b.mieG, t);
    blend.exposure = lerp(a.exposure, b.exposure, t);
    blend.hazeDensity = lerp(a.hazeDensity, b.hazeDensity, t);
    blend.daylight = lerp(a.daylight, b.daylight, t);
    blend.shallow = lerp(a.shallow, b.shallow, t);
    blend.level = lerp(a.level, b.level, t);
    blend.sun = lerp(a.sun.intensity, b.sun.intensity, t);
    blend.hemi = lerp(a.hemi.intensity, b.hemi.intensity, t);
    blend.ambient = lerp(a.ambient.intensity, b.ambient.intensity, t);

    uniforms['turbidity']!.value = blend.turbidity;
    uniforms['rayleigh']!.value = blend.rayleigh;
    uniforms['mieCoefficient']!.value = blend.mie;
    uniforms['mieDirectionalG']!.value = blend.mieG;
    if (uniforms['cloudCoverage']) uniforms['cloudCoverage'].value = weather.coverage;
    if (uniforms['cloudDensity']) uniforms['cloudDensity'].value = weather.density;
    const wobble = Math.sin(time * 0.02) * 0.4;
    sunVector(blend.elevation + wobble, blend.azimuth, sunDirection);
    uniforms['sunPosition']!.value.copy(sunDirection);
    sun.position.copy(sunDirection).multiplyScalar(200);
    renderer.toneMappingExposure = blend.exposure * 0.88;

    // A veiled sun gives less light; the sky gives a little more of its own.
    const veil = 1 - weather.sun;
    const lightBaseSun = lightBase.sun;
    lightBaseSun.intensity = blend.sun * weather.sun;
    lightBaseSun.color.copy(ca.sun).lerp(cb.sun, t);
    lightBase.hemi.intensity = blend.hemi * (1 + 0.25 * veil);
    lightBase.hemi.color.copy(ca.hemiSky).lerp(cb.hemiSky, t);
    lightBase.ambient.intensity = blend.ambient * (1 + 0.35 * veil);
    lightBase.ambient.color.copy(ca.ambient).lerp(cb.ambient, t);
    sun.intensity = lightBase.sun.intensity;
    sun.color.copy(lightBase.sun.color);
    hemi.intensity = lightBase.hemi.intensity;
    hemi.color.copy(lightBase.hemi.color);
    hemi.groundColor.copy(ca.hemiGround).lerp(cb.hemiGround, t);
    ambient.intensity = lightBase.ambient.intensity;
    ambient.color.copy(lightBase.ambient.color);

    // Haze: the sky's own colours, greyer under cloud.
    for (let k = 0; k < hazeGradient.length; k++) greyen(hazeGradient[k]!.copy(ca.haze[k]!).lerp(cb.haze[k]!, t), weather.grey);
    horizonColor.copy(ca.horizon).lerp(cb.horizon, t);
    greyen(horizonColor, weather.grey);

    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.density = lerp(FOG_DENSITY * 0.92, FOG_DENSITY * 1.08, 0.5 + 0.5 * Math.sin(time * 0.015)) * regionFog.density * weather.fog;
      // A region's tint is a daytime colour: it fades with the light.
      fog.color.copy(horizonColor).lerp(regionFog.tint, regionFog.mix * blend.level);
    }
    handle.hazeDensity = blend.hazeDensity;
    handle.daylight = blend.daylight;
    handle.shallowLight = blend.shallow;
    handle.level = blend.level;
  }

  // Environment: rebuilt from the sky alone; a full scene would reflect the water and land in themselves.
  let pmrem: THREE.PMREMGenerator | null = null;
  let envTarget: THREE.WebGLRenderTarget | null = null;
  let envEnabled = false;
  let envAge = 0;
  const hidden: THREE.Object3D[] = [];

  let envMs = 0;
  let envCount = 0;
  function refreshEnvironment(): void {
    envAge = 0;
    const began = performance.now();
    try {
      pmrem ??= new THREE.PMREMGenerator(renderer);
      for (const child of scene.children) {
        if (child !== sky && child.visible) {
          hidden.push(child);
          child.visible = false;
        }
      }
      const skyWasVisible = sky.visible;
      sky.visible = true;
      if (uniforms['showSunDisc']) uniforms['showSunDisc'].value = 0;
      const next = pmrem.fromScene(scene as unknown as THREE.Scene, 0.04);
      if (uniforms['showSunDisc']) uniforms['showSunDisc'].value = 1;
      sky.visible = skyWasVisible;
      const previous = envTarget;
      envTarget = next;
      handle.envMap = next.texture;
      scene.environment = next.texture;
      previous?.dispose();
    } catch {
      // No environment: the lights alone.
    } finally {
      for (const child of hidden) child.visible = true;
      hidden.length = 0;
      envMs = performance.now() - began;
      envCount++;
    }
  }

  const handle: SkyHandle = {
    sky,
    sun,
    hemi,
    ambient,
    lightBase,
    sunDirection,
    sunAzimuthDeg: presets[timeOfDay].azimuth + jitterAzimuth,
    horizonColor,
    hazeColor,
    hazeGradient,
    hazeDensity: presets[timeOfDay].hazeDensity,
    timeOfDay,
    daylight: presets[timeOfDay].daylight,
    shallowLight: presets[timeOfDay].shallow,
    level: 1,
    clearCover: baseCover,
    environment: () => ({ ms: envMs, count: envCount }),
    envMap: null,
    phase() {
      const count = DAY.length;
      const wrapped = ((cycle % count) + count) % count;
      return { name: DAY[Math.round(wrapped) % count]!, day: wrapped / count };
    },
    setFog(tint, mix, density) {
      regionFog.tint.copy(tint);
      regionFog.mix = mix;
      regionFog.density = density;
    },
    setWeather(look) {
      Object.assign(weather, look);
    },
    update(dt, rate = 1) {
      time += dt * rate;
      envAge += dt;
      if (uniforms['time']) uniforms['time'].value = time;
      cycle += (dt * rate * DAY.length) / DAY_SECONDS;
      applyDay();
      if (envEnabled && envAge >= ENV_REFRESH) refreshEnvironment();
    },
    setDay(day) {
      cycle = start + day * DAY.length;
      applyDay();
    },
    refreshEnvironment,
    setEnvironmentRefresh(on) {
      envEnabled = on;
    },
    dispose() {
      scene.remove(sky, sun, hemi, ambient);
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
      envTarget?.dispose();
      pmrem?.dispose();
      if (scene.environment === handle.envMap) scene.environment = null;
    },
  };

  applyDay();
  // The first environment is the opening sky, as before; later ones follow the day.
  refreshEnvironment();
  return handle;
}
