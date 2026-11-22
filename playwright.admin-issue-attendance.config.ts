import { defineConfig } from '@playwright/test';

// Browser workflow with canonical transport fixtures and no production connection.
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
    url: 'http://127.0.0.1:18765/tests/browser/admin-issue-attendance/index.html',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
