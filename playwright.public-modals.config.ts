import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser/public-modals',
  workers: 1,
  outputDir: '.scratch/ca-05/results',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5176', browserName: 'chromium' },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js preview --config vite.public-modals.config.ts --host 127.0.0.1 --port 5176 --strictPort',
    url: 'http://127.0.0.1:5176/tests/browser/public-modals/index.html',
    reuseExistingServer: false,
  },
});
