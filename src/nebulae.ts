import * as THREE from 'three';
import { nebulaSpriteTexture } from './textures.js';
import type { EngineLook } from './settings.js';

export type NebulaData = {
  key: string;
  position: number[];
  radius: number;
  seed?: number;
};

type NebulaVisual = {
  data: NebulaData;
  group: THREE.Group;
};

const PALETTE = {
  core: '#7fd6d2',
  shell: '#e07088',
  edge: '#c02858',
  dust: '#120e18',
};

export class Nebulae {
  look: EngineLook;
  mobile: boolean;
  group = new THREE.Group();
  items = new Map<string, NebulaVisual>();
  textures: Record<'core' | 'shell' | 'edge' | 'dust', THREE.Texture>;

  constructor(_renderer: THREE.WebGLRenderer, look: EngineLook, mobile = false) {
    this.look = look;
    this.mobile = mobile;
    this.textures = {
      core: nebulaSpriteTexture(11, 'core', mobile ? 128 : 192),
      shell: nebulaSpriteTexture(22, 'shell', mobile ? 128 : 192),
      edge: nebulaSpriteTexture(33, 'edge', mobile ? 128 : 192),
      dust: nebulaSpriteTexture(44, 'dust', mobile ? 96 : 128),
    };
  }

  load(data: NebulaData): void {
    if (this.items.has(data.key)) return;
    const group = new THREE.Group();
    // Keep clouds large enough to cover ~20–40% of a frame when nearby, without filling every shot.
    const radius = Math.min(data.radius, this.mobile ? 4500 : 7000);
    const layers: Array<{ kind: keyof typeof PALETTE; scale: number; opacity: number; blend: THREE.Blending; count: number }> = [
      { kind: 'edge', scale: 1.5, opacity: 0.55, blend: THREE.AdditiveBlending, count: this.mobile ? 6 : 9 },
      { kind: 'shell', scale: 1.05, opacity: 0.7, blend: THREE.AdditiveBlending, count: this.mobile ? 6 : 9 },
      { kind: 'core', scale: 0.55, opacity: 0.85, blend: THREE.AdditiveBlending, count: this.mobile ? 5 : 7 },
      { kind: 'dust', scale: 0.9, opacity: 0.18, blend: THREE.NormalBlending, count: 3 },
    ];
    const seed = data.seed ?? 1;
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i++) {
        const material = new THREE.SpriteMaterial({
          map: this.textures[layer.kind],
          color: PALETTE[layer.kind],
          transparent: true,
          opacity: layer.opacity * (0.85 + (i % 4) * 0.05),
          blending: layer.blend,
          depthWrite: false,
          depthTest: false,
          // Straight-alpha textures; premultiplied would darken additive sprites to invisibility.
          premultipliedAlpha: false,
          toneMapped: false,
        });
        const sprite = new THREE.Sprite(material);
        const spread = layer.kind === 'core' ? 0.25 : 0.6;
        sprite.position.set(
          Math.sin(i * 2.7 + seed) * spread * radius,
          Math.cos(i * 1.9 + seed * 0.7) * spread * 0.55 * radius,
          Math.sin(i * 3.1 + seed * 0.3) * spread * radius,
        );
        sprite.scale.setScalar(radius * layer.scale * (0.75 + (i % 3) * 0.12));
        sprite.renderOrder = -1;
        group.add(sprite);
      }
    }
    group.position.fromArray(data.position);
    this.group.add(group);
    this.items.set(data.key, { data, group });
  }

  unload(data: NebulaData): void {
    const item = this.items.get(data.key);
    if (!item) return;
    this.group.remove(item.group);
    item.group.traverse((object) => {
      if (object instanceof THREE.Sprite) object.material.dispose();
    });
    this.items.delete(data.key);
  }

  update(_camera: THREE.Camera): void {}

  dispose(): void {
    for (const item of [...this.items.values()]) this.unload(item.data);
    for (const texture of Object.values(this.textures)) texture.dispose();
  }
}
