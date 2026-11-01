import globals from 'globals';
import strict from './eslint.strict.mjs';

export default [
  ...strict,
  // Agent worktrees and session files: whole copies of the repository that typed lint would read again.
  { ignores: ['.claude/**'] },
  { files: ['src/**/*.ts'], languageOptions: { globals: globals.browser } },
  { files: ['src/world-worker.ts'], languageOptions: { globals: globals.worker } },
  {
    files: ['tools/**/*.ts', 'tests/**/*.ts', 'vite.config.ts', '*.mjs'],
    languageOptions: { globals: globals.node },
  },
];
