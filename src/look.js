// Art direction as plain data. The engine reads this; nothing here touches the DOM or WebGL.
// See .orch/DESIGN.md for the intent behind every number.
//
// Conventions
// - Distance unit: 1 = one ship length. Speeds in units per second, angles in degrees,
//   times in seconds unless the key says otherwise (…Min = minutes).
// - Colors are sRGB hex strings; convert to linear before lighting.
// - Ranges are [min, max]; pick uniformly from the seeded RNG unless a comment says otherwise.

export const UNIT = { shipLength: 1 };

// The three moods the voyage drifts through. A low-frequency 3D noise over ship position picks
// weights (see `regionField`); every color below is blended by those weights, never switched.
export const REGIONS = {
  tidepool: {
    label: 'Tidepool', // the default: cool, clear, gently blue
    sky: { deep: '#060a17', horizon: '#0b1530', band: '#1a2a4d' }, // sky dome gradient + faint galactic band
    starTint: ['#cfe0ff', '#eaf1ff', '#fff6e8', '#a9c6ff'], // weighted toward the first two
    nebula: { core: '#7fd6d2', mid: '#3c6fb4', edge: '#3a2a6e', opacity: 0.36 },
    keyLight: { color: '#f4f1ea', intensity: 1.0 },
    fill: { color: '#2a3f6b', intensity: 0.22 },
    rim: { color: '#7fb8e6', intensity: 0.5 },
    dust: '#9fb8d8',
  },
  ember: {
    label: 'Ember Reach', // warm, dusty, older stars, rose and amber clouds
    sky: { deep: '#0c0710', horizon: '#1d0f1c', band: '#3a1f2a' },
    starTint: ['#ffe2c2', '#ffd0a0', '#fff4e6', '#ffb88a'],
    nebula: { core: '#ffc48a', mid: '#d0606e', edge: '#4a1f45', opacity: 0.42 },
    keyLight: { color: '#ffe3c4', intensity: 1.05 },
    fill: { color: '#4a2633', intensity: 0.24 },
    rim: { color: '#ff9e7a', intensity: 0.5 },
    dust: '#d8b49f',
  },
  hollow: {
    label: 'Hollow', // the quiet void: sparse, darkest, distant galaxies own the sky
    sky: { deep: '#04050a', horizon: '#080a14', band: '#11141f' },
    starTint: ['#e8ecf5', '#ffffff', '#d4dcf0', '#f5efe4'],
    nebula: { core: '#b9c2d6', mid: '#4b5570', edge: '#1a1d2b', opacity: 0.14 },
    keyLight: { color: '#e9ecf2', intensity: 0.9 },
    fill: { color: '#1a1f2e', intensity: 0.16 },
    rim: { color: '#aab6d0', intensity: 0.4 },
    dust: '#a0a8b8',
  },
};

// How regions blend. weight_i = smoothstep over a 3D fbm sampled at shipPos / scale with a
// per-region offset; normalise so weights sum to 1. Transitions take a few minutes of flight.
export const regionField = {
  scale: 26000, // units per noise period; ~45 min of cruise to cross one full feature
  octaves: 2,
  sharpness: 2.2, // exponent on weights before normalising; higher = purer regions, shorter blends
  bias: { tidepool: 0.15, ember: 0.0, hollow: -0.12 }, // tidepool most common, hollow least
  blendSeconds: 4, // extra temporal smoothing on the blended palette so nothing pops
};

