import * as THREE from '../vendor/three/three.module.js';
import { random, hash } from './rng.js';
import { CELL_SIZE, regionWeights } from './universe.js';
import { createShip, animateShip } from './ship.js';
import { createPlanet, updatePlanet, disposePlanet } from './planets.js';
import { Sky, glowTexture, densityTexture, starMaterial, starsGeometry } from './space-layers.js';
import { RareEvents } from './events.js';
import { ImagePipeline } from './pipeline.js';
import { BakeQueue } from './bakes.js';
import { StarLighting } from './star-lighting.js';
import { blackbodyColor } from './astrophysics.js';
import { Nebulae } from './nebulae.js';
import { observePassQuality } from './quality.js';
import { ShipEnvironment } from './ship-materials.js';
import { AsteroidKit } from './asteroids.js';
import { forward } from './math.js';
import * as shaders from './shaders.js';

const regionNames = ['tidepool', 'ember', 'hollow'];
function blend(target, sources, weights) {
  target.setRGB(0, 0, 0);
  sources.forEach((source, i) => { target.r += source.r * weights[i]; target.g += source.g * weights[i]; target.b += source.b * weights[i]; });
}

export class SpaceRenderer {
  constructor(canvas, seed, look, quality) {
    this.seed = seed; this.look = look; this.mobile = quality.mobile; this.debug = look.debug ?? {}; this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
    const gl = this.renderer.getContext(), information = gl.getExtension('WEBGL_debug_renderer_info');
    const device = information ? gl.getParameter(information.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    this.software = /software|swift|llvmpipe/i.test(device);
    if (this.software) {
      quality.software = true; quality.tier = quality.initialTier = 'low'; quality.nebulaLevel = 4; quality.target = 1000 / 30;
      quality.maximum = Math.min(quality.dpr, look.realism.qualityTiers.low.dprCap); quality.ratio = Math.min(quality.ratio, quality.maximum);
    }
    this.renderer.setPixelRatio(quality.ratio); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(look.camera.fov, 1, look.camera.near, look.camera.far);
    this.groups = new Map(); this.planetGroups = new Set(); this.cloudGroups = new Set(); this.base = [0, 0, 0];
    this.farScene = new THREE.Scene(); this.systems = new Map(); this.volumes = new Map(); this.systemPlanetGroups = new Map(); this.focusId = look.focusPlanetId;
    this.lighting = new StarLighting(look); this.nearestSystem = null;
    this.vector = new THREE.Vector3(); this.cameraForward = new THREE.Vector3(); this.viewLight = new THREE.Vector3(); this.lightWorld = new THREE.Vector3(); this.size = new THREE.Vector2();
    this.weights = null; this.lastTime = 0;
    const rng = random(hash(seed, 771));
    this.lightAzimuth = (rng() < 0.5 ? 1 : -1) * (Math.PI / 2 + 0.15 + (rng() - 0.5) * Math.PI / 6);
    this.regions = regionNames.map((name) => {
      const region = look.REGIONS[name];
      return { deep: new THREE.Color(region.sky.deep), horizon: new THREE.Color(region.sky.horizon), band: new THREE.Color(region.sky.band),
        key: new THREE.Color(region.keyLight.color), fill: new THREE.Color(region.fill.color), rim: new THREE.Color(region.rim.color), dust: new THREE.Color(region.dust),
        stars: region.starTint.map((c) => new THREE.Color(c)), nebula: ['core', 'mid', 'edge'].map((key) => new THREE.Color(region.nebula[key])) };
    });
    this.palette = Object.fromEntries(['deep', 'horizon', 'band', 'key', 'fill', 'rim', 'dust'].map((key) => [key, new THREE.Color()]));
    this.palette.stars = Array.from({ length: 4 }, () => new THREE.Color()); this.palette.nebula = Array.from({ length: 3 }, () => new THREE.Color());
    this.planetFill = new THREE.Color();
    this.glow = glowTexture(); this.cloudTextures = [0, 1].map((i) => densityTexture(hash(seed, 83, i), this.mobile, look.nebula));
    this.quad = new THREE.PlaneGeometry(1, 1);
    this.hemisphere = new THREE.HemisphereLight('#bdc9d9', '#0d1220', 0.6); this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight('#f4f1ea', 1); this.scene.add(this.sun);
    this.companion = new THREE.DirectionalLight('#e2e9ff', 0); this.scene.add(this.companion);
    this.fill = new THREE.DirectionalLight('#2a3f6b', 0.22); this.fill.position.set(3, -1, 3); this.scene.add(this.fill);
    this.rim = new THREE.DirectionalLight('#7fb8e6', 0.5); this.rim.position.set(0.3, 0.5, -2); this.scene.add(this.rim);
    this.ship = createShip(look.ship, this.glow, this.mobile, look.realism, quality.tier); this.scene.add(this.ship);
    this.sky = new Sky(seed, look, this.mobile, quality.ratio);
    this.sky.stars.geometry.setDrawRange(0, look.realism.magnitudes.countByTier[quality.tier]);
    this.starMaterial = starMaterial(look, quality.ratio);
    this.stars = new THREE.Points(starsGeometry([], [], [], []), this.starMaterial); this.stars.frustumCulled = false; this.scene.add(this.stars);
    this.farScene.add(this.stars);
    this.dust = this.makeDust(); this.scene.add(this.dust);
    this.rocks = new AsteroidKit(seed, look, quality.tier);
    this.planetGeometry = new THREE.SphereGeometry(1, this.mobile ? 48 : 72, this.mobile ? 32 : 48);
    this.dummy = new THREE.Object3D(); this.events = new RareEvents(seed, look, this.glow, this.debug.event); this.scene.add(this.events.group);
    this.pipeline = new ImagePipeline(this.renderer, look, quality); this.bakes = new BakeQueue(this.renderer, look, this.pipeline.tier);
    this.sky.catalog.bakes = this.bakes;
    this.nebulae = new Nebulae(this.renderer, this.pipeline, this.bakes, look, quality); this.environment = new ShipEnvironment(this.renderer, look.realism.shipMaterials.environment); this.resize(quality.ratio);
  }

  makeDust() {
    const rng = random(hash(this.seed, 779)), settings = this.look.stars.dust, count = settings.count.high * 3;
    const geometry = new THREE.InstancedBufferGeometry(); geometry.index = this.quad.index;
    geometry.attributes.position = this.quad.attributes.position; geometry.attributes.uv = this.quad.attributes.uv;
    const base = [], sizes = [];
    for (let i = 0; i < count; i++) { base.push(rng() * settings.box, rng() * settings.box, rng() * settings.box); sizes.push(1.2 + rng()); }
    geometry.setAttribute('base', new THREE.InstancedBufferAttribute(new Float32Array(base), 3));
    geometry.setAttribute('size', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1)); geometry.instanceCount = count;
    const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ vertexShader: shaders.dustVertex, fragmentShader: shaders.dustFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { travel: { value: new THREE.Vector3() }, boxSize: { value: settings.box }, resolution: { value: new THREE.Vector2() },
        velocity: { value: new THREE.Vector3() }, streak: { value: settings.streak }, tint: { value: new THREE.Color() }, opacity: { value: settings.alpha }, pixelRatio: { value: this.renderer.getPixelRatio() } } }));
    mesh.frustumCulled = false; mesh.userData.baseCount = settings.count[this.quality.tier]; geometry.instanceCount = mesh.userData.baseCount; return mesh;
  }

  loadSystem(system) {
    if (this.systems.has(system.key)) return;
    const stars = system.stars.map((data) => {
      const group = new THREE.Group(), color = new THREE.Color().setRGB(...data.color);
      const disk = new THREE.Mesh(this.planetGeometry, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(this.look.realism.lighting.starDisk.hdrIntensity) }));
      disk.scale.setScalar(data.radius); group.add(disk);
      const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: color.clone().multiplyScalar(this.look.realism.lighting.starDisk.coronaPeak),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      corona.scale.setScalar(data.radius * this.look.realism.lighting.starDisk.coronaRadius * 2); group.add(corona); this.farScene.add(group);
      return { data, group };
    }); this.systems.set(system.key, { data: system, stars });
  }

  unloadSystem(system) {
    const record = this.systems.get(system.key); if (!record) return;
    for (const star of record.stars) { star.group.traverse((object) => object.material?.dispose()); this.farScene.remove(star.group); }
    for (const planet of system.planets) {
      const group = this.systemPlanetGroups.get(planet.id); if (group) { this.releasePlanet(group); this.systemPlanetGroups.delete(planet.id); }
    } this.systems.delete(system.key);
  }
  loadNebula(data) { this.volumes.set(data.key, data); this.nebulae.add(data); }
  unloadNebula(data) { this.volumes.delete(data.key); this.nebulae.remove(data); }

  releasePlanet(group) {
    disposePlanet(group); group.traverse((object) => {
      if (object.geometry && object.geometry !== this.planetGeometry) object.geometry.dispose(); object.material?.dispose();
    }); this.planetGroups.delete(group); this.farScene.remove(group);
  }

  updateSystems(flight) {
    const bodies = [];
    for (const record of this.systems.values()) {
      for (const { data, group } of record.stars) group.position.fromArray(data.position.map((n, i) => n - flight.position[i]));
      for (const planet of record.data.planets) {
        const distance = Math.hypot(...planet.position.map((n, i) => n - flight.position[i]));
        if (planet.radius / distance > 0.0025 || planet.id === this.focusId) bodies.push({ planet, distance });
      }
    }
    bodies.sort((a, b) => Number(b.planet.id === this.focusId) - Number(a.planet.id === this.focusId) || a.distance - b.distance);
    const wanted = new Set(bodies.slice(0, this.mobile ? 4 : 7).map(({ planet }) => planet.id));
    for (const [id, group] of this.systemPlanetGroups) if (!wanted.has(id)) { this.releasePlanet(group); this.systemPlanetGroups.delete(id); }
    for (const { planet } of bodies) if (wanted.has(planet.id)) {
      let group = this.systemPlanetGroups.get(planet.id);
      if (!group) {
        group = createPlanet(planet, this.look, this.planetGeometry, this.mobile, planet.id === this.focusId ? this.debug.planet : undefined, this.bakes, this.pipeline.tier);
        this.farScene.add(group); this.systemPlanetGroups.set(planet.id, group); this.planetGroups.add(group);
      }
      group.position.fromArray(planet.position.map((n, i) => n - flight.position[i]));
    }
  }
  get ready() { return !this.focusId || Boolean(this.systemPlanetGroups.get(this.focusId)?.userData.planet.surface.userData.bake.ready); }
  get needsWork() { return [...this.bakes.jobs.values()].some((job) => !job.ready && !job.cancelled); }

  loadCell(cell) {
    const group = new THREE.Group(); group.userData.coordinates = cell.coordinates; group.userData.field = cell.asteroidField;
    const origin = cell.coordinates.map((n) => n * CELL_SIZE), local = (point) => point.map((n, i) => n - origin[i]);
    for (const data of cell.planets) {
      const planet = createPlanet(data, this.look, this.planetGeometry, this.mobile, cell.key === '0,0,0' ? this.debug.planet : undefined, this.bakes, this.pipeline.tier);
      planet.position.fromArray(local(data.position)); group.add(planet); this.planetGroups.add(planet);
    }
    if (cell.asteroids.length) {
      group.add(this.rocks.create(cell.asteroids, origin));
    }
    for (const data of cell.nebulae) {
      const rng = random(data.seed), count = this.look.nebula.puffs[this.mobile ? 'low' : 'high'];
      const cloud = { group, center: new THREE.Vector3(...local(data.position)), puffs: [] };
      for (let i = 0; i < count; i++) {
        const material = new THREE.ShaderMaterial({ vertexShader: shaders.nebulaVertex, fragmentShader: shaders.nebulaFragment,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          uniforms: { densityMap: { value: this.cloudTextures[i % 2] }, core: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, edge: { value: new THREE.Color() },
            opacity: { value: 0 }, nearFade: { value: 0 }, softness: { value: this.look.nebula.softness } } });
        const puff = new THREE.Mesh(this.quad, material); puff.position.copy(cloud.center);
        const offset = new THREE.Vector3((rng() - 0.5) * data.radius, (rng() - 0.5) * data.radius * 0.6, (rng() - 0.5) * data.radius * 0.5);
        if (i > 0) puff.position.add(offset);
        puff.scale.set(data.radius * (0.45 + rng() * 0.4), data.radius * (0.35 + rng() * 0.4), 1); puff.userData.roll = rng() * Math.PI * 2; puff.frustumCulled = false;
        group.add(puff); cloud.puffs.push(puff);
      } this.cloudGroups.add(cloud);
    }
    this.groups.set(cell.key, group); this.scene.add(group);
  }

  unloadCell(cell) {
    const group = this.groups.get(cell.key); if (!group) return;
    for (const cloud of this.cloudGroups) if (cloud.group === group) this.cloudGroups.delete(cloud);
    group.traverse((object) => {
      if (object.userData.planet) disposePlanet(object);
      this.planetGroups.delete(object);
      if (object.userData.asteroidRecord) this.rocks.remove(object);
      if (object.isInstancedMesh && object.userData.rockClass === undefined) object.dispose();
      if (object.geometry && ![this.quad, this.planetGeometry, ...this.rocks.geometries].includes(object.geometry)) object.geometry.dispose();
      if (object.material && !this.rocks.materials.includes(object.material)) object.material.dispose();
    }); this.scene.remove(group); this.groups.delete(cell.key);
  }

  updateStars(universe, position) {
    this.base = position.map((n) => Math.round(n / CELL_SIZE) * CELL_SIZE);
    const positions = [], sizes = [], tints = [], halos = [], colors = [], fluxes = [], settings = this.look.stars.field;
    for (const cell of universe.cells.values()) for (const star of cell.stars.slice(0, this.look.realism.depthLayers.field.perCell[this.pipeline.tier])) {
      positions.push(...star.position.map((n, i) => n - this.base[i])); sizes.push(star.size); tints.push(star.warmth, star.brightness, 0);
      halos.push(star.halo ? settings.halo.sizePx[0] + star.warmth * (settings.halo.sizePx[1] - settings.halo.sizePx[0]) : 0);
      colors.push(...star.color); fluxes.push(star.luminosity);
    }
    this.stars.geometry.dispose(); this.stars.geometry = starsGeometry(positions, sizes, tints, halos, { colors, fluxes });
  }

  resize(ratio) {
    if (ratio) this.renderer.setPixelRatio(ratio);
    const width = window.innerWidth, height = window.innerHeight;
    this.camera.fov = this.look.camera.fovDeg[height > width ? 'portrait' : 'landscape'];
    this.camera.userData.baseFov = this.camera.fov;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix();
    this.renderer.getDrawingBufferSize(this.size);
    this.starMaterial.uniforms.pixelRatio.value = this.sky.stars.material.uniforms.pixelRatio.value = this.renderer.getPixelRatio();
    this.dust.material.uniforms.resolution.value.copy(this.size);
    this.dust.material.uniforms.pixelRatio.value = this.renderer.getPixelRatio();
    this.pipeline?.resize();
    this.nebulae?.resize();
  }

  applyQuality(quality) {
    this.pipeline.tier = quality.tier; this.bakes.tier = quality.tier;
    this.sky.stars.geometry.setDrawRange(0, this.look.realism.magnitudes.countByTier[quality.tier]);
    this.ship.userData.panels.anisotropy = this.look.realism.shipMaterials.graphite.anisotropy[quality.tier]; this.ship.userData.panels.needsUpdate = true;
    this.rocks.setTier(quality.tier); this.dust.userData.baseCount = this.look.stars.dust.count[quality.tier];
    for (const group of this.planetGroups) group.traverse((object) => { if (object.material?.uniforms?.normalTaps) object.material.uniforms.normalTaps.value = this.look.realism.planets.normals.tapsByTier[quality.tier]; });
    this.resize(quality.ratio);
  }
  observeQuality(elapsed) {
    if (!this.pipeline.timers.extension) return false;
    const pass = this.pipeline.timers.samples.nebula; if (!pass) return false;
    return observePassQuality(this.quality, 'nebula', pass.mean, elapsed, this.look.realism.budgets[this.mobile ? 'phone' : 'desktop'].nebula);
  }
  report() { return { ...this.pipeline.report(), software: this.software, bakeMs: this.bakes.lastMs, bakePeakMs: this.bakes.maxMs, systems: this.systems.size, volumes: this.volumes.size }; }

  updatePalette(flight, dt) {
    const forced = regionNames.indexOf(this.debug.region);
    const target = forced < 0 ? regionWeights(this.seed, flight.position, this.look.regionField) : regionNames.map((_, i) => Number(i === forced));
    if (!this.weights) this.weights = target;
    else this.weights = this.weights.map((weight, i) => weight + (target[i] - weight) * (1 - Math.exp(-dt / this.look.regionField.blendSeconds)));
    for (const key of ['deep', 'horizon', 'band', 'key', 'fill', 'rim', 'dust']) blend(this.palette[key], this.regions.map((region) => region[key]), this.weights);
    for (let i = 0; i < 4; i++) blend(this.palette.stars[i], this.regions.map((region) => region.stars[i]), this.weights);
    for (let i = 0; i < 3; i++) blend(this.palette.nebula[i], this.regions.map((region) => region.nebula[i]), this.weights);
    const angle = this.lightAzimuth + this.weights[1] * 0.18 - this.weights[2] * 0.1;
    this.lightWorld.set(Math.sin(angle), 0.35, Math.cos(angle)).normalize(); this.sun.position.copy(this.lightWorld).multiplyScalar(8);
    const intensity = (key, field) => this.weights.reduce((sum, weight, i) => sum + weight * this.look.REGIONS[regionNames[i]][key][field], 0);
    this.sun.color.copy(this.palette.key);
    this.fill.color.copy(this.palette.fill); this.fill.intensity = 0;
    this.rim.color.copy(this.palette.rim); this.rim.intensity = 0;
    this.hemisphere.color.copy(this.palette.band); this.hemisphere.intensity = this.look.realism.lighting.ambient.intensity[0] + this.weights[0] * (this.look.realism.lighting.ambient.intensity[1] - this.look.realism.lighting.ambient.intensity[0]);
    this.planetFill.copy(this.palette.fill).multiplyScalar(1 / Math.max(this.palette.fill.r, this.palette.fill.g, this.palette.fill.b, 0.01));
  }

  render(flight) {
    this.bakes.step();
    const dt = Math.min(0.1, Math.max(0, flight.time - this.lastTime)); this.lastTime = flight.time;
    this.updatePalette(flight, dt);
    this.environment.step(this.weights, this.palette, this.scene, 2 - this.bakes.lastMs);
    this.updateSystems(flight);
    for (const group of this.groups.values()) group.position.fromArray(group.userData.coordinates.map((n, i) => n * CELL_SIZE - flight.position[i]));
    this.stars.position.fromArray(this.base.map((n, i) => n - flight.position[i])); this.starMaterial.uniforms.palette.value = this.palette.stars;
    this.starMaterial.uniforms.regionTint.value.copy(this.palette.stars[0]);
    this.camera.updateMatrixWorld();
    const starLights = this.lighting.update(this.nearestSystem, flight, this.camera, this.palette, dt);
    this.lightWorld.copy(starLights[0].direction); this.viewLight.copy(this.lightWorld).transformDirection(this.camera.matrixWorldInverse);
    for (const [i, light] of [this.sun, this.companion].entries()) { light.position.copy(starLights[i].direction).multiplyScalar(8); light.color.copy(starLights[i].color); light.intensity = starLights[i].intensity; }
    this.scene.updateMatrixWorld(); this.farScene.updateMatrixWorld();
    for (const planet of this.planetGroups) updatePlanet(planet, flight.time, this.lightWorld, this.viewLight, { key: this.palette.key, fill: this.planetFill, camera: this.camera }, starLights);
    const box = this.look.stars.dust.box, uniforms = this.dust.material.uniforms;
    uniforms.travel.value.fromArray(flight.position.map((n) => ((n % box) + box) % box));
    uniforms.velocity.value.fromArray(forward(flight.yaw, flight.pitch)); uniforms.tint.value.copy(this.palette.dust);
    const insideField = [...this.groups.values()].some((group) => group.userData.field && Math.hypot(...group.userData.field.center.map((n, i) => n - flight.position[i])) < group.userData.field.radius);
    this.dust.geometry.instanceCount = this.dust.userData.baseCount * (insideField ? 3 : 1);
    animateShip(this.ship, flight, dt, this.camera, window.innerHeight);
    this.camera.getWorldDirection(this.cameraForward);
    const score = (cloud) => {
      this.vector.copy(cloud.center).add(cloud.group.position).sub(this.camera.position);
      return this.vector.lengthSq() + (this.vector.dot(this.cameraForward) < 0 ? 1e12 : 0);
    };
    const clouds = [...this.cloudGroups].sort((a, b) => score(a) - score(b));
    const opacity = this.weights.reduce((sum, weight, i) => sum + weight * this.look.REGIONS[regionNames[i]].nebula.opacity, 0);
    clouds.forEach((cloud, index) => cloud.puffs.forEach((puff) => {
      const distance = this.vector.copy(puff.position).add(cloud.group.position).distanceTo(this.camera.position);
      const [near, far] = this.look.nebula.nearFade; const fade = THREE.MathUtils.smoothstep(distance, near, far);
      puff.visible = !this.debug.hideNebula && index < (this.mobile ? 1 : 2) && fade > 0.001;
      puff.quaternion.copy(this.camera.quaternion); puff.rotateZ(puff.userData.roll);
      const u = puff.material.uniforms; u.core.value.copy(this.palette.nebula[0]); u.mid.value.copy(this.palette.nebula[1]); u.edge.value.copy(this.palette.nebula[2]);
      u.nearFade.value = fade; u.opacity.value = opacity / Math.sqrt(cloud.puffs.length) * 0.8;
    }));
    this.events.update(flight, this.camera, this.lightWorld);
    this.camera.near = 50; this.camera.far = 5e6; this.camera.updateProjectionMatrix();
    this.sky.update(this.camera, this.palette, this.weights[2], dt); this.sky.scene.visible = !this.debug.hideSky;
    this.pipeline.begin(); this.pipeline.draw('sky', () => this.renderer.render(this.sky.scene, this.camera));
    if (!this.debug.hideNebula) this.pipeline.draw('nebula', () => this.nebulae.render(flight, this.camera, this.weights));
    this.pipeline.draw('embeddedStars', () => this.renderer.render(this.nebulae.embeddedScene, this.camera)); this.renderer.clearDepth();
    this.pipeline.draw('planets', () => this.renderer.render(this.farScene, this.camera));
    this.camera.near = 0.05; this.camera.far = 4000; this.camera.updateProjectionMatrix(); this.renderer.clearDepth();
    this.pipeline.draw('near', () => this.renderer.render(this.scene, this.camera)); this.pipeline.finish(flight.time, dt);
  }

  dispose() {
    this.events.clear(); this.sky.catalog.dispose(); this.environment.dispose(); this.nebulae.dispose(); this.bakes.dispose(); const geometries = new Set(), materials = new Set();
    for (const scene of [this.scene, this.farScene, this.sky.scene]) scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); if (object.isInstancedMesh) object.dispose();
    });
    for (const geometry of this.rocks.geometries) geometries.add(geometry); for (const material of this.rocks.materials) materials.add(material); this.rocks.fields.clear();
    for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
    for (const texture of [this.glow, ...this.cloudTextures, ...this.sky.textures]) texture.dispose(); this.pipeline.dispose(); this.renderer.dispose();
  }
}
