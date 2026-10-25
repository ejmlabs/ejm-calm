import { angleDelta, clamp, damp, distance, forward, normalize } from './math.js';

export function createFlight(saved) {
  return saved ? { ...saved, position: [...saved.position], target: null, targetTime: 0, manual: 0, turn: 0 } : {
    position: [0, 0, 350], yaw: 0, pitch: 0.025, roll: 0, speed: 22, time: 0,
    target: null, targetTime: 0, manual: 0, turn: 0,
  };
}

export function steerFlight(state, yaw, pitch) {
  state.yaw += clamp(yaw, -0.35, 0.35);
  state.pitch = clamp(state.pitch + clamp(pitch, -0.2, 0.2), -0.85, 0.85);
  state.manual = 5;
}

export function stepFlight(state, elapsed, interests = [], obstacles = [], settings = {}) {
  const dt = clamp(Number.isFinite(elapsed) ? elapsed : 0, 0, 0.1);
  const cruise = clamp(settings.speed ?? 22, 4, 90);
  const interestRange = settings.interest?.nebulaCore?.falloff ?? 16000;
  state.time += dt; state.targetTime -= dt; state.manual = Math.max(0, state.manual - dt);
  const facing = forward(state.yaw, state.pitch);
  if (state.targetTime <= 0 || !state.target || distance(state.position, state.target) < 280) {
    let best = null, score = -Infinity;
    const light = settings.lightDirection;
    for (const interest of interests) {
      const gap = distance(state.position, interest.position);
      if (gap < (interest.radius ?? 0) + 280 || gap > interestRange) continue;
      const direction = normalize(interest.position.map((n, i) => n - state.position[i]));
      const alignment = direction.reduce((sum, n, i) => sum + n * facing[i], 0);
      let lighting = 0;
      if (light && interest.radius) {
        const approach = normalize(interest.position.map((n, i) => n - state.position[i]));
        const angle = Math.acos(clamp(approach.reduce((sum, n, i) => sum + n * light[i], 0), -1, 1)) * 180 / Math.PI;
        lighting = angle >= 60 && angle <= 120 ? 1.2 : angle >= 45 && angle <= 135 ? 0.4 : -0.35;
      }
      const ringBonus = interest.rings ? 0.35 : 0;
      const value = alignment * 3 - gap / interestRange + lighting + ringBonus;
      if (alignment > 0.15 && value > score) { score = value; best = interest; }
    }
    const lift = best?.rings ? Math.max(110, (best.radius ?? 100) * 0.22) : 80;
    state.target = best ? best.position.map((n, i) => n + (i === 0 ? (best.rings ? best.radius * best.ring.outer : best.radius ?? 100) * 2.4 + 180 : i === 1 ? lift : 0)) :
      state.position.map((n, i) => n + facing[i] * 2200 + (i === 1 ? Math.sin(state.time * 0.017) * 150 : 0));
    state.targetTime = settings.retarget?.everySeconds?.[0] ?? 28;
  }
  const direction = normalize(state.target.map((n, i) => n - state.position[i]));
  let avoiding = false;
  for (const body of obstacles) {
    const offset = state.position.map((n, i) => n - body.position[i]);
    const gap = Math.hypot(...offset);
    const extent = body.clearanceRadius ?? (body.rings ? body.radius * body.ring.outer : body.radius);
    const safe = extent * (body.type ? (settings.passClearance ?? 1.7) : 1) + 70;
    const lookAhead = safe + cruise * 14;
    if (gap > lookAhead) continue;
    const away = gap > 1e-6 ? offset.map((n) => n / gap) : [1, 0.3, 0];
    const ahead = -away.reduce((sum, n, i) => sum + n * facing[i], 0);
    if (ahead < 0 && gap > safe * 1.3) continue;
    const weight = clamp((lookAhead - gap) / (lookAhead - safe), 0, 3);
    for (let i = 0; i < 3; i++) direction[i] += away[i] * weight * 2.5;
    // A lateral bias resolves a perfectly head-on approach before reaching the body.
    direction[0] += -facing[2] * weight * 0.8;
    direction[2] += facing[0] * weight * 0.8;
    avoiding = true;
  }
  const desired = normalize(direction);
  const authority = avoiding ? 1 : 1 - clamp(state.manual / 5, 0, 1);
  const turnRate = avoiding ? 0.3 : (settings.turnRate ?? 0.045);
  const turn = clamp(angleDelta(state.yaw, Math.atan2(desired[0], -desired[2])), -turnRate * dt, turnRate * dt) * authority;
  state.yaw = Math.atan2(Math.sin(state.yaw + turn), Math.cos(state.yaw + turn));
  state.pitch += clamp(Math.asin(clamp(desired[1], -1, 1)) - state.pitch, -turnRate * dt * 0.5, turnRate * dt * 0.5) * authority;
  state.pitch = clamp(state.pitch, -0.85, 0.85);
  state.turn = damp(state.turn, dt ? turn / dt : 0, 2, dt);
  state.roll = damp(state.roll, clamp(-state.turn * 2.2, -0.3, 0.3), 2, dt);
  state.speed = damp(state.speed, avoiding ? cruise * 0.65 : cruise, 0.5, dt);
  const travel = forward(state.yaw, state.pitch);
  state.position = state.position.map((n, i) => n + travel[i] * state.speed * dt);
  for (const body of obstacles) {
    const gap = distance(state.position, body.position), minimum = (body.clearanceRadius ?? (body.rings ? body.radius * body.ring.outer : body.radius)) + 18;
    if (gap < minimum) {
      const away = gap > 1e-6 ? state.position.map((n, i) => (n - body.position[i]) / gap) : [1, 0, 0];
      state.position = body.position.map((n, i) => n + away[i] * minimum);
    }
  }
  return state;
}
