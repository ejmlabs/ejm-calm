import * as THREE from 'three';
import { fork } from './rng.js';
import { SHIP_LAND_MARGIN, type ShipSpec } from './terrain.js';
import { clampClearOfLand, type Shore } from './shore.js';
import { swellAt, type SwellSample } from './swell.js';

export type ShipHandle = {
  group: THREE.Group;
  spec: ShipSpec;
  /** Lantern positions in the ship's own frame (the group's scale and pose carry them to the world). */
  lanterns: readonly THREE.Vector3[];
  /** Hull length and beam in the ship's own frame, for the foam round it. */
  size: { length: number; beam: number };
  update: (dt: number, time: number, shore: Shore) => void;
  dispose: () => void;
};

/** Ships are drawn this many times larger than their frame: a sloop is about 8 m long, a tall ship about 14. */
export const SHIP_SIZE = 2.4;

/** Hull, trim and sail cloth per ship, picked by seed. */
const HULLS = [0x1d3a46, 0x4a2220, 0x1c2b44, 0x25402e, 0x2a2a2e, 0x5b3a22].map((hex) => new THREE.Color(hex));
const SAIL_CLOTH = [0xe9dfc6, 0xf1ece0, 0xdccfae, 0xe6d6b8].map((hex) => new THREE.Color(hex));
const TRIM = new THREE.Color(0xc9b891);
const DECK = new THREE.Color(0x9a7b55);
const WOOD = new THREE.Color(0x3e3226);
const CABIN = new THREE.Color(0x5a4a38);

/** A part of a hull: geometry in its own frame, placed by a matrix, in one colour. */
type Part = { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4; color: THREE.Color };

