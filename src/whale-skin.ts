import * as THREE from 'three';
import { hash, random } from './rng.js';
import { makeNoise2D } from './noise.js';
import { clamp, lerp, smoothstep } from './math.js';
import { ATLAS_BODY_V, BODY_LENGTH, HEAD_X, crossSection, sampleProfile, type Profile } from './whale-model.js';

export type WhaleSkin = {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  dispose: () => void;
};

// sRGB 0–1. Humpbacks are near-black above and white or mottled beneath.
const BACK = [0.2, 0.225, 0.255];
const FLANK = [0.34, 0.37, 0.4];
const BELLY = [0.78, 0.8, 0.8];
const BARNACLE = [0.6, 0.59, 0.56];

/**
 * Runtime-generated skin atlas: countershading, mottling, throat pleats, jaw
 * crease, eye, blowholes, knobs, barnacles and scars, plus a matching normal map.
 * Layout follows the UVs from whale-model: body on top, flippers and flukes below.
 */
export function createWhaleSkin(seed: number, size: number): WhaleSkin {
  const W = size;
  const H = size;
  const rng = random(hash(seed, 0x5a1e));
  const n0 = makeNoise2D(seed, 31);
  const n1 = makeNoise2D(seed, 32);
  const color = new Float32Array(W * H * 3);
  const height = new Float32Array(W * H);

  const bodyRows = Math.floor(H * (1 - ATLAS_BODY_V));
  const profiles: Profile[] = [];
  for (let px = 0; px < W; px++) profiles.push(sampleProfile(clamp((px + 0.5) / W, 0.004, 1)));
  const point = { y: 0, z: 0 };

  // Surface noise on the 3D position, so the ventral seam does not show.
  const field = (x: number, y: number, z: number, f: number) => 0.5 * (n0(x * f, y * f + z * 0.5 * f) + n1(z * f + 19.1, x * f - y * 0.5 * f));

  // Low-frequency fields vary over tens of centimetres: sample them on a coarse
  // grid and interpolate, which keeps generation cheap at 1024².
  const G = Math.max(1, Math.round(W / 256));
  const gw = Math.ceil(W / G) + 1;
  const gh = Math.ceil(bodyRows / G) + 1;
  const gLow = new Float32Array(gw * gh);
  const gMid = new Float32Array(gw * gh);
  const gFleck = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    const v = 1 - (gy * G + 0.5) / H;
    const theta = Math.PI + ((v - ATLAS_BODY_V) / (1 - ATLAS_BODY_V)) * Math.PI * 2;
    for (let gx = 0; gx < gw; gx++) {
      const p = profiles[Math.min(W - 1, gx * G)]!;
      crossSection(p, theta, point);
      const k = gy * gw + gx;
      gLow[k] = field(p.x, point.y, point.z, 0.45);
      gMid[k] = field(p.x, point.y, point.z, 1.6);
      gFleck[k] = field(p.x, point.y, point.z, 3.1);
    }
  }
  const coarse = (grid: Float32Array, px: number, py: number) => {
    const fx = px / G;
    const fy = py / G;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const k = y0 * gw + x0;
    return lerp(lerp(grid[k]!, grid[k + 1]!, tx), lerp(grid[k + gw]!, grid[k + gw + 1]!, tx), ty);
  };

  /* ---- body region ---- */
  for (let py = 0; py < bodyRows; py++) {
    const v = 1 - (py + 0.5) / H;
    const theta = Math.PI + ((v - ATLAS_BODY_V) / (1 - ATLAS_BODY_V)) * Math.PI * 2;
    const c = Math.cos(theta);
    const flank = Math.abs(Math.sin(theta));
    for (let px = 0; px < W; px++) {
      const p = profiles[px]!;
      const u = p.u;
      crossSection(p, theta, point);
      const { y, z } = point;
      const x = p.x;
      const i = py * W + px;
      const low = coarse(gLow, px, py);
      const mid = coarse(gMid, px, py);
      const fine = n0(x * 9 + z * 3, y * 9 - z * 2);

      // Countershading: white throat and belly, dark tail stock underneath.
      const boundary = lerp(-0.12, -0.48, smoothstep(0.3, 0.55, u)) - 1.1 * smoothstep(0.62, 0.82, u);
      const belly = 1 - smoothstep(boundary - 0.24, boundary + 0.2, c + low * 0.28 + mid * 0.14);
      const sideTone = 1 - smoothstep(0.1, 0.9, c);
      let r = lerp(BACK[0]!, FLANK[0]!, sideTone * 0.6);
      let g = lerp(BACK[1]!, FLANK[1]!, sideTone * 0.6);
      let b = lerp(BACK[2]!, FLANK[2]!, sideTone * 0.6);
      // Speckled transition: pale flecks on dark, dark blotches on white.
      const fleck = smoothstep(0.3, 0.44, coarse(gFleck, px, py)) * (1 - belly) * (1 - smoothstep(-0.2, 0.4, c));
      // Small, irregular grey mottles that thicken toward the flanks; no hard black spots.
      const blot = smoothstep(0.1, 0.42, coarse(gFleck, px, py) + mid * 0.5) * (0.25 + 0.3 * (1 - belly)) * belly * smoothstep(-0.98, -0.45, c);
      const white = clamp(belly * (1 - blot) * (0.88 + 0.12 * low) + fleck * 0.45, 0, 1);
      r = lerp(r, BELLY[0]!, white);
      g = lerp(g, BELLY[1]!, white);
      b = lerp(b, BELLY[2]!, white);
      const mottle = 1 + 0.18 * low + 0.08 * mid + 0.04 * fine;
      r *= mottle;
      g *= mottle;
      b *= mottle;
      let h = 0.12 * fine + 0.25 * mid;

      // Ventral pleats: grooves from chin to navel, converging forward.
      const pleatFade = smoothstep(0.02, 0.08, u) * (1 - smoothstep(0.36, 0.44, u + 0.03 * low)) * (1 - smoothstep(-0.32, 0, c));
      if (pleatFade > 0) {
        const ang = Math.atan2(z, -(y - p.mid));
        const wave = ang * 8.5 + 0.06 * Math.sin(u * 28 + ang * 3) + 0.04 * mid;
        const groove = (0.5 + 0.5 * Math.cos(wave * Math.PI * 2)) ** 7;
        h -= 1.6 * groove * pleatFade;
        const shade = 1 - 0.22 * groove * pleatFade;
        r *= shade;
        g *= shade;
        b *= shade;
      }

      // Mouth line: dark crease from rostrum back toward the eye.
      if (p.jaw > 0) {
        const d = y - p.jawY;
        const line = Math.exp(-((d / 0.02) ** 2)) * p.jaw * smoothstep(0.25, 0.6, flank);
        h -= 2.2 * line;
        const shade = 1 - 0.65 * line;
        r *= shade;
        g *= shade;
        b *= shade;
      }

      color[i * 3] = r;
      color[i * 3 + 1] = g;
      color[i * 3 + 2] = b;
      height[i] = h;
    }
  }

  /* ---- flipper and fluke region ---- */
  for (let py = bodyRows; py < H; py++) {
    const v = 1 - (py + 0.5) / H;
    const phi = (v / ATLAS_BODY_V) * Math.PI * 2;
    const top = Math.sin(phi) > 0;
    const k = 0.5 + 0.5 * Math.cos(phi);
    for (let px = 0; px < W; px++) {
      const U = (px + 0.5) / W;
      const i = py * W + px;
      let r: number;
      let g: number;
      let b: number;
      let h: number;
      if (U < 0.5) {
        // Flippers: white beneath, dark-capped near the root on top.
        const s = U / 0.5;
        const nz = n0(s * 7, k * 3 + (top ? 0 : 9));
        const fine = n1(s * 40, k * 14);
        const dark = top ? 1 - smoothstep(0.12, 0.5, s + nz * 0.18) : 0.12 * smoothstep(0.4, 0.8, nz);
        const tone = lerp(BELLY[0]!, BACK[0]! * 1.2, dark);
        r = tone;
        g = lerp(BELLY[1]!, BACK[1]! * 1.2, dark);
        b = lerp(BELLY[2]!, BACK[2]! * 1.2, dark);
        const mottle = 1 + 0.1 * nz + 0.04 * fine;
        r *= mottle;
        g *= mottle;
        b *= mottle;
        h = 0.2 * fine;
      } else {
        // Flukes: dark above; beneath, a seed-unique black-and-white pattern with a dark trailing margin.
        const zf = (U - 0.5) / 0.25 - 1;
        const nz = n1(Math.abs(zf) * 3.2 + 4, k * 2.2) * 0.7 + n0(zf * 7, k * 5) * 0.3;
        const fine = n0(zf * 50, k * 16);
        let white = 0;
        if (!top) {
          // Soft-edged blotches rather than hard cut-outs.
          white = (0.15 + 0.7 * smoothstep(-0.35, 0.35, nz)) * (1 - smoothstep(0.7, 0.92, k)) * smoothstep(0.02, 0.14, k);
        }
        r = lerp(BACK[0]!, BELLY[0]!, white);
        g = lerp(BACK[1]!, BELLY[1]!, white);
        b = lerp(BACK[2]!, BELLY[2]!, white);
        const mottle = 1 + 0.12 * nz + 0.04 * fine;
        r *= mottle;
        g *= mottle;
        b *= mottle;
        h = 0.2 * fine;
      }
      color[i * 3] = r;
      color[i * 3 + 1] = g;
      color[i * 3 + 2] = b;
      height[i] = h;
    }
  }

  /* ---- stamped details on the body ---- */
  // Texel footprint of a radius-r disc at body coordinate u.
  const radiusAt = (u: number) => {
    const p = sampleProfile(u);
    return Math.max(0.05, (p.width + (p.top - p.bot) * 0.5) * 0.5);
  };
  const texel = (u: number, theta: number) => ({
    px: u * W,
    py: (1 - (ATLAS_BODY_V + (1 - ATLAS_BODY_V) * ((theta - Math.PI) / (Math.PI * 2)))) * H,
  });
  type Stamp = (dx: number, dy: number, i: number) => void;
  const stamp = (u: number, theta: number, r: number, reach: number, fn: Stamp) => {
    const t = texel(u, ((theta - Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) + Math.PI);
    const ru = (r / BODY_LENGTH) * W;
    const rv = (r / radiusAt(u) / (Math.PI * 2)) * (1 - ATLAS_BODY_V) * H;
    const ex = Math.ceil(ru * reach);
    const ey = Math.ceil(rv * reach);
    for (let oy = -ey; oy <= ey; oy++) {
      const py = Math.floor(t.py) + oy;
      if (py < 0 || py >= bodyRows) continue;
      for (let ox = -ex; ox <= ex; ox++) {
        const px = Math.floor(t.px) + ox;
        if (px < 0 || px >= W) continue;
        fn((px + 0.5 - t.px) / ru, (py + 0.5 - t.py) / rv, py * W + px);
      }
    }
  };
  const tint = (i: number, rgb: number[], a: number) => {
    color[i * 3] = lerp(color[i * 3]!, rgb[0]!, a);
    color[i * 3 + 1] = lerp(color[i * 3 + 1]!, rgb[1]!, a);
    color[i * 3 + 2] = lerp(color[i * 3 + 2]!, rgb[2]!, a);
  };
  const thetaAt = (side: 1 | -1, fromTop: number) => Math.PI * 2 + side * fromTop; // 2π = dorsal midline
  const barnacle = (u: number, theta: number, r: number) =>
    stamp(u, theta, r, 1.6, (dx, dy, i) => {
      const d = Math.hypot(dx, dy);
      if (d > 1.5) return;
      const ring = Math.exp(-(((d - 0.7) / 0.28) ** 2));
      const core = Math.exp(-((d / 0.35) ** 2));
      tint(i, BARNACLE, clamp(ring * 0.45 + core * 0.15, 0, 1));
      tint(i, [0.35, 0.34, 0.32], core * 0.5);
      height[i] = height[i]! + 1.6 * ring + 0.8 * core;
    });

  // Head knobs (tubercles) along the rostrum and lower jaw.
  for (let row = -2; row <= 2; row++) {
    const fromTop = Math.abs(row) * 0.32;
    const side = row < 0 ? -1 : 1;
    for (let u = 0.02 + rng() * 0.01; u < 0.17; u += 0.016 + rng() * 0.008) {
      const theta = thetaAt(side, fromTop + (rng() - 0.5) * 0.08);
      stamp(u, theta, 0.05, 2.2, (dx, dy, i) => {
        const d2 = dx * dx + dy * dy;
        height[i] = height[i]! + 2.4 * Math.exp(-d2);
        tint(i, [0.1, 0.11, 0.12], 0.25 * Math.exp(-d2));
      });
      if (rng() < 0.18) barnacle(u + (rng() - 0.5) * 0.004, theta, 0.022);
    }
  }
  for (const side of [1, -1] as const) {
    for (let u = 0.015 + rng() * 0.01; u < 0.16; u += 0.014 + rng() * 0.008) {
      // Just below the mouth line on the lower jaw.
      const p = sampleProfile(u);
      let best = Math.PI * 0.5;
      let bestD = Infinity;
      for (let a = 0.6; a < 2.6; a += 0.02) {
        crossSection(p, a, point);
        const d = Math.abs(point.y - (p.jawY - 0.1));
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
      const theta = thetaAt(side, best);
      stamp(u, theta, 0.045, 2.2, (dx, dy, i) => {
        height[i] = height[i]! + 2.2 * Math.exp(-(dx * dx + dy * dy));
      });
    }
  }

  // Barnacle clusters on the chin and jaw tip only.
  for (let n = 0; n < 34; n++) barnacle(0.004 + rng() ** 1.6 * 0.07, Math.PI + (rng() - 0.5) * 2.6, 0.018 + rng() * 0.025);
  for (let n = 0; n < 14; n++) barnacle(0.03 + rng() * 0.08, Math.PI + (rng() - 0.5) * 1.6, 0.016 + rng() * 0.02);

  // Eyes, just above the end of the mouth line.
  for (const side of [1, -1] as const) {
    const u = 0.207;
    const p = sampleProfile(u);
    let best = Math.PI * 0.5;
    let bestD = Infinity;
    for (let a = 0.6; a < 2.4; a += 0.01) {
      crossSection(p, a, point);
      const d = Math.abs(point.y - (p.jawY + 0.13));
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    stamp(u, thetaAt(side, best), 0.07, 2.6, (dx, dy, i) => {
      const d = Math.hypot(dx, dy * 1.3);
      tint(i, [0.03, 0.03, 0.035], clamp(1.6 - d * 1.6, 0, 1));
      tint(i, [0.4, 0.42, 0.44], Math.exp(-(((d - 1.35) / 0.3) ** 2)) * 0.35);
      height[i] = height[i]! + 3 * Math.exp(-((d / 1.6) ** 2));
    });
  }

  // Paired blowhole slits with a raised splash guard in front.
  {
    const u = 0.188;
    for (const side of [1, -1] as const) {
      stamp(u, thetaAt(side, 0.06), 0.12, 1.4, (dx, dy, i) => {
        const slit = Math.exp(-((dx / 1) ** 2) - (dy / 0.22) ** 2);
        tint(i, [0.03, 0.035, 0.04], slit * 0.9);
        height[i] = height[i]! - 4 * slit;
      });
    }
    stamp(u - 0.018, Math.PI * 2, 0.2, 1.5, (dx, dy, i) => {
      height[i] = height[i]! + 2.5 * Math.exp(-((dx / 0.45) ** 2) - (dy / 1) ** 2);
    });
  }

  // Pale healed scars on the flanks.
  for (let n = 0; n < 5; n++) {
    let u = 0.25 + rng() * 0.5;
    let theta = Math.PI * 2 + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 1.2);
    const du = (rng() - 0.5) * 0.004;
    const dt = (rng() - 0.5) * 0.03;
    const steps = 10 + Math.floor(rng() * 30);
    const strength = 0.18 + rng() * 0.25;
    for (let sIdx = 0; sIdx < steps; sIdx++) {
      stamp(u, theta, 0.014, 1.8, (dx, dy, i) => {
        const a = Math.exp(-(dx * dx + dy * dy)) * strength;
        tint(i, [0.62, 0.64, 0.64], a);
        height[i] = height[i]! - 0.6 * a;
      });
      u += du + 0.0015;
      theta += dt;
    }
  }

  // Rake marks on the fluke underside: parallel pale lines.
  {
    const lines = 3 + Math.floor(rng() * 3);
    const z0 = (rng() - 0.5) * 1.2;
    for (let l = 0; l < lines; l++) {
      for (let t = 0; t < 1; t += 0.004) {
        const zf = z0 + (t - 0.5) * 0.6 + l * 0.05;
        const k = 0.2 + t * 0.55;
        const phi = Math.PI + Math.acos(clamp(2 * k - 1, -1, 1));
        const px = Math.floor((0.5 + 0.25 * (zf + 1)) * W);
        const py = Math.floor((1 - (phi / (Math.PI * 2)) * ATLAS_BODY_V) * H);
        for (let o = -1; o <= 1; o++) {
          const ii = clamp(py + o, bodyRows, H - 1) * W + clamp(px, 0, W - 1);
          tint(ii, [0.75, 0.75, 0.73], 0.5);
        }
      }
    }
  }

  /* ---- encode ---- */
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = W;
  albedoCanvas.height = H;
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = W;
  normalCanvas.height = H;
  const actx = albedoCanvas.getContext('2d')!;
  const nctx = normalCanvas.getContext('2d')!;
  const albedo = actx.createImageData(W, H);
  const normal = nctx.createImageData(W, H);
  // Height units are millimetres-ish; scale against the ~1 cm texel.
  const strength = 0.55 * (W / 1024);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      albedo.data[i * 4] = clamp(Math.round(color[i * 3]! * 255), 0, 255);
      albedo.data[i * 4 + 1] = clamp(Math.round(color[i * 3 + 1]! * 255), 0, 255);
      albedo.data[i * 4 + 2] = clamp(Math.round(color[i * 3 + 2]! * 255), 0, 255);
      albedo.data[i * 4 + 3] = 255;
      const l = height[py * W + Math.max(0, px - 1)]!;
      const rr = height[py * W + Math.min(W - 1, px + 1)]!;
      const up = height[Math.max(0, py - 1) * W + px]!;
      const dn = height[Math.min(H - 1, py + 1) * W + px]!;
      // Canvas rows run down while V runs up (flipY), hence the sign on dy.
      const nx = -(rr - l) * 0.5 * strength;
      const ny = (dn - up) * 0.5 * strength;
      const len = Math.hypot(nx, ny, 1);
      normal.data[i * 4] = Math.round((nx / len * 0.5 + 0.5) * 255);
      normal.data[i * 4 + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      normal.data[i * 4 + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      normal.data[i * 4 + 3] = 255;
    }
  }
  actx.putImageData(albedo, 0, 0);
  nctx.putImageData(normal, 0, 0);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.anisotropy = 4;
  return {
    map,
    normalMap,
    dispose() {
      map.dispose();
      normalMap.dispose();
    },
  };
}

/** World x of the blowholes, for placing the spout. */
export const BLOWHOLE_U = 0.188;
export const BLOWHOLE_X = HEAD_X + BLOWHOLE_U * BODY_LENGTH;
