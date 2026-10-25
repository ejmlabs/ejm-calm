import * as THREE from 'three';
import { softGlowTexture } from './textures.js';
import { random, hash } from './rng.js';
import type { EngineLook } from './settings.js';

export type RareEventKind = 'comet' | 'binary' | 'pulsar';

export class RareEvents {
  seed: number;
  look: EngineLook;
  group = new THREE.Group();
  glow: THREE.Texture;
  debugKind?: RareEventKind;
  active: THREE.Object3D[] = [];

  constructor(seed: number, look: EngineLook, glow?: THREE.Texture, debugKind?: RareEventKind) {
    this.seed = seed;
    this.look = look;
    this.glow = glow ?? softGlowTexture();
    this.debugKind = debugKind;
    if (debugKind) this.spawnDebug(debugKind);
  }

  private spawnDebug(kind: RareEventKind): void {
    const object = this.make(kind, [40, 8, -60], hash(this.seed, 99));
    this.group.add(object);
    this.active.push(object);
  }

  load(event: { position: number[]; kind: string; phase?: number }): void {
    const object = this.make(event.kind as RareEventKind, event.position, hash(this.seed, event.position[0]!, event.position[2]!));
    this.group.add(object);
    this.active.push(object);
  }

  unload(): void {
    for (const object of this.active) {
      this.group.remove(object);
      object.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Sprite) {
          child.geometry?.dispose?.();
          const material = (child as THREE.Mesh).material;
          if (material) {
            if (Array.isArray(material)) material.forEach((item) => item.dispose());
            else (material as THREE.Material).dispose();
          }
        }
      });
    }
    this.active = [];
    if (this.debugKind) this.spawnDebug(this.debugKind);
  }

  private make(kind: RareEventKind, position: number[], seed: number): THREE.Object3D {
    const group = new THREE.Group();
    group.position.fromArray(position);
    if (kind === 'comet') {
      const head = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glow, color: '#dff6ff', transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      head.scale.setScalar(6);
      group.add(head);
      const tail = new THREE.Mesh(
        new THREE.ConeGeometry(1.2, 28, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: '#9fdfff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      tail.rotation.x = Math.PI / 2;
      tail.position.z = 14;
      group.add(tail);
    } else if (kind === 'binary') {
      for (const side of [-1, 1]) {
        const star = new THREE.Mesh(
          new THREE.SphereGeometry(2.2, 16, 12),
          new THREE.MeshBasicMaterial({ color: side > 0 ? '#ffe6b0' : '#b0c8ff' }),
        );
        star.position.x = side * 6;
        group.add(star);
      }
    } else {
      const core = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      group.add(core);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 80, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: '#a8d8ff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      group.add(beam);
      group.userData.spin = 1.8;
    }
    group.userData.seed = seed;
    return group;
  }

  update(time: number): void {
    for (const object of this.active) {
      if (object.userData.spin) object.rotation.z = time * object.userData.spin;
    }
  }

  dispose(): void {
    this.unload();
    this.glow.dispose();
  }
}

// Silence unused import when tree-shaken differently
void random;
