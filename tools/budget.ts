import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

/**
 * Gzipped JavaScript in dist/assets (the page and its tile worker) against the size before `add-ocean-migration`
 * began (d93f95d: 214,245 + 6,152 bytes) plus the 25 KB the change may add. Run `npm run build` first.
 */
const BASELINE = 220397;
const CAP = 25 * 1024;

const directory = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const sizes: Record<string, number> = {};
for (const name of await readdir(directory)) {
  if (name.endsWith('.js')) sizes[name] = gzipSync(await readFile(directory + name), { level: 9 }).length;
}
const total = Object.values(sizes).reduce((sum, size) => sum + size, 0);
for (const [name, size] of Object.entries(sizes)) console.log(`${name}: ${size} bytes gzip`);
console.log(`total ${total} bytes gzip, ${total - BASELINE >= 0 ? '+' : ''}${total - BASELINE} over the start of the change (cap +${CAP})`);
assert.ok(total - BASELINE <= CAP, `JavaScript grew by ${total - BASELINE} bytes gzip, over the ${CAP} cap`);