/** Bakes parts into one vertex-coloured, non-indexed geometry: the whole hull and rig is one draw. */
function bake(parts: readonly Part[]): THREE.BufferGeometry {
  const flat = parts.map(({ geometry, matrix }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    return g;
  });
  const count = flat.reduce((n, g) => n + g.attributes.position!.count, 0);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  let at = 0;
  flat.forEach((g, k) => {
    const c = parts[k]!.color;
    position.set(g.attributes.position!.array as Float32Array, at * 3);
    normal.set(g.attributes.normal!.array as Float32Array, at * 3);
    for (let v = 0; v < g.attributes.position!.count; v++) color.set([c.r, c.g, c.b], (at + v) * 3);
    at += g.attributes.position!.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return out;
}

const at = (x: number, y: number, z: number, ry = 0, rz = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), new THREE.Vector3(1, 1, 1));

/** A hull with a pointed bow, a sheer that lifts both ends and a tucked stern. */
function hullGeometry(kind: ShipSpec['kind']): THREE.BufferGeometry {
  const length = kind === 'tall' ? 4.4 : 3.4;
  const beam = kind === 'tall' ? 1.2 : 1.05;
  const depth = 0.85;
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0);
  shape.quadraticCurveTo(-length / 2, beam * 0.45, -length * 0.2, beam / 2);
  shape.lineTo(length * 0.28, (beam / 2) * 0.95);
  shape.quadraticCurveTo(length * 0.42, beam * 0.35, length / 2, 0);
  shape.quadraticCurveTo(length * 0.42, -beam * 0.35, length * 0.28, (-beam / 2) * 0.95);
  shape.lineTo(-length * 0.2, -beam / 2);
  shape.quadraticCurveTo(-length / 2, -beam * 0.45, -length / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.07, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, depth * 0.2, 0);
  // Sheer: the gunwale rises toward bow and stern.
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.abs(pos.getX(i)) / (length / 2);
    if (pos.getY(i) > depth * 0.55) pos.setY(i, pos.getY(i) + 0.26 * t * t);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A sail: a sloop's main is a triangle along its mast, a tall ship's a trapezoid with a rounded foot; cloth is belly-curved and seamed. */
function makeSail(width: number, height: number, triangle: boolean): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(width, height, 12, 14);
  const pos = geo.attributes.position!;
  const color = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const up = (y + height / 2) / height;
    const nx = x / (width / 2 + 0.01);
    const ny = (2 * y) / height;
    // Taper: a sloop's sail comes to a point at the head, a tall ship's loses a fifth.
    const taper = triangle ? 1 - 0.94 * up : 1 - 0.22 * up;
    const px = triangle ? width / 2 - (width / 2 - x) * taper : x * taper;
    // The foot curves up between the corners.
    const py = y + (triangle ? 0 : 0.16 * (1 - nx * nx) * (1 - up) * height * 0.2);
    const billow = (1 - ny * ny) * (1 - nx * nx * 0.55) * 0.55;
    pos.setXYZ(i, px, py, billow);
    // Panels: a darker seam every few rows, a little shade deeper in the belly.
    const seam = Math.abs(((up * 6) % 1) - 0.5) < 0.04 ? 0.82 : 1;
    const shade = (0.94 + 0.06 * (1 - billow)) * seam;
    color.set([shade, shade, shade], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return geo;
}

type Rig = {
  hull: THREE.BufferGeometry;
  sails: THREE.BufferGeometry;
  /** Per sail vertex: its place at rest (xyz), the way it billows (xyz), and the sway weight and phase. */
  rest: Float32Array;
  push: Float32Array;
  weight: Float32Array;
  phase: Float32Array;
  lanterns: THREE.Vector3[];
  size: { length: number; beam: number };
};

function buildRig(spec: ShipSpec): Rig {
  const rng = fork(spec.seed, 'mesh');
  const tall = spec.kind === 'tall';
  const hullColor = HULLS[(spec.seed >>> 0) % HULLS.length]!;
  const cloth = SAIL_CLOTH[(spec.seed >>> 3) % SAIL_CLOTH.length]!;
  const parts: Part[] = [];
  const hullGeo = hullGeometry(spec.kind);
  parts.push({ geometry: hullGeo, matrix: at(0, 0, 0), color: hullColor });
  const length = tall ? 4.4 : 3.4;
  const beam = tall ? 1.2 : 1.05;
  // Trim band and deck.
  parts.push({ geometry: new THREE.BoxGeometry(length * (tall ? 0.82 : 0.82), 0.08, beam * 0.98), matrix: at(0.1, 0.42, 0), color: TRIM });
  parts.push({ geometry: new THREE.BoxGeometry(length * 0.72, 0.05, beam * 0.72), matrix: at(0.05, 1.0, 0), color: DECK });
  // Masts: a tall ship has three, a sloop one; a bowsprit leans out over the bow.
  const mastXs = tall ? [-1.2, 0.15, 1.35] : [0.15];
  const sailParts: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  mastXs.forEach((x, m) => {
    const mastH = tall ? 5.2 - Math.abs(m - 1) * 0.45 : 3.9;
    parts.push({ geometry: new THREE.CylinderGeometry(0.05, 0.08, mastH, 6), matrix: at(x, mastH / 2 + 0.9, 0), color: WOOD });
    const sail = makeSail(tall ? 2.5 : 2.0, mastH * 0.78, !tall);
    // A tall ship's square sails hang across the hull; a sloop's mainsail runs fore and aft, its luff against the mast.
    sailParts.push({ geometry: sail, matrix: tall ? at(x, mastH * 0.52 + 0.95, 0, Math.PI / 2) : at(x - 1.0, mastH * 0.52 + 0.95, 0) });
  });
  if (tall) {
    const jib = makeSail(1.7, 2.7, true);
    sailParts.push({ geometry: jib, matrix: at(1.75, 2.55, 0, 0, -0.1) });
    parts.push({ geometry: new THREE.CylinderGeometry(0.04, 0.05, 1.3, 5), matrix: at(2.45, 1.35, 0, 0, -1.2), color: WOOD });
  } else {
    // Boom and a small jib for the sloop.
    parts.push({ geometry: new THREE.CylinderGeometry(0.035, 0.035, 2.0, 5), matrix: at(-0.85, 1.5, 0, 0, Math.PI / 2), color: WOOD });
    const jib = makeSail(1.1, 2.2, true);
    sailParts.push({ geometry: jib, matrix: at(1.15, 2.2, 0, 0, -0.12) });
  }
  // Cabin and its roof, a lantern post at the stern.
  parts.push({ geometry: new THREE.BoxGeometry(0.85, 0.42, 0.7), matrix: at(-1.15, 1.2, 0), color: CABIN });
  parts.push({ geometry: new THREE.BoxGeometry(0.95, 0.06, 0.8), matrix: at(-1.15, 1.45, 0), color: WOOD });
  const hull = bake(parts);
  for (const part of parts) part.geometry.dispose();

  // All the sails in one geometry, each moved into the ship's frame; the billow is a push along each sail's own normal.
  const merged = bake(sailParts.map(({ geometry, matrix }) => ({ geometry, matrix, color: cloth })));
  const sailColor = merged.attributes.color!.array as Float32Array;
  let v = 0;
  const rest = new Float32Array(merged.attributes.position!.count * 3);
  const push = new Float32Array(merged.attributes.position!.count * 3);
  const weight = new Float32Array(merged.attributes.position!.count);
  const phase = new Float32Array(merged.attributes.position!.count);
  const e = new THREE.Vector3();
  sailParts.forEach(({ geometry, matrix }, k) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    e.set(0, 0, 1).applyMatrix3(normalMatrix).normalize();
    const gp = flat.attributes.position!;
    const gc = flat.attributes.color!;
    for (let i = 0; i < gp.count; i++, v++) {
      rest[v * 3] = merged.attributes.position!.getX(v);
      rest[v * 3 + 1] = merged.attributes.position!.getY(v);
      rest[v * 3 + 2] = merged.attributes.position!.getZ(v);
      push[v * 3] = e.x;
      push[v * 3 + 1] = e.y;
      push[v * 3 + 2] = e.z;
      weight[v] = 0.35 + Math.abs(gp.getX(i));
      phase[v] = gp.getY(i) * 2.2 + k;
      // The cloth's own shading rides on the cloth colour.
      sailColor[v * 3] *= gc.getX(i);
      sailColor[v * 3 + 1] *= gc.getY(i);
      sailColor[v * 3 + 2] *= gc.getZ(i);
    }
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  });
  void rng;
  const top = tall ? 5.2 : 3.9;
  const lanterns = [new THREE.Vector3(mastXs[tall ? 1 : 0]!, top + 1.0, 0), new THREE.Vector3(-length / 2 + 0.2, 1.3, 0)];
  return { hull, sails: merged, rest, push, weight, phase, lanterns, size: { length, beam } };
}

