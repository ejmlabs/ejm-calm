import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mixedTests } from './flaky.mjs';

const inventory = (...names) => names.map(name => ({ file: 'tests/sea.test.ts', name, skipped: false }));
const report = (...tests) => ({ testResults: [{ name: 'tests/sea.test.ts', assertionResults: tests.map(([fullName, status]) => ({ fullName, status })) }] });

test('finds only tests with both a pass and a failure', () => {
  assert.deepEqual(mixedTests(report(['waves', 'failed'], ['wind', 'failed'], ['rain', 'passed']), report(['waves', 'passed'], ['wind', 'failed'], ['rain', 'passed']), inventory('waves', 'wind', 'rain')), {
    mixed: [['tests/sea.test.ts', 'waves']], incomplete: false,
  });
});

test('finds identifiable flakes even when other evidence is incomplete', () => {
  const first = report(['waves', 'failed'], ['wind', 'passed']);
  const cases = [
    report(['waves', 'passed']),
    report(['waves', 'passed'], ['wind', 'passed'], ['wind', 'failed']),
    report(['waves', 'passed'], ['wind', 'skipped']),
    { testResults: [...report(['waves', 'passed'], ['wind', 'passed']).testResults, null] },
    { testResults: [{ name: 'tests/sea.test.ts', assertionResults: [{ fullName: 'waves', status: 'passed' }, null] }] },
  ];
  for (const second of cases) {
    for (const [a, b] of [[first, second], [second, first]]) {
      assert.deepEqual(mixedTests(a, b, inventory('waves', 'wind')), { mixed: [['tests/sea.test.ts', 'waves']], incomplete: true });
    }
  }
  assert.deepEqual(mixedTests(null, first), { mixed: [], incomplete: true });
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
      writeFileSync(path, JSON.stringify({ testResults: [{ name: 'sea', assertionResults: [{ fullName: 'waves', status: first ? 'failed' : 'passed' }, ...(first ? [{ fullName: 'wind', status: 'passed' }] : [])] }] }));
      process.exitCode = first ? 1 : 0;
    `);
    const output = join(root, 'evidence');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./flaky.mjs', import.meta.url))], {
      cwd: root, env: { ...process.env, FLAKE_OUTPUT: output }, encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    const summary = JSON.parse(readFileSync(join(output, 'summary.json')));
    assert.deepEqual(summary.mixed, [['sea', 'waves']]);
    assert.equal(summary.incomplete, true);
    assert.match(result.stderr, /Flaky test: sea :: waves/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('a skip in both reports still makes evidence incomplete', () => {
  assert.equal(mixedTests(report(['rain', 'skipped']), report(['rain', 'skipped']), inventory('rain')).incomplete, true);
});


test('an omitted case fails coverage while comparable flakes remain visible', () => {
  const first = report(['waves', 'failed']);
  const second = report(['waves', 'passed']);
  assert.deepEqual(mixedTests(first, second, inventory('waves', 'wind')), {
    mixed: [['tests/sea.test.ts', 'waves']], incomplete: true,
  });
});

test('an ambiguous inventory case cannot hide other flakes or be classified itself', () => {
  const first = report(['waves', 'failed'], ['wind', 'failed']);
  const second = report(['waves', 'passed'], ['wind', 'passed']);
  assert.deepEqual(mixedTests(first, second, inventory('waves', 'waves', 'wind')), {
    mixed: [['tests/sea.test.ts', 'wind']], incomplete: true,
  });
});

test('real Vitest inventory includes parameterized cases and reports skipped cases', () => {
  const root = mkdtempSync(join(tmpdir(), 'calm-vitest-test-'));
  try {
    symlinkSync(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'fixture.test.js'), `
      import { describe, expect, test } from 'vitest';
      describe('outer', () => {
        describe('inner', () => test.each([1, 2])('case %i', value => expect(value).toBeGreaterThan(0)));
        test.skip('skipped case', () => {});
      });
    `);
    const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
    const inventoryPath = join(root, 'inventory.json');
    const listed = spawnSync(process.execPath, [fileURLToPath(new URL('./flaky-inventory.mjs', import.meta.url)), inventoryPath], { cwd: root, encoding: 'utf8' });
    assert.equal(listed.status, 0, listed.stderr);
    const cases = JSON.parse(readFileSync(inventoryPath, 'utf8'));
    assert.deepEqual(cases.map(item => [item.name, item.skipped]).sort(), [
      ['outer inner case 1', false], ['outer inner case 2', false], ['outer skipped case', true],
    ]);
    const reportPath = join(root, 'report.json');
    const run = spawnSync(process.execPath, [vitest, 'run', '--reporter=json', `--outputFile.json=${reportPath}`], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.deepEqual(mixedTests(result, result, cases), { mixed: [], incomplete: true });
    result.testResults[0].assertionResults = result.testResults[0].assertionResults.filter(item => item.fullName !== 'outer skipped case');
    assert.deepEqual(mixedTests(result, result, cases), { mixed: [], incomplete: true });
    const runnable = cases.filter(item => !item.skipped);
    assert.deepEqual(mixedTests(result, result, runnable), { mixed: [], incomplete: false });
    result.testResults[0].assertionResults = result.testResults[0].assertionResults.filter(item => item.fullName !== 'outer inner case 2');
    assert.deepEqual(mixedTests(result, result, runnable), { mixed: [], incomplete: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('collection includes all configured Vitest projects', () => {
  const root = mkdtempSync(join(tmpdir(), 'calm-vitest-projects-'));
  try {
    symlinkSync(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
    mkdirSync(join(root, 'one'));
    mkdirSync(join(root, 'two'));
    writeFileSync(join(root, 'vitest.config.mjs'), `
      import { defineConfig } from 'vitest/config';
      export default defineConfig({ test: { projects: [
        { test: { name: 'one', include: ['one/*.test.js'] } },
        { test: { name: 'two', include: ['two/*.test.js'] } },
      ] } });
    `);
    writeFileSync(join(root, 'one/a.test.js'), "import { test } from 'vitest'; test('first project', () => {});");
    writeFileSync(join(root, 'two/b.test.js'), "import { test } from 'vitest'; test.skip('second project skipped', () => {});");
    const output = join(root, 'inventory.json');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./flaky-inventory.mjs', import.meta.url)), output], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')).map(item => [item.name, item.skipped]).sort(), [
      ['first project', false], ['second project skipped', true],
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
