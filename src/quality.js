export function createQuality({ mobile = false, dpr = 1, maxDpr, minDpr, targetFPS } = {}) {
  const maximum = Math.min(dpr, maxDpr ?? (mobile ? 1.25 : 1.75));
  return { mobile, maximum, minimum: Math.min(maximum, minDpr ?? 0.65), ratio: maximum,
    average: 1000 / (targetFPS ?? (mobile ? 30 : 60)), target: 1000 / (targetFPS ?? (mobile ? 30 : 60)), samples: 0, cooldown: 0 };
}

export function updateQuality(state, milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 2000) return false;
  state.average += (milliseconds - state.average) * 0.035;
  if (state.cooldown > 0) { state.cooldown -= milliseconds; return false; }
  state.samples += milliseconds;
  if (state.samples < 3000) return false;
  state.samples = 0;
  const previous = state.ratio;
  if (state.average > state.target * 1.3) state.ratio = Math.max(state.minimum, state.ratio - 0.15);
  else if (state.average < state.target * 1.08) state.ratio = Math.min(state.maximum, state.ratio + 0.05);
  if (previous !== state.ratio) { state.cooldown = 3000; return true; }
  return false;
}
