import { defineConfig } from '@playwright/test';

// Isolated UI integration checks; no authenticated routes or canonical writes.
export default defineConfig({
  testDir: './tests/browser/level-modals',
  testMatch: '*.spec.ts',
  workers: 1,
  outputDir: '.scratch/level-modal-visibility/results',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5178', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5178',
    url: 'http://127.0.0.1:5178/tests/browser/level-modals/index.html',
    reuseExistingServer: !process.env.CI,
  },
});
