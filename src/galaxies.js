import * as THREE from '../vendor/three/three.module.js';
import { random, hash } from './rng.js';
import { weightedChoice } from './planet-data.js';

export class GalaxySky {
  constructor(scene, seed, look) {
    this.scene = scene; this.look = look; this.catalog = []; this.cache = new Map(); this.inverse = new THREE.Quaternion(); this.point = new THREE.Vector3(); this.geometry = new THREE.PlaneGeometry(1, 1);
    const rng = random(hash(seed, 751)); this.baseCount = Math.floor(look.galaxies.visible[0] + rng() * (look.galaxies.visible[1] - look.galaxies.visible[0] + 1));
    for (let index = 0; index < 256; index++) {
      const angle = rng() * Math.PI * 2, height = rng() * 2 - 1, radius = Math.sqrt(1 - height * height);
      const direction = new THREE.Vector3(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
      const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().negate());
      this.catalog.push({ id: index, seed: hash(seed, 751, index), direction, orientation, roll: rng() * Math.PI * 2,
        kind: weightedChoice(Object.entries(look.galaxies.kinds), rng), angle: (look.galaxies.angularSizeDeg[0] + rng() * (look.galaxies.angularSizeDeg[1] - look.galaxies.angularSizeDeg[0])) * Math.PI / 180 });
    }
  }
  create(data) {
    const bake = this.bakes.galaxy(data.seed, data.kind);
    const material = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { map: { value: bake.texture }, opacity: { value: 1 } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w*0.99999;}',
      fragmentShader: 'uniform sampler2D map;uniform float opacity;varying vec2 vUv;void main(){vec4 image=texture2D(map,vUv);gl_FragColor=vec4(image.rgb*1.35,image.a*opacity);}' });
    const mesh = new THREE.Mesh(this.geometry, material); mesh.frustumCulled = false; mesh.renderOrder = -800;
    mesh.scale.setScalar(2 * Math.tan(data.angle / 2) * 30000 * 1.15); mesh.quaternion.copy(data.orientation); mesh.rotateZ(data.roll); this.scene.add(mesh);
    const record = { data, bake, mesh }; this.cache.set(data.id, record); return record;
  }
  update(camera, hollow, dt) {
    if (!this.bakes) return;
    this.inverse.copy(camera.quaternion).invert(); const tangent = Math.tan(camera.fov * Math.PI / 360), candidates = [];
    for (const data of this.catalog) {
      this.point.copy(data.direction).applyQuaternion(this.inverse); if (this.point.z >= 0) continue;
      const x = this.point.x / (-this.point.z * tangent * camera.aspect), y = this.point.y / (-this.point.z * tangent);
      const edge = Math.max(Math.abs(x), Math.abs(y));
      if (edge < 0.9) candidates.push({ data, x, y, score: Math.abs(edge - 0.6) });
    }
    candidates.sort((a, b) => a.score - b.score); const selected = [], count = Math.min(4, this.baseCount + (hollow > 0.5 ? this.look.galaxies.hollowBonus : 0));
    for (const item of candidates) {
      if (selected.some((other) => Math.hypot(other.x - item.x, other.y - item.y) < 0.35)) continue;
      selected.push(item); if (selected.length >= count) break;
    }
    const wanted = new Set(selected.map(({ data }) => data.id));
    for (const { data } of selected) if (!this.cache.has(data.id)) this.create(data);
    for (const [id, record] of this.cache) {
      const target = wanted.has(id) ? 1 : 0, uniform = record.mesh.material.uniforms.opacity;
      uniform.value = dt > 0 ? THREE.MathUtils.damp(uniform.value, target, 4, dt) : target;
      record.mesh.visible = record.bake.ready && uniform.value > 0.01;
      record.mesh.position.copy(record.data.direction).multiplyScalar(30000).add(camera.position);
      if (this.cache.size > 12 && !wanted.has(id) && uniform.value < 0.05) this.remove(id);
    }
  }
  remove(id) { const record = this.cache.get(id); if (!record) return; this.scene.remove(record.mesh); record.mesh.material.dispose(); this.bakes.cancel(record.bake); this.cache.delete(id); }
  dispose() { for (const id of this.cache.keys()) this.remove(id); this.geometry.dispose(); }
}
