import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './math.js';

/**
 * Humpback-style whale anatomy in metres, local frame:
 * head on −X, tail on +X, back on +Y, left flank on +Z.
 * The body tube runs from the rostrum (u = 0) to the fluke insertion (u = 1);
 * the flukes reach past it so the whole animal is WHALE_LENGTH long.
 */
export const HEAD_X = -6;
export const TAIL_X = 4.6;
export const BODY_LENGTH = TAIL_X - HEAD_X;
export const WHALE_LENGTH = 12;
/** Humpback flippers are about a third of body length. */
export const FLIPPER_LENGTH = 4;
export const FLUKE_HALF_SPAN = 2;
/** Fluke trailing edge depth from the insertion: centre notch versus the lobes. */
export const FLUKE_NOTCH_CHORD = 0.55;
export const FLUKE_LOBE_CHORD = 1.1;

export type WhaleDetail = 'high' | 'medium' | 'low';

export type DetailSpec = {
  rings: number;
  radial: number;
  flipperSpan: number;
  flipperLoop: number;
  flukeSpan: number;
  flukeLoop: number;
  /** Leading-edge knobs need spanwise samples; low detail drops them. */
  tubercles: number;
};

export const WHALE_DETAIL: Record<WhaleDetail, DetailSpec> = {
  high: { rings: 132, radial: 52, flipperSpan: 56, flipperLoop: 14, flukeSpan: 44, flukeLoop: 14, tubercles: 1 },
  medium: { rings: 76, radial: 32, flipperSpan: 26, flipperLoop: 10, flukeSpan: 26, flukeLoop: 10, tubercles: 0.5 },
  low: { rings: 40, radial: 18, flipperSpan: 10, flipperLoop: 6, flukeSpan: 14, flukeLoop: 6, tubercles: 0 },
};

/** Camera distances where each level takes over, per quality tier. */
export const WHALE_LOD: Record<'high' | 'medium' | 'low', Array<{ detail: WhaleDetail; distance: number }>> = {
  high: [
    { detail: 'high', distance: 0 },
    { detail: 'medium', distance: 55 },
    { detail: 'low', distance: 140 },
  ],
  medium: [
    { detail: 'medium', distance: 0 },
    { detail: 'low', distance: 90 },
  ],
  low: [
    { detail: 'medium', distance: 0 },
    { detail: 'low', distance: 60 },
  ],
};

/* ---------------------------------------------------------------- profile */

// Side and top outline, sampled along u. Dorsal and ventral lines are absolute
// heights; width is the half-width. The head slopes up to a flat rostrum, the
// throat is deep, and the tail stock is laterally compressed.
const PU = [0, 0.02, 0.06, 0.12, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.88, 0.95, 1];
const PTOP = [0.04, 0.27, 0.5, 0.7, 0.9, 1.12, 1.2, 1.17, 1.06, 0.85, 0.6, 0.41, 0.27, 0.19];
const PBOT = [-0.1, -0.3, -0.6, -0.92, -1.18, -1.3, -1.27, -1.1, -0.86, -0.61, -0.4, -0.28, -0.2, -0.15];
const PWID = [0.05, 0.28, 0.54, 0.8, 1.03, 1.2, 1.22, 1.1, 0.86, 0.58, 0.45, 0.28, 0.18, 0.12];

function curve(xs: number[], ys: number[], x: number): number {
  // Monotone cubic (Fritsch–Carlson) so the outline never overshoots.
  const n = xs.length;
  if (x <= xs[0]!) return ys[0]!;
  if (x >= xs[n - 1]!) return ys[n - 1]!;
  let i = 0;
  while (x > xs[i + 1]!) i++;
  const slope = (k: number) => {
    if (k <= 0) return (ys[1]! - ys[0]!) / (xs[1]! - xs[0]!);
    if (k >= n - 1) return (ys[n - 1]! - ys[n - 2]!) / (xs[n - 1]! - xs[n - 2]!);
    const a = (ys[k]! - ys[k - 1]!) / (xs[k]! - xs[k - 1]!);
    const b = (ys[k + 1]! - ys[k]!) / (xs[k + 1]! - xs[k]!);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  const h = xs[i + 1]! - xs[i]!;
  const t = (x - xs[i]!) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * ys[i]! +
    (t3 - 2 * t2 + t) * h * slope(i) +
    (-2 * t3 + 3 * t2) * ys[i + 1]! +
    (t3 - t2) * h * slope(i + 1)
  );
}

export type Profile = {
  u: number;
  x: number;
  top: number;
  bot: number;
  width: number;
  mid: number;
  topExp: number;
  botExp: number;
  hump: number;
  fin: number;
  jawY: number;
  jaw: number;
};

