import * as THREE from 'three';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { random, type Rng } from './rng.js';

export function softGlowTexture(size = 64): THREE.Texture {
  if (typeof document === 'undefined') {
    const data = new Uint8Array(size * size * 4);
    const half = (size - 1) / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - half, y - half) / (size / 2);
      const a = Math.max(0, 1 - r);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * a * 255);
    }
    const texture = new THREE.DataTexture(data, size, size);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Tight disc for distant star Points — most energy in the core so 2–3px stars stay visible. */
export function starPointTexture(size = 64): THREE.Texture {
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - half, y - half) / (size / 2);
      // Hard core, short soft wing — reads as a point, not a haze.
      const core = Math.max(0, 1 - r * 2.8);
      const wing = Math.max(0, 1 - r);
      const a = Math.min(1, core * core + wing * wing * wing * 0.35);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function nebulaSpriteTexture(seed: number, kind: 'core' | 'shell' | 'edge' | 'dust', size = 128): THREE.Texture {
  const rng = random(seed);
  const noise = createNoise2D(() => rng());
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const cx = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / cx, dy = (y - cx) / cx;
      const r = Math.hypot(dx, dy);
      if (r > 1) continue;
      const falloff = kind === 'dust' ? Math.max(0, 1 - r) ** 1.4 : Math.max(0, 1 - r * r);
      const n = 0.55 + 0.45 * noise(dx * 2.4 + seed * 0.01, dy * 2.4);
      const lanes = kind === 'dust' ? Math.max(0, noise(dx * 5, dy * 1.2) * 0.5 + 0.5) : 1;
      let alpha = falloff * n * lanes;
      if (kind === 'core') alpha *= 0.85;
      else if (kind === 'shell') alpha *= 0.7;
      else if (kind === 'edge') alpha *= 0.55;
      else alpha *= 0.28;
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.min(255, Math.round(alpha * 255));
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.premultiplyAlpha = false;
  texture.needsUpdate = true;
  return texture;
}

export function galaxySpriteTexture(seed: number, kind: 'spiral' | 'elliptical' = 'spiral', size = 128): THREE.Texture {
  const rng = random(seed);
  const noise = createNoise2D(() => rng());
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const cx = size / 2;
  const arms = 2 + Math.floor(rng() * 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / cx, dy = (y - cx) / cx;
      const r = Math.hypot(dx, dy);
      if (r > 1) continue;
      const angle = Math.atan2(dy, dx);
      let density = Math.exp(-r * r * 3.2);
      if (kind === 'spiral') {
        const arm = Math.cos(angle * arms - r * 9) * 0.5 + 0.5;
        density *= 0.25 + arm * 0.9;
        density *= 0.7 + 0.3 * noise(dx * 4, dy * 4);
      } else {
        density *= 0.85 + 0.15 * noise(dx * 2, dy * 2);
      }
      const soft = Math.max(0, 1 - r);
      const alpha = density * soft * soft * 0.85;
      const i = (y * size + x) * 4;
      const tint = 200 + Math.floor(rng() * 40);
      image.data[i] = tint;
      image.data[i + 1] = tint;
      image.data[i + 2] = Math.min(255, tint + 20);
      image.data[i + 3] = Math.min(255, Math.round(alpha * 255));
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Smooth 1D radial ring map (u across RingGeometry). LinearFilter + mipmaps avoid stair-steps. */
export function ringAlphaTexture(bands: number, gaps: number[], seed: number, size = 512): THREE.Texture {
  const rng = random(seed);
  // Layout 1×N so RingGeometry v (inner→outer) samples the radial axis.
  const data = new Uint8Array(size * 4);
  for (let y = 0; y < size; y++) {
    const t = (y + 0.5) / size;
    let alpha = 0.42 + 0.38 * (0.5 + 0.5 * Math.sin(t * bands * Math.PI * 2 + seed * 0.01));
    alpha *= 0.55 + 0.45 * Math.sin(t * Math.PI);
    for (const gap of gaps) {
      const d = Math.abs(t - gap);
      alpha *= 1 - 0.92 * Math.exp(-(d * d) / (2 * 0.018 * 0.018));
    }
    alpha *= 0.88 + 0.12 * rng();
    const i = y * 4;
    data[i] = data[i + 1] = data[i + 2] = 230;
    data[i + 3] = Math.min(255, Math.round(Math.max(0, alpha) * 255));
  }
  const texture = new THREE.DataTexture(data, 1, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const n = Number.parseInt(value.length === 3 ? value.split('').map((c) => c + c).join('') : value, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function planetMaps(
  seed: number,
  palette: string[],
  type: string,
  size = 256,
): { color: THREE.Texture; bump: THREE.Texture; roughness: THREE.Texture } {
  const rng = random(seed);
  const noise = createNoise3D(() => rng());
  const colors = palette.map(hexToRgb);
  const colorImage = { data: new Uint8ClampedArray(size * size * 4) };
  const bumpImage = { data: new Uint8ClampedArray(size * size * 4) };
  const roughImage = { data: new Uint8ClampedArray(size * size * 4) };

  for (let y = 0; y < size; y++) {
    const lat = ((y + 0.5) / size - 0.5) * Math.PI;
    const cy = Math.cos(lat), sy = Math.sin(lat);
    for (let x = 0; x < size; x++) {
      const lon = (x + 0.5) / size * Math.PI * 2;
      const px = Math.cos(lon) * cy, pz = Math.sin(lon) * cy, py = sy;
      let n = 0, amp = 1, sum = 0;
      for (let o = 0; o < 5; o++) {
        n += noise(px * amp * 2, py * amp * 2, pz * amp * 2) * (1 / amp);
        sum += 1 / amp;
        amp *= 2.05;
      }
      n = (n / sum) * 0.5 + 0.5;
      if (type === 'gas' || type === 'ice') n = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(lat * (4 + seed % 5) + n * 3));
      const idx = Math.min(colors.length - 1, Math.floor(n * colors.length));
      const next = colors[Math.min(colors.length - 1, idx + 1)]!;
      const a = colors[idx]!;
      const f = n * colors.length - idx;
      const i = (y * size + x) * 4;
      colorImage.data[i] = Math.round(a[0] + (next[0] - a[0]) * f);
      colorImage.data[i + 1] = Math.round(a[1] + (next[1] - a[1]) * f);
      colorImage.data[i + 2] = Math.round(a[2] + (next[2] - a[2]) * f);
      colorImage.data[i + 3] = 255;
      const height = Math.round(n * 255);
      bumpImage.data[i] = bumpImage.data[i + 1] = bumpImage.data[i + 2] = height;
      bumpImage.data[i + 3] = 255;
      const rough = type === 'gas' ? 0.85 : type === 'ice' ? 0.25 + n * 0.35 : 0.45 + n * 0.4;
      const rv = Math.round(rough * 255);
      roughImage.data[i] = roughImage.data[i + 1] = roughImage.data[i + 2] = rv;
      roughImage.data[i + 3] = 255;
    }
  }
  const toTexture = (data: Uint8ClampedArray, srgb: boolean) => {
    const texture = new THREE.DataTexture(new Uint8Array(data.buffer.slice(0)), size, size);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  };
  return {
    color: toTexture(colorImage.data, true),
    bump: toTexture(bumpImage.data, false),
    roughness: toTexture(roughImage.data, false),
  };
}

export function seededRng(seed: number): Rng {
  return random(seed);
}
