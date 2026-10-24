import * as THREE from '../vendor/three/three.module.js';
import { random, hash } from './rng.js';

function glow(map, color, size) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sprite.scale.setScalar(size); return sprite;
}
function tail(length, width, tint, curve) {
  const positions = [], uv = [], indices = [], steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    for (const side of [-1, 1]) { positions.push(side * width * (0.08 + t) + curve * t * t, length * t, 0); uv.push(side < 0 ? 0 : 1, t); }
    if (i < steps) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
  return new THREE.Mesh(geometry, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { tint: { value: new THREE.Color(tint) } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 tint;varying vec2 vUv;void main(){float a=pow(max(0.0,1.0-abs(vUv.x*2.0-1.0)),1.5)*pow(1.0-vUv.y,1.5)*0.35;gl_FragColor=vec4(tint,a);\n#include <colorspace_fragment>\n}' }));
}

export class RareEvents {
  constructor(seed, look, map, debugKind) {
    this.look = look; this.map = map; this.debugKind = debugKind; this.group = new THREE.Group();
    this.rng = random(hash(seed, 691)); this.active = null; this.lastTime = -Infinity;
    this.next = Object.fromEntries(Object.entries(look.rare.events).map(([kind, spec]) => [kind, this.interval(spec)]));
    this.away = new THREE.Vector3(); this.right = new THREE.Vector3(); this.normal = new THREE.Vector3(); this.basis = new THREE.Matrix4();
  }
  interval(spec) { return (spec.everyMin[0] + this.rng() * (spec.everyMin[1] - spec.everyMin[0])) * 60; }
  start(kind, flight) {
    this.clear();
    const spec = this.look.rare.events[kind], group = new THREE.Group();
    const distance = kind === 'comet' ? spec.passDistance[1] : spec.distance[0];
    const origin = new THREE.Vector3(-0.27, 0.17, -1).normalize().multiplyScalar(distance).add(new THREE.Vector3(...flight.position));
    group.userData.origin = origin; this.group.add(group);
    if (kind === 'comet') {
      const length = spec.tailLength[0] + this.rng() * (spec.tailLength[1] - spec.tailLength[0]);
      group.add(glow(this.map, spec.headColor, 35));
      const ion = tail(length, 12, spec.ionTail, 0), dust = tail(length * 0.8, 60, spec.dustTail, 120); group.add(ion, dust);
      group.userData.tails = [ion, dust];
    } else if (kind === 'binary') {
      const colors = spec.colors[Math.floor(this.rng() * spec.colors.length)];
      colors.forEach((color) => {
        const star = new THREE.Group();
        star.add(new THREE.Mesh(new THREE.SphereGeometry(14, 12, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false })));
        star.add(glow(this.map, color, 170)); group.add(star);
      });
    } else {
      group.add(glow(this.map, spec.color, 170));
      const beam = tail(1700, 90, spec.color, 0), opposite = tail(1700, 90, spec.color, 0);
      opposite.rotation.z = Math.PI; const sweep = new THREE.Group(); sweep.add(beam, opposite); group.add(sweep); group.userData.sweep = sweep;
    }
    this.active = { kind, group, start: flight.time }; this.lastTime = flight.time;
  }
  update(flight, camera, key) {
    if (!this.active) {
      const kind = this.debugKind || Object.keys(this.next).find((kind) => flight.time >= this.next[kind] && flight.time - this.lastTime >= this.look.rare.minGapMin * 60);
      if (kind) this.start(kind, flight);
    }
    if (!this.active) return;
    const { kind, group, start } = this.active, t = flight.time - start, spec = this.look.rare.events[kind];
    group.position.copy(group.userData.origin).sub(new THREE.Vector3(...flight.position));
    if (kind === 'comet') {
      group.position.x -= t * 12;
      this.away.copy(key).negate().normalize(); this.normal.copy(camera.position).sub(group.position).normalize(); this.right.crossVectors(this.away, this.normal).normalize();
      this.normal.crossVectors(this.right, this.away).normalize(); this.basis.makeBasis(this.right, this.away, this.normal);
      for (const ribbon of group.userData.tails) ribbon.quaternion.setFromRotationMatrix(this.basis);
    } else if (kind === 'binary') {
      group.children.forEach((star, i) => { const angle = t * Math.PI * 2 / spec.orbitPeriod + i * Math.PI; star.position.set(Math.cos(angle) * 95, Math.sin(angle) * 45, Math.sin(angle) * 35); });
    } else {
      const sweep = group.userData.sweep; sweep.quaternion.copy(camera.quaternion); sweep.rotateZ(t * Math.PI * 2 / spec.beamPeriod);
      for (const beam of sweep.children) beam.material.uniforms.tint.value.set(spec.color).multiplyScalar(spec.beamOpacity);
    }
    if (!this.debugKind && t > 65) { this.next[kind] = flight.time + this.interval(spec); this.clear(); }
  }
  clear() {
    if (!this.active) return;
    this.active.group.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
    this.group.remove(this.active.group); this.active = null;
  }
}
