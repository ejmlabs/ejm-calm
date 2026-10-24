import * as THREE from '../vendor/three/three.module.js';
import { random, hash } from './rng.js';
import { CELL_SIZE, regionWeights } from './universe.js';
import { createShip, animateShip } from './ship.js';
import { createPlanet, updatePlanet } from './planets.js';
import { Sky, glowTexture, densityTexture, starMaterial, starsGeometry } from './space-layers.js';
import { RareEvents } from './events.js';
import { forward } from './math.js';
import * as shaders from './shaders.js';

const regionNames = ['tidepool', 'ember', 'hollow'];
function blend(target, sources, weights) {
  target.setRGB(0, 0, 0);
  sources.forEach((source, i) => { target.r += source.r * weights[i]; target.g += source.g * weights[i]; target.b += source.b * weights[i]; });
}

export class SpaceRenderer {
  constructor(canvas, seed, look, quality) {
    this.seed = seed; this.look = look; this.mobile = quality.mobile; this.debug = look.debug ?? {};
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(quality.ratio); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = look.exposure;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(look.camera.fov, 1, look.camera.near, look.camera.far);
    this.groups = new Map(); this.planetGroups = new Set(); this.cloudGroups = new Set(); this.base = [0, 0, 0];
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
    this.fill = new THREE.DirectionalLight('#2a3f6b', 0.22); this.fill.position.set(3, -1, 3); this.scene.add(this.fill);
    this.rim = new THREE.DirectionalLight('#7fb8e6', 0.5); this.rim.position.set(0.3, 0.5, -2); this.scene.add(this.rim);
    this.ship = createShip(look.ship, this.glow, this.mobile); this.scene.add(this.ship);
    this.sky = new Sky(seed, look, this.mobile, quality.ratio);
    this.starMaterial = starMaterial(look, quality.ratio);
    this.stars = new THREE.Points(starsGeometry([], [], [], []), this.starMaterial); this.stars.frustumCulled = false; this.scene.add(this.stars);
    this.dust = this.makeDust(); this.scene.add(this.dust);
    this.rockGeometry = new THREE.IcosahedronGeometry(1, look.asteroids.shape.baseDetail);
    this.rockMaterial = new THREE.MeshStandardMaterial({ color: look.asteroids.palette[0], roughness: look.asteroids.roughness, metalness: look.asteroids.metalness, flatShading: true });
    this.planetGeometry = new THREE.SphereGeometry(1, this.mobile ? 48 : 72, this.mobile ? 32 : 48);
    this.dummy = new THREE.Object3D(); this.events = new RareEvents(seed, look, this.glow, this.debug.event); this.scene.add(this.events.group);
    this.resize(quality.ratio);
  }

  makeDust() {
    const rng = random(hash(this.seed, 779)), settings = this.look.stars.dust, count = settings.count[this.mobile ? 'low' : 'high'];
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
    mesh.frustumCulled = false; return mesh;
  }