// Stars. Three layers give parallax: a sky shell at infinity, real 3D stars in cells, and near dust.
export const stars = {
  shell: {
    // points on a camera-centred sphere; no parallax, rotates with nothing
    count: { high: 7000, medium: 4500, low: 2600 },
    sizePx: [0.6, 1.6], // at DPR 1; power-law: most stars near min
    sizeExponent: 3.0,
    brightness: [0.25, 1.0],
    bandBoost: 2.4, // density multiplier inside the galactic band
    bandWidthDeg: 14,
    twinkle: 0.0, // no twinkle in vacuum; keep the sky still
  },
  field: {
    // per-cell 3D stars; parallax is visible over minutes, not seconds
    cellSize: 2400,
    perCell: { high: 180, medium: 120, low: 70 },
    viewRadius: 9000,
    sizePx: [1.0, 2.6],
    halo: { chance: 0.04, sizePx: [10, 26], intensity: 0.35 }, // the few bright ones get a soft sprite glow
    fadeNear: 300, // fade in from 0 at this distance so nothing pops into the chase view
  },
  dust: {
    // motes in a box that wraps around the ship; the main cue of motion
    box: 90,
    count: { high: 700, medium: 450, low: 260 },
    sizePx: [0.8, 1.8],
    alpha: 0.28,
    streak: 0.6, // stretch along velocity, in units at cruise speed; 0 disables
    fadeEdge: 0.25, // fraction of box over which motes fade at the wrap edges
  },
};

// Sky: a deep gradient dome (never pure black) plus a faint galactic band in the region's band color.
export const sky = {
  bandTiltDeg: 62, // the band's great circle tilt vs the world's up; fixed per seed ± bandJitterDeg
  bandJitterDeg: 20,
  bandOpacity: 0.22,
  bandNoiseScale: 3.0,
  grainAmount: 0.012, // dithering noise added in the final pass to kill banding in dark gradients
};

// Nebulae: few, huge, soft. Built from 3–6 overlapping camera-facing fbm billboards (or a volume
// impostor) per nebula; colors come from the blended region (core → mid → edge by density).
export const nebula = {
  cellSize: 30000,
  chancePerCell: 0.55,
  radius: [6000, 18000],
  puffs: { high: 6, medium: 4, low: 3 },
  softness: 0.75, // 0 = crisp filaments, 1 = pure haze
  filamentScale: 2.6, // fbm frequency across one puff
  octaves: { high: 5, medium: 4, low: 3 },
  drift: 0.003, // internal noise time scale; slow enough to read as still
  coreGlow: { chance: 0.35, color: '#fff3e2', size: 0.12, intensity: 0.5 }, // an embedded young star
  nearFade: [800, 3000], // fade opacity to 0 as the camera gets within this range of a puff, so passing through is a gentle haze, not a wall
  passThroughEveryMin: [10, 18], // how often the route grazes a nebula's outskirts
};

// Planets. A planet is the main event of most minutes; most of the time one is visible somewhere,
// and a close pass happens every few minutes.
export const planets = {
  closePassEveryMin: [4, 7],
  radius: [260, 1600],
  passClearance: 1.7, // autopilot keeps at least radius × this (ring outer radius if ringed)
  types: {
    rocky: {
      weight: 0.26,
      palette: ['#8a7a6a', '#b39c82', '#5e544c', '#d6c2a4'],
      atmosphere: { color: '#c9b8a4', thickness: 0.015, intensity: 0.35 },
      surface: 'craters+fbm',
    },
    ocean: {
      weight: 0.18,
      palette: ['#1d4e7a', '#2f7fa8', '#e9f1f4', '#6e8f5a'], // deep, shallow, cloud, land
      atmosphere: { color: '#8cc8ff', thickness: 0.035, intensity: 0.9 },
      surface: 'continents+clouds',
    },
    gas: {
      weight: 0.3,
      palette: ['#d9b38c', '#a8714e', '#f1e1c6', '#7a5643'], // banded; alt palette below
      altPalette: ['#9fb6d9', '#5d7bb0', '#e4ecf6', '#3d4f7a'],
      atmosphere: { color: '#f2d6b0', thickness: 0.03, intensity: 0.6 },
      surface: 'bands+storms',
      bands: [6, 14],
      turbulence: 0.35,
    },
    ice: {
      weight: 0.18,
      palette: ['#cfe3ee', '#9cc0d6', '#f4fbff', '#6f93ad'],
      atmosphere: { color: '#d8f0ff', thickness: 0.025, intensity: 0.7 },
      surface: 'cracks+fbm',
    },
    ember: {
      weight: 0.08, // rare: a dark world with faint glowing seams on its night side
      palette: ['#2a1d1a', '#4a2c22', '#1a1412', '#ff7a3a'], // last = emissive seams
      atmosphere: { color: '#ff9a6a', thickness: 0.02, intensity: 0.4 },
      surface: 'seams',
      emissive: 0.6,
    },
  },
  // Regions lean the type mix: multiply weights, then renormalise.
  regionTypeBias: {
    tidepool: { ocean: 1.4, ice: 1.3 },
    ember: { gas: 1.3, rocky: 1.2, ember: 2.0 },
    hollow: { ice: 1.4, rocky: 1.2, ember: 0.5 },
  },
  terminatorSoftness: 0.12, // wrap of the day/night edge
  nightSide: 0.04, // ambient on the dark side, tinted by region fill
  spinPeriod: [600, 2400], // seconds per turn; barely perceptible
  rings: {
    chance: { gas: 0.55, ice: 0.3, rocky: 0.08, ocean: 0.04, ember: 0.05 },
    inner: [1.35, 1.7], // × planet radius
    outer: [2.0, 2.8],
    tiltDeg: [-28, 28],
    palette: ['#d8c9b0', '#a89a86', '#efe6d6', '#7d7466'],
    opacity: [0.35, 0.7],
    bands: [8, 22], // concentric gaps/bands from 1D noise
    shadow: true, // planet shadow on rings and ring shadow on planet; skip on low
  },
  moons: {
    count: [0, 3], // weighted: 0 (35%), 1 (35%), 2 (20%), 3 (10%)
    countWeights: [0.35, 0.35, 0.2, 0.1],
    radius: [0.06, 0.22], // × planet radius
    orbit: [2.6, 6.0], // × planet radius, outside rings
    palette: ['#9a958e', '#c8c2b8', '#6d6862', '#b8a68e'],
    orbitPeriod: [900, 3600], // slow; a moon visibly moves only over minutes
  },
};

