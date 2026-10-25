import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createShip, animateShip, type ShipGroup } from './ship.js';
import { createPlanet, updatePlanet, disposePlanet, type PlanetGroup } from './planets.js';
import { StarField } from './stars.js';
import { Nebulae } from './nebulae.js';
import { createGalaxySprite } from './galaxies.js';
import { RareEvents } from './events.js';
import { AsteroidKit } from './asteroids.js';
import { softGlowTexture } from './textures.js';
import { blackbodyColor } from './astrophysics.js';
import { updateSystem } from './systems.js';
import type { EngineLook } from './settings.js';
import type { QualityState } from './quality.js';
import type { FlightState } from './flight.js';

type CellData = {
  key: string;
  stars: Array<{ position: number[]; temperature?: number; brightness?: number; color?: string; luminosity?: number }>;
  asteroids: Array<{ position: number[]; radius: number; composition: string; tint: number; rotation: number[]; stretch: number }>;
  galaxies: Array<{ position: number[]; radius: number; rotation: number; seed: number }>;
  events: Array<{ position: number[]; kind: string; phase?: number }>;
};

type SystemData = {
  key: string;
  position: number[];
  stars: Array<{ position: number[]; radius: number; temperature?: number; luminosity?: number; color?: number[] }>;
  planets: Array<Parameters<typeof createPlanet>[0]>;
  binary?: boolean;
  binaryPhase?: number;
  binaryPeriod?: number;
  separation?: number;
};

export class SpaceRenderer {
  seed: number;
  look: EngineLook;
  quality: QualityState;
  mobile: boolean;
  debug: Record<string, unknown>;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  ship: ShipGroup;
  stars: StarField;
  nebulae: Nebulae;
  rocks: AsteroidKit;
  events: RareEvents;
  glow: THREE.Texture;
  sun: THREE.DirectionalLight;
  fill: THREE.HemisphereLight;
  companion: THREE.DirectionalLight;
  lightWorld = new THREE.Vector3(0.4, 0.7, 0.3).normalize();
  nearestSystem: SystemData | null = null;
  planetGroups = new Set<PlanetGroup>();
  systemGroups = new Map<string, THREE.Group>();
  galaxySprites = new Map<string, THREE.Sprite>();
  cellStars = new Map<string, CellData['stars']>();
  base = new THREE.Vector3();
  ready = false;
  needsWork = false;
  focusId?: string;
  private size = new THREE.Vector2();
  private starOrigin: number[] = [0, 0, 0];
  // Compatibility stub for main.ts bake hook
  bakes = { onReady: undefined as (() => void) | undefined };

