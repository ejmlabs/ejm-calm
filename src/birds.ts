import * as THREE from 'three';
import { fork } from './rng.js';

/** Distant V-shaped bird silhouettes — cheap Line loops. */
export function createBirds(seed: number, count = 5): { group: THREE.Group; update: (time: number) => void; dispose: () => void } {
  const rng = fork(seed, 'birds');
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const birds: Array<{ line: THREE.Line; radius: number; speed: number; height: number; phase: number }> = [];

  for (let i = 0; i < count; i++) {
    const geo = new THREE.BufferGeometry();
    const span = 0.9 + rng() * 0.5;
    const points = new Float32Array([
      -span, 0, 0,
      0, 0.15, 0,
      span, 0, 0,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(points, 3));
    geos.push(geo);
    const mat = new THREE.LineBasicMaterial({ color: 0x1a2430, transparent: true, opacity: 0.55 });
    mats.push(mat);
    const line = new THREE.Line(geo, mat);
    group.add(line);
    birds.push({
      line,
      radius: 60 + rng() * 120,
      speed: 0.05 + rng() * 0.08,
      height: 12 + rng() * 18,
      phase: rng() * Math.PI * 2,
    });
  }

  return {
    group,
    update(time: number) {
      for (const bird of birds) {
        const a = time * bird.speed + bird.phase;
        bird.line.position.set(Math.cos(a) * bird.radius, bird.height + Math.sin(a * 3) * 0.8, Math.sin(a) * bird.radius);
        bird.line.rotation.y = -a + Math.PI / 2;
        bird.line.rotation.z = Math.sin(time * 6 + bird.phase) * 0.25;
      }
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