  loadCell(cell) {
    const group = new THREE.Group(); group.userData.coordinates = cell.coordinates;
    const origin = cell.coordinates.map((n) => n * CELL_SIZE), local = (point) => point.map((n, i) => n - origin[i]);
    for (const data of cell.planets) {
      const planet = createPlanet(data, this.look, this.planetGeometry, this.mobile, cell.key === '0,0,0' ? this.debug.planet : undefined);
      planet.position.fromArray(local(data.position)); group.add(planet); this.planetGroups.add(planet);
    }
    if (cell.asteroids.length) {
      const rocks = new THREE.InstancedMesh(this.rockGeometry, this.rockMaterial, cell.asteroids.length);
      cell.asteroids.forEach((rock, index) => {
        this.dummy.position.fromArray(local(rock.position)); this.dummy.rotation.fromArray([...rock.rotation, 'XYZ']);
        this.dummy.scale.set(rock.radius, rock.radius * rock.stretch, rock.radius * 0.8); this.dummy.updateMatrix(); rocks.setMatrixAt(index, this.dummy.matrix);
      }); rocks.instanceMatrix.needsUpdate = true; rocks.computeBoundingSphere(); group.add(rocks);
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
      this.planetGroups.delete(object);
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry && ![this.quad, this.planetGeometry, this.rockGeometry].includes(object.geometry)) object.geometry.dispose();
      if (object.material && object.material !== this.rockMaterial) object.material.dispose();
    }); this.scene.remove(group); this.groups.delete(cell.key);
  }

  updateStars(universe, position) {
    this.base = position.map((n) => Math.round(n / CELL_SIZE) * CELL_SIZE);
    const positions = [], sizes = [], tints = [], halos = [], settings = this.look.stars.field;
    for (const cell of universe.cells.values()) for (const star of cell.stars.slice(0, settings.perCell[this.mobile ? 'low' : 'high'])) {
      positions.push(...star.position.map((n, i) => n - this.base[i])); sizes.push(star.size); tints.push(star.warmth, star.brightness, 0);
      halos.push(star.halo ? settings.halo.sizePx[0] + star.warmth * (settings.halo.sizePx[1] - settings.halo.sizePx[0]) : 0);
    }
    this.stars.geometry.dispose(); this.stars.geometry = starsGeometry(positions, sizes, tints, halos);
  }

  resize(ratio) {
    if (ratio) this.renderer.setPixelRatio(ratio);
    const width = window.innerWidth, height = window.innerHeight;
    this.camera.fov = this.look.camera.fovDeg[height > width ? 'portrait' : 'landscape'];
    this.renderer.setSize(width, height, false); this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix();
    this.renderer.getDrawingBufferSize(this.size);
    this.starMaterial.uniforms.pixelRatio.value = this.sky.stars.material.uniforms.pixelRatio.value = this.renderer.getPixelRatio();
    this.dust.material.uniforms.resolution.value.copy(this.size);
    this.dust.material.uniforms.pixelRatio.value = this.renderer.getPixelRatio();
  }

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
    this.sun.color.copy(this.palette.key); this.sun.intensity = intensity('keyLight', 'intensity');
    this.fill.color.copy(this.palette.fill); this.fill.intensity = intensity('fill', 'intensity');
    this.rim.color.copy(this.palette.rim); this.rim.intensity = intensity('rim', 'intensity');
    this.planetFill.copy(this.palette.fill).multiplyScalar(1 / Math.max(this.palette.fill.r, this.palette.fill.g, this.palette.fill.b, 0.01));
  }

  render(flight) {
    const dt = Math.min(0.1, Math.max(0, flight.time - this.lastTime)); this.lastTime = flight.time;
    this.updatePalette(flight, dt);
    for (const group of this.groups.values()) group.position.fromArray(group.userData.coordinates.map((n, i) => n * CELL_SIZE - flight.position[i]));
    this.stars.position.fromArray(this.base.map((n, i) => n - flight.position[i])); this.starMaterial.uniforms.palette.value = this.palette.stars;
    this.camera.updateMatrixWorld(); this.viewLight.copy(this.lightWorld).transformDirection(this.camera.matrixWorldInverse);
    for (const planet of this.planetGroups) updatePlanet(planet, flight.time, this.lightWorld, this.viewLight, { key: this.palette.key, fill: this.planetFill });
    const box = this.look.stars.dust.box, uniforms = this.dust.material.uniforms;
    uniforms.travel.value.fromArray(flight.position.map((n) => ((n % box) + box) % box));
    uniforms.velocity.value.fromArray(forward(flight.yaw, flight.pitch)); uniforms.tint.value.copy(this.palette.dust);
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
    this.sky.update(this.camera, this.palette, this.weights[2]); this.sky.scene.visible = !this.debug.hideSky;
    this.renderer.clear(); this.renderer.render(this.sky.scene, this.camera); this.renderer.clearDepth(); this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.events.clear(); const geometries = new Set(), materials = new Set();
    for (const scene of [this.scene, this.sky.scene]) scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); if (object.isInstancedMesh) object.dispose();
    });
    for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
    for (const texture of [this.glow, ...this.cloudTextures, ...this.sky.textures]) texture.dispose(); this.renderer.dispose();
  }
}