// Asteroid fields: a belt-shaped volume the route occasionally crosses; the ship threads a lane.
export const asteroids = {
  crossEveryMin: [8, 14],
  crossingSeconds: [40, 75],
  field: { length: [1200, 2400], width: [500, 900], thickness: [120, 260] },
  count: { high: 1400, medium: 800, low: 400 }, // instanced, one draw call per LOD
  size: [0.4, 14], // power-law: most are pebbles, a handful are boulders
  sizeExponent: 2.6,
  shape: { baseDetail: 1, displacement: 0.35, flatten: [0.6, 1.0] }, // icosahedron, noise-displaced, squashed
  palette: ['#6b625a', '#8a8076', '#4d4743', '#a39683', '#5c5450'],
  roughness: 0.95,
  metalness: 0.0,
  tumble: [0.01, 0.12], // rad/s
  lane: { width: 70, clearance: 12 }, // a clear corridor through the field; keep every rock this far from the ship path
  speedFactor: 0.7, // autopilot slows while inside
  fadeDistance: [900, 1600], // rocks fade in over this range
};

// Distant galaxies: billboards on the sky shell (no parallax), always 2–4 in view somewhere.
export const galaxies = {
  visible: [2, 4],
  hollowBonus: 2, // extra galaxies while hollow dominates
  angularSizeDeg: [1.4, 6.0],
  kinds: { spiral: 0.55, elliptical: 0.25, edgeOn: 0.2 },
  core: ['#ffe8c8', '#fff2dc'],
  arms: ['#b8ccff', '#d6e2ff', '#e8d6ff'],
  dust: '#2a1a14', // dark lane on edge-on discs
  opacity: [0.35, 0.8],
  armsCount: [2, 4],
  twist: [2.5, 5.0],
};

// Rare events: one at a time, never announced, never more often than this.
export const rare = {
  minGapMin: 12,
  events: {
    comet: {
      everyMin: [20, 35],
      headColor: '#f2fbff',
      ionTail: '#7fc4ff', // straight, away from key light
      dustTail: '#ffe1b8', // curved, broader
      tailLength: [900, 2200],
      passDistance: [400, 1500],
    },
    binary: {
      everyMin: [40, 60],
      colors: [['#ffd29a', '#9cc4ff'], ['#fff1d6', '#ff9a7a']],
      orbitPeriod: 50, // seconds; the pair visibly circles
      glow: 0.9,
      distance: [6000, 12000],
    },
    pulsar: {
      everyMin: [80, 120],
      color: '#cfe6ff',
      beamPeriod: 7, // seconds per sweep; slow, not strobing
      beamOpacity: 0.22,
      distance: [8000, 16000],
    },
  },
};

