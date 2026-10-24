export function parseSeed(value) {
  if (typeof value !== 'string' || !/^\d{1,10}$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number <= 0xffffffff ? number : null;
}

export function resolveSeed(search = '', savedSeed, entropy = Math.random) {
  const explicit = parseSeed(new URLSearchParams(search).get('seed'));
  if (explicit !== null) return { seed: explicit, explicit: true };
  if (Number.isInteger(savedSeed) && savedSeed >= 0 && savedSeed <= 0xffffffff) {
    return { seed: savedSeed, explicit: false };
  }
  return { seed: Math.floor(entropy() * 0x100000000) >>> 0, explicit: false };
}

export function seedURL(address, seed) {
  const url = new URL(address);
  url.searchParams.set('seed', String(seed >>> 0));
  return url;
}
