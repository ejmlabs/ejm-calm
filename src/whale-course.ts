import type { NoiseFunction2D } from 'simplex-noise';
import { fork } from './rng.js';
import { makeNoise2D } from './noise.js';
import { clamp } from './math.js';
import { clampClearOfLand, type Shore } from './shore.js';

/** Hard cap on |Δheading| / dt. Gentle enough that a turn reads as a curve, not a spin. */
export const WHALE_MAX_TURN_RATE = 0.2;

/** Hard clearance from land passed to clampClearOfLand. */
export const WHALE_ISLAND_MARGIN = 20;

export type WhaleCourse = {
  x: number;
  z: number;
  heading: number;
  /** Heading the whale is steering for after looking ahead for land. */
  leg: number;
  /** Detour from the journey heading chosen at the last look-ahead (radians). */
  detour?: number;
  /** Journey bias: the journey slowly adopts the way the plans actually lead. */
  bias?: number;
  /** Look-ahead slot (time / LOOK_EVERY) of the last decision. */
  slot?: number;
  /** Plan slot (time / PLAN_EVERY) of the last plan, and the bearing it chose. */
  scan?: number;
  plan?: number;
  /** Open water the plans are heading for, held until reached, cut off or stale. */
  target?: { x: number; z: number; since: number; closest: number; closestAt: number };
  /** Coarse cells already swum through (most recent last), so the journey prefers new water. */
  visited?: Map<string, true>;
  planCache?: PlanCache;
  /** Forward speed, m/s; defaults to params.speed. */
  speed?: number;
  /** Steer for this point instead of the journey (feeding); land avoidance still applies. */
  aim?: { x: number; z: number } | null;
};

export type WhaleCourseParams = {
  baseHeading: number;
  /** Start point: only a fallback if the course ever turns non-finite. */
  homeX: number;
  homeZ: number;
  speed: number;
  turnRate: number;
  /** The journey heading swings slowly around baseHeading. */
  journeyFreq: number;
  journeyAmp: number;
  wanderFreq: number;
  wanderAmp: number;
  wanderPhase: number;
};

/** Shortest signed angle from `from` to `to`, in (−π, π]. */
export function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Horizontal direction the head points when `group.rotation.y = heading`
 * (lathe head sits on local −X; yaw-only YXZ).
 */
export function whaleForward(heading: number): { x: number; z: number } {
  return { x: -Math.cos(heading), z: Math.sin(heading) };
}

/** Heading whose forward matches the world XZ vector (dx, dz). */
export function headingToward(dx: number, dz: number): number {
  return Math.atan2(dz, -dx);
}

export function createWhaleCourseParams(
  seed: number,
  home: { x: number; z: number },
  heading: number,
): WhaleCourseParams {
  const rng = fork(seed, 'whale-course');
  return {
    baseHeading: heading,
    homeX: home.x,
    homeZ: home.z,
    speed: 1.55 + rng() * 0.45,
    turnRate: WHALE_MAX_TURN_RATE,
    journeyFreq: 1 / (900 + rng() * 500),
    journeyAmp: 0.35 + rng() * 0.25,
    wanderFreq: 0.013 + rng() * 0.01,
    wanderAmp: 0.25 + rng() * 0.15,
    wanderPhase: rng() * 64,
  };
}

export function createWhaleCourseNoise(seed: number): NoiseFunction2D {
  return makeNoise2D(seed, 11);
}

/** How far ahead of the hard margin the whale starts to bend away from land. */
const LAND_INFLUENCE = 34;

