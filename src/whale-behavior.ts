import type { Shore } from './shore.js';
import { fork } from './rng.js';
import { makeNoise2D } from './noise.js';
import { clamp, damp, lerp, smoothstep } from './math.js';
import { createSpring, springSet, springStep } from './spring.js';
import { FEED_CELL, feedSiteInCell, type FeedSite } from './feed-sites.js';
import { WHALE_ISLAND_MARGIN, createWhalePilot, shortestAngle, whaleForward, type WhaleCourse } from './whale-course.js';
import {
  FLOOR_CLEARANCE,
  PHASE_LEN,
  POSE_KEYS,
  REST_ARCH,
  SWIM_PITCH,
  SWIM_Y,
  emptyPose,
  whalePose,
  type WhalePhase,
  type WhalePose,
} from './whale-motion.js';

export type WhaleBehavior = 'travel' | 'feed' | 'breathe';

/** Travel speed range, m/s: noise moves between cruising, speeding up and easing off. */
export const TRAVEL_MIN = 3;
export const TRAVEL_MAX = 9;
/** Acceleration limits, m/s²: easing off is a little quicker than speeding up. */
export const MAX_ACCEL = 0.8;
export const MAX_DECEL = 1.2;
/** Seconds between breaths: a seeded interval in this range (a feed may hold it to FEED_HOLD). */
export const BREATH_MIN = 70;
export const BREATH_MAX = 120;
/** A feed starts only this long before a due breath, and holds that breath until at least FEED_HOLD after it starts. */
const FEED_WINDOW = 60;
const FEED_HOLD = 100;
/** Feed sites are looked for this far around the whale, and only roughly ahead. */
const FEED_RANGE = 600;
/** An approach that has not reached its site by then gives up. */
const APPROACH_SECONDS = 100;
/** Seconds between decisions; fixed in sim time so 30 and 60 fps decide alike. */
const DECIDE_EVERY = 0.5;

/** A posed stretch (surface, spout, dive, breach, splash) played from whalePose. */
type Segment = { phase: WhalePhase; len: number; t: number };

export type WhaleMotion = {
  x: number;
  z: number;
  heading: number;
  /** Horizontal speed right now, m/s (breach surge included). */
  speed: number;
  behavior: WhaleBehavior;
  phase: WhalePhase;
  phaseT: number;
  /** Eased target pose; the caller adds the surface bob and the floor limit. */
  pose: WhalePose;
  /** Seafloor height under the whale (undefined without floorAt). */
  floor: number | undefined;
  /** The bait ball or krill swarm being fed on or approached. */
  site: FeedSite | null;
};

export type WhaleMover = {
  motion: WhaleMotion;
  step: (dt: number, time: number, shore: Shore) => void;
  /** Play `phase` from normalised time `t` for review; the whale holds position (surge aside) and snaps to it. */
  force: (phase: WhalePhase, t: number) => void;
};

/**
 * Pure, seeded whale behaviour: a small state machine (travel → feed → travel,
 * travel → breathe → travel) on top of the journey planner. Speed and travel
 * depth follow slow noise; every change of pose eases through a decaying offset,
 * so no transition jumps in height, pitch or heading.
 */
