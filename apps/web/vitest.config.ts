import { defineConfig } from 'vitest/config';

// Vitest owns unit/component tests; Playwright owns the e2e/ directory
// (run through `npm run e2e` with apps/web/playwright.config.ts).
export default defineConfig({
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/workers/*Worker.ts'
      ],
      reporter: ['text', 'html', 'json', 'clover']
    }
  }
});
