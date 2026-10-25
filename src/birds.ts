import * as THREE from 'three';
import { fork } from './rng.js';
import { damp } from './math.js';

/**
 * Distant V-shaped bird silhouettes — cheap Line loops. They wheel around a
 * centre that trails the whale (world coordinates), so they keep it company on
 * the journey.
 */
export function createBirds(
  seed: number,
  count = 5,
): { group: THREE.Group; update: (time: number, centerX?: number, centerZ?: number, dt?: number) => void; dispose: () => void } {
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

  const center = { x: 0, z: 0, set: false };
  return {
    group,
    update(time: number, centerX = 0, centerZ = 0, dt = 0) {
      // The flock drifts after the whale over half a minute or so; it never snaps.
      if (!center.set || Math.hypot(centerX - center.x, centerZ - center.z) > 3000) {
        center.x = centerX;
        center.z = centerZ;
        center.set = true;
      } else {
        center.x = damp(center.x, centerX, 0.04, dt);
        center.z = damp(center.z, centerZ, 0.04, dt);
      }
      for (const bird of birds) {
        const a = time * bird.speed + bird.phase;
        bird.line.position.set(center.x + Math.cos(a) * bird.radius, bird.height + Math.sin(a * 3) * 0.8, center.z + Math.sin(a) * bird.radius);
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
