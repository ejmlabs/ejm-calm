export function sampleRockSize(rng, min, max, exponent) {
  return (min ** -exponent - rng() * (min ** -exponent - max ** -exponent)) ** (-1 / exponent);
}
