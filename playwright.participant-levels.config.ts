import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser/participant-levels',
  testMatch: '*.spec.ts',
  workers: 1,
  outputDir: '.scratch/unified-participant-levels/browser-results',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5177', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5177',
    url: 'http://127.0.0.1:5177/tests/browser/participant-levels/index.html',
    reuseExistingServer: false,
  },
});
