import { defineConfig } from '@playwright/test';

// Browser-journey and paint-regression suite (docs/plans/06 §17 Luna 5).
// Chromium downloads into the repo-local .browsers directory:
//   npm run e2e:install
// The dev server is reused when already running, else started here.

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 7_000,
    toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.02 }
  },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' }
    }
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000
  }
});
