import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { request } from 'node:http';
import { startServer } from '../tools/serve.js';

type FetchResult = { status: number | undefined; headers: import('node:http').IncomingHttpHeaders; body: string };

function fetchRaw(base: string, path: string, method = 'GET'): Promise<FetchResult> {
  return new Promise((accept, reject) => {
    const req = request(base, { path, method }, (response) => {
      let body = ''; response.setEncoding('utf8'); response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => accept({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject); req.end();
  });
}

test('static server provides module MIME types and rejects traversal and unsupported methods', async () => {
  const root = resolve(import.meta.dirname, '..');
  const dist = resolve(root, 'dist');
  execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'ignore' });
  const assets = await readdir(resolve(dist, 'assets'));
  const scriptName = assets.find((name) => name.endsWith('.js') && name.startsWith('index-'));
  assert.ok(scriptName, 'dist/assets must contain a built JavaScript bundle');
  const scriptPath = `/assets/${scriptName}`;

  const app = await startServer({ port: 0, root: dist });
  try {
    const script = await fetchRaw(app.url, scriptPath);
    const csp = String(script.headers['content-security-policy'] ?? '');
    assert.equal(script.status, 200); assert.match(String(script.headers['content-type'] ?? ''), /text\/javascript/);
    assert.equal(script.headers['x-content-type-options'], 'nosniff');
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /connect-src 'none'/);
    assert.match(csp, /worker-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.doesNotMatch(csp, /unsafe-inline/);
    assert.equal((await fetchRaw(app.url, scriptPath, 'HEAD')).body, '');
    assert.equal((await fetchRaw(app.url, '/')).status, 200);
    assert.equal((await fetchRaw(app.url, '/styles.css')).status, 404);
    assert.equal((await fetchRaw(app.url, '/LICENSE')).status, 200);
    assert.equal((await fetchRaw(app.url, '/THIRD_PARTY_NOTICES')).status, 200);
    for (const path of ['/../package.json', '/%2e%2e/package.json', '/.git/config', '/.orch/BRIEF.md', '/assets/%00', '/assets%5cmain.js']) {
      assert.equal((await fetchRaw(app.url, path)).status, 403, path);
    }
    for (const path of ['/README.md', '/package.json', '/notes.md', '/secret.md', '/shots/desktop.png', '/shots/', '/node_modules/playwright-core/package.json', '/tools/serve.ts', '/tests/server.test.ts', '/missing.js', '/src/rng.js', '/vendor/three/three.module.js']) {
      assert.equal((await fetchRaw(app.url, path)).status, 404, path);
    }
    assert.equal((await fetchRaw(app.url, '/%not-valid')).status, 400);
    assert.equal((await fetchRaw(app.url, scriptPath, 'POST')).status, 405);
  } finally { await app.close(); }
});
