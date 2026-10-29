import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mixedTests } from './flaky.mjs';

const report = (...tests) => ({ testResults: [{ name: 'tests/sea.test.ts', assertionResults: tests.map(([fullName, status]) => ({ fullName, status })) }] });

test('finds only tests with both a pass and a failure', () => {
  assert.deepEqual(mixedTests(report(['waves', 'failed'], ['wind', 'failed'], ['rain', 'skipped']), report(['waves', 'passed'], ['wind', 'failed'], ['rain', 'skipped'])), [['tests/sea.test.ts', 'waves']]);
});

test('rejects incomplete and ambiguous reports', () => {
  assert.throws(() => mixedTests(null, report()));
  assert.throws(() => mixedTests(report(['waves', 'passed'], ['waves', 'failed']), report()));
  assert.throws(() => mixedTests(report(['waves', 'passed']), report()));
  assert.throws(() => mixedTests(report(['waves', 'passed']), report(['waves', 'skipped'])));
});

test('a passing second run never hides the first failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'calm-flaky-test-'));
  try {
    mkdirSync(join(root, 'node_modules/vitest'), { recursive: true });
    writeFileSync(join(root, 'node_modules/vitest/vitest.mjs'), `
      import { existsSync, writeFileSync } from 'node:fs';
      const first = !existsSync('attempted');
      writeFileSync('attempted', 'yes');
      const path = process.argv.find(a => a.startsWith('--outputFile.json=')).split('=')[1];
      writeFileSync(path, JSON.stringify({ testResults: [{ name: 'sea', assertionResults: [{ fullName: 'waves', status: first ? 'failed' : 'passed' }] }] }));
      process.exitCode = first ? 1 : 0;
    `);
    const output = join(root, 'evidence');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./flaky.mjs', import.meta.url))], {
      cwd: root, env: { ...process.env, FLAKE_OUTPUT: output }, encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(readFileSync(join(output, 'summary.json'))).mixed, [['sea', 'waves']]);
    assert.match(result.stderr, /Flaky test: sea :: waves/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
