// Vitest profile used only by Stryker mutation runs (`npm run test:mutation`).
//
// Mutation testing re-runs the related unit tests once per mutant, so the test
// loop has to stay fast. Lab-measurement tests that deliberately take minutes
// (fillFeasibility.test.ts probes solveFill with maxNodes: 400_000 and a
// 300_000 ms timeout) are excluded here. They still run in the normal suite
// via `npm --workspace @crossword/construction run test`.
//
// Everything else is inherited from vitest defaults, so newly added fast unit
// tests are picked up by mutation runs automatically.
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/fillFeasibility.test.ts']
  }
});
