import { test } from 'vitest';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createShip, patchSailShader } from '../src/ships.js';
import type { ShipSpec } from '../src/terrain.js';
import { item } from '../src/item.js';

const open = { clearance: () => 1000, away: () => ({ x: 1, z: 0 }) };

/** 48 ships of a kind whose seeds cover every hull colour with every cloth colour. */
const specs = (kind: ShipSpec['kind']): ShipSpec[] =>
  Array.from({ length: 48 }, (_, id) => ({
    id,
    x: 0,
    z: 0,
    heading: 0.3,
    scale: 1,
    kind,
    seed: Math.imul(id + 1, 0x9e3779b1) >>> 0,
  }));

const geometryOf = (mesh: THREE.Object3D): THREE.BufferGeometry => (mesh as THREE.Mesh).geometry;

/** Where the cloth's vertices stand at `time`, by the rule the vertex shader applies (the old per-frame CPU loop's own). */
function swayed(sails: THREE.BufferGeometry, time: number): Float32Array {
  const rest = sails.getAttribute('position').array;
  const sway = sails.getAttribute('sway').array;
  const phase = sails.getAttribute('swayPhase').array;
  const out = new Float32Array(rest.length);
  for (let v = 0; v < phase.length; v++) {
    const wave = Math.sin(time * 1.6 + (phase[v] ?? 0)) * 0.06 * (sway[v * 4 + 3] ?? 0);
    for (let c = 0; c < 3; c++)
      out[v * 3 + c] = (rest[v * 3 + c] ?? 0) + (sway[v * 4 + c] ?? 0) * wave;
  }
  return out;
}

/** FNV-1a over the bits of every float. */
function fold(hash: number, values: ArrayLike<number>): number {
  const words = new Uint32Array(new Float32Array(values).buffer);
  let out = hash;
  for (const word of words) out = Math.imul(out ^ word, 0x01000193) >>> 0;
  return out;
}

function fingerprint(kind: ShipSpec['kind']): number {
  let hash = 0x811c9dc5;
  const seen = new Set<string>();
  for (const spec of specs(kind)) {
    seen.add(`${String((spec.seed >>> 0) % 6)}:${String((spec.seed >>> 3) % 4)}`);
    const ship = createShip(spec);
    const hull = geometryOf(item(ship.group.children, 0));
    const sails = geometryOf(item(ship.group.children, 1));
    for (const name of ['position', 'normal', 'color'])
      hash = fold(hash, hull.getAttribute(name).array);
    for (const name of ['position', 'normal', 'color'])
      hash = fold(hash, sails.getAttribute(name).array);
    for (const time of [3.7, 11.2]) hash = fold(hash, swayed(sails, time));
    hash = fold(
      hash,
      ship.lanterns.flatMap((lantern) => [lantern.x, lantern.y, lantern.z]),
    );
    hash = fold(hash, [ship.size.length, ship.size.beam]);
    ship.dispose();
  }
  assert.equal(seen.size, 24, 'the seeds cover every hull and cloth colour');
  return hash;
}

test('ships are built as before: the same hulls, colours, sails and sway for every seed', () => {
  // Fingerprints of the geometry the per-ship build made (and the CPU sway it ran every frame) before ships shared a
  // template per kind: a change that alters what a seed's ships look like changes these on purpose.
  assert.equal(fingerprint('tall'), 0x4192a011);
  assert.equal(fingerprint('sloop'), 0x4516c06b);
});

test('ships of a kind share their shape and sway, and differ only in the colours a seed picks', () => {
  const [a, b, c] = [1, 2, 3].map((id) =>
    createShip({ id, x: 0, z: 0, heading: 0, scale: 1, kind: 'sloop', seed: id * 7 }),
  );
  assert.ok(a && b && c);
  for (const [name, mesh] of [
    ['position', 0],
    ['normal', 0],
    ['position', 1],
    ['sway', 1],
    ['swayPhase', 1],
  ] as const) {
    const first: ArrayLike<number> = geometryOf(item(a.group.children, mesh)).getAttribute(
      name,
    ).array;
    assert.equal(geometryOf(item(b.group.children, mesh)).getAttribute(name).array, first, name);
  }
  const colors = [a, b, c].map(
    (ship) => geometryOf(item(ship.group.children, 0)).getAttribute('color').array,
  );
  assert.notDeepEqual(colors[0], colors[1], 'the hull colours follow the seed');
  for (const ship of [a, b, c]) ship.dispose();
});

test('sails sway in the vertex shader: no vertex is rewritten as time passes', () => {
  const ship = createShip(item(specs('tall'), 5));
  const sails = geometryOf(item(ship.group.children, 1));
  const material = (item(ship.group.children, 1) as THREE.Mesh).material as THREE.Material;
  const before = sails.getAttribute('position').array.slice();
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
  };
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    null as never,
  );
  const angle = shader.uniforms['clothAngle'];
  assert.ok(angle, 'the cloth angle is a uniform of the sail material');
  for (const time of [1.3, 9000.2]) {
    ship.update(1 / 30, time, open);
    assert.deepEqual(sails.getAttribute('position').array, before, 'the vertices stay at rest');
    assert.ok(
      Math.abs((angle.value as number) - ((time * 1.6) % (Math.PI * 2))) < 1e-9,
      `the angle follows the time (${String(time)} s)`,
    );
  }
  ship.update(1 / 30, 1.3, open);
  const still = angle.value;
  ship.update(0, 1.3, open);
  assert.equal(angle.value, still, 'a frozen clock (reduced motion) holds the cloth still');
  ship.dispose();
});

test('the sail shader patch finds its places in three, and says so when it cannot', () => {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
  };
  patchSailShader(shader);
  assert.match(shader.vertexShader, /attribute vec4 sway;/);
  assert.match(
    shader.vertexShader,
    /transformed \+= sway\.xyz \* \(sin\( clothAngle \+ swayPhase \) \* 0\.06 \* sway\.w\);/,
  );
  assert.throws(() => {
    patchSailShader({ uniforms: {}, vertexShader: 'void main() {}' });
  }, /no vertex steps/);
});
