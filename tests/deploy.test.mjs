import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CSP, CSP_HEADER } from '../tools/serve.mjs';

const root = resolve(import.meta.dirname, '..');

test('meta CSP matches the header policy', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const meta = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  assert.ok(meta);
  assert.equal(meta[1], CSP);
  assert.equal(CSP_HEADER, `${CSP}; frame-ancestors 'none'`);
});

test('build output holds only the public tree and host headers', async () => {
  execFileSync(process.execPath, [resolve(root, 'tools/build.mjs')], { stdio: 'ignore' });
  const headers = await readFile(resolve(root, 'dist/_headers'), 'utf8');
  assert.ok(headers.includes(`Content-Security-Policy: ${CSP_HEADER}`));
  for (const name of ['X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy: no-referrer']) assert.ok(headers.includes(name));
  const entries = (await readdir(resolve(root, 'dist'))).sort();
  assert.deepEqual(entries, ['LICENSE', 'THIRD_PARTY_NOTICES', '_headers', 'index.html', 'src', 'styles.css', 'vendor']);
});