/** Dorsal fin height along u: gentle front on the hump, steep hooked rear. */
export function dorsalFin(u: number): number {
  // Rises slowly off the hump to a pointed, swept tip, then drops away steeply behind it.
  return 0.32 * smoothstep(0.59, 0.668, u) ** 1.8 * (1 - smoothstep(0.669, 0.69, u));
}

export function sampleProfile(u: number): Profile {
  const top = curve(PU, PTOP, u);
  const bot = curve(PU, PBOT, u);
  const width = curve(PU, PWID, u);
  // Widest line sits below the middle: broad belly, narrower back.
  const mid = bot + (top - bot) * 0.46;
  const jaw = smoothstep(0, 0.03, u) * (1 - smoothstep(0.185, 0.215, u));
  return {
    u,
    x: HEAD_X + u * BODY_LENGTH,
    top,
    bot,
    width,
    mid,
    // Flat-topped rostrum, rounder body, keeled tail stock.
    topExp: lerp(2.7, 2.15, smoothstep(0.05, 0.3, u)) - 0.15 * smoothstep(0.75, 0.95, u),
    botExp: 2.2 - 0.55 * smoothstep(0.72, 0.92, u),
    hump: 0.1 * Math.exp(-(((u - 0.64) / 0.06) ** 2)),
    fin: dorsalFin(u),
    // Mouth line drops gently from the rostrum toward the eye.
    jawY: bot + (top - bot) * lerp(0.55, 0.4, clamp(u / 0.2, 0, 1)),
    jaw,
  };
}

function signedPow(v: number, e: number): number {
  return Math.sign(v) * Math.abs(v) ** e;
}

/**
 * Point on the skin for ring profile `p` at angle `theta`
 * (0 = dorsal midline, π/2 = left flank, π = belly).
 */
export function crossSection(p: Profile, theta: number, out: { y: number; z: number }): { y: number; z: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const exp = c >= 0 ? p.topExp : p.botExp;
  let z = p.width * signedPow(s, 2 / exp);
  let y = c >= 0 ? p.mid + (p.top - p.mid) * signedPow(c, 2 / exp) : p.mid + (p.mid - p.bot) * signedPow(c, 2 / exp);
  if (c > 0) {
    // Dorsal hump and small fin ride on the midline.
    const fromTop = Math.atan2(Math.abs(s), c);
    y += p.hump * c ** 4 + p.fin * Math.exp(-((fromTop / 0.11) ** 2));
  }
  if (p.jaw > 0) {
    // Lower jaw sits slightly proud of the upper; a soft crease marks the mouth line.
    const d = y - p.jawY;
    const flank = Math.abs(s);
    z *= 1 + 0.045 * p.jaw * flank * (1 - smoothstep(-0.12, 0.03, d));
    z *= 1 - 0.035 * p.jaw * flank * Math.exp(-((d / 0.055) ** 2));
  }
  out.y = y;
  out.z = z;
  return out;
}

/* ---------------------------------------------------------------- skeleton */

export type BoneSpec = { name: string; x: number; parent: number };

/** Spine bones sorted head→tail; B0 is the root near the centre of mass. */
export const SPINE: BoneSpec[] = [
  { name: 'H2', x: -5, parent: 1 },
  { name: 'H1', x: -3.4, parent: 2 },
  { name: 'B0', x: -1.4, parent: -1 },
  { name: 'B1', x: 0.4, parent: 2 },
  { name: 'B2', x: 1.9, parent: 3 },
  { name: 'B3', x: 3.0, parent: 4 },
  { name: 'B4', x: 3.9, parent: 5 },
  { name: 'B5', x: TAIL_X, parent: 6 },
];
export const ROOT_BONE = 2;
export const FLUKE_BONE = 7;
export const FLIPPER_L = 8;
export const FLIPPER_R = 9;
export const BONE_COUNT = 10;

export function spineY(x: number): number {
  const p = sampleProfile(clamp((x - HEAD_X) / BODY_LENGTH, 0, 1));
  return (p.top + p.bot) * 0.5;
}

/** Flipper root on the lower flank behind the head, slightly inside the skin. */
export const FLIPPER_ROOT_U = 0.31;
export function flipperRoot(side: 1 | -1): THREE.Vector3 {
  const p = sampleProfile(FLIPPER_ROOT_U);
  const point = crossSection(p, Math.PI * 0.5 + 0.62, { y: 0, z: 0 });
  return new THREE.Vector3(p.x, p.mid + (point.y - p.mid) * 0.9, side * point.z * 0.86);
}