function avoidLand(
  x: number,
  z: number,
  heading: number,
  desired: number,
  shore: Shore,
  reach: number,
): number {
  const gap = shore.clearance(x, z);
  const influence = WHALE_ISLAND_MARGIN + LAND_INFLUENCE * reach;
  if (!(gap < influence)) return desired;
  const away = shore.away(x, z);
  // Direction toward the land is the reverse of the way out.
  const ndx = -away.x;
  const ndz = -away.z;
  const fwd = whaleForward(heading);
  const closeness = clamp(1 - (gap - WHALE_ISLAND_MARGIN * 0.5) / (influence - WHALE_ISLAND_MARGIN * 0.5), 0, 1);
  const ahead = fwd.x * ndx + fwd.z * ndz;
  if (ahead < 0.05 && closeness < 0.5) return desired;
  // Follow the coast on the nearer side; when very close, head straight out.
  const left = headingToward(-ndz, ndx);
  const right = headingToward(ndz, -ndx);
  const tangent = Math.abs(shortestAngle(desired, left)) <= Math.abs(shortestAngle(desired, right)) ? left : right;
  const flee = closeness > 0.72 ? headingToward(away.x, away.z) : tangent;
  const weight = clamp(closeness * (0.45 + 0.9 * clamp(ahead, 0, 1)), 0, 1);
  return desired + shortestAngle(desired, flee) * weight;
}

/** Seconds between look-aheads; fixed in sim time so 30 and 60 fps decide alike. */
export const LOOK_EVERY = 0.5;
/** Probe distances ahead and the clearance each wants. */
const PROBES: ReadonlyArray<readonly [number, number]> = [
  [60, WHALE_ISLAND_MARGIN + 30],
  [150, 50],
];
/** Detours tried, nearest the journey first; the last ones turn back out of a bay. */
const DETOURS = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.45, -1.45, 1.9, -1.9, 2.5, -2.5, Math.PI];

/** Seconds between plans of the way on (fixed in sim time). */
export const PLAN_EVERY = 5;
/**
 * The first plan waits this long: the opening needs none, and by then the
 * streamed navigation tiles it reads are built in the background.
 */
export const PLAN_START = 20;
/** Coarse planning grid: cell size and radius in cells (≈1.6 km). */
const PLAN_CELL = 80;
const PLAN_RADIUS = 20;
/**
 * Coarse cells with this much clearance are deep water; down to PLAN_CLEAR (what
 * the look-ahead allows) they cost PLAN_SHALLOW_COST times as much to cross, so
 * routes keep off the coast (calmer, bluer water) unless a passage needs it.
 */
const PLAN_DEEP = 150;
const PLAN_CLEAR = 50;
const PLAN_SHALLOW_COST = 3;
/** Targets lie at least this many cells of path away; the plan steers for the path point PLAN_LEAD cells out. */
const PLAN_MIN_DEPTH = 12;
const PLAN_LEAD = 3;
/** A target is dropped once this close, or after this long. */
const TARGET_REACHED = 300;
const TARGET_SECONDS = 180;
/** No headway toward the target for this long means the way is shut. */
const STALL_SECONDS = 90;
/** Side of the coarse cells the whale remembers swimming through. */
const VISIT_CELL = 300;
const VISIT_MEMORY = 600;
const visitKey = (x: number, z: number) => `${Math.floor(x / VISIT_CELL)}:${Math.floor(z / VISIT_CELL)}`;

/** Coarse clearance samples on a fixed world lattice, shared by successive plans. */
export type PlanCache = Map<string, number>;
const PLAN_CACHE_CAP = 40000;

/**
 * Bearing toward the open water furthest along `journey` that the whale can
 * actually reach: a cheapest-path search over a coarse grid of shore clearance
 * finds every reachable cell within ~1.6 km, where water near the coast costs
 * more than deep water, so routes keep off the shore unless a passage needs it.
 * The best cell is far along the journey and not yet swum, and the whale steers
 * for a point a few cells down the path to it. A dead-end gulf is left by the
 * way it was entered, and a bay by its mouth, without pacing. A held target
 * (`keep`) wins while it can still be reached. Returns null when boxed in.
 */
