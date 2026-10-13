import { defineConfig } from '@playwright/test';

// Component-only browser tests: no protected app routes, auth, or Firebase emulator reset.
export default defineConfig({
  testDir: './tests/browser/admin-modals',
  testMatch: '*.spec.ts',
  workers: 1,
  outputDir: '.scratch/admin-modal-unification/component-results',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5175', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev -- --config vite.admin-modals.config.ts --host 127.0.0.1 --port 5175',
    url: 'http://127.0.0.1:5175/tests/browser/admin-modals/index.html',
    reuseExistingServer: false,
  },
});
