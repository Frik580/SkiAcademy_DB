import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Real app modules let the test exercise an authenticated background refresh
// in the same Zustand instance as an already-open form, without injecting data.
export default defineConfig({
  ...base,
  testMatch: [
    'student-skill-evaluation-concurrency.spec.ts',
    'student-coach-comments-participant-switch.spec.ts',
  ],
  webServer: {
    command:
      'npm exec vite -- --mode e2e --config e2e/vite.live.config.ts --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
