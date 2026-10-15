import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser/journey-geometry',
  testMatch: '*.spec.ts',
  workers: 1,
  reporter: 'list',
  outputDir: '.scratch/journey-geometry/results',
  use: { browserName: 'chromium', reducedMotion: 'reduce' },
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5181',
      url: 'http://127.0.0.1:5181/tests/browser/journey-geometry/index.html',
      reuseExistingServer: false,
    },
    {
      command:
        'npm run build:staging -- --config vite.journey-geometry.config.ts && npm run preview -- --config vite.journey-geometry.config.ts --host 127.0.0.1 --port 4181 --strictPort',
      url: 'http://127.0.0.1:4181/tests/browser/journey-geometry/index.html',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
