import * as THREE from 'three';
import type { WorldLayout } from './terrain.js';
import { farShelf, farShelfSteps, navShelfSteps, nearShelf, type Land, type ShelfMap } from './land.js';
import { createOcean, type OceanHandle } from './ocean.js';
import { createLandStream, type LandStream } from './landmesh.js';
import { createShipStream } from './world-ships.js';
import { createWorldOrigin, type WorldOrigin } from './world-origin.js';
import type { Shore } from './shore.js';
import type { ShipHandle } from './ships.js';
import type { WorkerRequest } from './world-worker.js';

export type WorldOptions = {
  sunDirection: THREE.Vector3;
  hazeColor: THREE.Color;
  hazeDensity: number;
  hazeGradient: { angles: number[]; colors: THREE.Color[] };
  /** Low sun lights the shallows less. */
  shallowLight: number;
  reflectionGain: number;
  waterSize: number;
  landSegments: number;
  /** Fewer ships on small screens. */
  mobile: boolean;
  /** Build land tiles and far shelf maps in a worker (browser). */
  worker?: boolean;
};

export type World = {
  /** Parent for everything placed in world coordinates (whale, ships, land, birds); sits at −origin. */
  root: THREE.Group;
  origin: WorldOrigin;
  shore: Shore;
  land: Land;
  ocean: OceanHandle;
  landStream: LandStream;
  ships: {
    /** Ships afloat and visible (stable array). */
    active: () => readonly ShipHandle[];
    setVisible: (visible: boolean) => void;
  };
  /** Streams land, ships and shelves around the whale and recentres the origin if needed. */
  update: (whaleWorldX: number, whaleWorldZ: number, camera: THREE.Camera, dt: number, time: number) => void;
  stats: () => Record<string, number | number[]>;
  dispose: () => void;
};

/** Background work on the main thread (navigation tiles, shelf bakes) stays under this per frame. */
const BUDGET_MS = 2.5;
/** Navigation tiles are kept built this far around the whale (covers look-ahead and the next shelf bake). */
const NAV_RADIUS = 2300;
const FAR_SIZE = 384;
const FAR_EXTENT = 6400;

export function createWorld(seed: number, layout: WorldLayout, scene: THREE.Scene, options: WorldOptions): World {
  const land = layout.land;
  const origin = createWorldOrigin();
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);

  // Opening maps around the start, exactly as before the world went endless.
  const ocean = createOcean(seed, options.sunDirection, {
    textureSize: options.waterSize,
    waterColor: 0x1c5470,
    shelves: { near: nearShelf(land), far: farShelf(land), light: options.shallowLight },
    reflectionHaze: options.hazeColor,
    reflectionGain: options.reflectionGain,
  });
  scene.add(ocean.mesh);

  const landStream = createLandStream(land, {
    segments: options.landSegments,
    sunDirection: options.sunDirection,
    hazeColor: options.hazeColor,
    hazeDensity: options.hazeDensity,
    hazeGradient: options.hazeGradient,
    worker: options.worker,
  });
  root.add(landStream.group);
  landStream.prime(layout.whaleHome.x, layout.whaleHome.z);

  // The whale's first minutes need no stall: build the water around the start now.
  land.nav.prefetch(layout.whaleHome.x, layout.whaleHome.z, 700, Infinity);

  const ships = createShipStream({
    seed,
    maskAt: land.maskAt,
    startSpecs: layout.ships,
    parent: root,
    cap: options.mobile ? 5 : 8,
    shoreReady: land.nav.ready,
  });

  // Shelf bakes for the ocean after a recentre: exact near map from the nav tiles, coarse far map.
  let nearJob: Generator<void, ShelfMap> | null = null;
  let nearCenter = { x: 0, z: 0 };
  let farJob: Generator<void, ShelfMap> | null = null;
  let farId = 0;
  let worker: Worker | null = null;
  if (options.worker && typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./world-worker.ts', import.meta.url), { type: 'module' });
      const init: WorkerRequest = { type: 'init', seed: land.seed, viewYaw: land.viewYaw, offset: land.offset };
      worker.postMessage(init);
      worker.onmessage = (event: MessageEvent<{ type: string; id: number; shelf: ShelfMap }>) => {
        if (event.data.type === 'far' && event.data.id === farId) ocean.setShelves({ far: event.data.shelf });
      };
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
        farJob = farSteps(origin.x, origin.z);
      };
    } catch {
      worker = null;
    }
  }

  const farSteps = (cx: number, cz: number) => farShelfSteps(land, FAR_SIZE, FAR_EXTENT, cx, cz);

  function* nearSteps(cx: number, cz: number): Generator<void, ShelfMap> {
    while (!land.nav.prefetch(cx, cz, 1600 * Math.SQRT2, BUDGET_MS)) yield;
    return yield* navShelfSteps(land, cx, cz);
  }

  origin.onRecenter(() => {
    root.position.set(-origin.x, 0, -origin.z);
    root.updateMatrixWorld();
    ocean.setOrigin(origin.x, origin.z);
    nearCenter = { x: origin.x, z: origin.z };
    nearJob = nearSteps(origin.x, origin.z);
    farId++;
    if (worker) {
      const request: WorkerRequest = { type: 'far', id: farId, size: FAR_SIZE, extent: FAR_EXTENT, cx: origin.x, cz: origin.z };
      worker.postMessage(request);
    } else {
      farJob = farSteps(origin.x, origin.z);
    }
  });

  const cameraWorld = new THREE.Vector3();
  let whale = [layout.whaleHome.x, layout.whaleHome.z];

  return {
    root,
    origin,
    shore: land,
    land,
    ocean,
    landStream,
    ships: { active: ships.active, setVisible: ships.setVisible },
    update(wx, wz, camera, dt, time) {
      whale = [wx, wz];
      // The camera is still in the old render space until the rig moves it: read it first.
      cameraWorld.copy(camera.position);
      cameraWorld.x += origin.x;
      cameraWorld.z += origin.z;
      origin.maybeRecenter(wx, wz);
      landStream.update(cameraWorld.x, cameraWorld.z, dt);
      ships.update(dt, time, wx, wz, land);

      const start = performance.now();
      const left = () => BUDGET_MS - (performance.now() - start);
      if (nearJob) {
        while (left() > 0) {
          const next = nearJob.next();
          if (next.done) {
            if (nearCenter.x === origin.x && nearCenter.z === origin.z) ocean.setShelves({ near: next.value });
            nearJob = null;
            break;
          }
        }
      }
      while (farJob && left() > 0) {
        const next = farJob.next();
        if (next.done) {
          ocean.setShelves({ far: next.value });
          farJob = null;
        }
      }
      if (left() > 0) land.nav.prefetch(wx, wz, NAV_RADIUS, left());
    },
    stats() {
      const tiles = landStream.stats();
      const nav = land.nav.stats();
      const fleet = ships.stats();
      return {
        origin: [origin.x, origin.z],
        whaleWorld: whale,
        chunks: tiles.tiles,
        chunksPending: tiles.pending,
        chunksFading: tiles.fading,
        landTriangles: tiles.triangles,
        navTiles: nav.tiles,
        shipCells: fleet.cells,
        shipsLoaded: fleet.ships,
        shipsVisible: fleet.visible,
      };
    },
    dispose() {
      worker?.terminate();
      ships.dispose();
      landStream.dispose();
      ocean.dispose();
      scene.remove(root);
      scene.remove(ocean.mesh);
    },
  };
}