// The ship: a small courier built from lathe + extrude primitives. All dimensions × shipLength.
export const ship = {
  hull: {
    // lathe profile along +Z (nose) → −Z (tail): [z, radius]
    profile: [
      [0.5, 0.0],
      [0.42, 0.035],
      [0.3, 0.075],
      [0.1, 0.1],
      [-0.15, 0.105],
      [-0.35, 0.09],
      [-0.48, 0.07],
      [-0.5, 0.055],
    ],
    segments: { high: 24, medium: 18, low: 12 },
    squash: [1.0, 0.78], // [x, y] scale of the cross-section: a little wider than tall
    color: '#e6e0d3', // warm ivory
    roughness: 0.42,
    metalness: 0.15,
  },
  panels: { color: '#3a3f47', roughness: 0.6, metalness: 0.3 }, // graphite belly + wing roots
  accent: { color: '#c47a4a', stripeZ: [-0.05, 0.02] }, // a thin copper band around the hull
  canopy: {
    center: [0, 0.06, 0.18],
    size: [0.07, 0.045, 0.16], // ellipsoid radii
    color: '#1c2a38',
    glow: '#ffcf8a', // faint warm interior, emissive 0.15
    glowIntensity: 0.15,
  },
  wings: {
    // flat swept delta, slight dihedral; extruded outline in the XZ plane (one side, mirrored)
    outline: [
      [0.08, 0.12],
      [0.46, -0.28],
      [0.48, -0.38],
      [0.08, -0.36],
    ],
    thickness: 0.018,
    dihedralDeg: 6,
    y: -0.02,
    color: 'panels', // uses panels; tips use accent
    tipAccent: 0.06, // span fraction at the tip painted accent
  },
  fin: {
    outline: [
      [0, -0.18],
      [0.16, -0.42],
      [0.16, -0.48],
      [0, -0.46],
    ], // [y, z]
    thickness: 0.014,
    color: 'hull',
  },
  nacelles: {
    // twin engine pods under the wing roots
    x: 0.14,
    y: -0.045,
    z: [-0.48, -0.12],
    radius: 0.04,
    color: 'panels',
  },
  engine: {
    color: '#9fe3ff', // cyan-white core
    outer: '#4f8cff',
    nozzleRadius: 0.032,
    plumeLength: [0.22, 0.4], // scales with throttle; additive cone + soft sprite
    flickerAmp: 0.04, // very subtle, slow (2–3 Hz noise, not random per frame)
    spriteSizePx: 30,
    lightIntensity: 0.6, // a small point light behind the ship, high tier only
  },
  navLights: {
    port: { pos: [-0.47, -0.02, -0.36], color: '#ff4a3d' },
    starboard: { pos: [0.47, -0.02, -0.36], color: '#3dff8a' },
    tail: { pos: [0, 0.16, -0.47], color: '#ffffff', blinkPeriod: 2.6, blinkOn: 0.12 }, // brief soft blink
    spriteSizePx: 7,
    intensity: 0.7,
  },
  motion: {
    bankPerTurnRate: 4.0, // degrees of roll per degree/s of yaw rate
    maxBankDeg: 22,
    bankTau: 1.1, // seconds; roll follows turn with this lag
    pitchTau: 0.9,
    bob: { amplitude: 0.015, period: 7.5 }, // gentle vertical float, × shipLength
    sway: { amplitudeDeg: 0.6, period: 11 }, // tiny roll breathing on top of banking
  },
};

