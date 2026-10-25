import { random } from './rng.js';
import { makeSurfaceRecipe, surfaceSample, encodeAlbedo, surfaceFbm } from './surface-recipe.js';
import art from './look.js';
import { blackbodyColor, linearColor } from './astrophysics.js';

function bakePlanet({ data, width, height }) {
  const rng = random(data.seed), recipe = makeSurfaceRecipe(data, rng);
  const albedo = new Uint8Array(width * height * 4), surface = new Uint8Array(albedo.length), normals = new Uint8Array(albedo.length), elevation = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const latitude = ((y + 0.5) / height - 0.5) * Math.PI, cy = Math.cos(latitude), sy = Math.sin(latitude);
    for (let x = 0; x < width; x++) {
      const longitude = (x + 0.5) / width * Math.PI * 2, point = [-Math.cos(longitude) * cy, sy, Math.sin(longitude) * cy];
      const value = surfaceSample(recipe, ...point), index = (y * width + x) * 4;
      for (let i = 0; i < 3; i++) albedo[index + i] = encodeAlbedo(value.albedo[i]);
      elevation[y * width + x] = value.height; surface[index] = Math.round(value.ocean * 255); surface[index + 1] = Math.round(value.emission * 255);
      surface[index + 2] = Math.round(value.clouds * 255); surface[index + 3] = Math.round(value.roughness * 255);
    }
  }
  if (recipe.type === 'rocky') {
    const spec = recipe.spec.craters, density = data.moon ? art.realism.moons.craterDensityScale : 1;
    for (let layer = 0; layer < spec.layers; layer++) for (let i = 0; i < spec.density[layer] * density; i++) {
      const u = rng(), sy = rng() * 2 - 1, latitude = Math.asin(sy), v = latitude / Math.PI + 0.5;
      const radius = spec.radius[layer] * (0.7 + rng() * 0.6), cy = Math.sqrt(1 - sy * sy), lon = u * Math.PI * 2;
      const center = [-Math.cos(lon) * cy, sy, Math.sin(lon) * cy], ex = Math.min(width / 2, Math.ceil(radius / (Math.PI * 2 * Math.max(0.03, cy)) * width * 1.6));
      const ey = Math.ceil(radius / Math.PI * height * 1.6), px = Math.floor(u * width), py = Math.floor(v * height);
      for (let yy = Math.max(0, py - ey); yy <= Math.min(height - 1, py + ey); yy++) {
        const lat = ((yy + 0.5) / height - 0.5) * Math.PI, cosine = Math.cos(lat), sine = Math.sin(lat);
        for (let xx = px - ex; xx <= px + ex; xx++) {
          const x = (xx % width + width) % width, longitude = (x + 0.5) / width * Math.PI * 2;
          const dot = -Math.cos(longitude) * cosine * center[0] + sine * center[1] + Math.sin(longitude) * cosine * center[2];
          const distance = Math.sqrt(Math.max(0, 2 - 2 * dot)) / radius;
          if (distance > 1.5) continue;
          const bowl = Math.max(0, 1 - distance * distance) ** 2, rim = Math.exp(-(((distance - 1) / 0.12) ** 2));
          const pixel = yy * width + x; elevation[pixel] += (-bowl + rim * spec.rimHeight) * radius * 2.7;
          const ejecta = Math.exp(-(((distance - 1.15) / 0.25) ** 2)) * 10;
          for (let c = 0; c < 3; c++) albedo[pixel * 4 + c] = Math.min(255, albedo[pixel * 4 + c] + ejecta);
        }
      }
    }
  }
  for (let y = 0; y < height; y++) {
    const latitude = ((y + 0.5) / height - 0.5) * Math.PI, cy = Math.cos(latitude), sy = Math.sin(latitude);
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4, longitude = (x + 0.5) / width * Math.PI * 2;
      const at = (u, v) => elevation[Math.max(0, Math.min(height - 1, v)) * width + (u + width) % width];
      const dx = (at(x + 1, y) - at(x - 1, y)) * width / (4 * Math.PI * Math.max(0.08, cy)) * 0.055 * recipe.spec.reliefStrength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * height / (2 * Math.PI) * 0.055 * recipe.spec.reliefStrength;
      const n = [-Math.cos(longitude) * cy - Math.sin(longitude) * dx - Math.cos(longitude) * sy * dy,
        sy - cy * dy, Math.sin(longitude) * cy - Math.cos(longitude) * dx + Math.sin(longitude) * sy * dy];
      const length = Math.hypot(...n);
      for (let c = 0; c < 3; c++) normals[index + c] = Math.round((n[c] / length * 0.5 + 0.5) * 255);
      normals[index + 3] = 255; albedo[index + 3] = Math.round(Math.max(0, Math.min(1, elevation[y * width + x])) * 255);
    }
  }
  return { albedo, surface, normals };
}

