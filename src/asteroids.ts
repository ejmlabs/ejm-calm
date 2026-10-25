import * as THREE from 'three';
import type { EngineLook } from './settings.js';
import type { QualityTier } from './quality.js';
import { random } from './rng.js';

export type AsteroidData = {
  position: number[];
  radius: number;
  composition: string;
  tint: number;
  rotation: number[];
  stretch: number;
};

const COLORS: Record<string, string> = {
  C: '#b0a89e',
  S: '#d2c4a8',
  M: '#c5cad2',
};

export class AsteroidKit {
  seed: number;
  look: EngineLook;
  tier: QualityTier;
  group = new THREE.Group();
  fields = new Map<string, THREE.InstancedMesh>();
  dummy = new THREE.Object3D();
  geometry: THREE.IcosahedronGeometry;
  materials: Record<string, THREE.MeshStandardMaterial>;

  constructor(seed: number, look: EngineLook, tier: QualityTier = 'high') {
    this.seed = seed;
    this.look = look;
    this.tier = tier;
    this.geometry = new THREE.IcosahedronGeometry(1, tier === 'low' ? 0 : 1);
    this.materials = {
      C: new THREE.MeshStandardMaterial({ color: COLORS.C, roughness: 0.88, metalness: 0.04, emissive: '#1a1816', emissiveIntensity: 0.06 }),
      S: new THREE.MeshStandardMaterial({ color: COLORS.S, roughness: 0.75, metalness: 0.1, emissive: '#1c1812', emissiveIntensity: 0.05 }),
      M: new THREE.MeshStandardMaterial({ color: COLORS.M, roughness: 0.42, metalness: 0.55, emissive: '#121418', emissiveIntensity: 0.05 }),
    };
  }

  loadField(key: string, rocks: AsteroidData[]): void {
    this.unloadField(key);
    if (!rocks.length) return;
    const byClass = new Map<string, AsteroidData[]>();
    for (const rock of rocks) {
      const list = byClass.get(rock.composition) ?? [];
      list.push(rock);
      byClass.set(rock.composition, list);
    }
    for (const [name, list] of byClass) {
      const material = this.materials[name] ?? this.materials.C!;
      const mesh = new THREE.InstancedMesh(this.geometry, material, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      list.forEach((rock, index) => {
        this.dummy.position.fromArray(rock.position);
        this.dummy.rotation.fromArray(rock.rotation as [number, number, number]);
        this.dummy.scale.set(rock.radius, rock.radius * rock.stretch, rock.radius);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix);
        const tint = 0.85 + rock.tint * 0.3;
        mesh.setColorAt?.(index, new THREE.Color(tint, tint, tint));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
      this.fields.set(`${key}:${name}`, mesh);
    }
  }

  unloadField(key: string): void {
    for (const [name, mesh] of [...this.fields.entries()]) {
      if (!name.startsWith(`${key}:`)) continue;
      this.group.remove(mesh);
      mesh.dispose();
      this.fields.delete(name);
    }
  }

  dispose(): void {
    for (const key of [...this.fields.keys()]) this.unloadField(key.split(':')[0]!);
    this.geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}

export function sampleRockMesh(_seed: number): THREE.BufferGeometry {
  const rng = random(_seed);
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.attributes.position!;
  for (let i = 0; i < position.count; i++) {
    const scale = 0.75 + rng() * 0.5;
    position.setXYZ(i, position.getX(i) * scale, position.getY(i) * scale, position.getZ(i) * scale);
  }
  geometry.computeVertexNormals();
  return geometry;
}
