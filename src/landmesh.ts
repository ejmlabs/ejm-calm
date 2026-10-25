import * as THREE from 'three';
import type { Land } from './land.js';
import { makeNoise2D } from './noise.js';
import { chunkKey, parseChunkKey, cellDistance } from './chunks.js';
import { hash } from './rng.js';
import { buildTile, tileSize, TOP_LEVEL, SINK, type TileData } from './world-tiles.js';
import type { WorkerRequest } from './world-worker.js';
import { underwaterUniforms, UNDERWATER_GLSL_PARS } from './seams.js';

export { biomeColor } from './world-tiles.js';

export type LandStreamOptions = {
  /** Old clipmap ring segments; tiles get 3/16 of that per side, which keeps each tier's triangle budget. */
  segments: number;
  sunDirection: THREE.Vector3;
  /** Sky colour at the horizon; distance haze blends land into it. */
  hazeColor: THREE.Color;
  /** Haze density per metre (thicker at golden hour and dusk). */
  hazeDensity?: number;
  /** Sky colours by elevation angle; when set, haze matches the sky behind each point. */
  hazeGradient?: { angles: number[]; colors: THREE.Color[] };
  /** Build tiles in a worker (browser only); falls back to time-sliced main-thread builds. */
  worker?: boolean;
};

export type LandStream = {
  /** Holds tiles at world positions: add it under the world root. */
  group: THREE.Group;
  /** Builds every tile needed around world (x, z) right now, fully faded in (first frame). */
  prime: (x: number, z: number) => void;
  /**
   * Streams around world (x, z) moving at (vx, vz) m/s and advances fades: finer
   * tiles lead along the motion, and tiles further ahead are built early and held.
   */
  update: (x: number, z: number, dt: number, vx?: number, vz?: number) => void;
  /** A tile's dissolve state, or undefined when it is not placed. */
  tileState: (key: string) => 'in' | 'on' | 'out' | undefined;
  stats: () => {
    tiles: number;
    triangles: number;
    pending: number;
    fading: number;
    /** Built ahead, not yet wanted. */
    ready: number;
    /** Wanted tiles inside the haze with nothing solid over them right now. */
    holes: number;
    /** Tiles that have finished dissolving in, ever. */
    completed: number;
  };
  dispose: () => void;
};

/** Eye height the haze gradient is measured from (the camera rides just above the sea). */
const EYE = 4;
/** Default haze density (per metre); land a few kilometres out melts into the sky. */
const HAZE = 0.00026;
/** Haze is complete here, inside the streamed radius, so the land never shows an edge. */
const HAZE_END = 7800;
/** Tiles are kept out to this distance from the camera. */
const STREAM_RADIUS = 8600;
/** A tile splits into four when the camera is closer than SPLIT × its size. */
const SPLIT = 0.8;
/** Seconds a tile takes to dissolve in or out (±20% per tile, so neighbours never finish in step). */
const FADE = 1.5;
/** Re-select tiles once the selection centre has moved this far. */
const RESELECT = 12;
/** Tiles are refined this many seconds of motion before the camera reaches them (capped in metres). */
const LEAD = 6;
const LEAD_MAX = 80;
/** Tiles this far ahead are built early and held ready (not drawn) until wanted. */
const PREFETCH = 12;
const PREFETCH_MAX = 240;
const READY_CAP = 96;
/** Built tiles start dissolving in at most this many per frame, so a burst of arrivals trickles in. */
const PLACE_PER_FRAME = 2;

/** Seeded per-tile value in [0, 1): order jitter and fade length. */
const tileUnit = (seed: number, level: number, ix: number, iz: number) => hash(seed, 0x544c, level, ix, iz) / 0x100000000;

/** (vx, vz)·seconds, capped at `max` metres. */
function ahead(vx: number, vz: number, seconds: number, max: number): [number, number] {
  const k = Math.min(seconds, max / Math.max(1e-6, Math.hypot(vx, vz)));
  return [vx * k, vz * k];
}