export function createWhaleMover(
  seed: number,
  home: { x: number; z: number },
  heading: number,
  floorAt?: (x: number, z: number) => number,
): WhaleMover {
  const rng = fork(seed, 'whale-behavior');
  const noise = makeNoise2D(seed, 23);
  const pilot = createWhalePilot(seed, home, heading);
  const course: WhaleCourse = { x: home.x, z: home.z, heading, leg: heading, speed: 1 };

  /** Travel speed: two octaves of slow noise, so surges and lulls never repeat. */
  const travelSpeed = (t: number) =>
    lerp(TRAVEL_MIN, TRAVEL_MAX, smoothstep(-0.65, 0.45, 0.7 * noise(t / 34, 0.5) + 0.3 * noise(t / 11, 3.7)));
  /**
   * Travel depth: back and dorsal fin breaking the surface (so the chase camera above
   * the mirror-like water always sees the whale), now and then a shallow dive it follows under.
   */
  const travelDepth = (t: number) =>
    -1.35 - 0.4 * smoothstep(-0.6, 0.6, noise(t / 47, 8.1)) - 7.5 * smoothstep(0.3, 0.75, noise(t / 130, 12.9));
  const jitter = (a: number, b: number) => a + (b - a) * rng();

  // The opening is a breath already under way: mid-surface, so the first blow comes within seconds.
  let behavior: WhaleBehavior = 'breathe';
  let seg: Segment | null = { phase: 'surface', len: PHASE_LEN.surface, t: PHASE_LEN.surface * 0.45 };
  const queue: Segment[] = [];
  const posed = (phase: WhalePhase, len = PHASE_LEN[phase]): Segment => ({ phase, len, t: 0 });
  queue.push(posed('spout'), posed('surface', jitter(3, 6)), posed('spout'), posed('dive'));
  let breathing = true;
  let forced = false;
  let nextBreath = jitter(BREATH_MIN, BREATH_MAX);
  let nextFeed = jitter(20, 60);
  let site: FeedSite | null = null;
  let siteSince = 0;
  let feedStart: number | null = null;
  let feedLen = 0;
  let lunge = false;
  let circleDir = 1;
  const visited = new Set<number>();
  const cells = new Map<string, FeedSite | null>();
  let slot = -1;

  let speed = 1;
  let speedGoal = 1;
  const depth = createSpring(SWIM_Y);
  let label: WhalePhase = 'surface';
  /** The segment the pose came from last step (null while cruising). */
  let source: Segment | null = seg;
  let labelT = 0;
  let bank = 0;

  const target = emptyPose();
  const offset = emptyPose();
  for (const key of POSE_KEYS) offset[key] = 0;
  const motion: WhaleMotion = {
    x: course.x,
    z: course.z,
    heading,
    speed,
    behavior,
    phase: 'surface',
    phaseT: 0.45,
    pose: whalePose('surface', 0.45),
    floor: floorAt?.(home.x, home.z),
    site: null,
  };

  function siteIn(cx: number, cz: number): FeedSite | null {
    const key = `${cx}:${cz}`;
    let s = cells.get(key);
    if (s === undefined) {
      s = feedSiteInCell(seed, cx, cz, floorAt!);
      cells.set(key, s);
      if (cells.size > 256) cells.delete(cells.keys().next().value!);
    }
    return s;
  }

  /** Nearest unvisited site roughly ahead, in reach and clear of the coast. */
  function findSite(shore: Shore): FeedSite | null {
    const fwd = whaleForward(course.heading);
    let best: FeedSite | null = null;
    let bestD = FEED_RANGE;
    for (let cz = Math.floor((course.z - FEED_RANGE) / FEED_CELL); cz <= Math.floor((course.z + FEED_RANGE) / FEED_CELL); cz++) {
      for (let cx = Math.floor((course.x - FEED_RANGE) / FEED_CELL); cx <= Math.floor((course.x + FEED_RANGE) / FEED_CELL); cx++) {
        const s = siteIn(cx, cz);
        if (!s || visited.has(s.id)) continue;
        const dx = s.x - course.x;
        const dz = s.z - course.z;
        const d = Math.hypot(dx, dz);
        if (d >= bestD || dx * fwd.x + dz * fwd.z < 0.2 * d) continue;
        if (!(shore.clearance(s.x, s.z) > WHALE_ISLAND_MARGIN + s.radius + 10)) continue;
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  function endFeed(time: number): void {
    if (site) visited.add(site.id);
    if (visited.size > 64) visited.delete(visited.values().next().value!);
    site = null;
    feedStart = null;
    behavior = 'travel';
    nextFeed = time + jitter(40, 100);
  }

  function decide(time: number, shore: Shore): void {
    if (behavior === 'travel') {
      if (time >= nextBreath) {
        behavior = 'breathe';
        breathing = false;
      } else if (floorAt && time >= nextFeed && nextBreath - time > FEED_WINDOW) {
        site = findSite(shore);
        if (site) {
          behavior = 'feed';
          nextBreath = Math.max(nextBreath, time + FEED_HOLD);
          siteSince = time;
          lunge = (site.id & 1) === 1;
          circleDir = site.id & 2 ? 1 : -1;
        } else nextFeed = time + 4;
      }
    } else if (behavior === 'feed' && site) {
      const d = Math.hypot(site.x - course.x, site.z - course.z);
      if (feedStart === null && d < site.radius && Math.abs(depth.x - site.y) < site.radius) {
        feedStart = time;
        feedLen = jitter(16, 30);
      }
      const done = feedStart !== null ? time - feedStart > feedLen : time - siteSince > APPROACH_SECONDS;
      if (done || time > nextBreath) endFeed(time);
    }
  }

  /** Queue the breath: surface and blow two or three times, looking around between, then dive (now and then breach). */
  function startBreath(): void {
    breathing = true;
    queue.push(posed('surface', jitter(3.5, 6)), posed('spout'));
    const blows = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < blows; i++) queue.push(posed('surface', jitter(2.5, 4.5)), posed('spout'));
    queue.push(posed('dive'));
    if (rng() < 0.2) queue.push(posed('breach'), posed('splash'));
  }

  /** Cruise pose: depth from the spring, nose along the climb or descent, banking into turns. */
  function cruisePose(out: WhalePose): void {
    const near = smoothstep(-3.2, -1.6, depth.x);
    const pace = clamp((speed - 1) / (TRAVEL_MAX - 1), 0, 1);
    out.y = depth.x;
    out.pitch = SWIM_PITCH * near + clamp(Math.atan2(depth.v, Math.max(speed, 1.5)), -0.5, 0.5);
    out.roll = bank;
    out.arch = REST_ARCH * near;
    out.stroke = lerp(0.75, 1.35, pace);
    out.rate = lerp(0.8, 1.7, pace);
    out.flipLift = 0;
    out.flipSweep = 0.08 * (1 - pace);
    out.bob = near;
    out.surge = 0;
  }

  function step(rawDt: number, time: number, shore: Shore): void {
    const dt = Number.isFinite(rawDt) ? Math.max(0, rawDt) : 0;
    if (!(dt > 0) || !Number.isFinite(time)) return;
    const s = Math.floor(time / DECIDE_EVERY);
    if (!forced && s !== slot) {
      slot = s;
      decide(time, shore);
    }

    // Goals for speed and depth from the behaviour.
    let goalSpeed = travelSpeed(time);
    let goalDepth = travelDepth(time);
    course.aim = null;
    if (behavior === 'breathe') {
      goalSpeed = seg ? (seg.phase === 'dive' ? 1.8 : 1.1) : 1.8;
      goalDepth = SWIM_Y;
      if (!breathing && !seg && depth.x > SWIM_Y - 0.5 && speed < 2.6) startBreath();
    } else if (behavior === 'feed' && site) {
      const dx = course.x - site.x;
      const dz = course.z - site.z;
      const d = Math.hypot(dx, dz);
      if (feedStart === null) {
        course.aim = site;
        goalSpeed = lerp(1.8, Math.max(goalSpeed, 6.5), smoothstep(25, 110, d));
        goalDepth = lerp(site.y, goalDepth, smoothstep(40, 160, d));
      } else {
        goalDepth = site.y;
        if (lunge) {
          // Pursue the centre: the turn limit swings the whale back through the swarm in loops.
          course.aim = site;
          goalSpeed = 3.4;
        } else {
          const a = Math.atan2(dz, dx) + circleDir * 0.7;
          const r = site.radius + 3;
          course.aim = { x: site.x + Math.cos(a) * r, z: site.z + Math.sin(a) * r };
          goalSpeed = 1.6;
        }
      }
    }
    motion.floor = floorAt?.(course.x, course.z);
    if (floorAt) {
      // Read the floor a few seconds ahead too, so a fast whale rises over a slope in time.
      const fwd = whaleForward(course.heading);
      let floor = motion.floor ?? -Infinity;
      for (const ahead of [2, 4, 8]) floor = Math.max(floor, floorAt(course.x + fwd.x * speed * ahead, course.z + fwd.z * speed * ahead));
      if (Number.isFinite(floor)) goalDepth = Math.max(goalDepth, floor + FLOOR_CLEARANCE + 1);
    }
    goalDepth = Math.min(goalDepth, SWIM_Y);

    // Speed eases toward a smoothed goal with bounded acceleration.
    speedGoal = damp(speedGoal, goalSpeed, 0.6, dt);
    if (forced) speed = 0;
    else speed += clamp((speedGoal - speed) * 0.5, -MAX_DECEL, MAX_ACCEL) * dt;

    const before = course.heading;
    if (!forced) {
      course.speed = speed;
      pilot.step(course, dt, time, shore);
    }
    bank = damp(bank, clamp((shortestAngle(before, course.heading) / dt) * speed * 0.12, -0.45, 0.45), 1.5, dt);

    // Posed segments play in order; between them the whale cruises.
    let phase: WhalePhase;
    let phaseT: number;
    if (seg && seg.t >= seg.len) {
      seg = queue.shift() ?? null;
      if (!seg) {
        forced = false;
        springSet(depth, motion.pose.y);
        if (behavior === 'breathe') {
          behavior = 'travel';
          nextBreath = time + jitter(BREATH_MIN, BREATH_MAX);
          nextFeed = time + jitter(5, 25);
        }
      }
    } else if (!seg && queue.length) seg = queue.shift()!;
    if (seg) {
      seg.t += dt;
      phase = seg.phase;
      phaseT = clamp(seg.t / seg.len, 0, 1);
      whalePose(phase, phaseT, target);
    } else {
      springStep(depth, goalDepth, 0.35, dt);
      const next: WhalePhase = depth.x < -3.5 ? 'deep' : depth.x > -2.8 ? 'swim' : label === 'deep' ? 'deep' : 'swim';
      if (next !== label) labelT = 0;
      labelT += dt;
      phase = next;
      phaseT = clamp(labelT / PHASE_LEN[phase], 0, 1);
      cruisePose(target);
    }
    // A change of pose source eases out through the offset instead of jumping.
    if (seg !== source) for (const key of POSE_KEYS) offset[key] = motion.pose[key] - target[key];
    source = seg;
    label = phase;
    const fade = Math.exp(-1.1 * dt);
    for (const key of POSE_KEYS) {
      offset[key] *= fade;
      motion.pose[key] = target[key] + offset[key];
    }

    if (motion.pose.surge !== 0) {
      // Breach carries the whale forward along its heading, even in a forced review.
      const fwd = whaleForward(course.heading);
      course.x += fwd.x * motion.pose.surge * dt;
      course.z += fwd.z * motion.pose.surge * dt;
    }
    motion.x = course.x;
    motion.z = course.z;
    motion.heading = course.heading;
    motion.speed = speed + motion.pose.surge;
    motion.behavior = behavior;
    motion.phase = phase;
    motion.phaseT = phaseT;
    motion.site = site;
  }

  return {
    motion,
    step,
    force(phase, t) {
      forced = true;
      queue.length = 0;
      seg = { phase, len: PHASE_LEN[phase], t: PHASE_LEN[phase] * t };
      source = seg;
      site = null;
      feedStart = null;
      behavior = 'travel';
      breathing = false;
      speed = 0;
      label = phase;
      whalePose(phase, t, motion.pose);
      for (const key of POSE_KEYS) offset[key] = 0;
      motion.phase = phase;
      motion.phaseT = t;
      motion.speed = 0;
      motion.behavior = behavior;
      motion.site = null;
    },
  };
}
