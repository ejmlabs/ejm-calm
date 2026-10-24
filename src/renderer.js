import * as THREE from '../vendor/three/three.module.js';
import { random, hash } from './rng.js';
import { fractalNoise } from './noise.js';
import { CELL_SIZE, regionWeights } from './universe.js';
import * as shaders from './shaders.js';

const color = (value, fallback) => new THREE.Color(value ?? fallback);
function blendColors(target, sources, weights) {
  target.setRGB(0, 0, 0);
  sources.forEach((source, i) => { target.r += source.r * weights[i]; target.g += source.g * weights[i]; target.b += source.b * weights[i]; });
}
const palettes = [
  ['#315162', '#99b8bb', '#c0e4df'], ['#705054', '#c3a58b', '#e2d0b8'], ['#3e4e78', '#939cba', '#b8d6e8'],
];

function cloudTexture(seed, galaxy = false, resolution = 128) {
  const pixels = new Uint8Array(resolution * resolution * 4);
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const u = (x / (resolution - 1) - 0.5) * 2, v = (y / (resolution - 1) - 0.5) * 2;
    const radius = Math.hypot(u, v), index = (y * resolution + x) * 4;
    let density;
    if (galaxy) {
      const ellipse = Math.hypot(u, v * 2.8);
      const arms = (Math.sin(Math.atan2(v * 2.8, u) * 2 - ellipse * 14) + 1) * 0.5;
      density = Math.exp(-ellipse * ellipse * 4) * (0.15 + arms * 0.5) + Math.exp(-ellipse * ellipse * 90) * 0.8;
    } else {
      const field = fractalNoise(u * 3 + 9, v * 3 + 9, 0.7, seed, 3);
      density = Math.max(0, field - 0.23) * Math.exp(-radius * radius * 3.3) * Math.max(0, 1 - radius) * 2.8;
    }
    pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
    pixels[index + 3] = Math.min(255, Math.round(density * 255));
  }
  const texture = new THREE.DataTexture(pixels, resolution, resolution, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

function glowTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot(x / (size - 1) * 2 - 1, y / (size - 1) * 2 - 1);
    const offset = (y * size + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = 255;
    data[offset + 3] = Math.round(Math.max(0, Math.exp(-radius * radius * 6) - Math.exp(-6)) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size); texture.needsUpdate = true;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
  return texture;
}

function makeShip(settings, glow) {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: color(settings.hull?.color ?? settings.color, '#ddd8cb'), roughness: settings.hull?.roughness ?? 0.52, metalness: settings.hull?.metalness ?? 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: color(settings.canopy?.color, '#182e3b'), roughness: 0.18, metalness: 0.7 });
  const accent = new THREE.MeshStandardMaterial({ color: color(settings.accent?.color, '#b87955'), roughness: 0.45, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), hull);
  body.scale.set(0.72, 0.38, 2.4); group.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.9, 4), hull);
  nose.rotation.x = -Math.PI / 2; nose.rotation.z = Math.PI / 4; nose.position.z = -2; nose.scale.z = 0.65; group.add(nose);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), dark);
  canopy.scale.set(0.43, 0.31, 0.96); canopy.position.set(0, 0.27, -0.52); group.add(canopy);
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0.4, 0, -0.8, 3.6, -0.1, 1.3, 0.65, 0, 1.6,
    0.4, -0.12, -0.8, 0.65, -0.12, 1.6, 3.6, -0.22, 1.3,
    0.4, 0, -0.8, 0.4, -0.12, -0.8, 3.6, -0.22, 1.3,
    0.4, 0, -0.8, 3.6, -0.22, 1.3, 3.6, -0.1, 1.3,
    3.6, -0.1, 1.3, 3.6, -0.22, 1.3, 0.65, -0.12, 1.6,
    3.6, -0.1, 1.3, 0.65, -0.12, 1.6, 0.65, 0, 1.6,
  ], 3)); wingGeometry.computeVertexNormals();
  const wingMaterial = hull.clone(); wingMaterial.side = THREE.DoubleSide;
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeometry, wingMaterial); wing.scale.x = side; group.add(wing);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.65), accent);
    stripe.position.set(side * 2.5, -0.05, 1); stripe.rotation.y = side * -0.7; group.add(stripe);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.25, 10), dark);
    engine.rotation.x = Math.PI / 2; engine.position.set(side * 0.88, -0.04, 1.3); group.add(engine);
    const light = new THREE.Mesh(new THREE.CircleGeometry(0.19, 12), new THREE.MeshBasicMaterial({ color: color(settings.engine?.color, '#b7eceb') }));
    light.position.set(side * 0.88, -0.04, 1.94); group.add(light);
    const plume = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: color(settings.engine?.color, '#a6dcdf'), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    plume.position.set(side * 0.88, -0.04, 2.05); plume.scale.set(1.15, 1.15, 1); group.add(plume);
    const navigation = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), new THREE.MeshBasicMaterial({ color: side < 0 ? '#d6987e' : '#9cc6be' }));
    navigation.position.set(side * 3.55, -0.07, 1.28); group.add(navigation);
  }
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 3), hull);
  fin.position.set(0, 0.58, 1.12); fin.scale.set(0.15, 1, 1); group.add(fin);
  group.scale.setScalar(settings.scale ?? 0.19);
  return group;
}

