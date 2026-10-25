import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { fork } from './rng.js';
import { clamp, lerp } from './math.js';

export type TimeOfDay = 'golden' | 'morning' | 'afternoon' | 'dusk';

export type SkyHandle = {
  sky: Sky;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  sunDirection: THREE.Vector3;
  sunAzimuthDeg: number;
  horizonColor: THREE.Color;
  timeOfDay: TimeOfDay;
  envMap: THREE.Texture | null;
  update: (dt: number) => void;
  dispose: () => void;
};

const presets: Record<TimeOfDay, { elevation: number; azimuth: number; turbidity: number; rayleigh: number; mie: number; exposure: number; mieG: number }> = {
  // Lower turbidity/mie keep the sky horizon from blooming into a cream band.
  golden: { elevation: 7, azimuth: 185, turbidity: 4.2, rayleigh: 1.8, mie: 0.003, exposure: 0.5, mieG: 0.8 },
  morning: { elevation: 22, azimuth: 140, turbidity: 2.6, rayleigh: 1.4, mie: 0.003, exposure: 0.48, mieG: 0.78 },
  afternoon: { elevation: 38, azimuth: 200, turbidity: 2.0, rayleigh: 1.4, mie: 0.0028, exposure: 0.46, mieG: 0.78 },
  dusk: { elevation: 4, azimuth: 250, turbidity: 5.5, rayleigh: 2.2, mie: 0.0035, exposure: 0.45, mieG: 0.8 },
};

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

export function createSky(
  seed: number,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): SkyHandle {
  const timeOfDay = pickTimeOfDay(seed);
  const preset = presets[timeOfDay];
  const rng = fork(seed, 'sky-jitter');
  const elevation = clamp(preset.elevation + (rng() - 0.5) * 4, 2, 45);
  const azimuth = preset.azimuth + (rng() - 0.5) * 24;

  const sky = new Sky();
  sky.scale.setScalar(12000);
  const uniforms = sky.material.uniforms;
  uniforms['turbidity']!.value = preset.turbidity;
  uniforms['rayleigh']!.value = preset.rayleigh;
  uniforms['mieCoefficient']!.value = preset.mie;
  uniforms['mieDirectionalG']!.value = preset.mieG;
  if (uniforms['cloudCoverage']) uniforms['cloudCoverage'].value = 0.12 + rng() * 0.1;
  if (uniforms['cloudDensity']) uniforms['cloudDensity'].value = 0.15;
  if (uniforms['showSunDisc']) uniforms['showSunDisc'].value = 1;

  const sunDirection = new THREE.Vector3();
  sunVector(elevation, azimuth, sunDirection);
  uniforms['sunPosition']!.value.copy(sunDirection);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
  sun.position.copy(sunDirection).multiplyScalar(200);
  sun.castShadow = false;

  const hemi = new THREE.HemisphereLight(0xc0d4e8, 0x2a3e4e, 0.75);
  const ambient = new THREE.AmbientLight(0x6a8498, 0.4);

  scene.add(sky);
  scene.add(sun);
  scene.add(hemi);
  scene.add(ambient);

  // Horizon fog must match water so there is no bright cream band at the seam.
  const horizonColor = new THREE.Color();
  if (timeOfDay === 'golden' || timeOfDay === 'dusk') {
    horizonColor.setRGB(0.42, 0.4, 0.38);
  } else if (timeOfDay === 'morning') {
    horizonColor.setRGB(0.4, 0.5, 0.58);
  } else {
    horizonColor.setRGB(0.38, 0.48, 0.58);
  }
  const skyBlue = new THREE.Color(0.42, 0.56, 0.68);
  horizonColor.lerp(skyBlue, clamp(elevation / 55, 0, 0.45));
  const waterFog = new THREE.Color(0x163e54);
  horizonColor.lerp(waterFog, 0.42);

  scene.fog = new THREE.FogExp2(horizonColor.getHex(), 0.0031);
  scene.background = null;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Slightly lower exposure cuts the washed-out horizon band.
  renderer.toneMappingExposure = preset.exposure * 0.88;

  let envMap: THREE.Texture | null = null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    if (uniforms['showSunDisc']) uniforms['showSunDisc'].value = 0;
    envMap = pmrem.fromScene(scene as unknown as THREE.Scene, 0.04).texture;
    if (uniforms['showSunDisc']) uniforms['showSunDisc'].value = 1;
    scene.environment = envMap;
  } catch {
    envMap = null;
  }
  pmrem.dispose();

  let time = 0;
  return {
    sky,
    sun,
    hemi,
    ambient,
    sunDirection,
    sunAzimuthDeg: azimuth,
    horizonColor,
    timeOfDay,
    envMap,
    update(dt: number) {
      time += dt;
      if (uniforms['time']) uniforms['time'].value = time;
      const wobble = Math.sin(time * 0.02) * 0.4;
      sunVector(elevation + wobble, azimuth, sunDirection);
      uniforms['sunPosition']!.value.copy(sunDirection);
      sun.position.copy(sunDirection).multiplyScalar(200);
      const fog = scene.fog as THREE.FogExp2 | null;
      if (fog) {
        fog.density = lerp(0.0017, 0.002, 0.5 + 0.5 * Math.sin(time * 0.015));
      }
    },
    dispose() {
      scene.remove(sky, sun, hemi, ambient);
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
      envMap?.dispose();
      if (scene.environment === envMap) scene.environment = null;
    },
  };
}
