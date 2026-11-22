import { defineConfig } from '@playwright/test';

// Presentation verification only; this does not claim authenticated workflow coverage.
export default defineConfig({
  testDir: './tests/browser/admin-issue-attendance',
  testMatch: '*.spec.ts',
  workers: 1,
  outputDir: '.scratch/admin-issue-attendance/results',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:18765',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/browser/admin-issue-attendance/server.mjs',
    url: 'http://127.0.0.1:18765/__attendance_ready',
    reuseExistingServer: false,
  },
});
