import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PerformanceObserver } from 'node:perf_hooks';
import { layoutWorld } from '../src/terrain.js';
import { farShelf, farShelfSteps, navShelf, navShelfSteps, type ShelfMap } from '../src/land.js';
import { createNavField } from '../src/world-nav.js';

/** A coast made of cheap waves, so a field built over it costs almost nothing. */
const waves = (x: number, z: number) => Math.sin(x * 0.0021) * Math.cos(z * 0.0017) - 0.1;

test('a prefetch builds the missing tiles nearest first, the same on every call', () => {
  const cell = 10;
  const field = createNavField(waves, { min: -1600, cell, tile: 16, pad: 8, maxTiles: 1000 });
  const size = 16 * cell;
  const [x, z, radius] = [777, -432, 1000];
  const fx = (x - -1600) / size;
  const fz = (z - -1600) / size;
  const reach = Math.ceil(radius / size);
  const expected: { tx: number; tz: number; d: number }[] = [];
  for (let tz = Math.floor(fz) - reach; tz <= Math.floor(fz) + reach; tz++)
    for (let tx = Math.floor(fx) - reach; tx <= Math.floor(fx) + reach; tx++) {
      const d = Math.hypot(tx + 0.5 - fx, tz + 0.5 - fz) * size;
      if (d <= radius + size * 0.71) expected.push({ tx, tz, d });
    }
  expected.sort((a, b) => a.d - b.d || a.tz - b.tz || a.tx - b.tx);
  assert.ok(expected.length > 60, 'a field of many tiles');

  // One slice a call (a budget of nothing): note which tile became ready after each.
  const built: { tx: number; tz: number }[] = [];
  const done = new Set<string>();
  for (let calls = 0; !field.prefetch(x, z, radius, 0); calls++) {
    assert.ok(calls < 100000, 'the prefetch finishes');
    for (const { tx, tz } of expected) {
      const key = `${String(tx)}:${String(tz)}`;
      if (done.has(key) || !field.ready(-1600 + (tx + 0.5) * size, -1600 + (tz + 0.5) * size))
        continue;
      done.add(key);
      built.push({ tx, tz });
    }
  }
  assert.deepEqual(
    built.map(({ tx, tz }) => [tx, tz]),
    expected.slice(0, built.length).map(({ tx, tz }) => [tx, tz]),
    'tiles complete in order of distance, ties by row then column',
  );
  assert.ok(built.length >= expected.length - 1, 'every tile in reach is built');
});

test('a prefetch over built ground allocates nothing a call, whatever its radius', async () => {
  const field = createNavField(waves, { min: -1600, cell: 10, tile: 16, pad: 8, maxTiles: 1000 });
  const [x, z, radius] = [300, 200, 1600];
  field.prefetch(x, z, radius, Infinity);
  assert.ok(field.stats().tiles > 300, 'a wide field is built');
  // A scan of 441 candidate tiles once made a string for each: tens of kilobytes of garbage every step.
  let collections = 0;
  const observer = new PerformanceObserver((list) => {
    collections += list.getEntries().length;
  });
  observer.observe({ entryTypes: ['gc'] });
  for (let i = 0; i < 6000; i++) assert.ok(field.prefetch(x + (i % 5), z, radius, 0));
  // Collections are reported on the next turn of the event loop.
  await new Promise((resolve) => setImmediate(resolve));
  collections += observer.takeRecords().length;
  observer.disconnect();
  assert.ok(collections <= 2, `${String(collections)} garbage collections in 6000 idle scans`);
});

const fingerprint = (shelf: ShelfMap): string => {
  let hash = 0x811c9dc5;
  for (const byte of shelf.data) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return `0x${hash.toString(16)}`;
};

test('shelf bakes make the maps they always made', () => {
  const land = layoutWorld(42).land;
  // Fingerprints from before the bakes were cut into finer slices.
  assert.equal(fingerprint(navShelf(land, 0, 0)), '0x869c4b94');
  assert.equal(fingerprint(navShelf(land, 6400, -3200)), '0x3b881b28');
  assert.equal(fingerprint(farShelf(land, 96, 6400, 20000, 5000)), '0xd552c3f5');
  assert.equal(fingerprint(farShelf(land, 96, 6400, 0, 0)), '0x253fdeab');
});

/** Calls of `count` made between one yield of `steps` and the next, the largest. */
function longestSlice(steps: Generator<void, unknown>, count: () => number): number {
  let longest = 0;
  let last = count();
  for (;;) {
    const next = steps.next();
    longest = Math.max(longest, count() - last);
    last = count();
    if (next.done) return longest;
  }
}

test('a shelf bake yields after a few dozen samples, so a loop of slices can stop at its budget', () => {
  const land = layoutWorld(42).land;
  let masks = 0;
  const far = longestSlice(
    farShelfSteps(
      {
        maskAt: (x, z) => {
          masks++;
          return land.maskAt(x, z);
        },
      },
      96,
      6400,
      20000,
      5000,
    ),
    () => masks,
  );
  assert.ok(far <= 64, `a far slice took ${String(far)} mask samples`);

  // Over the start bay, where the sand banks are added: the bank samples are sliced too.
  let reads = 0;
  let shoals = 0;
  const counted = {
    ...land,
    nav: {
      ...land.nav,
      distanceAt: (x: number, z: number) => {
        reads++;
        return land.nav.distanceAt(x, z);
      },
    },
    shoalAt: (x: number, z: number) => {
      shoals++;
      return land.shoalAt(x, z);
    },
  };
  const slices = navShelfSteps(counted, 0, 0);
  const near = longestSlice(slices, () => reads);
  assert.ok(near <= 4 * 320, `a near slice read ${String(near)} distances`);
  assert.ok(reads > 0 && shoals > 20000, 'the bake covered the bay and its banks');
  const banks = longestSlice(navShelfSteps(counted, 0, 0), () => shoals);
  assert.ok(banks <= 64, `a sand bank slice took ${String(banks)} samples`);
});