export function planJourney(
  x: number,
  z: number,
  journey: number,
  visited: ReadonlyMap<string, true>,
  shore: Shore,
  cache: PlanCache,
  keep?: { x: number; z: number },
): { bearing: number; x: number; z: number; steps: number } | null {
  const side = PLAN_RADIUS * 2 + 1;
  const ci = Math.floor(x / PLAN_CELL);
  const cj = Math.floor(z / PLAN_CELL);
  /** Cost of crossing a cell: 1 in deep water, more near the coast, Infinity where too close. */
  const cost = (li: number, lj: number): number => {
    const i = ci + li - PLAN_RADIUS;
    const j = cj + lj - PLAN_RADIUS;
    const key = `${i}:${j}`;
    let m = cache.get(key);
    if (m === undefined) {
      m = shore.clearance((i + 0.5) * PLAN_CELL, (j + 0.5) * PLAN_CELL);
      cache.set(key, m);
      if (cache.size > PLAN_CACHE_CAP) cache.delete(cache.keys().next().value!);
    }
    return m > PLAN_DEEP ? 1 : m > PLAN_CLEAR ? PLAN_SHALLOW_COST : Infinity;
  };
  const n = side * side;
  const dist = new Float64Array(n).fill(Infinity);
  const steps = new Int16Array(n);
  const parent = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  // Binary heap of cell indices keyed by dist.
  const heap: number[] = [];
  const push = (k: number) => {
    heap.push(k);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (dist[heap[p]!]! <= dist[k]!) break;
      heap[c] = heap[p]!;
      c = p;
    }
    heap[c] = k;
  };
  const pop = (): number => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        if (l >= heap.length) break;
        const r = l + 1;
        const m = r < heap.length && dist[heap[r]!]! < dist[heap[l]!]! ? r : l;
        if (dist[heap[m]!]! >= dist[last]!) break;
        heap[c] = heap[m]!;
        c = m;
      }
      heap[c] = last;
    }
    return top;
  };
  const start = PLAN_RADIUS * side + PLAN_RADIUS;
  dist[start] = 0;
  push(start);
  const fwd = whaleForward(journey);
  const keepI = keep ? Math.floor(keep.x / PLAN_CELL) - ci + PLAN_RADIUS : -1;
  const keepJ = keep ? Math.floor(keep.z / PLAN_CELL) - cj + PLAN_RADIUS : -1;
  const keepK = keepI >= 0 && keepJ >= 0 && keepI < side && keepJ < side ? keepJ * side + keepI : -1;
  let best = -1;
  let bestScore = -Infinity;
  while (heap.length) {
    const k = pop();
    if (done[k]) continue;
    done[k] = 1;
    const li = k % side;
    const lj = (k - li) / side;
    if (steps[k]! >= PLAN_MIN_DEPTH) {
      const wx = (ci + li - PLAN_RADIUS + 0.5) * PLAN_CELL;
      const wz = (cj + lj - PLAN_RADIUS + 0.5) * PLAN_CELL;
      const dx = wx - x;
      const dz = wz - z;
      // Far along the journey, new water, and not too winding or shallow a way there.
      const score = dx * fwd.x + dz * fwd.z - (visited.has(visitKey(wx, wz)) ? 900 : 0) - 0.3 * (dist[k]! * PLAN_CELL - Math.hypot(dx, dz));
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue;
        const ni = li + di;
        const nj = lj + dj;
        if (ni < 0 || nj < 0 || ni >= side || nj >= side) continue;
        const nk = nj * side + ni;
        if (done[nk]) continue;
        const c = cost(ni, nj);
        if (c === Infinity) continue;
        // Diagonal moves may not squeeze between two closed cells.
        if (di !== 0 && dj !== 0 && cost(li + di, lj) === Infinity && cost(li, lj + dj) === Infinity) continue;
        const next = dist[k]! + c * (di !== 0 && dj !== 0 ? Math.SQRT2 : 1);
        if (next < dist[nk]!) {
          dist[nk] = next;
          steps[nk] = steps[k]! + 1;
          parent[nk] = k;
          push(nk);
        }
      }
    }
  }
  if (keepK >= 0 && done[keepK] && keepK !== start) best = keepK;
  if (best < 0) return null;
  const bi = best % side;
  const bj = (best - bi) / side;
  const target = { x: (ci + bi - PLAN_RADIUS + 0.5) * PLAN_CELL, z: (cj + bj - PLAN_RADIUS + 0.5) * PLAN_CELL };
  let waypoint = best;
  while (steps[waypoint]! > PLAN_LEAD) waypoint = parent[waypoint]!;
  const li = waypoint % side;
  const lj = (waypoint - li) / side;
  const wx = (ci + li - PLAN_RADIUS + 0.5) * PLAN_CELL;
  const wz = (cj + lj - PLAN_RADIUS + 0.5) * PLAN_CELL;
  return { bearing: headingToward(wx - x, wz - z), ...target, steps: steps[best]! };
}