  constructor(canvas: HTMLCanvasElement, seed: number, look: EngineLook, quality: QualityState) {
    this.seed = seed;
    this.look = look;
    this.quality = quality;
    this.mobile = quality.mobile;
    this.debug = (look as { debug?: Record<string, unknown> }).debug ?? {};
    this.focusId = (look as { focusPlanetId?: string }).focusPlanetId;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
    });
    // Near-black void between stars; OutputPass reads these tone-mapping settings.
    const voidColor = '#02030a';
    this.renderer.setClearColor(voidColor, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setPixelRatio(quality.ratio);
    this.renderer.autoClear = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(voidColor);
    this.camera = new THREE.PerspectiveCamera(
      look.camera.fov ?? 52,
      1,
      look.camera.near ?? 0.05,
      look.camera.far ?? 60000,
    );
    (this.camera.userData as { baseFov?: number }).baseFov = look.camera.fov ?? 52;

    this.fill = new THREE.HemisphereLight('#9eb0d0', '#05060c', 0.32);
    this.scene.add(this.fill);
    const ambient = new THREE.AmbientLight('#7a8498', 0.28);
    this.scene.add(ambient);
    this.sun = new THREE.DirectionalLight('#fff4e5', 2.6);
    this.scene.add(this.sun);
    this.companion = new THREE.DirectionalLight('#dce6ff', 0);
    this.scene.add(this.companion);

    this.glow = softGlowTexture();
    this.ship = createShip(look.ship, this.glow, this.mobile, look.realism, quality.tier);
    this.scene.add(this.ship);

    this.stars = new StarField(seed, look, this.mobile, quality.tier, quality.ratio);
    this.scene.add(this.stars.group);
    this.nebulae = new Nebulae(this.renderer, look, this.mobile);
    this.scene.add(this.nebulae.group);
    this.rocks = new AsteroidKit(seed, look, quality.tier);
    this.scene.add(this.rocks.group);
    this.events = new RareEvents(seed, look, this.glow, this.debug.event as 'comet' | 'binary' | 'pulsar' | undefined);
    this.scene.add(this.events.group);

    const size = this.renderer.getSize(this.size);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Modest bloom; high threshold so the void stays near-black between stars.
    const bloomStrength = this.mobile ? 0.18 : 0.26;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), bloomStrength, 0.35, 0.86);
    this.bloom.resolution.set(Math.max(1, size.x * 0.5), Math.max(1, size.y * 0.5));
    this.composer.addPass(this.bloom);
    const output = new OutputPass();
    this.composer.addPass(output);

    this.resize(quality.ratio);
    this.ready = true;
  }

  resize(ratio = this.quality.ratio): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.composer.setSize(width, height);
    this.bloom.resolution.set(Math.max(1, width * ratio * 0.5), Math.max(1, height * ratio * 0.5));
    this.stars.setPixelRatio(ratio);
  }

  applyQuality(quality: QualityState): void {
    this.quality = quality;
    this.resize(quality.ratio);
    this.bloom.strength = quality.mobile || quality.tier === 'low' ? 0.22 : 0.32;
  }

  observeQuality(_elapsed: number): boolean {
    return false;
  }

  loadCell(cell: CellData): void {
    this.cellStars.set(cell.key, cell.stars);
    if (cell.asteroids?.length) this.rocks.loadField(cell.key, cell.asteroids);
    for (const galaxy of cell.galaxies ?? []) {
      const key = `${cell.key}:g:${galaxy.seed}`;
      if (this.galaxySprites.has(key)) continue;
      // Shrink ~45% vs old radii for softer distant look.
      const sprite = createGalaxySprite({ ...galaxy, radius: galaxy.radius * 0.4 });
      this.scene.add(sprite);
      this.galaxySprites.set(key, sprite);
    }
    for (const event of cell.events ?? []) this.events.load(event);
    this.rebuildStars();
  }

  unloadCell(cell: CellData): void {
    this.cellStars.delete(cell.key);
    this.rocks.unloadField(cell.key);
    for (const key of [...this.galaxySprites.keys()]) {
      if (!key.startsWith(`${cell.key}:`)) continue;
      const sprite = this.galaxySprites.get(key)!;
      this.scene.remove(sprite);
      sprite.material.dispose();
      this.galaxySprites.delete(key);
    }
    this.rebuildStars();
  }

  loadSystem(system: SystemData): void {
    if (this.systemGroups.has(system.key)) return;
    const group = new THREE.Group();
    group.userData.system = system;
    for (const star of system.stars) {
      const color = star.color
        ? new THREE.Color(star.color[0], star.color[1], star.color[2])
        : new THREE.Color().fromArray(blackbodyColor(star.temperature ?? 5500));
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, this.mobile ? 16 : 24, this.mobile ? 12 : 16),
        new THREE.MeshBasicMaterial({ color }),
      );
      mesh.scale.setScalar(star.radius);
      mesh.position.fromArray(star.position);
      mesh.userData.star = star;
      group.add(mesh);
      const corona = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glow, color, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      corona.scale.setScalar(star.radius * 3.5);
      corona.position.copy(mesh.position);
      group.add(corona);
    }
    for (const planet of system.planets) {
      const planetGroup = createPlanet(planet, { mobile: this.mobile, glow: this.glow });
      group.add(planetGroup);
      this.planetGroups.add(planetGroup);
    }
    this.scene.add(group);
    this.systemGroups.set(system.key, group);
  }

  unloadSystem(system: SystemData): void {
    const group = this.systemGroups.get(system.key);
    if (!group) return;
    for (const child of [...group.children]) {
      if ((child as PlanetGroup).userData?.planet) {
        this.planetGroups.delete(child as PlanetGroup);
        disposePlanet(child as PlanetGroup);
      }
    }
    this.scene.remove(group);
    this.systemGroups.delete(system.key);
  }

  loadNebula(nebula: { key: string; position: number[]; radius: number; seed?: number }): void {
    this.nebulae.load(nebula);
  }

  unloadNebula(nebula: { key: string; position: number[]; radius: number }): void {
    this.nebulae.unload(nebula);
  }

  updateStars(universe: { cells: Map<string, CellData> }, position: number[]): void {
    this.starOrigin = [...position];
    for (const [key, cell] of universe.cells) {
      if (!this.cellStars.has(key)) this.cellStars.set(key, cell.stars);
    }
    this.rebuildStars();
    this.stars.follow(position);
  }

  private rebuildStars(): void {
    const merged: CellData['stars'] = [];
    for (const stars of this.cellStars.values()) {
      for (const star of stars) {
        const color = star.temperature ? blackbodyColor(star.temperature) : undefined;
        merged.push({
          ...star,
          color: color ? `rgb(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)})` : star.color,
        });
      }
    }
    this.stars.updateField(merged, this.starOrigin);
  }

  render(flight: FlightState): void {
    this.base.fromArray(flight.position);
    this.ship.position.set(0, 0, 0);
    animateShip(this.ship, flight, 1 / 60, this.camera, this.renderer.domElement.clientHeight || 900);

    // Keep world content relative to ship by shifting scene root offset via object positions.
    for (const [key, group] of this.systemGroups) {
      const system = group.userData.system as SystemData;
      updateSystem(system as never, flight.time);
      for (const child of group.children) {
        if ((child as PlanetGroup).userData?.planet) {
          const record = (child as PlanetGroup).userData.planet;
          updatePlanet(child as PlanetGroup, flight.time);
          child.position.set(
            record.data.position[0]! - flight.position[0]!,
            record.data.position[1]! - flight.position[1]!,
            record.data.position[2]! - flight.position[2]!,
          );
        } else if (child.userData.star) {
          const star = child.userData.star as SystemData['stars'][number];
          child.position.set(
            star.position[0]! - flight.position[0]!,
            star.position[1]! - flight.position[1]!,
            star.position[2]! - flight.position[2]!,
          );
        } else if (child instanceof THREE.Sprite) {
          // corona follows previous mesh — skip
        }
      }
      void key;
    }

    for (const [, sprite] of this.galaxySprites) {
      const data = sprite.userData.galaxy as { position: number[] };
      sprite.position.set(
        data.position[0]! - flight.position[0]!,
        data.position[1]! - flight.position[1]!,
        data.position[2]! - flight.position[2]!,
      );
    }

    this.nebulae.group.position.set(-flight.position[0]!, -flight.position[1]!, -flight.position[2]!);
    this.rocks.group.position.set(-flight.position[0]!, -flight.position[1]!, -flight.position[2]!);
    this.events.group.position.set(-flight.position[0]!, -flight.position[1]!, -flight.position[2]!);
    this.events.update(flight.time);

    const system = this.nearestSystem;
    if (system?.stars[0]) {
      const star = system.stars[0];
      this.lightWorld.set(
        star.position[0]! - flight.position[0]!,
        star.position[1]! - flight.position[1]!,
        star.position[2]! - flight.position[2]!,
      ).normalize();
      this.sun.position.copy(this.lightWorld).multiplyScalar(200);
      const color = star.temperature ? blackbodyColor(star.temperature) : [1, 0.95, 0.85];
      this.sun.color.setRGB(color[0], color[1], color[2]);
      this.sun.intensity = 1.8 + Math.min(2, (star.luminosity ?? 1) * 0.15);
      if (system.stars[1]) {
        const other = system.stars[1];
        this.companion.position.set(
          other.position[0]! - flight.position[0]!,
          other.position[1]! - flight.position[1]!,
          other.position[2]! - flight.position[2]!,
        ).normalize().multiplyScalar(180);
        this.companion.intensity = 0.8;
      } else this.companion.intensity = 0;
    } else {
      this.sun.position.copy(this.lightWorld).multiplyScalar(200);
      this.sun.intensity = 1.4;
      this.companion.intensity = 0;
    }

    this.stars.follow(flight.position);
    this.composer.render();
  }

  report(): Record<string, number | string | boolean> {
    return {
      tier: this.quality.tier,
      exposure: this.renderer.toneMappingExposure,
      bloom: this.bloom.strength,
      bakeMs: 0,
      planets: this.planetGroups.size,
      mobile: this.mobile,
      shellStars: this.stars.shell.count,
      nebulae: this.nebulae.items.size,
    };
  }

  dispose(): void {
    this.composer.dispose();
    this.renderer.dispose();
    this.stars.dispose();
    this.nebulae.dispose();
    this.rocks.dispose();
    this.events.dispose();
    this.glow.dispose();
    for (const group of this.planetGroups) disposePlanet(group);
    this.planetGroups.clear();
  }
}
