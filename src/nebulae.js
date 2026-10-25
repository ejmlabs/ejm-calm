import * as THREE from '../vendor/three/three.module.js';
import * as shaders from './nebula-shaders.js';
import { blackbodyColor } from './astrophysics.js';

function target(width, height) {
  return new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, count: 2, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
}
export class Nebulae {
  constructor(renderer, pipeline, bakes, look, quality) {
    this.renderer = renderer; this.pipeline = pipeline; this.bakes = bakes; this.look = look; this.quality = quality; this.records = new Map();
    this.scene = new THREE.Scene(); this.embeddedScene = new THREE.Scene(); this.direction = new THREE.Vector3(); this.center = new THREE.Vector3(); this.previousPosition = new THREE.Vector3(Infinity, 0, 0); this.previousQuaternion = new THREE.Quaternion(); this.historyValid = false; this.lastKey = '';
    this.jitter = bakes.blueNoise(117); this.blank = new THREE.Data3DTexture(new Uint8Array(32), 2, 2, 2); this.blank.format = THREE.RGBAFormat; this.blank.needsUpdate = true;
    const uniform = { densityA: { value: this.blank }, densityB: { value: this.blank }, jitterMap: { value: this.jitter.texture }, centers: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      axes: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)] }, radii: { value: new THREE.Vector2(1, 1) }, count: { value: 0 }, cameraPosition: { value: new THREE.Vector3() },
      oxygen: { value: new THREE.Color() }, hydrogen: { value: new THREE.Color() }, sulphur: { value: new THREE.Color() }, reflection: { value: new THREE.Color() },
      extinction: { value: new THREE.Vector3(...look.realism.nebula.dust.reddening.map((n) => 1 / n)) }, extinctionScale: { value: look.realism.nebula.dust.extinction },
      erosion: { value: look.realism.nebula.density.erosion }, dustCoverage: { value: look.realism.nebula.dust.coverage }, emissionScale: { value: look.realism.nebula.emissionScale * 1.15 },
      steps: { value: 48 }, lowSlices: { value: 0 }, time: { value: 0 }, embedded: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) }, embeddedCount: { value: 0 } };
    this.material = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: shaders.vertex, fragmentShader: shaders.fragment, uniforms: uniform, side: THREE.BackSide, depthTest: false, depthWrite: false });
    this.proxy = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.material); this.proxy.frustumCulled = false; this.scene.add(this.proxy);
    this.historyScene = new THREE.Scene(); this.historyCamera = new THREE.Camera();
    this.historyMaterial = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: shaders.historyVertex, fragmentShader: shaders.historyFragment, depthTest: false, depthWrite: false,
      uniforms: { emission: { value: null }, transmission: { value: null }, oldEmission: { value: null }, oldTransmission: { value: null }, weight: { value: 0 } } });
    this.historyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.historyMaterial); this.historyQuad.frustumCulled = false; this.historyScene.add(this.historyQuad);
    this.frame = target(1, 1); this.history = [target(1, 1), target(1, 1)]; this.historyIndex = 0; this.resize();
  }
  add(data) { this.records.set(data.key, { data, bake: null, lights: [] }); }
  remove(data) {
    const record = this.records.get(data.key); if (!record) return;
    if (record.bake) this.bakes.cancel(record.bake);
    for (const light of record.lights) { light.geometry.dispose(); light.material.dispose(); this.embeddedScene.remove(light); }
    this.records.delete(data.key);
  }
  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2()), tier = this.quality.tier;
    let resolution = this.look.realism.nebula.resolution[tier]; if (this.quality.nebulaLevel >= 3) resolution *= 0.7;
    const width = Math.max(1, Math.floor(size.x * resolution)), height = Math.max(1, Math.floor(size.y * resolution));
    this.frame.setSize(width, height); for (const history of this.history) history.setSize(width, height); this.historyValid = false;
    this.material.uniforms.steps.value = Math.max(16, this.look.realism.nebula.steps[tier] - this.quality.nebulaLevel * 16);
    this.material.uniforms.lowSlices.value = Number(this.quality.nebulaLevel >= 4);
  }
  choose(flight, camera) {
    camera.getWorldDirection(this.direction); const observer = new THREE.Vector3(...flight.position).add(camera.position);
    const visible = [...this.records.values()].filter(({ data }) => {
      const delta = new THREE.Vector3(...data.position).sub(observer); return delta.dot(this.direction) + data.radius > 0;
    }).sort((a, b) => observer.distanceTo(new THREE.Vector3(...a.data.position)) - observer.distanceTo(new THREE.Vector3(...b.data.position))).slice(0, 2);
    for (const record of visible) if (!record.bake) {
      record.bake = this.bakes.volume(record.data.seed);
      for (const star of record.data.embedded) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...blackbodyColor(star.temperature)).multiplyScalar(6) }));
        lamp.scale.setScalar(star.radius); lamp.userData.position = star.position; record.lights.push(lamp); this.embeddedScene.add(lamp);
      }
    }
    this.quality.hasNebula = visible.length > 0; return visible.filter((record) => record.bake.ready);
  }
  render(flight, camera, weights) {
    const selected = this.choose(flight, camera); if (!selected.length) return;
    for (const record of this.records.values()) for (const light of record.lights) { light.visible = selected.includes(record); light.position.fromArray(light.userData.position).sub(new THREE.Vector3(...flight.position)); }
    const u = this.material.uniforms, offset = new THREE.Vector3(...flight.position); let embedded = 0;
    selected.forEach(({ data, bake }, i) => {
      u[i === 0 ? 'densityA' : 'densityB'].value = bake.texture; u.centers.value[i].fromArray(data.position).sub(offset); u.axes.value[i].fromArray(data.axes); u.radii.value.setComponent(i, data.radius);
      for (const star of data.embedded) if (embedded < 8) u.embedded.value[embedded++].fromArray(star.position).sub(offset);
    }); u.embeddedCount.value = embedded; u.count.value = selected.length; u.cameraPosition.value.copy(camera.position); u.time.value = Math.floor(flight.time * 24) / 24;
    const spec = this.look.realism.nebula, mixes = ['tidepool', 'ember', 'hollow'].map((name) => spec.regionMix[name]);
    const contribution = (name) => weights.reduce((sum, weight, i) => sum + weight * (mixes[i][name] ?? 0) * (mixes[i].intensityScale ?? 1), 0);
    for (const [key, channel] of [['oxygen', 'oIII'], ['hydrogen', 'hAlpha'], ['sulphur', 'sII'], ['reflection', 'reflection']]) u[key].value.set(spec.emission[channel]).multiplyScalar(contribution(channel));
    this.center.set(0, 0, 0); for (let i = 0; i < selected.length; i++) this.center.add(u.centers.value[i]); this.center.multiplyScalar(1 / selected.length);
    let radius = 0; for (let i = 0; i < selected.length; i++) radius = Math.max(radius, this.center.distanceTo(u.centers.value[i]) + u.radii.value.getComponent(i));
    this.proxy.position.copy(this.center); this.proxy.scale.setScalar(radius); this.renderer.setRenderTarget(this.frame);
    const gl = this.renderer.getContext(); gl.clearBufferfv(gl.COLOR, 0, new Float32Array([0, 0, 0, 1])); gl.clearBufferfv(gl.COLOR, 1, new Float32Array([1, 1, 1, 1]));
    this.renderer.render(this.scene, camera);
    const observer = offset.add(camera.position), key = selected.map((record) => record.data.key).join('|');
    if (key !== this.lastKey || this.previousPosition.distanceTo(observer) > 10 || Math.abs(camera.quaternion.dot(this.previousQuaternion)) < 0.9995) this.historyValid = false;
    this.lastKey = key; this.previousPosition.copy(observer); this.previousQuaternion.copy(camera.quaternion);
    let image = this.frame;
    if (this.quality.tier !== 'low' && this.look.realism.nebula.history[this.quality.tier] > 0) {
      const previous = this.history[this.historyIndex], next = this.history[1 - this.historyIndex], h = this.historyMaterial.uniforms;
      h.emission.value = this.frame.textures[0]; h.transmission.value = this.frame.textures[1]; h.oldEmission.value = previous.textures[0]; h.oldTransmission.value = previous.textures[1];
      h.weight.value = this.historyValid ? this.look.realism.nebula.history[this.quality.tier] : 0;
      this.renderer.setRenderTarget(next); this.renderer.render(this.historyScene, this.historyCamera); this.historyIndex = 1 - this.historyIndex; this.historyValid = true; image = next;
    }
    this.pipeline.compositeVolume(image.textures[0], image.textures[1], image.width, image.height);
  }
  dispose() {
    for (const record of this.records.values()) this.remove(record.data); this.frame.dispose(); for (const item of this.history) item.dispose();
    this.blank.dispose(); this.material.dispose(); this.historyMaterial.dispose(); this.proxy.geometry.dispose(); this.historyQuad.geometry.dispose();
  }
}