/** How open a bearing is from (x, z): 0 when every probe has its clearance, growing as land closes in. */
function blockage(x: number, z: number, bearing: number, shore: Shore, reach: number): number {
  const fwd = whaleForward(bearing);
  let cost = 0;
  for (const [d, want] of PROBES) {
    const gap = shore.clearance(x + fwd.x * d * reach, z + fwd.z * d * reach);
    // Near probes weigh most: land at 60 m matters more than land at 400 m.
    if (gap < want) cost += ((want - gap) / want) * (500 / d);
  }
  return cost;
}

/** Picks the detour from the journey heading that leads to the most open water. */
function chooseDetour(course: WhaleCourse, journey: number, shore: Shore, reach: number): number {
  const previous = course.detour ?? 0;
  if (blockage(course.x, course.z, journey, shore, reach) === 0) return 0;
  let best = previous;
  let bestCost = Infinity;
  for (const detour of DETOURS) {
    const bearing = journey + detour;
    const cost =
      blockage(course.x, course.z, bearing, shore, reach) * 4 +
      Math.abs(detour) * 0.35 +
      // Holding the last choice keeps the whale from dithering between two gaps.
      Math.abs(shortestAngle(journey + previous, bearing)) * 0.25 +
      // Turning hard costs too.
      Math.abs(shortestAngle(course.heading, bearing)) * 0.1;
    if (cost < bestCost) {
      bestCost = cost;
      best = detour;
    }
  }
  return best;
}

/**
 * Advance the journey one step. The whale follows a slowly swinging journey
 * heading, never a home. Every PLAN_EVERY seconds it plans a way on through
 * the water it can reach (see planJourney), and the journey slowly
 * adopts where the plans lead. Every LOOK_EVERY seconds it probes the water
 * ahead and to either side and picks the most open bearing near the plan.
 * Near-field avoidance and a hard clearance clamp stay as the last guard.
 */
