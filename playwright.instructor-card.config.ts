import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser/instructor-card',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: 'list',
  outputDir: '.scratch/instructor-card/results',
  use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:5183' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5183',
    url: 'http://127.0.0.1:5183/tests/browser/instructor-card/index.html',
    reuseExistingServer: false,
  },
});