export type ShipOptions = {
  /** World point the ship drifts around, and how far it may wander from it. */
  anchor?: { x: number; z: number };
  leash?: number;
  /** Only nudge off the coast where this says the shore is cheap to read (nav tile built). */
  shoreReady?: (x: number, z: number) => boolean;
};

export function createShips(specs: ShipSpec[], options: ShipOptions = {}): ShipHandle[] {
  return specs.map((spec) => createShip(spec, options));
}

export function createShip(spec: ShipSpec, options: ShipOptions = {}): ShipHandle {
  const rig = buildRig(spec);
  const hullMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.03 });
  const sailMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x2a2418),
    emissiveIntensity: 0.22,
    envMapIntensity: 0.08,
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(rig.hull, hullMaterial), new THREE.Mesh(rig.sails, sailMaterial));
  const size = spec.scale * SHIP_SIZE;
  group.scale.setScalar(size);

  const anchor = options.anchor ?? { x: 0, z: 0 };
  const leash = options.leash ?? 280;
  let x = spec.x;
  let z = spec.z;
  let heading = spec.heading;
  const drift = 0.35 + ((spec.seed % 1000) / 1000) * 0.45;
  const swell: SwellSample = { height: 0, slopeX: 0, slopeZ: 0 };
  const sailPos = rig.sails.attributes.position as THREE.BufferAttribute;

  return {
    group,
    spec,
    lanterns: rig.lanterns,
    size: rig.size,
    update(dt: number, time: number, shore: Shore) {
      heading += dt * 0.015 * (spec.kind === 'sloop' ? 1 : 0.7);
      const speed = drift * dt;
      x += Math.sin(heading) * speed;
      z += Math.cos(heading) * speed;
      if (!options.shoreReady || options.shoreReady(x, z)) {
        const cleared = clampClearOfLand(x, z, shore, SHIP_LAND_MARGIN * 0.6);
        x = cleared.x;
        z = cleared.z;
      }
      if (Math.hypot(x - anchor.x, z - anchor.z) > leash) {
        heading += Math.PI * 0.6;
        x = anchor.x + (x - anchor.x) * 0.96;
        z = anchor.z + (z - anchor.z) * 0.96;
      }

      // Ride the shared swell: heave from its height, roll and pitch from its slope across and along the hull.
      const sea = swellAt(x, z, time, swell);
      const roll = Math.atan(sea.slopeX * Math.cos(heading) - sea.slopeZ * Math.sin(heading));
      const pitch = -Math.atan(sea.slopeX * Math.sin(heading) + sea.slopeZ * Math.cos(heading));
      // About 35% of the hull below the waterline.
      group.position.set(x, -0.25 * size + sea.height, z);
      group.rotation.order = 'YXZ';
      group.rotation.y = heading;
      group.rotation.z = roll;
      group.rotation.x = pitch;

      const { rest, push, weight, phase } = rig;
      for (let v = 0; v < weight.length; v++) {
        const wave = Math.sin(time * 1.6 + phase[v]!) * 0.06 * weight[v]!;
        sailPos.setXYZ(v, rest[v * 3]! + push[v * 3]! * wave, rest[v * 3 + 1]! + push[v * 3 + 1]! * wave, rest[v * 3 + 2]! + push[v * 3 + 2]! * wave);
      }
      sailPos.needsUpdate = true;
    },
    dispose() {
      rig.hull.dispose();
      rig.sails.dispose();
      hullMaterial.dispose();
      sailMaterial.dispose();
    },
  };
}