function bakeVolume({ seed, size }) {
  const spec = art.realism.nebula.density, data = new Uint8Array(size ** 3 * 4);
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let px = (x / (size - 1) * 2 - 1), py = (y / (size - 1) * 2 - 1), pz = (z / (size - 1) * 2 - 1);
    const warp = (surfaceFbm(px * 0.5 + 3, py * 0.5, pz * 0.5, seed, spec.warpOctaves) - 0.5) * spec.warpStrength;
    px = px * spec.baseFrequency + warp; py = py * spec.baseFrequency - warp * 0.7; pz = pz * spec.baseFrequency + warp * 0.4;
    let density = 0, amplitude = 0.5, weight = 0;
    for (let i = 0; i < spec.ridgedOctaves; i++) {
      // Ridged multifractal: 1 − |noise|, sharpened, so filaments stay thin.
      const value = surfaceFbm(px, py, pz, seed + i * 31, 1) * 2 - 1;
      const ridge = Math.pow(1 - Math.abs(value), spec.ridgeSharpness);
      density += ridge * ridge * amplitude; weight += amplitude;
      px *= 2.07; py *= 2.07; pz *= 2.07; amplitude *= 0.5;
    }
    const filament = Math.max(0, density / weight - spec.erosion);
    const index = ((z * size + y) * size + x) * 4;
    // Keep peak coverage low so large regions stay under ~15% opacity.
    data[index] = Math.round(Math.max(0, Math.min(1, filament * filament * 3.4)) * 255);
    data[index + 1] = Math.round(surfaceFbm(x / size * art.realism.nebula.dust.laneFrequency, y / size * art.realism.nebula.dust.laneFrequency, z / size * art.realism.nebula.dust.laneFrequency, seed + 811, 3) * 255);
    data[index + 2] = Math.round(surfaceFbm(x / size * 3, y / size * 3, z / size * 3, seed + 29, 2) * 255); data[index + 3] = 255;
  }
  return { volume: data };
}

function blueNoise({ seed, size = 32 }) {
  const rng = random(seed), remaining = Array.from({ length: size * size }, (_, i) => i), nearest = new Float32Array(size * size).fill(Infinity), pixels = new Uint8Array(size * size * 4);
  for (let rank = 0; remaining.length; rank++) {
    let best = 0;
    for (let i = 0; i < 16; i++) { const pick = Math.floor(rng() * remaining.length); if (nearest[remaining[pick]] > nearest[remaining[best]]) best = pick; }
    const pixel = remaining[best], x = pixel % size, y = Math.floor(pixel / size), value = Math.round(rank / (size * size - 1) * 255);
    pixels.set([value, value, value, 255], pixel * 4); remaining[best] = remaining.at(-1); remaining.pop();
    for (const candidate of remaining) {
      const dx = Math.abs(candidate % size - x), dy = Math.abs(Math.floor(candidate / size) - y), tx = Math.min(dx, size - dx), ty = Math.min(dy, size - dy);
      nearest[candidate] = Math.min(nearest[candidate], tx * tx + ty * ty);
    }
  }
  return { noise: pixels };
}

