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

// ---------------------------------------------------------------------------------------------
// Realism targets (phase 3). See .orch/REALISM.md. Everything above stays valid; these are
// additions the engine adopts as it moves to physically based, HDR rendering.
// ---------------------------------------------------------------------------------------------

// Blackbody color ramp, sRGB, normalised to the brightest channel. Interpolate in linear space.
export const blackbody = [
  [2500, '#ffa148'],
  [3000, '#ffb46b'],
  [3500, '#ffc489'],
  [4000, '#ffd1a3'],
  [4500, '#ffdbba'],
  [5000, '#ffe4ce'],
  [5500, '#ffecdf'],
  [6000, '#fff3ef'],
  [6500, '#fff9fd'],
  [7000, '#f5f3ff'],
  [8000, '#e3e9ff'],
  [9000, '#d6e1ff'],
  [10000, '#ccdbff'],
  [12000, '#bfd3ff'],
  [15000, '#b3ccff'],
  [20000, '#a8c5ff'],
  [30000, '#9fbfff'],
];

export const realism = {
  // Spectral classes. `volume` = share by count in a volume (3D field stars, system stars before
  // bias); `apparent` = share among visible stars on the sky shell (luminous classes over-represented).
  starClasses: {
    O: { tempK: [30000, 30000], volume: 0.00003, apparent: 0.002, luminosity: [30000, 200000] },
    B: { tempK: [10000, 30000], volume: 0.0013, apparent: 0.1, luminosity: [25, 30000] },
    A: { tempK: [7500, 10000], volume: 0.006, apparent: 0.22, luminosity: [5, 25] },
    F: { tempK: [6000, 7500], volume: 0.03, apparent: 0.19, luminosity: [1.5, 5] },
    G: { tempK: [5200, 6000], volume: 0.076, apparent: 0.14, luminosity: [0.6, 1.5] },
    K: { tempK: [3700, 5200], volume: 0.121, apparent: 0.31, luminosity: [0.08, 0.6] },
    M: { tempK: [2500, 3700], volume: 0.765, apparent: 0.038, luminosity: [0.0001, 0.08] },
  },
  // Apparent magnitude on the shell: N(<m) ∝ 10^(slope·m). Flux = 10^(−0.4·(m − mRef)).
  magnitudes: {
    range: [-1.0, 7.5],
    slope: 0.48, // ≈ 3× more stars per magnitude fainter
    mRef: 2.0, // a magnitude-2 star maps to linear intensity 1.0 before exposure
    countByTier: { high: 9000, medium: 6000, low: 3500 },
  },
  // Point spread: Gaussian core + faint wide halo, no diffraction spikes.
  starPsf: {
    coreSigmaPx: 0.55, // at DPR 1; scale with DPR
    minFootprintPx: 1.0, // faint stars never shrink below one pixel; dim by intensity instead
    halo: { fromMagnitude: 1.5, radiusPx: [6, 14], peak: 0.03 }, // only m < 1.5 get a halo
    glare: { fromMagnitude: 0.0, radiusPx: 22, peak: 0.012 }, // brightest few only; circular, soft
    hdrPeak: 6.0, // linear intensity cap for the brightest core, so bloom catches it
  },
  // Depth layers that give parallax and scale.
  depthLayers: {
    shell: { distance: 'infinity', parallax: 0 },
    field: { cellSize: 2400, viewRadius: 9000, perCell: { high: 220, medium: 140, low: 80 } },
    near: { box: 90, dustApparentSpeedCap: 10 }, // dust flow never faster than this (u/s) on screen
  },

  // Nebulae: raymarched impostors over a bounding sphere, drawn into a reduced-resolution buffer.
  nebula: {
    density: {
      warpStrength: 0.65, // domain warp: p += warp · fbm(p · 0.5)
      warpOctaves: 2,
      ridgedOctaves: 5, // ridged multifractal for filaments: 1 − |noise|
      ridgeSharpness: 2.2,
      baseFrequency: 1.8, // per nebula radius
      erosion: 0.42, // subtract before clamping so edges break up into wisps
      shape: 'ellipsoid', // falloff envelope, axes 1 : [0.5, 0.9] : [0.3, 0.7]
    },
    // Emission lines in display sRGB (artistic, readable versions of the real lines).
    emission: {
      hAlpha: '#e8466a', // 656 nm, rendered rose rather than deep red so it reads on screens
      oIII: '#4fd8d0', // 501 nm teal
      sII: '#b3222f', // 672 nm deep red, sits at the outskirts
      hBeta: '#5a7dff',
      reflection: '#6c8cff', // blue scattered starlight near embedded stars
    },
    // Mix per region (weights for the emission channels above).
    regionMix: {
      tidepool: { oIII: 0.55, hAlpha: 0.15, reflection: 0.3 },
      ember: { hAlpha: 0.6, sII: 0.25, oIII: 0.15 },
      hollow: { reflection: 0.6, oIII: 0.2, hAlpha: 0.2, intensityScale: 0.35 },
    },
    // Structure: OIII sits in the hot core, H-alpha in the shell, SII at the edge.
    layering: { oIII: [0.0, 0.45], hAlpha: [0.25, 0.85], sII: [0.6, 1.0] }, // normalised radius bands
    dust: {
      color: '#2a1a12', // absorbs and slightly reddens what is behind it
      extinction: 1.6, // per unit density, Beer–Lambert
      reddening: [1.0, 0.85, 0.65], // per-channel extinction multipliers (blue lost first)
      laneFrequency: 3.4,
      coverage: 0.35,
    },
    embeddedStars: { count: [1, 4], tempK: [12000, 30000], lightRadius: 0.35, intensity: 1.4 },
    emissionScale: 0.9, // linear HDR emission at density 1; nebulae stay below the bloom threshold
    steps: { high: 48, medium: 32, low: 16 },
    resolution: { high: 0.5, medium: 0.5, low: 0.35 }, // of the drawing buffer
    jitter: 'blueNoise', // per-pixel ray offset, rotated per frame
    history: { high: 0.85, medium: 0.8, low: 0 }, // temporal blend; 0 = off
    lowTierFallback: { slices: 6 }, // if raymarching misses budget: 6 camera-facing slices sampling the same 3D density
  },

  // Planet surfaces, baked once per planet into equirect maps (albedo+height, specular mask, clouds)
  // and shaded per pixel. Names match planets.types; `lava` is the type keyed `ember` above.
  planets: {
    bake: { size: { high: [1024, 512], medium: [512, 256], low: [512, 256] }, framesToBake: 6 },
    rocky: {
      albedo: ['#5e544c', '#8a7a6a', '#b39c82', '#d6c2a4'],
      continents: { frequency: 1.6, octaves: 6 },
      craters: { layers: 3, density: [40, 220, 900], radius: [0.08, 0.025, 0.006], rimHeight: 0.35 },
      reliefStrength: 0.9,
    },
    oceanic: {
      deep: '#0b2a4a',
      shallow: '#1f6a8f',
      land: ['#4f6b3a', '#7d7a4e', '#b8a47a'],
      ice: '#e8f1f6',
      seaLevel: 0.52,
      continents: { frequency: 1.3, octaves: 7, warp: 0.4 },
      polarCaps: 0.12, // latitude fraction
      glint: { roughness: 0.08, strength: 1.6 }, // sun glint on water (specular mask = ocean)
      clouds: { coverage: 0.48, frequency: 2.4, octaves: 6, warp: 0.6, color: '#f4f7fa', drift: 0.0004, shadow: 0.35 },
      reliefStrength: 0.5,
    },
    gas: {
      bands: [8, 16],
      bandWarp: 0.18, // fraction of one band width
      turbulence: { octaves: 5, alongLongitude: 3.0 }, // stretch noise east–west
      storms: { count: [1, 3], size: [0.04, 0.12], color: '#c9653a' },
      palettes: [
        ['#d9b38c', '#a8714e', '#f1e1c6', '#7a5643'],
        ['#9fb6d9', '#5d7bb0', '#e4ecf6', '#3d4f7a'],
        ['#cdbf9e', '#9a8f72', '#ece4cf', '#6c6450'],
      ],
      reliefStrength: 0.0,
      limbDarkening: 0.55,
    },
    ice: {
      albedo: ['#cfe3ee', '#9cc0d6', '#f4fbff', '#6f93ad'],
      cracks: { frequency: 6, width: 0.012, color: '#7a5a48', octaves: 3 }, // Europa-like lineae
      reliefStrength: 0.35,
      specular: { roughness: 0.3, strength: 0.4 },
    },
    lava: {
      crust: ['#1a1412', '#2a1d1a', '#4a2c22'],
      seams: { frequency: 4.5, width: 0.02, color: '#ff6a2a', hdrIntensity: 3.0 }, // emissive, night side + faintly on day side
      reliefStrength: 1.0,
    },
    normals: { tapsByTier: { high: 4, medium: 3, low: 0 }, strength: 1.0 }, // 0 taps = baked normal only
    terminator: { softness: 0.08, sunsetBand: { color: '#ff9a5a', width: 0.06, strength: 0.5 } },
    nightSide: { ambient: 0.015, earthshine: 0.0 }, // no city lights, ever
  },

  // Atmosphere: analytic single-scattering approximation on a shell 1 + thickness.
  atmosphere: {
    rayleigh: { rocky: '#c9b8a4', oceanic: '#5fa8ff', gas: '#f2d6b0', ice: '#bfe6ff', lava: '#ff9a6a' },
    thickness: { rocky: 0.012, oceanic: 0.03, gas: 0.035, ice: 0.02, lava: 0.018 },
    density: { rocky: 0.3, oceanic: 1.0, gas: 0.8, ice: 0.6, lava: 0.5 },
    limbExponent: 3.0,
    forwardScatterG: 0.6, // Henyey–Greenstein; bright crescent when backlit
    backlitBoost: 2.5,
  },

  // Light comes from the nearest system star; between systems a faint region key remains.
  lighting: {
    systemStarClasses: { M: 0.3, K: 0.3, G: 0.22, F: 0.12, A: 0.05, B: 0.01 },
    illuminance: { clamp: [0.6, 1.6], falloff: 'inverseSquare', referenceDistance: 20000 },
    interstellarKey: 0.25, // fraction of region key light when no system star is in range
    ambient: { source: 'skyAndNebula', intensity: [0.03, 0.06] },
    starDisk: { hdrIntensity: 40, coronaRadius: 3.5, coronaPeak: 0.25 },
    keepClear: 8, // × star radius, autopilot never closer
  },

  starSystems: {
    cellSize: 30000,
    chancePerCell: 0.3,
    starRadius: [300, 1400], // by class; M small, B large
    planets: [1, 6],
    orbitSpacing: [1.6, 2.0], // geometric ratio between consecutive orbits
    firstOrbit: [4000, 9000],
    inclinationDeg: [-5, 5],
    frostLine: 'luminosity', // inner: rocky/lava/oceanic, outer: gas/ice
    binaryChance: 0.04,
  },

  rings: {
    densityNoise: { octaves: 3, frequency: 40 },
    gaps: { count: [1, 3], width: [0.015, 0.04], density: 0.05 }, // fraction of ring span
    opticalDepth: [0.2, 1.4],
    forwardScatterG: 0.7,
    backlitBoost: 1.8,
    particleColor: ['#d8c9b0', '#a89a86', '#efe6d6', '#7d7466'],
    planetShadow: true, // analytic, all tiers
    ringShadowOnPlanet: true, // analytic, all tiers
    radialTexture: 1024,
  },

  moons: { lockedRotation: true, recipe: 'rocky', craterDensityScale: 1.4 },

  asteroids: {
    classes: {
      C: { weight: 0.75, albedo: ['#3b3733', '#47423c'], roughness: 0.92, metalness: 0.0 },
      S: { weight: 0.17, albedo: ['#7a6a58', '#8d7b66'], roughness: 0.85, metalness: 0.0 },
      M: { weight: 0.08, albedo: ['#8a8580', '#9a948c'], roughness: 0.55, metalness: 0.6 },
    },
    sizePowerLaw: 2.5, // N(>D) ∝ D^−2.5
    detailByTier: { high: 2, medium: 1, low: 1 }, // icosahedron subdivisions
    displacementOctaves: 3,
    craterNormals: { high: true, medium: true, low: false },
  },

  galaxies: {
    bakeSize: { high: 256, medium: 192, low: 128 },
    spiral: { arms: [2, 4], pitchDeg: [10, 25], bulgeTempK: 4500, armTempK: [9000, 15000], hiiKnots: { count: [20, 60], color: '#e8466a' } },
    elliptical: { sersicN: 4, axisRatio: [0.4, 1.0], tempK: 4300 },
    edgeOn: { thickness: [0.04, 0.09], dustLane: { color: '#1a100a', opacity: 0.7, width: 0.25 } },
    inclinationDeg: [0, 80],
  },

  comets: {
    coma: { radius: [30, 80], color: '#eaf6ff', hdrIntensity: 4 },
    ionTail: { color: '#7fb8ff', length: [3000, 7000], width: [40, 120], striations: 6 },
    dustTail: { color: '#ffe6c8', length: [2000, 5000], curvature: 0.25, width: [150, 400] },
    onlyInSystems: true, // tails point away from that system's star
  },

  // Image pipeline.
  pipeline: {
    target: 'HalfFloat', // linear HDR
    toneMapping: 'AgX', // gentle highlight roll-off; ACES as fallback
    exposure: { base: 1.0, adapt: true, upSeconds: 4, downSeconds: 8, rangeEV: [-1.0, 1.0], meterRes: 1 / 16, centerWeight: 0.6 },
    bloom: {
      threshold: 1.0,
      knee: 0.5,
      intensity: 0.08,
      mips: { high: 5, medium: 4, low: 3 },
      resolution: { high: 0.5, medium: 0.5, low: 0.25 },
    },
    lens: {
      chromaticAberration: { high: 0.0015, medium: 0, low: 0 }, // at the corners, radial, as UV offset
      vignette: { amount: 0.18, softness: 0.55 },
      grain: { amount: 0.012, fps: 24, luminanceOnly: true },
    },
  },

  // Ship materials (physically based).
  shipMaterials: {
    hull: { color: '#e6e0d3', roughness: 0.38, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.12 },
    graphite: { color: '#3a3f47', roughness: 0.45, metalness: 0.85, anisotropy: { high: 0.5, medium: 0, low: 0 } },
    copper: { color: '#b8734a', roughness: 0.32, metalness: 1.0 },
    canopy: { color: '#0e1822', roughness: 0.05, metalness: 0.0, clearcoat: 1.0, interiorGlow: '#ffcf8a', interiorIntensity: 0.15 },
    panelLines: { spacing: 0.06, width: 0.004, albedoDarken: 0.25, roughnessAdd: 0.2, normalDepth: 0.4 },
    engine: { core: '#9fe3ff', outer: '#4f8cff', hdrIntensity: 6.0 },
    navLights: { hdrIntensity: 3.0 },
    environment: { cubeSize: 32, intensity: 0.25, refreshWhenRegionShifts: 0.05 },
  },

  // Cinematic drift: summed slow sines on top of the viewer's framing. Never persisted.
  cameraDrift: {
    yaw: { amplitudeDeg: 2.5, periodSeconds: 71 },
    pitch: { amplitudeDeg: 1.2, periodSeconds: 53 },
    dolly: { amplitude: 0.03, periodSeconds: 89 }, // fraction of distance
    fovBreath: { amplitudeDeg: 0.6, periodSeconds: 41 },
    fadeOutOnInputSeconds: 0.4,
    resumeAfterSeconds: 6,
    fadeInSeconds: 10,
    reducedMotion: false, // off under prefers-reduced-motion
  },

  // Per-pass GPU budgets in ms (desktop target 8 ms total, phone 16 ms total).
  budgets: {
    desktop: { sky: 0.3, stars: 0.4, nebula: 2.5, planets: 1.5, rings: 0.3, rocks: 0.6, ship: 0.4, bloom: 0.8, composite: 0.4, headroom: 0.8 },
    phone: { sky: 0.6, stars: 0.8, nebula: 4.5, planets: 3.0, rings: 0.5, rocks: 1.2, ship: 0.8, bloom: 1.6, composite: 0.8, headroom: 2.2 },
  },

  qualityTiers: {
    high: { dprCap: 2.0, hdr: true, bloom: true, lens: true, nebulaSteps: 48, normalTaps: 4, anisotropy: true, msaa: 4 },
    medium: { dprCap: 1.5, hdr: true, bloom: true, lens: false, nebulaSteps: 32, normalTaps: 3, anisotropy: false, msaa: 4 },
    low: { dprCap: 1.25, hdr: true, bloom: true, lens: false, nebulaSteps: 16, normalTaps: 0, anisotropy: false, msaa: 2 },
  },
};

export default { UNIT, REGIONS, regionField, stars, sky, nebula, planets, asteroids, galaxies, rare, ship, camera, flight, grade, quality, ui, blackbody, realism };
