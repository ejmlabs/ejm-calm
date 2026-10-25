import * as THREE from 'three';
import { galaxySpriteTexture } from './textures.js';
import { hash } from './rng.js';

export type GalaxyData = {
  position: number[];
  radius: number;
  rotation: number;
  seed: number;
};

const cache = new Map<string, THREE.Texture>();

function textureFor(seed: number): THREE.Texture {
  const kind = seed % 3 === 0 ? 'elliptical' : 'spiral';
  const key = `${kind}:${seed % 7}`;
  let texture = cache.get(key);
  if (!texture) {
    texture = galaxySpriteTexture(hash(seed, 19), kind, 96);
    cache.set(key, texture);
  }
  return texture;
}

export function createGalaxySprite(data: GalaxyData): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: textureFor(data.seed),
    color: '#c9d2e4',
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  // Smaller and softer than the old sticker-halos; slight non-uniform scale ≈ inclination.
  const incline = 0.45 + (data.seed % 100) / 200;
  sprite.scale.set(data.radius * 0.55, data.radius * 0.55 * incline, 1);
  sprite.position.fromArray(data.position);
  sprite.material.rotation = data.rotation;
  sprite.userData.galaxy = data;
  return sprite;
}

export class GalaxySky {
  group = new THREE.Group();

  add(data: GalaxyData): THREE.Sprite {
    const sprite = createGalaxySprite(data);
    this.group.add(sprite);
    return sprite;
  }

  clear(): void {
    while (this.group.children.length) {
      const child = this.group.children.pop()!;
      if (child instanceof THREE.Sprite) child.material.dispose();
    }
  }
}