const vertexShader = /* glsl */ `
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vColor = color;
  vNormal = normal;
  vec4 world = modelMatrix * vec4( position, 1.0 );
  // Far land settles into the sea toward the streamed edge (behind the haze), so no edge can show.
  float far = smoothstep( ${(HAZE_END - 1600).toFixed(1)}, ${HAZE_END.toFixed(1)}, length( world.xz - cameraPosition.xz ) );
  world.y = ( world.y + ${SINK.toFixed(2)} ) * ( 1.0 - far ) - ${SINK.toFixed(2)};
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

/**
 * Lighting and aerial perspective per fragment, so tall far triangles haze
 * evenly instead of streaking between vertices. Haze runs by horizontal
 * distance from the camera from a fixed eye height, which keeps the land's
 * colour identical in the water's mirror pass, and is complete before the
 * streamed edge. Fading tiles dissolve with a screen-space dither (opaque, no
 * sorting).
 */
function fragmentShader(stops: number, dither: boolean): string {
  return /* glsl */ `
uniform vec3 sunDirection;
uniform vec3 sunTint;
uniform float hazeDensity;
uniform float hazeAngles[${stops}];
uniform vec3 hazeColors[${stops}];
uniform float fade;
${UNDERWATER_GLSL_PARS}
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;

vec3 hazeAt( float deg ) {
  vec3 color = hazeColors[0];
  for ( int i = 1; i < ${stops}; i++ ) {
    float t = clamp( ( deg - hazeAngles[i - 1] ) / max( 1e-3, hazeAngles[i] - hazeAngles[i - 1] ), 0.0, 1.0 );
    color = mix( color, hazeColors[i], t );
  }
  return color;
}

