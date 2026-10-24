import * as THREE from '../vendor/three/three.module.js';

export class BakeQueue {
  constructor(renderer, look, tier = 'high') {
    this.renderer = renderer; this.look = look; this.tier = tier; this.nextId = 1; this.jobs = new Map(); this.uploads = []; this.lastMs = 0; this.maxMs = 0;
    this.worker = new Worker(new URL('./bake-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      const job = this.jobs.get(data.id); if (!job || job.cancelled) return;
      if (data.error) { job.error = data.error; job.ready = true; return; }
      if (data.noise || data.galaxy) { job.data = data.noise ?? data.galaxy; this.uploads.push({ job, image: true }); }
      else if (data.volume) { job.data = data.volume; this.uploads.push({ job, volume: true }); }
      else {
        job.sources = {};
        for (const key of ['albedo', 'surface', 'normals']) job.sources[key] = new THREE.DataTexture(data[key], job.width, job.height);
        job.row = 0; this.uploads.push({ job });
      }
      this.onReady?.();
    };
    this.worker.onerror = (event) => { for (const job of this.jobs.values()) if (!job.ready) { job.error = event.message; job.ready = true; } this.onReady?.(); };
  }
  planet(data, { moon = false } = {}) {
    const [width, height] = moon ? [256, 128] : this.look.realism.planets.bake.size[this.tier];
    const id = this.nextId++, job = { id, width, height, row: 0, ready: false, cancelled: false };
    for (const key of ['albedo', 'surface', 'normals']) {
      const texture = new THREE.DataTexture(new Uint8Array(width * height * 4), width, height);
      texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.wrapS = THREE.RepeatWrapping;
      texture.colorSpace = key === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      job[key] = texture;
    }
    this.jobs.set(id, job); this.worker.postMessage({ kind: 'planet', id, data: { ...data, moon }, width, height }); return job;
  }
  volume(seed) {
    const id = this.nextId++, size = this.tier === 'high' ? 64 : 32;
    const job = { id, size, ready: false, cancelled: false, texture: new THREE.Data3DTexture(new Uint8Array(size ** 3 * 4), size, size, size) };
    job.texture.format = THREE.RGBAFormat; job.texture.minFilter = job.texture.magFilter = THREE.LinearFilter; job.texture.unpackAlignment = 1;
    this.jobs.set(id, job); this.worker.postMessage({ kind: 'volume', id, seed, size }); return job;
  }
  blueNoise(seed) {
    const id = this.nextId++, size = 32, job = { id, ready: false, cancelled: false, texture: new THREE.DataTexture(new Uint8Array(size * size * 4).fill(127), size, size) };
    job.texture.magFilter = job.texture.minFilter = THREE.NearestFilter; job.texture.wrapS = job.texture.wrapT = THREE.RepeatWrapping; job.texture.needsUpdate = true;
    this.jobs.set(id, job); this.worker.postMessage({ kind: 'noise', id, seed, size }); return job;
  }
  galaxy(seed, galaxyKind) {
    const id = this.nextId++, size = this.look.realism.galaxies.bakeSize[this.tier];
    const texture = new THREE.DataTexture(new Uint8Array(size * size * 4), size, size); texture.magFilter = texture.minFilter = THREE.LinearFilter;
    const job = { id, texture, ready: false, cancelled: false }; this.jobs.set(id, job);
    this.worker.postMessage({ kind: 'galaxy', id, seed, size, galaxyKind }); return job;
  }
  step(budget = 2) {
    const start = performance.now();
    while (this.uploads.length && performance.now() - start < budget) {
      const entry = this.uploads[0], { job } = entry;
      if (job.cancelled) { this.uploads.shift(); continue; }
      if (entry.volume || entry.image) {
        job.texture.image.data = job.data; job.texture.needsUpdate = true; this.renderer.initTexture(job.texture); job.ready = true; this.uploads.shift();
      } else {
        const rows = Math.min(job.height - job.row, Math.max(1, Math.floor(job.height / this.look.realism.planets.bake.framesToBake)));
        for (const key of ['albedo', 'surface', 'normals']) {
          const texture = job[key];
          if (job.row === 0) { texture.addUpdateRange(0, job.width * 4); texture.needsUpdate = true; this.renderer.initTexture(texture); }
          const region = new THREE.Box3(new THREE.Vector3(0, job.row, 0), new THREE.Vector3(job.width, job.row + rows, 1));
          this.renderer.copyTextureToTexture(job.sources[key], texture, region, new THREE.Vector2(0, job.row));
        }
        job.row += rows;
        if (job.row === job.height) { job.ready = true; this.uploads.shift(); }
        break;
      }
    }
    this.lastMs = performance.now() - start; this.maxMs = Math.max(this.maxMs, this.lastMs);
  }
  cancel(job) {
    job.cancelled = true; this.jobs.delete(job.id);
    for (const key of ['albedo', 'surface', 'normals', 'texture']) job[key]?.dispose();
  }
  dispose() { this.worker.terminate(); for (const job of this.jobs.values()) this.cancel(job); this.uploads = []; }
}