function bakeGalaxy({ seed, size, galaxyKind }) {
  const rng = random(seed), spec = art.realism.galaxies, pixels = new Uint8Array(size * size * 4);
  const arms = Math.floor(spec.spiral.arms[0] + rng() * (spec.spiral.arms[1] - spec.spiral.arms[0] + 1));
  const pitch = (spec.spiral.pitchDeg[0] + rng() * (spec.spiral.pitchDeg[1] - spec.spiral.pitchDeg[0])) * Math.PI / 180;
  const inclination = (spec.inclinationDeg[0] + rng() * (spec.inclinationDeg[1] - spec.inclinationDeg[0])) * Math.PI / 180;
  const axisRatio = spec.elliptical.axisRatio[0] + rng() * (spec.elliptical.axisRatio[1] - spec.elliptical.axisRatio[0]);
  const flatten = galaxyKind === 'edgeOn' ? spec.edgeOn.thickness[0] + rng() * (spec.edgeOn.thickness[1] - spec.edgeOn.thickness[0])
    : galaxyKind === 'elliptical' ? axisRatio : Math.max(0.22, Math.cos(inclination) * 0.85 + 0.15);
  const bulge = blackbodyColor(galaxyKind === 'elliptical' ? spec.elliptical.tempK : spec.spiral.bulgeTempK), blue = blackbodyColor(spec.spiral.armTempK[0] + rng() * (spec.spiral.armTempK[1] - spec.spiral.armTempK[0]));
  const pink = linearColor(spec.spiral.hiiKnots.color), phase = rng() * Math.PI * 2;
  const count = Math.floor(spec.spiral.hiiKnots.count[0] + rng() * (spec.spiral.hiiKnots.count[1] - spec.spiral.hiiKnots.count[0] + 1));
  const knots = Array.from({ length: count }, () => { const r = 0.12 + rng() * 0.68, angle = Math.log(r + 0.02) / Math.tan(pitch) + Math.floor(rng() * arms) * Math.PI * 2 / arms + phase + (rng() - 0.5) * 0.1; return [r * Math.cos(angle), r * Math.sin(angle), 0.008 + rng() * 0.014]; });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1) * 2 - 1, v = (y / (size - 1) * 2 - 1) / flatten, r = Math.hypot(u, v), angle = Math.atan2(v, u);
    const spiral = (angle - Math.log(r + 0.02) / Math.tan(pitch) - phase) * arms;
    const ridge = Math.pow(Math.cos(spiral) * 0.5 + 0.5, 5.2), dust = Math.pow(Math.cos(spiral - 0.28) * 0.5 + 0.5, 14);
    let core = Math.exp(-r * r * 70), density = Math.exp(-r * 3.4) * (0.12 + ridge * 0.82) + core * 0.85, knot = 0;
    if (galaxyKind === 'elliptical') {
      const re = 0.28, sersic = Math.exp(-7.669 * ((r / re) ** (1 / spec.elliptical.sersicN) - 1));
      density = Math.min(1.2, sersic * 1.15); core = Math.exp(-r * r * 40);
    } else if (galaxyKind === 'edgeOn') {
      core = Math.exp(-u * u * 80 - v * v * 5); density = Math.exp(-u * u * 4.2 - v * v * 2.6) * 0.75 + core * 0.55;
      density *= 1 - Math.exp(-v * v * 140) * spec.edgeOn.dustLane.opacity;
    } else for (const [kx, ky, radius] of knots) { const d = (u - kx) ** 2 + (v - ky) ** 2; if (d < radius * radius * 12) knot += Math.exp(-d / (radius * radius * 1.8)); }
    const edge = Math.max(0, 1 - r * r) ** 1.6, index = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) {
      let color = blue[c] + (bulge[c] - blue[c]) * Math.min(1, core * 2.2); color *= 1 - dust * 0.55 * [0.55, 0.8, 1][c]; color += pink[c] * knot * 0.85;
      pixels[index + c] = Math.round(Math.min(1, color * 1.15) * 255);
    } pixels[index + 3] = Math.round(Math.min(1, (density + knot * 0.28) * edge) * 255);
  }
  return { galaxy: pixels };
}

const KINDS = new Set(['planet', 'volume', 'noise', 'galaxy']);
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
};

self.onmessage = ({ data: request }) => {
  try {
    if (!request || !KINDS.has(request.kind)) throw new Error('unknown bake kind');
    const job = { ...request };
    if (job.kind === 'planet') {
      job.width = clamp(job.width, 16, 2048, 512);
      job.height = clamp(job.height, 8, 1024, 256);
    } else {
      job.size = clamp(job.size, 8, 128, job.kind === 'volume' ? 32 : 32);
    }
    const result = job.kind === 'volume' ? bakeVolume(job) : job.kind === 'noise' ? blueNoise(job) : job.kind === 'galaxy' ? bakeGalaxy(job) : bakePlanet(job);
    self.postMessage({ id: request.id, ...result }, Object.values(result).map((array) => array.buffer));
  } catch (error) { self.postMessage({ id: request?.id, error: error.message }); }
};
