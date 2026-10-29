import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Compare individual tests, not just the exit status of the whole suite.
export function mixedTests(first, second, inventory) {
  let incomplete = false;
  const results = (report) => {
    const tests = new Map();
    const duplicates = new Set();
    if (!Array.isArray(report?.testResults)) {
      incomplete = true;
      return tests;
    }
    for (const file of report.testResults) {
      if (typeof file?.name !== 'string' || !Array.isArray(file.assertionResults)) {
        incomplete = true;
        continue;
      }
      for (const test of file.assertionResults) {
        if (typeof test?.fullName !== 'string') {
          incomplete = true;
          continue;
        }
        const id = JSON.stringify([file.name, test.fullName]);
        if (tests.has(id) || duplicates.has(id)) {
          incomplete = true;
          tests.delete(id);
          duplicates.add(id);
          continue;
        }
        if (test.status !== 'passed' && test.status !== 'failed') incomplete = true;
        tests.set(id, test.status);
      }
    }
    return tests;
  };
  const expected = new Set();
  const ineligible = new Set();
  if (!Array.isArray(inventory) || inventory.length === 0) {
    incomplete = true;
  } else {
    for (const item of inventory) {
      if (typeof item?.file !== 'string' || typeof item?.name !== 'string') {
        incomplete = true;
        continue;
      }
      const id = JSON.stringify([item.file, item.name]);
      if (typeof item.skipped !== 'boolean' || item.skipped) incomplete = true;
      if (expected.has(id)) {
        incomplete = true;
        ineligible.add(id);
      }
      expected.add(id);
    }
  }
  const a = results(first);
  const b = results(second);
  for (const tests of [a, b]) {
    if (tests.size !== expected.size || [...expected].some((id) => !tests.has(id))) incomplete = true;
  }
  if (a.size !== b.size || [...a.keys()].some((id) => !b.has(id))) incomplete = true;
  for (const [id, status] of a) {
    const next = b.get(id);
    if ((status === 'passed' || status === 'failed') !== (next === 'passed' || next === 'failed')) {
      incomplete = true;
    }
  }
  const mixed = [...a].filter(([id, status]) =>
    !ineligible.has(id) && ((status === 'passed' && b.get(id) === 'failed') ||
    (status === 'failed' && b.get(id) === 'passed')),
  ).map(([id]) => JSON.parse(id));
  return { mixed, incomplete };
}

function main() {
  const output = resolve(process.env.FLAKE_OUTPUT ?? join(tmpdir(), `calm-flakes-${Date.now()}-${process.pid}`));
  mkdirSync(output);
  const inventoryPath = join(output, 'inventory.json');
  const listed = spawnSync(process.execPath, [fileURLToPath(new URL('./flaky-inventory.mjs', import.meta.url)), inventoryPath], {
    stdio: 'inherit', timeout: 120_000,
  });
  let inventory = null;
  if (listed.status === 0) {
    try { inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')); } catch (error) { console.error('Cannot read test inventory:', error.message); }
  } else {
    console.error('Cannot collect test inventory:', listed.error?.message ?? `exit ${listed.status}, signal ${listed.signal}`);
  }
  const attempts = [];
  for (let n = 1; n <= 2; n++) {
    const report = join(output, `attempt-${n}.json`);
    const result = spawnSync(process.execPath, [
      'node_modules/vitest/vitest.mjs', 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${report}`,
    ], { stdio: 'inherit' });
    const attempt = { status: result.status, signal: result.signal, error: result.error?.message };
    writeFileSync(join(output, `attempt-${n}-status.json`), JSON.stringify(attempt, null, 2) + '\n');
    let data = null;
    try { data = JSON.parse(readFileSync(report, 'utf8')); } catch (error) { console.error(`Cannot read attempt ${n} report:`, error.message); }
    attempts.push({ ...attempt, report: data });
  }
  const { mixed, incomplete } = mixedTests(attempts[0].report, attempts[1].report, inventory);
  if (incomplete) console.error('Cannot fully compare test reports');
  writeFileSync(join(output, 'summary.json'), JSON.stringify({
    inventory: { status: listed.status, signal: listed.signal, error: listed.error?.message },
    attempts: attempts.map(({ report, ...attempt }) => attempt), mixed, incomplete,
  }, null, 2) + '\n');
  for (const [file, name] of mixed) console.error(`Flaky test: ${file} :: ${name}`);
  console.log(`Test evidence: ${output}`);
  return incomplete || mixed.length > 0 || attempts.some(({ status }) => status !== 0) ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = main();
