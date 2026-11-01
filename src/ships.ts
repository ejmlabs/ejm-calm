import * as THREE from 'three';
import { SHIP_LAND_MARGIN, type ShipSpec } from './terrain.js';
import { clampClearOfLand, type Shore } from './shore.js';
import { swellAt, type SwellSample } from './swell.js';
import { item } from './item.js';
import { patchShader } from './shader-patch.js';

export interface ShipHandle {
  group: THREE.Group;
  spec: ShipSpec;
  /** Lantern positions in the ship's own frame (the group's scale and pose carry them to the world). */
  lanterns: readonly THREE.Vector3[];
  /** Hull length and beam in the ship's own frame, for the foam round it. */
  size: { length: number; beam: number };
  /** Moves the ship; its sails sway on the GPU off `time`. */
  update: (dt: number, time: number, shore: Shore) => void;
  dispose: () => void;
}

/** Ships are drawn this many times larger than their frame: a sloop is about 8 m long, a tall ship about 14. */
export const SHIP_SIZE = 2.4;

/** Hull, trim and sail cloth per ship, picked by seed. */
const HULLS = [0x1d3a46, 0x4a2220, 0x1c2b44, 0x25402e, 0x2a2a2e, 0x5b3a22].map(
  (hex) => new THREE.Color(hex),
);
const SAIL_CLOTH = [0xe9dfc6, 0xf1ece0, 0xdccfae, 0xe6d6b8].map((hex) => new THREE.Color(hex));
const TRIM = new THREE.Color(0xc9b891);
const DECK = new THREE.Color(0x9a7b55);
const WOOD = new THREE.Color(0x3e3226);
const CABIN = new THREE.Color(0x5a4a38);

/** A part of a hull: geometry in its own frame, placed by a matrix, in one colour (null: the ship's own hull colour). */
interface Part {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  color: THREE.Color | null;
}

/** Parts baked into one non-indexed shape: the whole hull and rig is one draw. */
interface Baked {
  position: Float32Array;
  normal: Float32Array;
  /** Where each part's vertices start, then the vertex count. */
  starts: number[];
}

