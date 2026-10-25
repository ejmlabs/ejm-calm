import * as THREE from '../vendor/three/three.module.js';
import { random, hash } from './rng.js';

function glow(map, color, size, intensity = 1) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sprite.scale.setScalar(size); return sprite;
}

function ribbon(length, width, tint, curve, striations = 0) {
  const positions = [], uv = [], indices = [], steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    for (const side of [-1, 1]) {
      const flare = width * (0.12 + t * 0.95) * (1 + (striations ? Math.sin(t * striations * Math.PI) * 0.08 : 0));
      positions.push(side * flare + curve * t * t, length * t, 0); uv.push(side < 0 ? 0 : 1, t);
    }
    if (i < steps) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
  return new THREE.Mesh(geometry, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { tint: { value: new THREE.Color(tint) } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 tint;varying vec2 vUv;void main(){float a=pow(max(0.0,1.0-abs(vUv.x*2.0-1.0)),1.35)*pow(1.0-vUv.y,1.35)*0.42;gl_FragColor=vec4(tint,a);}' }));
}

export class RareEvents {
  constructor(seed, look, map, debugKind) {
    this.look = look; this.map = map; this.debugKind = debugKind; this.group = new THREE.Group();
    this.rng = random(hash(seed, 691)); this.active = null; this.lastTime = -Infinity; this.seed = seed;
    this.next = Object.fromEntries(Object.entries(look.rare.events).map(([kind, spec]) => [kind, this.interval(spec)]));
    this.away = new THREE.Vector3(); this.right = new THREE.Vector3(); this.normal = new THREE.Vector3(); this.basis = new THREE.Matrix4();
    this.origin = new THREE.Vector3(); this.starAway = new THREE.Vector3();
  }
  interval(spec) { return (spec.everyMin[0] + this.rng() * (spec.everyMin[1] - spec.everyMin[0])) * 60; }
  start(kind, flight, system) {
    this.clear();
    const legacy = this.look.rare.events[kind], realism = this.look.realism.comets, group = new THREE.Group();
    const distance = kind === 'comet' ? legacy.passDistance[1] : legacy.distance[0];
    const bearing = new THREE.Vector3(-0.27, 0.17, -1).normalize();
    this.origin.copy(bearing).multiplyScalar(distance).add(new THREE.Vector3(...flight.position));
    group.userData.origin = this.origin.clone(); this.group.add(group);
    if (kind === 'comet') {
      const ionLength = realism.ionTail.length[0] + this.rng() * (realism.ionTail.length[1] - realism.ionTail.length[0]);
      const dustLength = realism.dustTail.length[0] + this.rng() * (realism.dustTail.length[1] - realism.dustTail.length[0]);
      const comaRadius = realism.coma.radius[0] + this.rng() * (realism.coma.radius[1] - realism.coma.radius[0]);
      group.add(glow(this.map, realism.coma.color, comaRadius * 0.55, realism.coma.hdrIntensity));
      const ion = ribbon(ionLength * 0.012, realism.ionTail.width[0] * 0.004, realism.ionTail.color, 0, realism.ionTail.striations);
      const dust = ribbon(dustLength * 0.012, realism.dustTail.width[0] * 0.004, realism.dustTail.color, dustLength * realism.dustTail.curvature * 0.00005, 0);
      group.add(ion, dust); group.userData.tails = [ion, dust];
      group.userData.systemKey = system?.key ?? null;
      if (system?.stars?.[0]) this.starAway.fromArray(system.stars[0].position).sub(new THREE.Vector3(...flight.position)).normalize();
      else this.starAway.set(0.4, 0.1, -0.9).normalize();
    } else if (kind === 'binary') {
      const colors = legacy.colors[Math.floor(this.rng() * legacy.colors.length)];
      colors.forEach((color) => {
        const star = new THREE.Group();
        star.add(new THREE.Mesh(new THREE.SphereGeometry(14, 12, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false })));
        star.add(glow(this.map, color, 170)); group.add(star);
      });
    } else {
      group.add(glow(this.map, legacy.color, 170));
      const beam = ribbon(1700, 90, legacy.color, 0), opposite = ribbon(1700, 90, legacy.color, 0);
      opposite.rotation.z = Math.PI; const sweep = new THREE.Group(); sweep.add(beam, opposite); group.add(sweep); group.userData.sweep = sweep;
    }
    this.active = { kind, group, start: flight.time, system }; this.lastTime = flight.time;
  }
  update(flight, camera, key, system = null) {
    const inSystem = Boolean(system);
    if (!this.active) {
      let kind = this.debugKind || Object.keys(this.next).find((name) => flight.time >= this.next[name] && flight.time - this.lastTime >= this.look.rare.minGapMin * 60);
      if (kind === 'comet' && this.look.realism.comets.onlyInSystems && !inSystem && !this.debugKind) kind = null;
      if (kind) this.start(kind, flight, system);
    }
    if (!this.active) return;
    const { kind, group, start } = this.active, t = flight.time - start, spec = this.look.rare.events[kind];
    group.position.copy(group.userData.origin).sub(new THREE.Vector3(...flight.position));
    if (kind === 'comet') {
      group.position.x -= t * 12;
      if (system?.stars?.[0]) this.starAway.fromArray(system.stars[0].position).sub(new THREE.Vector3(...flight.position)).add(group.position).normalize().negate();
      else this.starAway.copy(key).negate().normalize();
      this.away.copy(this.starAway); this.normal.copy(camera.position).sub(group.position).normalize();
      this.right.crossVectors(this.away, this.normal).normalize(); this.normal.crossVectors(this.right, this.away).normalize();
      this.basis.makeBasis(this.right, this.away, this.normal);
      for (const ribbonMesh of group.userData.tails) ribbonMesh.quaternion.setFromRotationMatrix(this.basis);
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