// Camera: rigid third-person chase. Orbit offsets are the viewer's and are never undone.
export const camera = {
  fovDeg: { landscape: 52, portrait: 64 }, // portrait = aspect < 1
  near: 0.05,
  far: 60000, // shell stars, sky and galaxies are drawn camera-relative and ignore far
  distance: 5.5, // behind the ship, × shipLength
  height: 1.3, // above the ship's up axis
  lookAhead: 1.8, // aim point in front of the ship
  zoom: { min: 2.2, max: 26, wheelStep: 1.1, pinchGain: 1.0, damping: 0.18 },
  orbit: {
    yawUnlimited: true,
    pitchDeg: [-55, 70], // relative to the chase pitch
    dragSpeedDegPerPx: 0.25,
    damping: 0.12, // seconds-ish smoothing on drag input, not on the result
  },
  follow: {
    // the rig is attached to the ship; only rotation is lightly smoothed so banking reads
    headingTau: 0.45, // camera yaw/pitch lag behind the ship's heading
    rollFollow: 0.25, // fraction of ship bank the horizon follows; most bank shows on the ship
    positionTau: 0, // 0 = rigid
  },
  recenter: false, // never
};

// Flight and autopilot pacing.
export const flight = {
  cruise: 8, // units/s; ~8 ship lengths per second
  speedRange: [5, 11], // autopilot eases inside this; slower near beauty, faster in hollow
  speedTau: 6, // seconds to ease between speeds
  turnRateMaxDeg: 4, // deg/s; a full about-face takes ~45 s
  turnAccelDeg: 0.8, // deg/s² cap on changes of turn rate
  climbMaxDeg: 22, // pitch limits for autopilot (viewer steering may go to ±60)
  steerMaxDeg: 60,
  retarget: { everySeconds: [45, 120], dwellOnBeauty: [20, 50] },
  // Scored candidates: score = weight × appeal ÷ (1 + distance / falloff) × novelty
  interest: {
    planet: { weight: 1.0, falloff: 6000 },
    ringedPlanet: { weight: 1.4, falloff: 8000 },
    nebulaCore: { weight: 0.9, falloff: 16000 },
    galaxy: { weight: 0.5, falloff: Infinity }, // direction only
    rare: { weight: 1.6, falloff: 12000 },
    noveltyHalfLifeSeconds: 600, // recently visited kinds score lower
  },
  approach: { flybyOffset: [1.9, 3.2] }, // aim beside the target (× radius), never at it
  nudge: { turnDeg: 18, climbDeg: 10, fadeSeconds: 4 }, // arrow keys
  steerReturnSeconds: 6, // after viewer steering stops, hand back to autopilot over this
};

// Light, tone and glow.
export const grade = {
  toneMapping: 'ACESFilmic',
  exposure: 1.0,
  saturation: 0.95,
  lift: '#05070d', // added to shadows so blacks are ink, not void
  vignette: { amount: 0.18, softness: 0.55 },
  bloom: { threshold: 0.82, strength: 0.32, radius: 0.5, resolution: 0.5 }, // high tier only
  glowSprites: true, // all tiers: stars, engine, nav lights and suns carry additive halos
};

// Quality tiers. Pick at start from device hints, then adapt on frame time.
export const quality = {
  tiers: {
    high: { dprCap: 2.0, bloom: true, ringShadows: true, engineLight: true, nebulaRes: 1.0 },
    medium: { dprCap: 1.5, bloom: false, ringShadows: true, engineLight: false, nebulaRes: 0.75 },
    low: { dprCap: 1.25, bloom: false, ringShadows: false, engineLight: false, nebulaRes: 0.5 },
  },
  startTier: { coarsePointer: 'low', default: 'high' },
  adapt: {
    targetFrameMs: 16.7,
    downAfterMs: 22, // sustained over window → step resolution down
    upBelowMs: 12,
    windowSeconds: 3,
    resolutionSteps: [1.0, 0.85, 0.7, 0.55],
  },
  hiddenFps: 0, // stop rendering while document is hidden
  batteryFpsCap: 30, // when the platform hints at low power / saving mode
};

// UI timings the shell uses.
export const ui = {
  veilFadeSeconds: 2.0,
  gateFadeSeconds: 1.4,
  idleDimSeconds: 4,
  copiedToastSeconds: 2.2,
  defaultVolume: 0.5,
};

export default { UNIT, REGIONS, regionField, stars, sky, nebula, planets, asteroids, galaxies, rare, ship, camera, flight, grade, quality, ui };
