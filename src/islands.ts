import * as THREE from 'three';
import { buildHeightfield, waterlineColor, type IslandSpec } from './terrain.js';
import { clamp } from './math.js';
import { makeNoise2D } from './noise.js';

export type IslandHandle = {
  group: THREE.Group;
  spec: IslandSpec;
  dispose: () => void;
};

export function createIsland(
  spec: IslandSpec,
  segments: number,
  fogColor?: THREE.Color,
): IslandHandle {
  const { size, heights, maxHeight } = buildHeightfield(spec, segments);
  const count = segments + 1;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position!;

  for (let iz = 0; iz < count; iz++) {
    for (let ix = 0; ix < count; ix++) {
      const idx = iz * count + ix;
      pos.setY(idx, heights[idx]!);
    }
  }
  geo.computeVertexNormals();

  const normals = geo.attributes.normal!;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();
  const jitter = makeNoise2D(spec.seed, 9);
  const dist = Math.hypot(spec.x, spec.z);
  // Haze only with distance, toward the sky fog colour (not a green tint).
  const haze = clamp((dist - 260) / 700, 0, 0.45);
  const hazeTarget = fogColor?.clone() ?? new THREE.Color(0x6a8498);

  for (let iz = 0; iz < count; iz++) {
    for (let ix = 0; ix < count; ix++) {
      const idx = iz * count + ix;
      const h = heights[idx]!;
      const ny = normals.getY(idx);
      const [r, g, b] = waterlineColor(h, Math.max(maxHeight, 1), ny, { allowSnow: false });
      const j = 1 + jitter(ix * 0.17, iz * 0.17) * 0.03;
      color.setRGB(r * j, g * j, b * j);
      color.lerp(hazeTarget, haze);
      colors[idx * 3] = color.r;
      colors[idx * 3 + 1] = color.g;
      colors[idx * 3 + 2] = color.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Unlit so sun/ACES cannot bleach forest and rock into pale khaki.
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // Sink ~1 m so the waterline has no seam.
  mesh.position.set(spec.x, -1, spec.z);

  const group = new THREE.Group();
  group.add(mesh);

  const shelfGeo = new THREE.CircleGeometry(spec.radius * 1.12, 32);
  shelfGeo.rotateX(-Math.PI / 2);
  const shelfMat = new THREE.MeshBasicMaterial({
    color: 0x4a5c48,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const shelf = new THREE.Mesh(shelfGeo, shelfMat);
  shelf.position.set(spec.x, -0.35, spec.z);
  group.add(shelf);

  return {
    group,
    spec,
    dispose() {
      geo.dispose();
      mat.dispose();
      shelfGeo.dispose();
      shelfMat.dispose();
    },
  };
}

export function createIslands(
  specs: IslandSpec[],
  segments: number,
  fogColor?: THREE.Color,
): IslandHandle[] {
  return specs.map((spec) => createIsland(spec, segments, fogColor));
}