export function stepWhaleCourse(
  course: WhaleCourse,
  dt: number,
  time: number,
  shore: Shore,
  params: WhaleCourseParams,
  noise: NoiseFunction2D,
): void {
  if (!(dt > 0) || !Number.isFinite(dt) || !Number.isFinite(time)) return;
  const speed = course.speed ?? params.speed;
  // A faster whale looks further ahead for land, so its wider curves still clear the coast.
  const reach = Math.max(1, speed / 3);

  const n1 = noise(time * params.wanderFreq + params.wanderPhase, 2.5);
  const n2 = noise(time * params.wanderFreq * 0.37 + 11.0, params.wanderPhase * 0.2 + 4.0);
  const wander = (n1 * 0.78 + n2 * 0.22) * params.wanderAmp;
  const swing = noise(time * params.journeyFreq + params.wanderPhase * 0.5, 7.3) * params.journeyAmp;
  let bias = course.bias ?? 0;
  const scan = Math.floor(time / PLAN_EVERY);
  const visited = (course.visited ??= new Map());
  const cell = visitKey(course.x, course.z);
  if (!visited.has(cell)) {
    visited.set(cell, true);
    if (visited.size > VISIT_MEMORY) visited.delete(visited.keys().next().value!);
  }
  const heading = params.baseHeading + bias + swing;
  if (course.scan !== scan && time >= PLAN_START) {
    course.scan = scan;
    const held = course.target;
    const gap = held ? Math.hypot(held.x - course.x, held.z - course.z) : 0;
    // Headway is measured along the planned path (held.closest is in path cells).
    const stalled = !!held && time - held.closestAt > STALL_SECONDS;
    const keep = held && !stalled && time - held.since < TARGET_SECONDS && gap > TARGET_REACHED ? held : undefined;
    const cache = (course.planCache ??= new Map());
    const plan2 = (k?: { x: number; z: number }) => planJourney(course.x, course.z, heading, visited, shore, cache, k);
    let plan = plan2(keep);
    if (course.plan !== undefined && (stalled || (keep && (!plan || plan.x !== keep.x || plan.z !== keep.z)))) {
      // The way to the held target closed up ahead (or the whale made no headway): remember
      // that gap as shut, so it does not turn back and try it again a few minutes later.
      const fwd = whaleForward(course.plan);
      for (let d = PLAN_CELL; d <= PLAN_CELL * 3; d += PLAN_CELL) {
        cache.set(`${Math.floor((course.x + fwd.x * d) / PLAN_CELL)}:${Math.floor((course.z + fwd.z * d) / PLAN_CELL)}`, -Infinity);
      }
      plan = plan2();
    }
    course.plan = plan?.bearing;
    if (!plan) course.target = undefined;
    else if (!keep || plan.x !== keep.x || plan.z !== keep.z) {
      course.target = { x: plan.x, z: plan.z, since: time, closest: plan.steps, closestAt: time };
    } else if (course.target && plan.steps < course.target.closest) {
      course.target.closest = plan.steps;
      course.target.closestAt = time;
    }
  }
  const journey = course.plan ?? heading;
  // Over ten minutes or so the journey itself turns the way the plans lead.
  course.bias = wrapAngle(bias + shortestAngle(heading, journey) * clamp(dt / 600, 0, 1));

  const slot = Math.floor(time / LOOK_EVERY);
  if (course.slot !== slot) {
    course.slot = slot;
    course.detour = chooseDetour(course, journey, shore, reach);
  }
  const detour = course.detour ?? 0;
  // The meander only plays in open water.
  const aim = course.aim;
  let desired = aim ? headingToward(aim.x - course.x, aim.z - course.z) : journey + detour + (detour === 0 ? wander : 0);
  course.leg = wrapAngle(desired);
  desired = avoidLand(course.x, course.z, course.heading, desired, shore, reach);

  const delta = shortestAngle(course.heading, desired);
  const maxStep = params.turnRate * dt;
  course.heading = wrapAngle(course.heading + clamp(delta, -maxStep, maxStep));

  const fwd = whaleForward(course.heading);
  course.x += fwd.x * speed * dt;
  course.z += fwd.z * speed * dt;

  const cleared = clampClearOfLand(course.x, course.z, shore, WHALE_ISLAND_MARGIN);
  course.x = cleared.x;
  course.z = cleared.z;

  if (!Number.isFinite(course.x) || !Number.isFinite(course.z) || !Number.isFinite(course.heading) || !Number.isFinite(course.leg)) {
    course.x = params.homeX;
    course.z = params.homeZ;
    course.heading = wrapAngle(params.baseHeading);
    course.leg = course.heading;
    course.detour = 0;
    course.bias = 0;
    course.plan = undefined;
    course.target = undefined;
  }
}

export type WhalePilot = {
  params: WhaleCourseParams;
  step: (course: WhaleCourse, dt: number, time: number, shore: Shore) => void;
};

export function createWhalePilot(
  seed: number,
  home: { x: number; z: number },
  heading: number,
): WhalePilot {
  const params = createWhaleCourseParams(seed, home, heading);
  const noise = createWhaleCourseNoise(seed);
  return {
    params,
    step(course, dt, time, shore) {
      stepWhaleCourse(course, dt, time, shore, params, noise);
    },
  };
}
