import { writeFileSync } from 'node:fs';
import { createVitest } from 'vitest/node';

// Collection loads test modules and global setup, as Vitest does for a normal run.
const runner = await createVitest('test', { watch: false, reporters: [] });
try {
  const specifications = await runner.globTestSpecifications();
  const { testModules, unhandledErrors } = await runner.collectTests(specifications);
  if (process.exitCode || unhandledErrors.length > 0 || testModules.length !== specifications.length) throw new Error('Vitest could not collect all tests');
  const tests = [];
  for (const module of testModules) {
    for (const item of module.children.allTests()) {
      const names = [item.name];
      let parent = item.parent;
      while (parent.type === 'suite') {
        names.unshift(parent.name);
        parent = parent.parent;
      }
      tests.push({ file: module.moduleId, name: names.join(' '), skipped: item.result().state !== 'pending' });
    }
  }
  writeFileSync(process.argv[2], JSON.stringify(tests, null, 2) + '\n');
} finally {
  await runner.close();
}
