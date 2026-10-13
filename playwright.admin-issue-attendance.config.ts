import { defineConfig } from '@playwright/test';

// Presentation verification only; this does not claim authenticated workflow coverage.
export default defineConfig({
  testDir: './tests/browser/admin-issue-attendance',
  testMatch: '*.spec.ts',
  workers: 1,
  outputDir: '.scratch/admin-issue-attendance/results',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5176', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5176',
    url: 'http://127.0.0.1:5176/tests/browser/admin-issue-attendance/index.html',
    reuseExistingServer: false,
  },
});
