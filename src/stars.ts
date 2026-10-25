import * as THREE from 'three';
import { softGlowTexture } from './textures.js';
import { random, hash } from './rng.js';
import type { EngineLook } from './settings.js';
import type { QualityTier } from './quality.js';

/**
 * Stars as InstancedMesh spheres (not THREE.Points).
 * Points fail to draw on ANGLE/SwiftShader in this environment; spheres billboard-free and stay visible.
 * Shell/band use world sizes tuned so at ~4k distance they read as ~1–3 px points.
 */
function starMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

export class StarField {
  look: EngineLook;
  tier: QualityTier;
  mobile: boolean;
  dpr: number;
  group = new THREE.Group();
  glow: THREE.Texture;
  geometry: THREE.SphereGeometry;
  shell: THREE.InstancedMesh;
  band: THREE.InstancedMesh;
  field: THREE.InstancedMesh;
  dust: THREE.Points;
  private dummy = new THREE.Object3D();
  private fieldCapacity = 0;

  constructor(seed: number, look: EngineLook, mobile = false, tier: QualityTier = 'high', dpr = 1) {
    this.look = look;
    this.mobile = mobile;
    this.tier = tier;
    this.dpr = Math.max(1, Math.min(2, dpr));
    this.glow = softGlowTexture(32);
    this.geometry = new THREE.SphereGeometry(1, 6, 4);
    this.shell = this.makeShell(seed);
    this.band = this.makeBand(seed);
    this.field = this.makeEmptyField();
    this.dust = this.makeDust(seed);
    this.group.add(this.shell, this.band, this.field, this.dust);
  }

  /** World sphere radius so a star at `distance` covers ~`px` pixels across. */
  private worldSizeForPx(px: number, distance: number): number {
    const height = 900;
    const fov = 52 * Math.PI / 180;
    // projected_diameter_px ≈ radius / distance * height / tan(fov/2)
    const radius = (px * this.dpr * distance * Math.tan(fov / 2)) / height;
    return Math.max(0.6, radius);
  }

  private makeShell(seed: number): THREE.InstancedMesh {
    const count = this.look.stars.shell.count[this.tier] ?? (this.mobile ? 2600 : 7000);
    const material = starMaterial();
    const mesh = new THREE.InstancedMesh(this.geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = -3;
    const rng = random(hash(seed, 3));
    const tints = this.look.REGIONS.tidepool.starTint.map((hex) => new THREE.Color(hex));
    const radius = 4200;
    const sizeMin = this.worldSizeForPx(1.1, radius);
    const sizeMax = this.worldSizeForPx(2.6, radius);
    for (let i = 0; i < count; i++) {
      const z = rng() * 2 - 1;
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      this.dummy.position.set(Math.cos(a) * r * radius, z * radius, Math.sin(a) * r * radius);
      const roll = rng();
      const size = sizeMin + (sizeMax - sizeMin) * roll ** 3;
      this.dummy.scale.setScalar(size);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      const color = tints[Math.floor(rng() * tints.length)]!.clone();
      const brightness = 0.75 + roll ** 2.2 * 1.6;
      color.multiplyScalar(brightness);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  private makeBand(seed: number): THREE.InstancedMesh {
    const count = this.mobile ? 1400 : 2800;
    const material = starMaterial();
    material.opacity = 0.85;
    const mesh = new THREE.InstancedMesh(this.geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = -3;
    const rng = random(hash(seed, 5));
    const radius = 4100;
    const size = this.worldSizeForPx(1.3, radius);
    for (let i = 0; i < count; i++) {
      const along = (rng() - 0.5) * Math.PI * 1.6;
      const height = (rng() - 0.5) * 0.16;
      this.dummy.position.set(Math.sin(along) * radius, height * radius, -Math.cos(along) * radius);
      this.dummy.scale.setScalar(size * (0.7 + rng() * 0.6));
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      const b = 0.55 + rng() * 0.75;
      mesh.setColorAt(i, new THREE.Color(0.82 * b, 0.9 * b, b));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  private makeEmptyField(): THREE.InstancedMesh {
    const material = starMaterial();
    const mesh = new THREE.InstancedMesh(this.geometry, material, 1);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = -2;
    this.fieldCapacity = 1;
    return mesh;
  }

  private makeDust(seed: number): THREE.Points {
    // Near dust still uses Points at close range (world-attenuated); small and dense.
    const settings = this.look.stars.dust;
    const count = this.mobile ? 500 : 1000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const rng = random(hash(seed, 9));
    const box = settings.box;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rng() - 0.5) * box;
      positions[i * 3 + 1] = (rng() - 0.5) * box;
      positions[i * 3 + 2] = (rng() - 0.5) * box;
      const c = 0.7 + rng() * 0.5;
      colors[i * 3] = c * 0.9;
      colors[i * 3 + 1] = c * 0.95;
      colors[i * 3 + 2] = c;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      map: this.glow,
      size: 0.45,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      toneMapped: false,
    });
    return new THREE.Points(geometry, material);
  }

  updateField(stars: Array<{ position: number[]; color?: string; temperature?: number; brightness?: number }>, origin: number[]): void {
    const count = stars.length;
    if (count > this.fieldCapacity) {
      this.group.remove(this.field);
      (this.field.material as THREE.Material).dispose();
      this.field.dispose();
      this.field = new THREE.InstancedMesh(this.geometry, starMaterial(), Math.max(count, 64));
      this.field.frustumCulled = false;
      this.field.renderOrder = -2;
      this.fieldCapacity = this.field.count;
      this.group.add(this.field);
    }
    this.field.count = count;
    const color = new THREE.Color();
    const distance = 800;
    const baseSize = this.worldSizeForPx(2.4, distance);
    for (let i = 0; i < count; i++) {
      const star = stars[i]!;
      this.dummy.position.set(
        star.position[0]! - origin[0]!,
        star.position[1]! - origin[1]!,
        star.position[2]! - origin[2]!,
      );
      const dist = Math.max(40, this.dummy.position.length());
      const size = baseSize * (distance / dist) * (0.7 + (star.brightness ?? 1) * 0.5);
      this.dummy.scale.setScalar(Math.min(40, Math.max(1.2, size)));
      this.dummy.updateMatrix();
      this.field.setMatrixAt(i, this.dummy.matrix);
      if (star.color) color.set(star.color);
      else color.setRGB(0.85, 0.9, 1);
      color.multiplyScalar((star.brightness ?? 1) * 1.4);
      this.field.setColorAt(i, color);
    }
    this.field.instanceMatrix.needsUpdate = true;
    if (this.field.instanceColor) this.field.instanceColor.needsUpdate = true;
  }

  follow(_position: number[]): void {
    // Shell/band/dust/field stay at scene origin (ship-relative).
  }

  setPixelRatio(dpr: number): void {
    this.dpr = Math.max(1, Math.min(2, dpr));
    // Sizes are baked into instance matrices at construction; acceptable for shot DPR stability.
  }

  dispose(): void {
    this.shell.dispose();
    this.band.dispose();
    this.field.dispose();
    this.dust.geometry.dispose();
    (this.dust.material as THREE.Material).dispose();
    (this.shell.material as THREE.Material).dispose();
    (this.band.material as THREE.Material).dispose();
    (this.field.material as THREE.Material).dispose();
    this.geometry.dispose();
    this.glow.dispose();
  }
}