export class SpaceRenderer {
  constructor(canvas, seed, look = {}, quality) {
    this.seed = seed; this.look = look; this.mobile = quality.mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !quality.mobile, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(quality.ratio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = look.exposure ?? 1.15;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(look.camera?.fov ?? 48, 1, 0.1, 6500);
    this.groups = new Map(); this.base = [0, 0, 0]; this.planetMaterials = new Set(); this.nebulaMaterials = new Set();
    this.regions = Object.values(look.REGIONS ?? {}).map((region) => ({
      deep: color(region.sky.deep), band: color(region.sky.band), key: color(region.keyLight.color),
      nebula: [color(region.nebula.core), color(region.nebula.mid), color(region.nebula.edge)],
    }));
    this.blended = { deep: new THREE.Color(), band: new THREE.Color(), key: new THREE.Color(), nebula: [new THREE.Color(), new THREE.Color(), new THREE.Color()] };
    this.glow = glowTexture();
    this.clouds = [0, 1, 2].map((i) => cloudTexture(hash(seed, i, 83), false, this.mobile ? 96 : 128));
    this.galaxy = cloudTexture(hash(seed, 94), true);
    const hemisphere = new THREE.HemisphereLight('#bdcfd9', '#17202d', 2.0); this.scene.add(hemisphere);
    const sun = this.sun = new THREE.DirectionalLight('#ffe0b9', 3.1); sun.position.set(-3, 4, -5); this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#7da7c0', 1.2); fill.position.set(4, -1, 4); this.scene.add(fill);
    this.ship = makeShip(look.ship ?? {}, this.glow); this.scene.add(this.ship);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5500, 24, 12), new THREE.ShaderMaterial({
      vertexShader: shaders.skyVertex, fragmentShader: shaders.skyFragment, side: THREE.BackSide, depthWrite: false,
      uniforms: { baseColor: { value: color(look.background, '#080e19') }, mistColor: { value: color(look.mist, '#142531') }, seedPhase: { value: seed % 997 } },
    }));
    this.sky.renderOrder = -10; this.scene.add(this.sky);
    this.starMaterial = new THREE.ShaderMaterial({ vertexShader: shaders.starVertex, fragmentShader: shaders.starFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { pixelRatio: { value: quality.ratio } } });
    this.stars = new THREE.Points(new THREE.BufferGeometry(), this.starMaterial); this.stars.frustumCulled = false; this.scene.add(this.stars);
    this.backStars = this.makeBackgroundStars(); this.scene.add(this.backStars);
    this.dust = this.makeDust(); this.scene.add(this.dust);
    this.rockGeometry = new THREE.IcosahedronGeometry(1, 0);
    this.rockMaterial = new THREE.MeshStandardMaterial({ color: '#656876', roughness: 0.98, metalness: 0.05, flatShading: true });
    this.planetGeometry = new THREE.SphereGeometry(1, this.mobile ? 32 : 48, this.mobile ? 24 : 32);
    this.dummy = new THREE.Object3D(); this.lightDirection = new THREE.Vector3();
    this.resize(quality.ratio);
  }

  makeBackgroundStars() {
    const rng = random(hash(this.seed, 778));
    const positions = [], sizes = [], tints = [];
    for (let i = 0; i < (this.look.stars?.shell?.count?.[this.mobile ? 'low' : 'high'] ?? (this.mobile ? 1400 : 2800)); i++) {
      const azimuth = rng() * Math.PI * 2, height = rng() * 2 - 1, ring = Math.sqrt(1 - height * height);
      positions.push(Math.sin(azimuth) * ring * 4700, height * 4700, Math.cos(azimuth) * ring * 4700);
      sizes.push(0.55 + rng() ** 9 * 3.8);
      const warmth = rng(), brightness = 0.32 + rng() * 0.65;
      tints.push((0.7 + warmth * 0.3) * brightness, (0.79 + warmth * 0.12) * brightness, (1 - warmth * 0.23) * brightness);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('tint', new THREE.Float32BufferAttribute(tints, 3));
    return new THREE.Points(geometry, this.starMaterial);
  }

  makeDust() {
    const rng = random(hash(this.seed, 779)), box = this.look.stars?.dust?.box ?? 90;
    const positions = [], sizes = [], tints = [];
    const count = this.look.stars?.dust?.count?.[this.mobile ? 'low' : 'high'] ?? 260;
    for (let i = 0; i < count; i++) {
      positions.push(rng() * box, rng() * box, rng() * box); sizes.push(0.8 + rng()); tints.push(0.6, 0.72, 0.85);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('tint', new THREE.Float32BufferAttribute(tints, 3));
    const material = new THREE.ShaderMaterial({ vertexShader: shaders.dustVertex, fragmentShader: shaders.dustFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { travel: { value: new THREE.Vector3() }, boxSize: { value: box }, pixelRatio: { value: this.renderer.getPixelRatio() } } });
    const dust = new THREE.Points(geometry, material); dust.frustumCulled = false; return dust;
  }

  loadCell(cell) {
    const group = new THREE.Group(); group.userData.coordinates = cell.coordinates;
    const origin = cell.coordinates.map((n) => n * CELL_SIZE);
    const local = (point) => point.map((n, i) => n - origin[i]);
    for (const data of cell.planets) {
      const planetTypes = Object.values(this.look.planets?.types ?? {});
      const swatch = this.look.planetPalettes?.[data.palette] ?? planetTypes[data.seed % (planetTypes.length || 1)]?.palette ?? palettes[data.palette];
      const colors = Array.isArray(swatch) ? swatch : [swatch.base, swatch.bands, swatch.atmosphere];
      const material = new THREE.ShaderMaterial({ vertexShader: shaders.planetVertex, fragmentShader: shaders.planetFragment,
        uniforms: { colorA: { value: color(colors[0], palettes[data.palette][0]) }, colorB: { value: color(colors[1], palettes[data.palette][1]) },
          colorC: { value: color(colors[2], palettes[data.palette][2]) }, phase: { value: data.phase }, lightDirection: { value: new THREE.Vector3(-0.6, 0.5, 0.7) } } });
      this.planetMaterials.add(material);
      const planet = new THREE.Mesh(this.planetGeometry, material); planet.scale.setScalar(data.radius);
      planet.position.fromArray(local(data.position)); planet.rotation.z = data.tilt; group.add(planet);
      const atmosphere = new THREE.Mesh(this.planetGeometry, new THREE.ShaderMaterial({
        vertexShader: shaders.planetVertex, fragmentShader: shaders.atmosphereFragment, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, uniforms: { tint: { value: color(colors[2], '#b9d8ee') } },
      }));
      atmosphere.scale.setScalar(data.radius * 1.025); atmosphere.position.copy(planet.position); group.add(atmosphere);
      if (data.rings) {
        const inner = data.radius * 1.35, outer = data.radius * 2.25;
        const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, this.mobile ? 80 : 128), new THREE.ShaderMaterial({
          vertexShader: shaders.ringVertex, fragmentShader: shaders.ringFragment, side: THREE.DoubleSide, transparent: true, depthWrite: false,
          uniforms: { tint: { value: color(colors[2], '#c5c4b7') }, innerRadius: { value: inner }, outerRadius: { value: outer } },
        }));
        ring.position.copy(planet.position); ring.rotation.set(-1.1, data.tilt * 0.5, data.tilt + 0.3); group.add(ring);
      }
      if (data.moon) {
        const moon = new THREE.Mesh(this.planetGeometry, new THREE.MeshStandardMaterial({ color: '#aaa7a1', roughness: 0.95 }));
        moon.scale.setScalar(data.radius * 0.17); moon.position.copy(planet.position).add(new THREE.Vector3(-data.radius * 2.7, data.radius * 1.3, 40)); group.add(moon);
      }
    }
    if (cell.asteroids.length) {
      const rocks = new THREE.InstancedMesh(this.rockGeometry, this.rockMaterial, cell.asteroids.length);
      cell.asteroids.forEach((rock, index) => {
        this.dummy.position.fromArray(local(rock.position)); this.dummy.rotation.fromArray([...rock.rotation, 'XYZ']);
        this.dummy.scale.set(rock.radius, rock.radius * rock.stretch, rock.radius * 0.8); this.dummy.updateMatrix();
        rocks.setMatrixAt(index, this.dummy.matrix);
      });
      rocks.instanceMatrix.needsUpdate = true; rocks.computeBoundingSphere(); group.add(rocks);
    }
    for (const data of cell.nebulae) {
      const colors = this.look.nebulaColors ?? ['#688f98', '#a97888', '#667fa8'];
      const layers = this.mobile ? 2 : 3;
      for (let i = 0; i < layers; i++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.clouds[(data.palette + i) % 3], color: color(colors[(data.palette + i) % colors.length], '#7c929b'),
          transparent: true, opacity: this.mobile ? 0.14 : 0.19, depthWrite: false, blending: THREE.AdditiveBlending, rotation: data.rotation + i * 1.7 }));
        sprite.position.fromArray(local(data.position)); sprite.position.x += (i - 1) * data.radius * 0.45;
        sprite.position.y += Math.sin(i * 2.3) * data.radius * 0.2;
        sprite.scale.set(data.radius * (3.2 - i * 0.3), data.radius * (2.5 - i * 0.2), 1);
        sprite.material.userData.layer = i; this.nebulaMaterials.add(sprite.material); group.add(sprite);
      }
    }
    for (const data of cell.galaxies) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.galaxy, color: '#c1c3cf', opacity: 0.6,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: data.rotation }));
      sprite.position.fromArray(local(data.position)); sprite.scale.set(data.radius * 2.7, data.radius * 2.7, 1); group.add(sprite);
    }
    for (const data of cell.events) for (let i = 0; i < 2; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: i ? '#b1c9e3' : '#f1d5b5', blending: THREE.AdditiveBlending, depthWrite: false }));
      sprite.position.fromArray(local(data.position)); sprite.position.x += i * 27; sprite.scale.setScalar(35); group.add(sprite);
    }
    this.groups.set(cell.key, group); this.scene.add(group);
  }

  unloadCell(cell) {
    const group = this.groups.get(cell.key);
    if (!group) return;
    group.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry && object.geometry !== this.planetGeometry && object.geometry !== this.rockGeometry) object.geometry.dispose();
      if (object.material && object.material !== this.rockMaterial) {
        this.planetMaterials.delete(object.material); this.nebulaMaterials.delete(object.material); object.material.dispose();
      }
    });
    this.scene.remove(group); this.groups.delete(cell.key);
  }

  updateStars(universe, position) {
    this.base = position.map((n) => Math.round(n / CELL_SIZE) * CELL_SIZE);
    const vertices = [], sizes = [], colors = [];
    for (const cell of universe.cells.values()) for (const star of cell.stars) {
      vertices.push(...star.position.map((n, i) => n - this.base[i])); sizes.push(star.size);
      const brightness = star.brightness;
      colors.push((0.68 + star.warmth * 0.32) * brightness, (0.8 + star.warmth * 0.12) * brightness, (1 - star.warmth * 0.26) * brightness);
    }
    this.stars.geometry.dispose(); this.stars.geometry = new THREE.BufferGeometry();
    this.stars.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    this.stars.geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    this.stars.geometry.setAttribute('tint', new THREE.Float32BufferAttribute(colors, 3));
  }

  resize(ratio) {
    if (ratio) this.renderer.setPixelRatio(ratio);
    const width = window.innerWidth, height = window.innerHeight;
    this.camera.fov = this.look.camera?.fovDeg?.[height > width ? 'portrait' : 'landscape'] ?? this.look.camera?.fov ?? 52;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix();
    this.starMaterial.uniforms.pixelRatio.value = this.renderer.getPixelRatio();
    if (this.dust) this.dust.material.uniforms.pixelRatio.value = this.renderer.getPixelRatio();
  }

  render(flight) {
    for (const group of this.groups.values()) group.position.fromArray(group.userData.coordinates.map((n, i) => n * CELL_SIZE - flight.position[i]));
    this.stars.position.fromArray(this.base.map((n, i) => n - flight.position[i]));
    this.backStars.position.copy(this.camera.position); this.sky.position.copy(this.camera.position);
    const dustBox = this.dust.material.uniforms.boxSize.value;
    this.dust.material.uniforms.travel.value.fromArray(flight.position.map((n) => ((n % dustBox) + dustBox) % dustBox));
    this.ship.position.set(0, Math.sin(flight.time * 0.8) * 0.045, 0);
    this.ship.rotation.set(flight.pitch, -flight.yaw, flight.roll, 'YXZ');
    const viewLight = this.lightDirection.set(-0.6, 0.5, 0.7).transformDirection(this.camera.matrixWorldInverse);
    for (const material of this.planetMaterials) material.uniforms.lightDirection.value.copy(viewLight);
    if (this.regions.length === 3) {
      const weights = regionWeights(this.seed, flight.position, this.look.regionField);
      for (const key of ['deep', 'band', 'key']) {
        blendColors(this.blended[key], this.regions.map((region) => region[key]), weights);
      }
      for (let layer = 0; layer < 3; layer++) {
        blendColors(this.blended.nebula[layer], this.regions.map((region) => region.nebula[layer]), weights);
      }
      this.sky.material.uniforms.baseColor.value.copy(this.blended.deep);
      this.sky.material.uniforms.mistColor.value.copy(this.blended.band);
      this.sun.color.copy(this.blended.key);
      for (const material of this.nebulaMaterials) material.color.copy(this.blended.nebula[material.userData.layer]);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    const geometries = new Set(), materials = new Set();
    this.scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
      if (object.isInstancedMesh) object.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of [this.glow, this.galaxy, ...this.clouds]) texture.dispose();
    this.renderer.dispose();
  }
}
