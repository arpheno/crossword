/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  mutate: ['packages/construction/src/csp.ts'],
  vitest: {
    dir: 'packages/construction',
    related: true,
    configFile: `${import.meta.dirname}/packages/construction/vitest.mutation.config.mjs`
  },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  disableTypeChecks: false,
  ignorePatterns: [
    '.venv',
    'node_modules',
    'apps/web/dist',
    'reports',
    'src/crossword/static/lib',
    // Agent/visual-harness artifacts: .browsers holds a Chrome for Testing app
    // bundle whose special files cannot be copied into the sandbox on macOS,
    // and .shots/.shots caches are binary output with no bearing on mutants.
    '.browsers',
    '.shots',
    '__pycache__',
    '.pytest_cache'
  ],
  htmlReporter: {
    fileName: 'reports/mutation/index.html'
  },
  jsonReporter: {
    fileName: 'reports/mutation/report.json'
  },
  thresholds: {
    high: 80,
    low: 70,
    break: 70
  },
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
  // Explicit cap so a mutation run coexists with other local work; the default
  // is n-1 of all logical cores.
  concurrency: 5
};
