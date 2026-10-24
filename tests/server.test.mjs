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
    assert.equal((await fetchRaw(app.url, '/src/rng.js', 'HEAD')).body, '');
    for (const path of ['/../package.json', '/%2e%2e/package.json', '/.git/config', '/.orch/BRIEF.md', '/src/%00', '/src%5crng.js', '/node_modules/playwright-core/package.json']) {
      assert.equal((await fetchRaw(app.url, path)).status, 403, path);
    }
    assert.equal((await fetchRaw(app.url, '/%not-valid')).status, 400);
    assert.equal((await fetchRaw(app.url, '/missing.js')).status, 404);
    assert.equal((await fetchRaw(app.url, '/src/rng.js', 'POST')).status, 405);
  } finally { await app.close(); }
});
