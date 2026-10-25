import * as THREE from 'three';
import { planetMaps, ringAlphaTexture } from './textures.js';
import type { PlanetAppearance } from './planet-data.js';

export type PlanetRecord = {
  data: {
    id: string;
    type: string;
    radius: number;
    position: number[];
    tilt: number;
    seed: number;
    palette: string[];
    rings?: boolean;
    ring?: PlanetAppearance['ring'];
    moons?: PlanetAppearance['moons'];
    spinPeriod?: number;
  };
  appearance: PlanetAppearance;
  body: THREE.Mesh;
  atmosphere?: THREE.Mesh;
  ring?: THREE.Mesh;
  moons: THREE.Object3D[];
};

export type PlanetGroup = THREE.Group & { userData: { planet: PlanetRecord } };

const geometryCache = new Map<string, THREE.SphereGeometry>();

function sphere(segments: number): THREE.SphereGeometry {
  const key = String(segments);
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = new THREE.SphereGeometry(1, segments, Math.max(16, segments / 2));
    geometryCache.set(key, geometry);
  }
  return geometry;
}

const atmosphereVertex = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const atmosphereFragment = /* glsl */ `
uniform vec3 glowColor;
uniform float intensity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vView))), 2.4);
  float alpha = fresnel * intensity;
  gl_FragColor = vec4(glowColor * alpha, alpha);
}
`;

export function createPlanet(
  data: PlanetRecord['data'] & PlanetAppearance,
  options: { mobile?: boolean; glow?: THREE.Texture } = {},
): PlanetGroup {
  const mobile = Boolean(options.mobile);
  const size = mobile ? 128 : 256;
  const maps = planetMaps(data.seed, data.palette, data.type, size);
  const material = new THREE.MeshStandardMaterial({
    map: maps.color,
    bumpMap: maps.bump,
    bumpScale: data.type === 'gas' ? 0.015 : 0.04,
    roughnessMap: maps.roughness,
    roughness: 1,
    metalness: data.type === 'ember' ? 0.15 : 0.02,
    emissive: data.type === 'ember' ? new THREE.Color(data.palette[0] ?? '#ff8844') : new THREE.Color('#0a0c12'),
    emissiveIntensity: data.type === 'ember' ? 0.2 : 0.04,
  });
  const body = new THREE.Mesh(sphere(mobile ? 32 : 48), material);
  body.scale.setScalar(data.radius);
  body.renderOrder = 0;

  const group = new THREE.Group() as PlanetGroup;
  group.add(body);

  let atmosphere: THREE.Mesh | undefined;
  if (data.atmosphere && data.type !== 'ember') {
    const glowColor = new THREE.Color((data.atmosphere.color as string) ?? '#88bbff');
    const atm = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex,
      fragmentShader: atmosphereFragment,
      uniforms: {
        glowColor: { value: glowColor },
        intensity: { value: 0.55 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    atmosphere = new THREE.Mesh(sphere(24), atm);
    atmosphere.scale.setScalar(data.radius * 1.06);
    atmosphere.renderOrder = 2;
    group.add(atmosphere);
  }

  let ring: THREE.Mesh | undefined;
  if (data.rings && data.ring) {
    const map = ringAlphaTexture(data.ring.bands, data.ring.gaps, data.seed);
    // Opaque + alphaTest so the ring stays in the opaque pass and depth-tests
    // against the planet (far half hidden). transparent:true would sort as a
    // single sprite-like object and let the far arc paint over the disc.
    const ringMat = new THREE.MeshStandardMaterial({
      map,
      color: '#e2d2b0',
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
      alphaTest: 0.08,
      roughness: 0.85,
      metalness: 0.05,
      emissive: '#1a1810',
      emissiveIntensity: 0.08,
    });
    const segments = mobile ? 128 : 192;
    ring = new THREE.Mesh(
      new THREE.RingGeometry(data.radius * data.ring.inner, data.radius * data.ring.outer, segments),
      ringMat,
    );
    ring.rotation.x = -Math.PI / 2 + data.ring.tilt;
    ring.rotation.y = data.tilt * 0.4;
    ring.rotation.z = data.tilt + 0.15;
    ring.renderOrder = 1;
    group.add(ring);
  }

  const moons: THREE.Object3D[] = [];
  for (const moon of data.moons ?? []) {
    const moonMaps = planetMaps(moon.seed, moon.palette.length ? moon.palette : ['#9a958c', '#6e6a62', '#c4bdb0'], 'rocky', 64);
    const mesh = new THREE.Mesh(
      sphere(16),
      new THREE.MeshStandardMaterial({
        map: moonMaps.color,
        bumpMap: moonMaps.bump,
        bumpScale: 0.03,
        roughness: 0.78,
        metalness: 0.05,
        color: '#c8c2b8',
        emissive: '#101014',
        emissiveIntensity: 0.05,
      }),
    );
    mesh.scale.setScalar(Math.max(moon.radius * data.radius, data.radius * 0.04));
    mesh.userData.moon = moon;
    group.add(mesh);
    moons.push(mesh);
  }

  group.position.fromArray(data.position);
  group.rotation.z = data.tilt;

  const record: PlanetRecord = {
    data,
    appearance: data,
    body,
    atmosphere,
    ring,
    moons,
  };
  group.userData = { planet: record };
  return group;
}

export function updatePlanet(group: PlanetGroup, time: number, _sunDirection?: THREE.Vector3): void {
  const { data, body, moons } = group.userData.planet;
  group.position.fromArray(data.position);
  body.rotation.y = time * Math.PI * 2 / Math.max(40, data.spinPeriod ?? 120);
  for (const mesh of moons) {
    const moon = mesh.userData.moon as { position?: number[]; worldRadius?: number };
    if (moon.position) mesh.position.fromArray(moon.position.map((n, i) => n - data.position[i]!));
  }
}

export function disposePlanet(group: PlanetGroup): void {
  const { body, atmosphere, ring, moons } = group.userData.planet;
  const meshes: THREE.Mesh[] = [body];
  if (atmosphere) meshes.push(atmosphere);
  if (ring) meshes.push(ring);
  for (const moon of moons) if (moon instanceof THREE.Mesh) meshes.push(moon);
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((item) => disposeMaterial(item));
    else disposeMaterial(material);
  }
}

function disposeMaterial(material: THREE.Material): void {
  const maps = material as THREE.MeshStandardMaterial;
  maps.map?.dispose();
  maps.bumpMap?.dispose();
  maps.roughnessMap?.dispose();
  material.dispose();
}
