import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { createOcean, patchShader } from '../src/ocean.js';

test('patchShader applies every patch in order, taking replacements literally', () => {
  assert.equal(patchShader('a b c', [{ find: 'a', replace: 'x' }, { find: 'c', replace: 'y$&' }]), 'x b y$&');
});

test('patchShader returns null rather than a half-patched shader', () => {
  assert.equal(patchShader('a b c', [{ find: 'a', replace: 'x' }, { find: 'missing', replace: 'y' }]), null);
});

test('the bundled three.js Water shader takes every patch', () => {
  const stock = (new Water(new THREE.PlaneGeometry(1, 1), { textureWidth: 4, textureHeight: 4 }).material as THREE.ShaderMaterial)
    .fragmentShader;
  const shelf = { data: new Uint8Array(4), size: 2, min: -50, extent: 100 };
  const ocean = createOcean(1, new THREE.Vector3(0, 1, 0), { textureSize: 4, shelves: { near: shelf, far: shelf } });
  const material = ocean.water.material as THREE.ShaderMaterial;
  assert.notEqual(material.fragmentShader, stock);
  for (const declaration of ['uniform vec3 reflectionHaze;', 'uniform float reflectionLift;', 'uniform float reflectionGain;', 'uniform sampler2D shelfNear;']) {
    assert.ok(material.fragmentShader.includes(declaration), declaration);
  }
  assert.ok(material.fragmentShader.includes('shelfMix'));
  for (const name of ['reflectionHaze', 'reflectionLift', 'shelfNear', 'shelfFar', 'shallowLight']) assert.ok(material.uniforms[name], name);
  ocean.dispose();
});
