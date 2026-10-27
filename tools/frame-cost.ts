import * as THREE from 'three';
import { createBirds } from '../src/birds.js';
import { createWake } from '../src/wake.js';
import { createSky } from '../src/sky.js';
import { createWeather } from '../src/weather.js';
import { SEA_WAVES, packWaves, setSea, swellAt } from '../src/swell.js';
import { FollowCamera } from '../src/camera.js';
import type { QualityTier } from '../src/quality.js';

/**
 * CPU cost per frame of what the journey's feel adds, in plain Node (no GPU, no phone): milliseconds per call over
 * 20,000 calls at 60 steps a second with the whale at cruise. A guide to what each piece costs, not a device figure.
 *
 * usage: npx tsx tools/frame-cost.ts
 */
const N = 20000;
const DT = 1 / 60;
const heading = 0.6;
const f = { x: -Math.cos(heading), z: Math.sin(heading) };

function time(label: string, run: (i: number) => void): void {
  for (let i = 0; i < 2000; i++) run(i);
  const start = performance.now();
  for (let i = 0; i < N; i++) run(i);
  console.log(`${label.padEnd(28)} ${(((performance.now() - start) / N)).toFixed(4)} ms`);
}

const source = (i: number) => ({ x: f.x * 22 * DT * i, y: -0.4, z: f.z * 22 * DT * i, heading, speed: 22 });
const origin = { x: 0, z: 0 };

for (const tier of ['low', 'high'] as QualityTier[]) {
  const birds = createBirds(1, tier);
  time(`birds (${tier})`, (i) => {
    const s = source(i);
    birds.update(i * DT, s.x, s.z, DT, { x: s.x - f.x * 18, y: 6, z: s.z - f.z * 18 }, false);
  });
}
const wake = createWake();
time('wake', (i) => wake.update(source(i), DT));

const renderer = { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 } as unknown as THREE.WebGLRenderer;
const sky = createSky(1, renderer, new THREE.Scene());
const weather = createWeather(1, sky.clearCover);
time('day, weather and fog', (i) => {
  sky.setWeather(weather.update(DT, i * DT, [1, 0, 0, 0]));
  sky.update(DT);
});

// A rough sea: the shared swell for the water, and the wake lying on it.
setSea(1, 0.6);
const packed = new Float32Array(SEA_WAVES * 4);
time('sea (water waves)', (i) => packWaves(i * 20, i * 7, i * DT, packed));
const sea = { height: 0, slopeX: 0, slopeZ: 0 };
const riding = createWake({ surface: (x, z) => swellAt(x, z, 100, sea).height });
time('wake on a rough sea', (i) => riding.update(source(i), DT));
setSea(0);

const camera = new THREE.PerspectiveCamera(48, 1.6, 0.5, 12000);
const rig = new FollowCamera(camera);
time('camera', (i) => {
  const s = source(i);
  rig.setTarget(s);
  rig.update(DT, i * DT);
});