function bake(parts: readonly { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[]): Baked {
  const flat = parts.map(({ geometry, matrix }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    return g;
  });
  const count = flat.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const starts: number[] = [];
  let at = 0;
  for (const g of flat) {
    starts.push(at);
    position.set(g.getAttribute('position').array, at * 3);
    normal.set(g.getAttribute('normal').array, at * 3);
    at += g.getAttribute('position').count;
    g.dispose();
  }
  starts.push(at);
  return { position, normal, starts };
}

/** One vertex colour per vertex: each part's vertices in the colour of that part. */
function paint(shape: Baked, colors: readonly THREE.Color[]): Float32Array {
  const out = new Float32Array(shape.position.length);
  colors.forEach((c, k) => {
    const end = item(shape.starts, k + 1);
    for (let v = item(shape.starts, k); v < end; v++) {
      out[v * 3] = c.r;
      out[v * 3 + 1] = c.g;
      out[v * 3 + 2] = c.b;
    }
  });
  return out;
}

/** One shape's geometry, over arrays the ships of a kind share (nothing writes to them) and the colours of this ship. */
function geometryOf(
  shape: Baked,
  color: Float32Array,
  extra: Record<string, THREE.BufferAttribute> = {},
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(shape.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(shape.normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  for (const [name, attribute] of Object.entries(extra)) geometry.setAttribute(name, attribute);
  return geometry;
}

const at = (x: number, y: number, z: number, ry = 0, rz = 0, rx = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );

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
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, depth * 0.2, 0);
  // Sheer: the gunwale rises toward bow and stern.
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = Math.abs(pos.getX(i)) / (length / 2);
    if (pos.getY(i) > depth * 0.55) pos.setY(i, pos.getY(i) + 0.26 * t * t);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A sail: a sloop's main is a triangle along its mast, a tall ship's a trapezoid with a rounded foot; cloth is belly-curved and seamed. */
function makeSail(
  width: number,
  height: number,
  triangle: boolean,
  belly = 0.55,
): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(width, height, 12, 14);
  const pos = geo.getAttribute('position');
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
    const billow = (1 - ny * ny) * (1 - nx * nx * 0.55) * belly;
    pos.setXYZ(i, px, py, billow);
    // Panels: a darker seam every few rows, a little shade deeper in the belly.
    const seam = Math.abs(((up * 6) % 1) - 0.5) < 0.04 ? 0.82 : 1;
    const shade = (0.94 + 0.06 * (1 - billow)) * seam;
    color.set([shade, shade, shade], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return geo;
}

/** What the ships of one kind have in common: their shape and sway, but for the colours a seed picks. */
interface Template {
  hull: Baked;
  /** Per hull part: its colour, or null for the ship's own hull colour. */
  hullColors: (THREE.Color | null)[];
  sails: Baked;
  /** Per sail vertex: the shade the cloth's seams and belly give it. */
  shade: Float32Array;
  /** Per sail vertex: the way it billows (xyz) and how far (w), and its phase in the wave. */
  sway: Float32Array;
  phase: Float32Array;
  lanterns: THREE.Vector3[];
  size: { length: number; beam: number };
}

/** Building a template is the cost of a ship (several milliseconds), so each kind's is built once, on first use. */
const templates: Partial<Record<ShipSpec['kind'], Template>> = {};

function templateFor(kind: ShipSpec['kind']): Template {
  return (templates[kind] ??= buildTemplate(kind));
}

function buildTemplate(kind: ShipSpec['kind']): Template {
  const tall = kind === 'tall';
  const parts: Part[] = [];
  const hullGeo = hullGeometry(kind);
  parts.push({ geometry: hullGeo, matrix: at(0, 0, 0), color: null });
  const length = tall ? 4.4 : 3.4;
  const beam = tall ? 1.2 : 1.05;
  const GALLERY = new THREE.Color(0xd8c690);
  // Trim band, deck and rails along the gunwale, so the hull has a deck line from every side.
  parts.push({
    geometry: new THREE.BoxGeometry(length * 0.82, 0.08, beam * 0.98),
    matrix: at(0.1, 0.42, 0),
    color: TRIM,
  });
  parts.push({
    geometry: new THREE.BoxGeometry(length * 0.72, 0.05, beam * 0.72),
    matrix: at(0.05, 1.0, 0),
    color: DECK,
  });
  for (const side of [-1, 1])
    parts.push({
      geometry: new THREE.BoxGeometry(length * 0.66, 0.09, 0.05),
      matrix: at(0.05, 1.17, side * beam * 0.43),
      color: TRIM,
    });
  // A stern you can read: a transom with a lit gallery of windows, a rail across it and a rudder.
  parts.push({
    geometry: new THREE.BoxGeometry(0.1, 0.5, beam * 0.9),
    matrix: at(-length / 2 + 0.2, 0.82, 0),
    color: null,
  });
  parts.push({
    geometry: new THREE.BoxGeometry(0.06, 0.2, beam * 0.62),
    matrix: at(-length / 2 + 0.13, 0.95, 0),
    color: GALLERY,
  });
  parts.push({
    geometry: new THREE.BoxGeometry(0.06, 0.08, beam * 0.92),
    matrix: at(-length / 2 + 0.2, 1.19, 0),
    color: TRIM,
  });
  parts.push({
    geometry: new THREE.BoxGeometry(0.06, 0.7, 0.14),
    matrix: at(-length / 2 + 0.02, 0.4, 0),
    color: WOOD,
  });
  // Masts and yards. A tall ship has three masts, each a course and a narrower topsail on yards, set a little off each other's angle so the sails stagger; a sloop has one.
  const mastXs = tall ? [-1.2, 0.15, 1.35] : [0.15];
  const sailParts: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  mastXs.forEach((x, m) => {
    const mastH = tall ? 5.2 - Math.abs(m - 1) * 0.45 : 3.9;
    parts.push({
      geometry: new THREE.CylinderGeometry(0.05, 0.08, mastH, 6),
      matrix: at(x, mastH / 2 + 0.9, 0),
      color: WOOD,
    });
    if (tall) {
      const yaw = Math.PI / 2 + (m - 1) * 0.14;
      const width = 2.5 - 0.15 * Math.abs(m - 1);
      const courseH = mastH * 0.4;
      const topH = mastH * 0.3;
      const courseY = 0.95 + mastH * 0.3;
      const topY = 0.95 + mastH * 0.7;
      sailParts.push({
        geometry: makeSail(width, courseH, false, 0.9),
        matrix: at(x, courseY, 0, yaw),
      });
      sailParts.push({
        geometry: makeSail(width * 0.74, topH, false, 0.8),
        matrix: at(x, topY, 0, yaw - 0.06),
      });
      for (const [y, w] of [
        [courseY + courseH / 2, width],
        [courseY - courseH / 2, width * 0.96],
        [topY + topH / 2, width * 0.74],
      ] as const) {
        parts.push({
          geometry: new THREE.CylinderGeometry(0.03, 0.03, w * 1.06, 5),
          matrix: at(x, y, 0, yaw, 0, Math.PI / 2),
          color: WOOD,
        });
      }
    } else {
      // A fore-and-aft mainsail with its luff against the mast.
      sailParts.push({
        geometry: makeSail(2.0, mastH * 0.78, true),
        matrix: at(x - 1.0, mastH * 0.52 + 0.95, 0),
      });
    }
  });
  if (tall) {
    // Jib and bowsprit.
    sailParts.push({ geometry: makeSail(1.7, 2.7, true), matrix: at(1.75, 2.55, 0, 0, -0.1) });
    parts.push({
      geometry: new THREE.CylinderGeometry(0.04, 0.05, 1.3, 5),
      matrix: at(2.45, 1.35, 0, 0, -1.2),
      color: WOOD,
    });
    // A raised quarterdeck aft.
    parts.push({
      geometry: new THREE.BoxGeometry(length * 0.26, 0.14, beam * 0.86),
      matrix: at(-length * 0.33, 1.22, 0),
      color: DECK,
    });
  } else {
    parts.push({
      geometry: new THREE.CylinderGeometry(0.035, 0.035, 2.0, 5),
      matrix: at(-0.85, 1.5, 0, 0, Math.PI / 2),
      color: WOOD,
    });
    sailParts.push({ geometry: makeSail(1.1, 2.2, true), matrix: at(1.15, 2.2, 0, 0, -0.12) });
  }
  // Cabin and its roof.
  parts.push({
    geometry: new THREE.BoxGeometry(0.85, 0.42, 0.7),
    matrix: at(-1.15, tall ? 1.45 : 1.2, 0),
    color: CABIN,
  });
  parts.push({
    geometry: new THREE.BoxGeometry(0.95, 0.06, 0.8),
    matrix: at(-1.15, tall ? 1.7 : 1.45, 0),
    color: WOOD,
  });
  const hull = bake(parts);
  for (const part of parts) part.geometry.dispose();

  // All the sails in one shape, each moved into the ship's frame; the billow is a push along each sail's own normal.
  const sails = bake(sailParts);
  const count = sails.position.length / 3;
  const shade = new Float32Array(count);
  const sway = new Float32Array(count * 4);
  const phase = new Float32Array(count);
  const e = new THREE.Vector3();
  let v = 0;
  sailParts.forEach(({ geometry, matrix }, k) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    e.set(0, 0, 1).applyMatrix3(normalMatrix).normalize();
    const gp = flat.getAttribute('position');
    const gc = flat.getAttribute('color');
    for (let i = 0; i < gp.count; i++, v++) {
      shade[v] = gc.getX(i);
      sway[v * 4] = e.x;
      sway[v * 4 + 1] = e.y;
      sway[v * 4 + 2] = e.z;
      sway[v * 4 + 3] = 0.35 + Math.abs(gp.getX(i));
      phase[v] = gp.getY(i) * 2.2 + k;
    }
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  });
  const top = tall ? 5.2 : 3.9;
  const lanterns = [
    new THREE.Vector3(mastXs[tall ? 1 : 0], top + 1.0, 0),
    new THREE.Vector3(-length / 2 + 0.2, 1.3, 0),
  ];
  return {
    hull,
    hullColors: parts.map((part) => part.color),
    sails,
    shade,
    sway,
    phase,
    lanterns,
    size: { length, beam },
  };
}

/** The cloth's own shading rides on the cloth colour. */
function clothColors(template: Template, cloth: THREE.Color): Float32Array {
  const out = new Float32Array(template.shade.length * 3);
  const [r, g, b] = [Math.fround(cloth.r), Math.fround(cloth.g), Math.fround(cloth.b)];
  for (let v = 0; v < template.shade.length; v++) {
    const shade = template.shade[v] ?? 0;
    out[v * 3] = r * shade;
    out[v * 3 + 1] = g * shade;
    out[v * 3 + 2] = b * shade;
  }
  return out;
}

/** The cloth's wave runs in the vertex shader off this one angle, so a ship's sails cost the CPU nothing a frame. */
const clothAngle = { value: 0 };
/** Radians a second the cloth's wave turns, and how far (in the ship's frame) it moves a vertex of weight 1. */
const CLOTH_RATE = 1.6;
const CLOTH_SWAY = 0.06;

/**
 * Sways the sails in the vertex shader: each vertex rests at its geometry position and moves along its own push
 * direction (`sway.xyz`) by `sway.w` times a wave of the shared angle and its own phase.
 */
export function patchSailShader(shader: {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
}): void {
  const vertex = patchShader(shader.vertexShader, [
    {
      find: '#include <common>',
      replace:
        '#include <common>\nattribute vec4 sway;\nattribute float swayPhase;\nuniform float clothAngle;',
    },
    {
      find: '#include <begin_vertex>',
      replace: `#include <begin_vertex>\ntransformed += sway.xyz * (sin( clothAngle + swayPhase ) * ${CLOTH_SWAY.toFixed(2)} * sway.w);`,
    },
  ]);
  if (vertex === null)
    throw new Error('the standard material has no vertex steps to sway sails in');
  shader.vertexShader = vertex;
  shader.uniforms['clothAngle'] = clothAngle;
}

/** A ship's geometry: the kind's shared shape and sway, in the colours its seed picks. */
function buildRig(spec: ShipSpec) {
  const template = templateFor(spec.kind);
  const hullColor = item(HULLS, (spec.seed >>> 0) % HULLS.length);
  const cloth = item(SAIL_CLOTH, (spec.seed >>> 3) % SAIL_CLOTH.length);
  const hull = geometryOf(
    template.hull,
    paint(
      template.hull,
      template.hullColors.map((color) => color ?? hullColor),
    ),
  );
  const sails = geometryOf(template.sails, clothColors(template, cloth), {
    sway: new THREE.BufferAttribute(template.sway, 4),
    swayPhase: new THREE.BufferAttribute(template.phase, 1),
  });
  return { hull, sails, lanterns: template.lanterns, size: template.size };
}

export interface ShipOptions {
  /** World point the ship drifts around, and how far it may wander from it. */
  anchor?: { x: number; z: number };
  leash?: number;
  /** Only nudge off the coast where this says the shore is cheap to read (nav tile built). */
  shoreReady?: (x: number, z: number) => boolean;
}

export function createShips(specs: ShipSpec[], options: ShipOptions = {}): ShipHandle[] {
  return specs.map((spec) => createShip(spec, options));
}

export function createShip(spec: ShipSpec, options: ShipOptions = {}): ShipHandle {
  const rig = buildRig(spec);
  const hullMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.03,
  });
  const sailMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x2a2418),
    emissiveIntensity: 0.22,
  });
  sailMaterial.onBeforeCompile = patchSailShader;
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
      // Wrapped here in double precision, so the shader's sine stays exact however long the visit.
      clothAngle.value = (time * CLOTH_RATE) % (Math.PI * 2);
    },
    dispose() {
      rig.hull.dispose();
      rig.sails.dispose();
      hullMaterial.dispose();
      sailMaterial.dispose();
    },
  };
}