void main() {
  ${
    dither
      ? `// Interleaved gradient noise: an even, fine dissolve.
  float grain = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
  if ( grain >= fade ) discard;`
      : ''
  }
  vec3 n = normalize( vNormal );
  float lambert = max( 0.0, dot( n, sunDirection ) );
  float sky = 0.38 + 0.14 * n.y;
  float h = vWorld.y + ${SINK.toFixed(2)};
  float d = length( vWorld.xz - cameraPosition.xz );
  // Far ranges read as solid masses: facet-to-facet light differences fade with distance.
  float distant = smoothstep( 2000.0, 5500.0, d );
  lambert = mix( lambert, 0.45 * max( 0.0, sunDirection.y ) + 0.25, distant );
  sky = mix( sky, 0.5, distant );
  vec3 lit = vColor * ( sky + lambert * 0.78 * sunTint );
  // Air thins with altitude: high ridges and snowfields stay solid through the haze.
  float dh = d * mix( 1.0, 0.62, smoothstep( 150.0, 900.0, h ) );
  float a = min( 0.88, 1.0 - exp( -dh / 9000.0 - pow( dh * hazeDensity, 2.0 ) ) );
  // Past the composed view the haze closes completely, well inside the streamed edge.
  a = max( a, smoothstep( ${(HAZE_END - 1600).toFixed(1)}, ${HAZE_END.toFixed(1)}, d ) );
  // Haze is the air in front of the peak (sky nearer the horizon), not the sky behind
  // it, so a far range stays a distinct silhouette rather than a see-through curtain.
  vec3 haze = hazeAt( 0.5 * degrees( atan( h - ${EYE.toFixed(1)}, max( 1.0, d ) ) ) );
  vec3 color = mix( lit, haze, a );
  color = applyUnderwater( color, length( vWorld - cameraPosition ) );
  gl_FragColor = vec4( color, 1.0 );
  #include <colorspace_fragment>
}`;
}

type Tile = {
  key: string;
  level: number;
  ix: number;
  iz: number;
  mesh: THREE.Mesh | null;
  triangles: number;
  /** 0 → 1 while dissolving in; back to 0 while dissolving out. */
  fade: number;
  /** Seconds this tile's dissolve takes. */
  fadeTime: number;
  state: 'in' | 'on' | 'out';
};

/**
 * Picks the tiles to draw around (x, z): a quadtree from TOP_LEVEL down, where a
 * node splits when the camera is within SPLIT × its size. Nodes that were split
 * stay split a little longer, so a camera hovering at a boundary never flickers.
 * With a lead (ax, az), distance is measured to the segment from the camera to
 * the camera + lead, so the tiles it is heading into are refined early.
 */
export function selectTiles(
  x: number,
  z: number,
  wasSplit: ReadonlySet<string>,
  split: Set<string>,
  radius = STREAM_RADIUS,
  factor = SPLIT,
  ax = 0,
  az = 0,
): string[] {
  const out: Array<{ key: string; d: number; level: number }> = [];
  const top = tileSize(TOP_LEVEL);
  // Samples along the segment, at most 16 m apart (a cell's distance is convex along it).
  const samples = Math.ceil(Math.hypot(ax, az) / 16);
  const distance = (ix: number, iz: number, size: number) => {
    let d = cellDistance(x, z, ix, iz, size);
    for (let k = 1; k <= samples; k++) d = Math.min(d, cellDistance(x + (ax * k) / samples, z + (az * k) / samples, ix, iz, size));
    return d;
  };
  const visit = (level: number, ix: number, iz: number) => {
    const size = tileSize(level);
    const d = distance(ix, iz, size);
    const key = chunkKey(level, ix, iz);
    const reach = factor * size * (wasSplit.has(key) ? 1.2 : 1);
    if (level > 0 && d < reach) {
      split.add(key);
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) visit(level - 1, ix * 2 + i, iz * 2 + j);
    } else {
      out.push({ key, d, level });
    }
  };
  for (let iz = Math.floor((z - radius) / top); iz <= Math.floor((z + radius) / top); iz++) {
    for (let ix = Math.floor((x - radius) / top); ix <= Math.floor((x + radius) / top); ix++) {
      if (cellDistance(x, z, ix, iz, top) <= radius) visit(TOP_LEVEL, ix, iz);
    }
  }
  out.sort((a, b) => a.d - b.d || a.level - b.level || (a.key < b.key ? -1 : 1));
  return out.map((t) => t.key);
}

type Cell = { level: number; ix: number; iz: number };

function overlaps(a: Cell, b: Cell): boolean {
  const sa = tileSize(a.level);
  const sb = tileSize(b.level);
  return a.ix * sa < (b.ix + 1) * sb && b.ix * sb < (a.ix + 1) * sa && a.iz * sa < (b.iz + 1) * sb && b.iz * sb < (a.iz + 1) * sa;
}

/**
 * Endless land: LOD tiles streamed around the camera, built in a worker, each
 * dissolving in over FADE seconds; a tile being replaced stays until everything
 * covering it is solid, then dissolves out.
 */
export function createLandStream(land: Land, options: LandStreamOptions): LandStream {
  const cells = Math.max(8, Math.round((options.segments * 3) / 16));
  const sun = options.sunDirection.clone().normalize();
  const sunTint = new THREE.Color().setHex(0xfff0d8, THREE.SRGBColorSpace);
  const patchNoise = makeNoise2D(land.seed, 21);
  // Without a gradient, a single haze colour at every elevation.
  const gradient = options.hazeGradient ?? { angles: [0, 90], colors: [options.hazeColor, options.hazeColor] };
  const uniforms = {
    sunDirection: { value: sun },
    sunTint: { value: sunTint },
    hazeDensity: { value: options.hazeDensity ?? HAZE },
    hazeAngles: { value: gradient.angles.slice() },
    hazeColors: { value: gradient.colors.map((c) => c.clone()) },
    fade: { value: 1 },
    ...underwaterUniforms,
  };
  const makeMaterial = (dither: boolean) =>
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: fragmentShader(gradient.angles.length, dither),
      uniforms,
      vertexColors: true,
      fog: false,
      toneMapped: false,
    });
  const solid = makeMaterial(false);
  const dissolving = makeMaterial(true);

  const group = new THREE.Group();
  group.name = 'land';
  const tiles = new Map<string, Tile>();
  const requested = new Set<string>();
  let wanted = new Set<string>();
  let wantedList: string[] = [];
  let wantedCells: Array<{ key: string; level: number; ix: number; iz: number }> = [];
  let split = new Set<string>();
  let lastX = Infinity;
  let lastZ = Infinity;
  let lastAX = 0;
  let lastAZ = 0;
  let queue: string[] = [];
  /** Built tiles waiting to be placed (paced), and tiles built ahead of need. */
  const arrived: Array<{ key: string; data: TileData | null }> = [];
  const ready = new Map<string, TileData | null>();
  let completed = 0;
  let holes = 0;

  let worker: Worker | null = null;
  let inFlight = 0;
  const MAX_IN_FLIGHT = 2;
  if (options.worker && typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./world-worker.ts', import.meta.url), { type: 'module' });
      const init: WorkerRequest = { type: 'init', seed: land.seed, viewYaw: land.viewYaw, offset: land.offset };
      worker.postMessage(init);
      worker.onmessage = (event: MessageEvent<{ type: string; key: string; data: TileData | null }>) => {
        if (event.data.type !== 'tile') return;
        inFlight = Math.max(0, inFlight - 1);
        requested.delete(event.data.key);
        received(event.data.key, event.data.data);
      };
      worker.onerror = () => {
        // Build on the main thread from here on; re-queue whatever was in flight.
        worker?.terminate();
        worker = null;
        inFlight = 0;
        requested.clear();
        lastX = Infinity;
      };
    } catch {
      worker = null;
    }
  }

  /** A built tile: queued for placement while wanted, otherwise held ready. */
  function received(key: string, data: TileData | null): void {
    if (wanted.has(key)) {
      arrived.push({ key, data });
      return;
    }
    ready.delete(key);
    ready.set(key, data);
    while (ready.size > READY_CAP) ready.delete(ready.keys().next().value!);
  }

  function place(key: string, data: TileData | null, solidNow: boolean): void {
    if (tiles.has(key)) return;
    const { lod, cx, cz } = parseChunkKey(key);
    // Open sea has nothing to dissolve: it counts as solid at once.
    const on = solidNow || !data;
    const fadeTime = FADE * (0.8 + 0.4 * tileUnit(land.seed, lod, cx, cz));
    const tile: Tile = { key, level: lod, ix: cx, iz: cz, mesh: null, triangles: 0, fade: on ? 1 : 0, fadeTime, state: on ? 'on' : 'in' };
    if (data) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, solidNow ? solid : dissolving);
      const size = tileSize(lod);
      mesh.position.set(cx * size, 0, cz * size);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.onBeforeRender = () => {
        if (mesh.material !== dissolving) return;
        uniforms.fade.value = tile.fade;
        dissolving.uniformsNeedUpdate = true;
      };
      group.add(mesh);
      tile.mesh = mesh;
      tile.triangles = data.triangles;
    }
    tiles.set(key, tile);
  }

  function buildHere(key: string): TileData | null {
    const { lod, cx, cz } = parseChunkKey(key);
    return buildTile(land, patchNoise, lod, cx, cz, cells);
  }

  function remove(tile: Tile): void {
    tiles.delete(tile.key);
    if (tile.mesh) {
      group.remove(tile.mesh);
      tile.mesh.geometry.dispose();
    }
  }

  /** Whether a cell is drawn solid: by itself, an ancestor, or (two levels down at most) its children. */
  function solidAt(level: number, ix: number, iz: number): boolean {
    for (let l = level, x = ix, z = iz; l <= TOP_LEVEL; l++, x = Math.floor(x / 2), z = Math.floor(z / 2)) {
      if (tiles.get(chunkKey(l, x, z))?.state === 'on') return true;
    }
    const below = (l: number, x: number, z: number, depth: number): boolean => {
      if (tiles.get(chunkKey(l, x, z))?.state === 'on') return true;
      if (l === 0 || depth === 0) return false;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (!below(l - 1, x * 2 + i, z * 2 + j, depth - 1)) return false;
      return true;
    };
    return level > 0 && below(level, ix, iz, 2);
  }

  /**
   * Wanted tiles along the lead (ax, az); then tiles around the prefetch point.
   * Missing ones queue by need (uncovered first), then distance with seeded
   * jitter so a ring of equal tiles never arrives together.
   */
  function reselect(x: number, z: number, ax: number, az: number, px: number, pz: number): void {
    const next = new Set<string>();
    wantedList = selectTiles(x, z, split, next, STREAM_RADIUS, SPLIT, ax, az);
    split = next;
    wanted = new Set(wantedList);
    wantedCells = wantedList.map((key) => {
      const { lod, cx, cz } = parseChunkKey(key);
      return { key, level: lod, ix: cx, iz: cz };
    });
    const order = (keys: string[], bias: number) =>
      keys
        .filter((key) => !tiles.has(key) && !(bias && ready.has(key)))
        .map((key) => {
          const { lod, cx, cz } = parseChunkKey(key);
          const d = cellDistance(x, z, cx, cz, tileSize(lod)) * (0.8 + 0.4 * tileUnit(land.seed, lod, cx, cz));
          return { key, rank: bias + (solidAt(lod, cx, cz) ? d : -1) };
        })
        .sort((a, b) => a.rank - b.rank || (a.key < b.key ? -1 : 1))
        .map((t) => t.key);
    const later = px === x && pz === z ? [] : selectTiles(px, pz, split, new Set()).filter((key) => !wanted.has(key));
    queue = [...order(wantedList, 0), ...order(later, 1e9)];
    lastX = x;
    lastZ = z;
    lastAX = ax;
    lastAZ = az;
  }

  /** True when every wanted tile overlapping `tile` is solid (or empty sea). */
  function covered(tile: Tile): boolean {
    for (const cell of wantedCells) {
      if (!overlaps(tile, cell)) continue;
      const other = tiles.get(cell.key);
      if (!other || other.state !== 'on') return false;
    }
    return true;
  }

  return {
    group,
    prime(x, z) {
      reselect(x, z, 0, 0, x, z);
      for (const key of wantedList) place(key, buildHere(key), true);
      queue = [];
    },
    update(x, z, dt, vx = 0, vz = 0) {
      const [ax, az] = ahead(vx, vz, LEAD, LEAD_MAX);
      if (Math.max(Math.hypot(x - lastX, z - lastZ), Math.hypot(x + ax - lastX - lastAX, z + az - lastZ - lastAZ)) > RESELECT) {
        const [px, pz] = ahead(vx, vz, PREFETCH, PREFETCH_MAX);
        reselect(x, z, ax, az, x + px, z + pz);
      }
      // Requests in queue order; one tile per frame when building on the main thread.
      while (queue.length && (worker ? inFlight < MAX_IN_FLIGHT : true)) {
        const key = queue.shift()!;
        if (tiles.has(key) || requested.has(key)) continue;
        if (ready.has(key)) {
          if (wanted.has(key)) {
            arrived.push({ key, data: ready.get(key)! });
            ready.delete(key);
          }
          continue;
        }
        if (worker) {
          const { lod, cx, cz } = parseChunkKey(key);
          const request: WorkerRequest = { type: 'tile', key, level: lod, ix: cx, iz: cz, cells };
          worker.postMessage(request);
          requested.add(key);
          inFlight++;
        } else {
          received(key, buildHere(key));
          break;
        }
      }
      for (let placed = 0; arrived.length && placed < PLACE_PER_FRAME; ) {
        const { key, data } = arrived.shift()!;
        if (tiles.has(key)) continue;
        if (!wanted.has(key)) {
          received(key, data);
          continue;
        }
        place(key, data, false);
        placed++;
      }
      // Without motion (reduced-motion preference) tiles swap at once.
      for (const tile of [...tiles.values()]) {
        const step = dt > 0 ? dt / tile.fadeTime : 1;
        const want = wanted.has(tile.key);
        if (want && tile.state === 'out') tile.state = 'in';
        if (!want && tile.state !== 'out' && covered(tile)) tile.state = 'out';
        if (tile.state === 'in') {
          tile.fade = Math.min(1, tile.fade + step);
          if (tile.fade >= 1) {
            tile.state = 'on';
            completed++;
            if (tile.mesh) tile.mesh.material = solid;
          }
        } else if (tile.state === 'out') {
          if (tile.mesh) tile.mesh.material = dissolving;
          tile.fade = Math.max(0, tile.fade - step);
          if (tile.fade <= 0 || !tile.mesh) remove(tile);
        }
      }
      holes = 0;
      for (const cell of wantedCells) {
        if (tiles.get(cell.key)?.state === 'on') continue;
        if (cellDistance(x, z, cell.ix, cell.iz, tileSize(cell.level)) < HAZE_END && !solidAt(cell.level, cell.ix, cell.iz)) holes++;
      }
    },
    tileState: (key) => tiles.get(key)?.state,
    stats() {
      let triangles = 0;
      let fading = 0;
      for (const tile of tiles.values()) {
        triangles += tile.triangles;
        if (tile.state !== 'on') fading++;
      }
      return { tiles: tiles.size, triangles, pending: queue.length + requested.size + arrived.length, fading, ready: ready.size, holes, completed };
    },
    dispose() {
      worker?.terminate();
      for (const tile of [...tiles.values()]) remove(tile);
      solid.dispose();
      dissolving.dispose();
    },
  };
}
