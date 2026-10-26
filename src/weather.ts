import { hash } from './rng.js';
import type { RegionWeights } from './regions.js';

export type WeatherState = 'clear' | 'hazy' | 'overcast';

/** What a weather state sets, as multipliers or fractions of the sky's own values. */
export type WeatherLook = {
  /** Cloud cover and density, as absolute values for the sky shader. */
  coverage: number;
  density: number;
  /** Multiplies the sea fog's density and the land haze. */
  fog: number;
  haze: number;
  /** Multiplies the sun's light; the sky's own light (hemisphere, ambient) is lifted a little when the sun is veiled. */
  sun: number;
  /** How far fog and haze colours are pulled toward a grey of their own brightness. */
  grey: number;
};

export const WEATHER: Record<WeatherState, WeatherLook> = {
  clear: { coverage: 0.17, density: 0.15, fog: 1, haze: 1, sun: 1, grey: 0 },
  hazy: { coverage: 0.34, density: 0.2, fog: 1.7, haze: 1.2, sun: 0.78, grey: 0.12 },
  overcast: { coverage: 0.82, density: 0.45, fog: 1.25, haze: 1.05, sun: 0.38, grey: 0.5 },
};

export const WEATHER_STATES: readonly WeatherState[] = ['clear', 'hazy', 'overcast'];

/** Seconds a weather choice holds before the next is drawn. */
export const WEATHER_SLOT = 300;
/** Seconds a full change from one state to another takes (at least a minute). */
export const WEATHER_CHANGE = 90;

/** Chance of clear, hazy, overcast in each region (temperate, tropical, polar, deep blue). */
const ODDS: ReadonlyArray<readonly [number, number, number]> = [
  [0.5, 0.25, 0.25],
  [0.55, 0.35, 0.1],
  [0.2, 0.25, 0.55],
  [0.6, 0.2, 0.2],
];

/** The weather drawn for a slot (300 s of time) in a place with these region weights. The first slot is always clear, as the opening is composed. */
export function weatherFor(seed: number, slot: number, weights: RegionWeights): WeatherState {
  if (slot <= 0) return 'clear';
  const roll = hash(seed, 5003, slot) / 0x100000000;
  const odds = [0, 0, 0];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) odds[k]! += weights[r]! * ODDS[r]![k]!;
  return roll < odds[0]! ? 'clear' : roll < odds[0]! + odds[1]! ? 'hazy' : 'overcast';
}

export type Weather = {
  /** The look right now, blended between the states; moved by `update`. */
  readonly look: WeatherLook;
  /** The state it is heading for. */
  target: () => WeatherState;
  /** `clock` is seconds of the experience; `weights` the region blend where the whale is. */
  update: (dt: number, clock: number, weights: RegionWeights) => WeatherLook;
  /** Jump to a state and hold it (review shots). */
  set: (state: WeatherState) => void;
};

/** Clear, hazy and overcast, drawn per 300 s slot from the region; the look eases over 90 s so nothing jumps. */
export function createWeather(seed: number, cover = WEATHER.clear.coverage): Weather {
  // Blend weights of the three states, moving toward the target's one-hot at 1/90 per second.
  const mix = [1, 0, 0];
  const look: WeatherLook = { ...WEATHER.clear, coverage: cover };
  let target: WeatherState = 'clear';
  let lastSlot = -1;
  let forced: WeatherState | null = null;

  function apply(): void {
    // The seed's own clear-sky cover stands in for the clear state.
    const clearCover = cover;
    let coverage = 0;
    let density = 0;
    let fog = 0;
    let haze = 0;
    let sun = 0;
    let grey = 0;
    WEATHER_STATES.forEach((state, k) => {
      const w = WEATHER[state];
      const m = mix[k]!;
      coverage += m * (state === 'clear' ? clearCover : w.coverage);
      density += m * w.density;
      fog += m * w.fog;
      haze += m * w.haze;
      sun += m * w.sun;
      grey += m * w.grey;
    });
    Object.assign(look, { coverage, density, fog, haze, sun, grey });
  }

  return {
    look,
    target: () => target,
    update(dt, clock, weights) {
      const slot = Math.floor(clock / WEATHER_SLOT);
      if (slot !== lastSlot) {
        lastSlot = slot;
        target = forced ?? weatherFor(seed, slot, weights);
      }
      const step = dt / WEATHER_CHANGE;
      WEATHER_STATES.forEach((state, k) => {
        const goal = state === target ? 1 : 0;
        mix[k] = goal > mix[k]! ? Math.min(goal, mix[k]! + step) : Math.max(goal, mix[k]! - step);
      });
      // Two states leaving while one arrives would otherwise dim the sum.
      const total = mix[0]! + mix[1]! + mix[2]!;
      for (let k = 0; k < 3; k++) mix[k] = mix[k]! / total;
      apply();
      return look;
    },
    set(state) {
      forced = state;
      target = state;
      WEATHER_STATES.forEach((s, k) => (mix[k] = s === state ? 1 : 0));
      apply();
    },
  };
}
