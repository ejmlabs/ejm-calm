import art from './look.js';
import { linearColor, linearToSrgb } from './astrophysics.js';

export function fieldHash(x, y, z, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
export function fieldNoise(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let a = x - ix, b = y - iy, c = z - iz; a = a * a * (3 - 2 * a); b = b * b * (3 - 2 * b); c = c * c * (3 - 2 * c);
  const h000 = fieldHash(ix, iy, iz, seed), h100 = fieldHash(ix + 1, iy, iz, seed), h010 = fieldHash(ix, iy + 1, iz, seed), h110 = fieldHash(ix + 1, iy + 1, iz, seed);
  const h001 = fieldHash(ix, iy, iz + 1, seed), h101 = fieldHash(ix + 1, iy, iz + 1, seed), h011 = fieldHash(ix, iy + 1, iz + 1, seed), h111 = fieldHash(ix + 1, iy + 1, iz + 1, seed);
  const front = (h000 + (h100 - h000) * a) * (1 - b) + (h010 + (h110 - h010) * a) * b;
  const back = (h001 + (h101 - h001) * a) * (1 - b) + (h011 + (h111 - h011) * a) * b;
  return front + (back - front) * c;
}
export function surfaceFbm(x, y, z, seed, octaves = 5) {
  let value = 0, amplitude = 0.5, weight = 0;
  for (let i = 0; i < octaves; i++) { value += fieldNoise(x, y, z, seed + i * 101) * amplitude; weight += amplitude; x = x * 2.03 + 13; y = y * 2.03 + 7; z = z * 2.03 + 19; amplitude *= 0.5; }
  return value / weight;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);
export const recipeName = (type) => type === 'ocean' ? 'oceanic' : type === 'ember' ? 'lava' : type;

export function makeSurfaceRecipe(data, rng) {
  const type = recipeName(data.type), spec = art.realism.planets[type];
  const palette = type === 'gas' ? spec.palettes[Math.floor(rng() * spec.palettes.length)] : spec.albedo ?? spec.land ?? spec.crust;
  return { type, spec, seed: data.seed, palette: palette.map(linearColor), bands: type === 'gas' ? Math.floor(spec.bands[0] + rng() * (spec.bands[1] - spec.bands[0] + 1)) : 0,
    storms: type === 'gas' ? Array.from({ length: Math.floor(spec.storms.count[0] + rng() * (spec.storms.count[1] - spec.storms.count[0] + 1)) }, () => ({ longitude: rng() * Math.PI * 2, latitude: (rng() - 0.5) * 1.1, size: spec.storms.size[0] + rng() * (spec.storms.size[1] - spec.storms.size[0]) })) : [],
    deep: type === 'oceanic' ? linearColor(spec.deep) : null, shallow: type === 'oceanic' ? linearColor(spec.shallow) : null,
    ice: type === 'oceanic' ? linearColor(spec.ice) : null, crack: type === 'ice' ? linearColor(spec.cracks.color) : null };
}

export function surfaceSample(recipe, x, y, z) {
  const { type, seed, spec, palette } = recipe;
  let height = 0.5, ocean = 0, emission = 0, clouds = 0, roughness = 0.85, albedo;
  if (type === 'gas') {
    const latitude = Math.asin(y) / Math.PI + 0.5, longitude = Math.atan2(z, x);
    const turbulence = surfaceFbm(x * 1.5, y * 8, z * 1.5, seed, spec.turbulence.octaves);
    const phase = latitude * recipe.bands + (turbulence - 0.5) * spec.bandWarp * 2;
    const wave = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
    albedo = mix(palette[0], palette[1], smooth(0.1, 0.9, wave));
    albedo = mix(albedo, palette[2], smooth(0.75, 0.98, wave) * 0.8);
    albedo = mix(albedo, palette[3], smooth(0.0, 0.35, fieldNoise(Math.floor(phase), 1, 0, seed)) * 0.25);
    for (const storm of recipe.storms) {
      const lon = Math.atan2(Math.sin(longitude - storm.longitude), Math.cos(longitude - storm.longitude));
      const u = lon / (storm.size * 2.7), v = (y - Math.sin(storm.latitude)) / storm.size;
      const density = Math.exp(-(u * u + v * v) * 1.5), swirl = Math.sin(Math.hypot(u, v) * 18 + turbulence * 4) * 0.5 + 0.5;
      albedo = mix(albedo, mix(palette[3], palette[2], swirl), density * 0.75);
    }
  } else if (type === 'oceanic') {
    const frequency = spec.continents.frequency;
    const warp = surfaceFbm(x * 2, y * 2, z * 2, seed + 3, 3) - 0.5;
    const continents = surfaceFbm(x * frequency + warp * spec.continents.warp, y * frequency, z * frequency - warp * spec.continents.warp, seed, spec.continents.octaves);
    ocean = 1 - smooth(spec.seaLevel - 0.007, spec.seaLevel + 0.009, continents);
    const depth = Math.max(0, Math.min(1, (continents - spec.seaLevel + 0.1) / 0.1));
    const water = mix(recipe.deep, recipe.shallow, depth ** 3), land = mix(palette[0], palette[1], smooth(spec.seaLevel, 0.7, continents));
    albedo = mix(land, water, ocean); height = ocean > 0.5 ? 0.46 : 0.5 + (continents - spec.seaLevel) * 1.85;
    const snow = smooth(1 - spec.polarCaps - 0.03, 1 - spec.polarCaps + 0.03, Math.abs(y)); albedo = mix(albedo, recipe.ice, snow);
    const cloudWarp = surfaceFbm(x * 2 + 20, y * 2, z * 2, seed + 31, 2) * spec.clouds.warp;
    clouds = smooth(1 - spec.clouds.coverage - 0.05, 1 - spec.clouds.coverage + 0.1, surfaceFbm(x * spec.clouds.frequency + cloudWarp, y * spec.clouds.frequency, z * spec.clouds.frequency, seed + 77, spec.clouds.octaves));
    roughness = ocean > 0.5 ? spec.glint.roughness : 0.85;
  } else if (type === 'ice') {
    const base = surfaceFbm(x * 3, y * 3, z * 3, seed, 5), warped = surfaceFbm(x * spec.cracks.frequency, y * spec.cracks.frequency, z * spec.cracks.frequency, seed + 13, spec.cracks.octaves);
    const ridge = surfaceFbm(x * 11, y * 11, z * 11, seed + 41, 3);
    const line = 1 - smooth(spec.cracks.width, spec.cracks.width * 3, Math.abs(warped - 0.5));
    albedo = mix(palette[0], palette[1], base); albedo = mix(albedo, recipe.crack, line * 0.82); height = 0.5 + (base - 0.5) * 0.22 + (ridge - 0.5) * 0.08 - line * 0.045; roughness = spec.specular.roughness;
  } else if (type === 'lava') {
    const base = surfaceFbm(x * 4, y * 4, z * 4, seed, 6), seams = surfaceFbm(x * spec.seams.frequency, y * spec.seams.frequency, z * spec.seams.frequency, seed + 17, 4);
    emission = 1 - smooth(spec.seams.width * 0.5, spec.seams.width * 2, Math.abs(seams - 0.5));
    albedo = mix(palette[0], palette[1], base); height = 0.35 + base * 0.35 - emission * 0.12;
  } else {
    const continents = surfaceFbm(x * spec.continents.frequency, y * spec.continents.frequency, z * spec.continents.frequency, seed, spec.continents.octaves);
    const detail = surfaceFbm(x * 20, y * 20, z * 20, seed + 29, 3);
    albedo = mix(palette[0], palette[1], smooth(0.25, 0.7, continents)); albedo = mix(albedo, palette[2], detail * 0.22); height = 0.18 + continents * 0.62 + (detail - 0.5) * 0.09;
  }
  return { albedo, height, ocean, emission, clouds, roughness };
}

export function encodeAlbedo(value) { return Math.max(0, Math.min(255, Math.round(linearToSrgb(value) * 255))); }