/** Rest orientation: droop down and sweep back, mirrored for the right side. */
export const FLIPPER_DROOP = 0.62;
export const FLIPPER_SWEEP = 0.5;
export function flipperQuaternion(side: 1 | -1, droop: number, sweep: number, twist: number, out = new THREE.Quaternion()): THREE.Quaternion {
  const qy = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, side * sweep);
  const qx = new THREE.Quaternion().setFromAxisAngle(X_AXIS, side * droop);
  const qz = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, side * twist);
  return out.copy(qy).multiply(qx).multiply(qz);
}
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/* ---------------------------------------------------------------- geometry */

type Part = {
  positions: number[];
  uvs: number[];
  indices: number[];
  skinIndex: number[];
  skinWeight: number[];
  /** Pairs of vertex indices that share a position and must share a normal. */
  seams: Array<[number, number]>;
};

function newPart(): Part {
  return { positions: [], uvs: [], indices: [], skinIndex: [], skinWeight: [], seams: [] };
}

function spineWeights(x: number): [number, number, number, number] {
  const first = SPINE[0]!;
  const last = SPINE[SPINE.length - 1]!;
  if (x <= first.x) return [0, 0, 1, 0];
  if (x >= last.x) return [SPINE.length - 1, 0, 1, 0];
  let i = 0;
  while (x > SPINE[i + 1]!.x) i++;
  const t = smoothstep(0, 1, (x - SPINE[i]!.x) / (SPINE[i + 1]!.x - SPINE[i]!.x));
  return [i, i + 1, 1 - t, t];
}

/** Ring stations packed toward the head, the dorsal fin and the tail. */
export function ringStations(count: number): number[] {
  const samples = 400;
  const cdf: number[] = [0];
  const density = (u: number) =>
    1 + 1.5 * Math.exp(-((u / 0.12) ** 2)) + 1.1 * Math.exp(-(((u - 0.655) / 0.05) ** 2)) + 0.5 * Math.exp(-(((u - 1) / 0.12) ** 2));
  for (let i = 1; i <= samples; i++) cdf.push(cdf[i - 1]! + density((i - 0.5) / samples));
  const total = cdf[samples]!;
  const out: number[] = [];
  let k = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / (count - 1)) * total;
    while (k < samples && cdf[k + 1]! < target) k++;
    const span = cdf[k + 1]! - cdf[k]!;
    const f = span > 0 ? (target - cdf[k]!) / span : 0;
    out.push(clamp((k + f) / samples, 0, 1));
  }
  out[0] = 0;
  out[count - 1] = 1;
  return out;
}

/** Atlas regions: body on the top three quarters, flippers and flukes below. */
export const ATLAS_BODY_V = 0.25;

