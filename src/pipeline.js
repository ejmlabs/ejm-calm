import * as THREE from '../vendor/three/three.module.js';
import { GpuTimers } from './gpu-timers.js';

const vertex = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
const sampleTent = `vec3 tent(sampler2D image,vec2 uv,vec2 stepSize){return (texture2D(image,uv+stepSize*vec2(-0.5,-0.5)).rgb+texture2D(image,uv+stepSize*vec2(0.5,-0.5)).rgb+texture2D(image,uv+stepSize*vec2(-0.5,0.5)).rgb+texture2D(image,uv+stepSize*vec2(0.5,0.5)).rgb)*0.25;}`;
function target(width, height, depth = false, type = THREE.HalfFloatType) {
  return new THREE.WebGLRenderTarget(width, height, { type, format: THREE.RGBAFormat, depthBuffer: depth, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
}
function material(fragmentShader, uniforms) { return new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false }); }

export class ImagePipeline {
  constructor(renderer, look, quality) {
    this.renderer = renderer; this.look = look.realism.pipeline; this.quality = quality; this.tier = quality.tier ?? (quality.mobile ? 'low' : 'high');
    this.renderer.toneMapping = THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1;
    this.timers = new GpuTimers(renderer.getContext()); this.scene = new THREE.Scene(); this.camera = new THREE.Camera();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false; this.scene.add(this.quad);
    this.hdr = target(1, 1, true); this.work = target(1, 1, true); this.meter = target(1, 1, false, THREE.UnsignedByteType);
    this.exposure = this.look.exposure.base; this.targetExposure = this.exposure; this.lastMeter = -Infinity; this.meterTask = null; this.disposed = false;
    this.down = material(`uniform sampler2D source;uniform vec2 stepSize;uniform float threshold;uniform float knee;uniform float first;varying vec2 vUv;${sampleTent}
void main(){vec3 c=tent(source,vUv,stepSize);if(first>0.5){float peak=max(max(c.r,c.g),c.b);float soft=clamp(peak-threshold+knee,0.0,2.0*knee);soft=soft*soft/(4.0*knee+0.00001);c*=max(peak-threshold,soft)/max(peak,0.00001);}gl_FragColor=vec4(c,1.0);}`, {
      source: { value: null }, stepSize: { value: new THREE.Vector2() }, threshold: { value: this.look.bloom.threshold }, knee: { value: this.look.bloom.knee }, first: { value: 0 },
    });
    this.up = material(`uniform sampler2D source;uniform sampler2D detail;uniform vec2 stepSize;varying vec2 vUv;${sampleTent}
void main(){gl_FragColor=vec4((texture2D(detail,vUv).rgb+tent(source,vUv,stepSize))*0.5,1.0);}`, {
      source: { value: null }, detail: { value: null }, stepSize: { value: new THREE.Vector2() },
    });
    this.meterMaterial = material(`uniform sampler2D source;varying vec2 vUv;
void main(){vec3 c=texture2D(source,vUv).rgb;float l=dot(c,vec3(0.2126,0.7152,0.0722));float weight=mix(0.4,1.0,pow(max(0.0,1.0-length(vUv-0.5)*1.414),2.0));gl_FragColor=vec4(clamp((log2(max(l,0.00001))+16.0)/24.0,0.0,1.0),weight,0.0,1.0);}`, { source: { value: null } });
    this.volumeComposite = material(`uniform sampler2D source;uniform sampler2D emission;uniform sampler2D transmission;uniform vec2 stepSize;varying vec2 vUv;${sampleTent}
void main(){vec3 color=texture2D(source,vUv).rgb*tent(transmission,vUv,stepSize)+tent(emission,vUv,stepSize);gl_FragColor=vec4(color,1);}`, {
      source: { value: null }, emission: { value: null }, transmission: { value: null }, stepSize: { value: new THREE.Vector2() },
    });
    this.composite = material(`uniform sampler2D source;uniform sampler2D bloom;uniform float exposure;uniform float bloomStrength;uniform float aberration;uniform float vignette;uniform float softness;uniform float grain;uniform float time;varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p+time,vec2(12.9898,78.233)))*43758.5453);}
// Triangular-PDF dither: sum of two uniform [0,1) hashes, remapped to ±1 LSB.
float tpdf(vec2 p){return hash(p)+hash(p+vec2(19.1,7.3))-1.0;}
void main(){vec2 radial=vUv-0.5;vec2 offset=radial*dot(radial,radial)*aberration;vec3 c=texture2D(source,vUv).rgb;
if(aberration>0.0){c.r=texture2D(source,vUv+offset).r;c.b=texture2D(source,vUv-offset).b;}
c+=texture2D(bloom,vUv).rgb*bloomStrength;float shade=1.0-vignette*smoothstep(softness,1.4,length(radial*2.0));gl_FragColor=vec4(c*exposure*shade,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
float luminance=dot(gl_FragColor.rgb,vec3(0.2126,0.7152,0.0722));
float noise=tpdf(gl_FragCoord.xy)*grain*(0.7+0.3*sqrt(max(0.0,luminance)));
gl_FragColor.rgb=max(gl_FragColor.rgb+vec3(noise),vec3(4.0,5.0,10.0)/255.0);
}`, { source: { value: this.hdr.texture }, bloom: { value: null }, exposure: { value: 1 }, bloomStrength: { value: this.look.bloom.intensity },
      aberration: { value: 0 }, vignette: { value: this.look.lens.vignette.amount }, softness: { value: this.look.lens.vignette.softness }, grain: { value: this.look.lens.grain.amount }, time: { value: 0 } });
    this.composite.toneMapped = true; this.levels = []; this.resize();
  }
  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2()); this.width = size.x; this.height = size.y;
    for (const buffer of [this.hdr, this.work]) {
      const samples = Math.min(this.renderer.capabilities.maxSamples, this.tier === 'low' ? 2 : 4);
      if (buffer.samples !== samples) { buffer.dispose(); buffer.samples = samples; }
      buffer.setSize(size.x, size.y);
    }
    const scale = this.look.exposure.meterRes; this.meter.setSize(Math.max(1, Math.floor(size.x * scale)), Math.max(1, Math.floor(size.y * scale)));
    for (const level of this.levels) { level.down.dispose(); level.up.dispose(); }
    this.levels = []; const resolution = this.look.bloom.resolution[this.tier];
    for (let i = 0; i < this.look.bloom.mips[this.tier]; i++) {
      const w = Math.max(1, Math.floor(size.x * resolution / 2 ** i)), h = Math.max(1, Math.floor(size.y * resolution / 2 ** i));
      this.levels.push({ down: target(w, h), up: target(w, h) });
    }
    this.composite.uniforms.aberration.value = this.look.lens.chromaticAberration[this.tier];
  }
  pass(shader, destination) { this.quad.material = shader; this.renderer.setRenderTarget(destination); this.renderer.render(this.scene, this.camera); }
  begin() { this.timers.poll(); this.renderer.setRenderTarget(this.hdr); this.renderer.clear(); }
  draw(name, run) { return this.timers.measure(name, run); }
  compositeVolume(emission, transmission, width, height) {
    const u = this.volumeComposite.uniforms; u.source.value = this.hdr.texture; u.emission.value = emission; u.transmission.value = transmission; u.stepSize.value.set(1 / width, 1 / height);
    this.pass(this.volumeComposite, this.work); [this.hdr, this.work] = [this.work, this.hdr]; this.renderer.setRenderTarget(this.hdr);
  }
  finish(time, dt) {
    this.composite.uniforms.source.value = this.hdr.texture;
    const settings = this.look.exposure;
    const rate = this.targetExposure > this.exposure ? settings.upSeconds : settings.downSeconds;
    this.exposure += (this.targetExposure - this.exposure) * (1 - Math.exp(-dt / rate));
    this.timers.measure('bloom', () => {
      let source = this.hdr;
      this.levels.forEach((level, index) => {
        this.down.uniforms.source.value = source.texture; this.down.uniforms.stepSize.value.set(1 / source.width, 1 / source.height); this.down.uniforms.first.value = Number(index === 0);
        this.pass(this.down, level.down); source = level.down;
      });
      for (let i = this.levels.length - 2; i >= 0; i--) {
        const level = this.levels[i]; this.up.uniforms.source.value = source.texture; this.up.uniforms.detail.value = level.down.texture;
        this.up.uniforms.stepSize.value.set(1 / source.width, 1 / source.height); this.pass(this.up, level.up); source = level.up;
      }
      this.composite.uniforms.bloom.value = source.texture;
    });
    if (!this.meterTask && time - this.lastMeter > 0.75 && !this.disposed) this.measureExposure(time);
    this.composite.uniforms.exposure.value = this.exposure;
    this.composite.uniforms.time.value = Math.floor(time * this.look.lens.grain.fps) / this.look.lens.grain.fps;
    this.timers.measure('composite', () => this.pass(this.composite, null));
  }
  measureExposure(time) {
    this.lastMeter = time; this.meterMaterial.uniforms.source.value = this.hdr.texture;
    this.timers.measure('meter', () => this.pass(this.meterMaterial, this.meter));
    const pixels = new Uint8Array(this.meter.width * this.meter.height * 4);
    this.meterTask = this.renderer.readRenderTargetPixelsAsync(this.meter, 0, 0, this.meter.width, this.meter.height, pixels).then(() => {
      let sum = 0, weights = 0;
      for (let i = 0; i < pixels.length; i += 4) { const weight = pixels[i + 1] / 255; sum += (pixels[i] / 255 * 24 - 16) * weight; weights += weight; }
      const luminance = 2 ** (sum / Math.max(weights, 1));
      this.targetExposure = THREE.MathUtils.clamp(this.look.exposure.base * 0.02 / Math.max(luminance, 1e-5), this.look.exposure.base * 2 ** this.look.exposure.rangeEV[0], this.look.exposure.base * 2 ** this.look.exposure.rangeEV[1]);
    }).catch(() => {}).finally(() => { this.meterTask = null; });
  }
  report() { return { tier: this.tier, hdr: this.hdr.texture.type === THREE.HalfFloatType, samples: this.hdr.samples, exposure: this.exposure, gpu: this.timers.report() }; }
  dispose() {
    this.disposed = true; this.timers.dispose(); this.hdr.dispose(); this.work.dispose();
    if (this.meterTask) this.meterTask.finally(() => this.meter.dispose()); else this.meter.dispose();
    for (const level of this.levels) { level.down.dispose(); level.up.dispose(); }
    for (const item of [this.down, this.up, this.composite, this.meterMaterial, this.volumeComposite]) item.dispose(); this.quad.geometry.dispose();
  }
}
