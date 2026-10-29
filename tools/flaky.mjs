import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Compare individual tests, not just the exit status of the whole suite.
export function mixedTests(first, second) {
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
        if (typeof test?.fullName !== 'string' || typeof test.status !== 'string') {
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
        tests.set(id, test.status);
      }
    }
    return tests;
  };
  const a = results(first);
  const b = results(second);
  if (a.size !== b.size || [...a.keys()].some((id) => !b.has(id))) incomplete = true;
  for (const [id, status] of a) {
    const next = b.get(id);
    if ((status === 'passed' || status === 'failed') !== (next === 'passed' || next === 'failed')) {
      incomplete = true;
    }
  }
  const mixed = [...a].filter(([id, status]) =>
    (status === 'passed' && b.get(id) === 'failed') ||
    (status === 'failed' && b.get(id) === 'passed'),
  ).map(([id]) => JSON.parse(id));
  return { mixed, incomplete };
}

function main() {
  const output = resolve(process.env.FLAKE_OUTPUT ?? join(tmpdir(), `calm-flakes-${Date.now()}-${process.pid}`));
  mkdirSync(output);
  const attempts = [];
  for (let n = 1; n <= 2; n++) {
    const report = join(output, `attempt-${n}.json`);
    const result = spawnSync(process.execPath, [
      'node_modules/vitest/vitest.mjs', 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${report}`,
    ], { stdio: 'inherit' });
    let data = null;
    try { data = JSON.parse(readFileSync(report, 'utf8')); } catch (error) { console.error(`Cannot read attempt ${n} report:`, error.message); }
    attempts.push({ status: result.status, signal: result.signal, error: result.error?.message, report: data });
  }
  const { mixed, incomplete } = mixedTests(attempts[0].report, attempts[1].report);
  if (incomplete) console.error('Cannot fully compare test reports');
  writeFileSync(join(output, 'summary.json'), JSON.stringify({
    attempts: attempts.map(({ report, ...attempt }) => attempt), mixed, incomplete,
  }, null, 2) + '\n');
  for (const [file, name] of mixed) console.error(`Flaky test: ${file} :: ${name}`);
  console.log(`Test evidence: ${output}`);
  return incomplete || mixed.length > 0 || attempts.some(({ status }) => status !== 0) ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = main();
