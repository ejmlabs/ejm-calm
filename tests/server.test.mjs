import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startServer } from '../tools/serve.mjs';

function fetchRaw(base, path, method = 'GET') {
  return new Promise((accept, reject) => {
    const req = request(base, { path, method }, (response) => {
      let body = ''; response.setEncoding('utf8'); response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => accept({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject); req.end();
  });
}

test('static server provides module MIME types and rejects traversal and unsupported methods', async () => {
  const app = await startServer({ port: 0 });
  try {
    const script = await fetchRaw(app.url, '/src/rng.js');
    assert.equal(script.status, 200); assert.match(script.headers['content-type'], /text\/javascript/);
    assert.equal(script.headers['x-content-type-options'], 'nosniff');
    assert.match(script.headers['content-security-policy'], /script-src 'self'/);
    assert.match(script.headers['content-security-policy'], /connect-src 'none'/);
    assert.match(script.headers['content-security-policy'], /worker-src 'self'/);
    assert.match(script.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.doesNotMatch(script.headers['content-security-policy'], /unsafe-inline/);
    assert.equal((await fetchRaw(app.url, '/src/rng.js', 'HEAD')).body, '');
    assert.equal((await fetchRaw(app.url, '/')).status, 200);
    assert.equal((await fetchRaw(app.url, '/styles.css')).status, 200);
    assert.equal((await fetchRaw(app.url, '/LICENSE')).status, 200);
    assert.equal((await fetchRaw(app.url, '/THIRD_PARTY_NOTICES')).status, 200);
    assert.equal((await fetchRaw(app.url, '/vendor/three/three.module.js')).status, 200);
    for (const path of ['/../package.json', '/%2e%2e/package.json', '/.git/config', '/.orch/BRIEF.md', '/src/%00', '/src%5crng.js']) {
      assert.equal((await fetchRaw(app.url, path)).status, 403, path);
    }
    for (const path of ['/README.md', '/package.json', '/AGENTS.md', '/shots/desktop.png', '/shots/', '/node_modules/playwright-core/package.json', '/tools/serve.mjs', '/tests/server.test.mjs', '/missing.js']) {
      assert.equal((await fetchRaw(app.url, path)).status, 404, path);
    }
    assert.equal((await fetchRaw(app.url, '/%not-valid')).status, 400);
    assert.equal((await fetchRaw(app.url, '/src/rng.js', 'POST')).status, 405);
  } finally { await app.close(); }
});
