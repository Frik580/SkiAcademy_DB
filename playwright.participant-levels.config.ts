import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser/participant-levels',
  testMatch: '*.spec.ts',
  workers: 1,
  outputDir: '.scratch/unified-participant-levels/browser-results',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5177',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/browser/participant-levels/server.mjs',
    url: 'http://127.0.0.1:5177/__participant_levels_ready',
    reuseExistingServer: false,
  },
});
