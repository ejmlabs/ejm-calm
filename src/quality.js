export function selectQualityTier({ mobile = false, software = false, cores = 8, memory = 8 } = {}) {
  if (mobile || software) return 'low';
  return cores <= 4 || memory <= 4 ? 'medium' : 'high';
}
const names = ['low', 'medium', 'high'];
const caps = { high: 2, medium: 1.5, low: 1.25 };
export function createQuality({ mobile = false, dpr = 1, maxDpr, minDpr, targetFPS, software = false, cores, memory } = {}) {
  const tier = selectQualityTier({ mobile, software, cores, memory });
  const maximum = Math.min(dpr, maxDpr ?? caps[tier]);
  return { mobile, maximum, minimum: Math.min(maximum, minDpr ?? 0.65), ratio: maximum,
    average: 1000 / (targetFPS ?? (mobile ? 30 : 60)), target: 1000 / (targetFPS ?? (mobile ? 30 : 60)), samples: 0, cooldown: 0,
    dpr, tier, initialTier: tier, software, nebulaLevel: software ? 4 : 0, passWindows: {}, changed: null };
}

export function observePassQuality(state, name, milliseconds, elapsed, budget) {
  if (!Number.isFinite(milliseconds) || state.cooldown > 0) return false;
  state.passWindows[name] = milliseconds > budget ? (state.passWindows[name] ?? 0) + elapsed : Math.max(0, (state.passWindows[name] ?? 0) - elapsed);
  if (state.passWindows[name] < 3000) return false;
  state.passWindows[name] = 0;
  if (name === 'nebula' && state.nebulaLevel < 4) { state.nebulaLevel++; state.changed = 'nebula'; state.cooldown = 3000; return true; }
  return false;
}

export function updateQuality(state, milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 2000) return false;
  state.average += (milliseconds - state.average) * 0.035;
  if (state.cooldown > 0) { state.cooldown -= milliseconds; return false; }
  state.samples += milliseconds;
  if (state.samples < 3000) return false;
  state.samples = 0;
  const previous = state.ratio;
  state.changed = null;
  if (state.average > state.target * 1.3) {
    if (state.hasNebula && state.nebulaLevel < 4) { state.nebulaLevel++; state.changed = 'nebula'; }
    else if (state.tier !== 'low') {
      state.tier = names[names.indexOf(state.tier) - 1]; state.maximum = Math.min(state.dpr, caps[state.tier]); state.ratio = Math.min(state.ratio, state.maximum); state.changed = 'tier';
    } else state.ratio = Math.max(state.minimum, state.ratio - 0.15);
  } else if (state.average < state.target * 1.08) {
    state.ratio = Math.min(state.maximum, state.ratio + 0.05);
    if (state.ratio === previous && state.tier !== state.initialTier) {
      state.tier = names[names.indexOf(state.tier) + 1]; state.maximum = Math.min(state.dpr, caps[state.tier]); state.changed = 'tier';
    } else if (state.ratio === previous && state.nebulaLevel > 0 && !state.software) { state.nebulaLevel--; state.changed = 'nebula'; }
  }
  if (previous !== state.ratio || state.changed) { state.cooldown = 3000; return true; }
  return false;
}