function buildBody(spec: DetailSpec, part: Part): void {
  const stations = ringStations(spec.rings);
  const R = spec.radial;
  const tmp = { y: 0, z: 0 };
  const ringStart: number[] = [];
  for (let i = 0; i < stations.length; i++) {
    const u = stations[i]!;
    // Keep a small first ring; the rostrum closes on a tip vertex.
    const p = sampleProfile(Math.max(u, 0.004));
    const w = spineWeights(p.x);
    ringStart.push(part.positions.length / 3);
    for (let j = 0; j <= R; j++) {
      // Seam on the ventral midline, where it is least visible.
      const theta = Math.PI + (j / R) * Math.PI * 2;
      crossSection(p, theta, tmp);
      part.positions.push(p.x, tmp.y, tmp.z);
      part.uvs.push(u, ATLAS_BODY_V + (1 - ATLAS_BODY_V) * (j / R));
      part.skinIndex.push(w[0], w[1], 0, 0);
      part.skinWeight.push(w[2], w[3], 0, 0);
    }
    part.seams.push([ringStart[i]!, ringStart[i]! + R]);
  }
  for (let i = 0; i < stations.length - 1; i++) {
    const a0 = ringStart[i]!;
    const b0 = ringStart[i + 1]!;
    for (let j = 0; j < R; j++) {
      const a = a0 + j;
      const b = b0 + j;
      part.indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  // Caps: rostrum tip and a closed tail end hidden inside the fluke root.
  const caps: Array<{ ring: number; x: number; flip: boolean; u: number }> = [
    { ring: 0, x: HEAD_X - 0.04, flip: false, u: 0 },
    { ring: stations.length - 1, x: TAIL_X + 0.06, flip: true, u: 1 },
  ];
  for (const cap of caps) {
    const p = sampleProfile(cap.u);
    const tip = part.positions.length / 3;
    const w = spineWeights(cap.x);
    part.positions.push(cap.x, cap.u === 0 ? p.mid + 0.02 : (p.top + p.bot) * 0.5, 0);
    part.uvs.push(cap.u, ATLAS_BODY_V + (1 - ATLAS_BODY_V) * 0.5);
    part.skinIndex.push(w[0], w[1], 0, 0);
    part.skinWeight.push(w[2], w[3], 0, 0);
    const start = ringStart[cap.ring]!;
    for (let j = 0; j < R; j++) {
      if (cap.flip) part.indices.push(tip, start + j + 1, start + j);
      else part.indices.push(tip, start + j, start + j + 1);
    }
  }
}

/** Approximate NACA 00xx half-thickness at chord fraction k (0 = leading edge). */
function foil(k: number): number {
  const x = clamp(k, 0, 1);
  return 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
}

export type FlipperStation = { le: number; chord: number; thick: number };

/** Flipper planform at span fraction s: long, narrow, swept, scalloped leading edge. */
export function flipperStation(s: number, tubercles: number): FlipperStation {
  const chord = 0.92 * (0.78 + 0.22 * Math.sin(Math.PI * clamp(s * 1.3, 0, 1))) * Math.sqrt(Math.max(0, 1 - s ** 2.6)) + 0.025;
  const sweep = 0.55 * s * s;
  const knobs = tubercles * 0.05 * Math.max(0, Math.sin(Math.PI * 10 * s)) ** 0.8 * smoothstep(0.1, 0.3, s) * (1 - smoothstep(0.9, 1, s));
  return {
    le: sweep - chord * 0.3 - knobs,
    chord: chord + knobs,
    thick: 0.09 * (1 - 0.75 * s) + 0.01,
  };
}

function buildFlipper(spec: DetailSpec, side: 1 | -1, bone: number, part: Part): void {
  const root = flipperRoot(side);
  const rest = flipperQuaternion(side, FLIPPER_DROOP, FLIPPER_SWEEP, 0);
  const S = spec.flipperSpan;
  const C = spec.flipperLoop;
  const v = new THREE.Vector3();
  const base = part.positions.length / 3;
  for (let i = 0; i <= S; i++) {
    const s = i / S;
    const st = flipperStation(s, spec.tubercles);
    // Root sinks into the body; blend its weight with the trunk.
    const trunk = 1 - smoothstep(0.02, 0.14, s);
    const start = part.positions.length / 3;
    for (let j = 0; j <= C; j++) {
      const phi = (j / C) * Math.PI * 2;
      const k = 0.5 + 0.5 * Math.cos(phi); // 1 at trailing edge, 0 at leading edge
      const t = foil(k) * st.thick * Math.sign(Math.sin(phi) || 1) * (j === 0 || j === C ? 0 : 1);
      v.set(st.le + k * st.chord, t, (s * FLIPPER_LENGTH - 0.25) * side);
      v.applyQuaternion(rest).add(root);
      part.positions.push(v.x, v.y, v.z);
      part.uvs.push(s * 0.5, (j / C) * ATLAS_BODY_V);
      part.skinIndex.push(bone, ROOT_BONE, 0, 0);
      part.skinWeight.push(1 - trunk, trunk, 0, 0);
    }
    if (i === S) part.seams.push([start, start + C]);
  }
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < C; j++) {
      const a = base + i * (C + 1) + j;
      const b = a + C + 1;
      if (side === 1) part.indices.push(a, a + 1, b, b, a + 1, b + 1);
      else part.indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
}

export type FlukeStation = { le: number; chord: number; thick: number };

/** Fluke planform at |z| / half-span a: swept leading edge, notched trailing edge, pointed tips. */
export function flukeStation(a: number): FlukeStation {
  const x = clamp(a, 0, 1);
  const le = 0.02 + 1.1 * x ** 1.75;
  const lobe = lerp(FLUKE_NOTCH_CHORD, FLUKE_LOBE_CHORD, smoothstep(0, 0.17, x));
  const chord = lobe * Math.max(0, 1 - x ** 2.3) ** 0.55 + 0.02;
  // Slight scalloping of the trailing edge.
  const scallop = 0.02 * Math.sin(x * 38) * smoothstep(0.2, 0.35, x) * (1 - smoothstep(0.85, 1, x));
  return { le, chord: chord + scallop, thick: 0.13 * (1 - x) ** 1.3 + 0.012 };
}

function buildFluke(spec: DetailSpec, part: Part): void {
  const S = spec.flukeSpan;
  const C = spec.flukeLoop;
  const base = part.positions.length / 3;
  const y0 = spineY(TAIL_X);
  for (let i = 0; i <= S; i++) {
    // Cosine spacing packs stations at the tips and the notch.
    const zf = -Math.cos((i / S) * Math.PI);
    const a = Math.abs(zf);
    const st = flukeStation(a);
    const start = part.positions.length / 3;
    for (let j = 0; j <= C; j++) {
      const phi = (j / C) * Math.PI * 2;
      const k = 0.5 + 0.5 * Math.cos(phi);
      const t = foil(k) * st.thick * Math.sign(Math.sin(phi) || 1) * (j === 0 || j === C ? 0 : 1);
      part.positions.push(TAIL_X + st.le + k * st.chord - 0.06, y0 + t, zf * FLUKE_HALF_SPAN);
      part.uvs.push(0.5 + 0.25 * (zf + 1), (j / C) * ATLAS_BODY_V);
      part.skinIndex.push(FLUKE_BONE, 0, 0, 0);
      part.skinWeight.push(1, 0, 0, 0);
    }
    if (i === 0 || i === S) part.seams.push([start, start + C]);
  }
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < C; j++) {
      const a = base + i * (C + 1) + j;
      const b = a + C + 1;
      part.indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
}

function toGeometry(part: Part): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(part.uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(part.skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(part.skinWeight, 4));
  geo.setIndex(part.indices);
  geo.computeVertexNormals();
  const n = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (const [a, b] of part.seams) {
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const len = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / len, y / len, z / len);
    n.setXYZ(b, x / len, y / len, z / len);
  }
  return geo;
}

export type WhaleGeometryInfo = {
  geometry: THREE.BufferGeometry;
  /** Vertex ranges per part, for tests and debugging. */
  ranges: Record<'body' | 'flipperL' | 'flipperR' | 'fluke', [number, number]>;
};

/** One skinned mesh: body, both flippers and the flukes share a single draw call. */
export function buildWhaleGeometry(detail: WhaleDetail): WhaleGeometryInfo {
  const spec = WHALE_DETAIL[detail];
  const parts = {
    body: newPart(),
    flipperL: newPart(),
    flipperR: newPart(),
    fluke: newPart(),
  };
  buildBody(spec, parts.body);
  buildFlipper(spec, 1, FLIPPER_L, parts.flipperL);
  buildFlipper(spec, -1, FLIPPER_R, parts.flipperR);
  buildFluke(spec, parts.fluke);

  const geos = (Object.keys(parts) as Array<keyof typeof parts>).map((key) => toGeometry(parts[key]));
  const ranges = {} as WhaleGeometryInfo['ranges'];
  let offset = 0;
  const keys = Object.keys(parts) as Array<keyof typeof parts>;
  keys.forEach((key, i) => {
    const count = geos[i]!.getAttribute('position').count;
    ranges[key] = [offset, offset + count];
    offset += count;
  });
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return { geometry: merged, ranges };
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'] as const;
  const total = geos.reduce((sum, g) => sum + g.getAttribute('position').count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const first = geos[0]!.getAttribute(name) as THREE.BufferAttribute;
    const size = first.itemSize;
    const array = name === 'skinIndex' ? new Uint16Array(total * size) : new Float32Array(total * size);
    let offset = 0;
    for (const g of geos) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute;
      array.set(attr.array as ArrayLike<number>, offset);
      offset += attr.array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  const indices: number[] = [];
  let base = 0;
  for (const g of geos) {
    const idx = g.getIndex()!;
    for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + base);
    base += g.getAttribute('position').count;
  }
  out.setIndex(indices);
  return out;
}

/** Bones in bind pose. Callers parent `bones[ROOT_BONE]` under the posed body. */
export function createWhaleBones(): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  const world: THREE.Vector3[] = [];
  for (const spec of SPINE) {
    const bone = new THREE.Bone();
    bone.name = spec.name;
    bones.push(bone);
    world.push(new THREE.Vector3(spec.x, spineY(spec.x), 0));
  }
  SPINE.forEach((spec, i) => {
    const bone = bones[i]!;
    if (spec.parent >= 0) {
      bones[spec.parent]!.add(bone);
      bone.position.copy(world[i]!).sub(world[spec.parent]!);
    } else {
      bone.position.copy(world[i]!);
    }
  });
  for (const side of [1, -1] as const) {
    const bone = new THREE.Bone();
    bone.name = side === 1 ? 'FlipperL' : 'FlipperR';
    bone.position.copy(flipperRoot(side)).sub(world[ROOT_BONE]!);
    flipperQuaternion(side, FLIPPER_DROOP, FLIPPER_SWEEP, 0, bone.quaternion);
    bones[ROOT_BONE]!.add(bone);
    bones.push(bone);
  }
  return bones;
}
