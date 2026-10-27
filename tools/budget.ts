import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

/**
 * Reports the gzipped JavaScript in dist/assets (the page and its tile worker) against the size before
 * `add-ocean-migration` began (d93f95d: 214,245 + 6,152 bytes). A report, not a cap: load time is the bar.
 * Run `npm run build` first.
 */
const BASELINE = 220397;

const directory = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const sizes: Record<string, number> = {};
for (const name of await readdir(directory)) {
  if (name.endsWith('.js')) sizes[name] = gzipSync(await readFile(directory + name), { level: 9 }).length;
}
const total = Object.values(sizes).reduce((sum, size) => sum + size, 0);
for (const [name, size] of Object.entries(sizes)) console.log(`${name}: ${size} bytes gzip`);
console.log(`total ${total} bytes gzip, ${total - BASELINE >= 0 ? '+' : ''}${total - BASELINE} since d93f95d`);
