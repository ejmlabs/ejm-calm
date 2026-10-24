export function hash(...values) {
  let result = 0x811c9dc5;
  for (const value of values) {
    let word = Number(value) | 0;
    word = Math.imul(word ^ (word >>> 16), 0x7feb352d);
    word = Math.imul(word ^ (word >>> 15), 0x846ca68b);
    result = Math.imul(result ^ word ^ (word >>> 16), 0x01000193);
  }
  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b);
  return (result ^ (result >>> 13)) >>> 0;
}

export function random(seed) {
  let counter = 0;
  return () => hash(seed, counter++) / 0x100000000;
}

export const cellRandom = (seed, x, y, z, channel = 0) => random(hash(seed, x, y, z, channel));
