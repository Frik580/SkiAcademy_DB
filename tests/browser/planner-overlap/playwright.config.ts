import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'planner.spec.ts',
  workers: 1,
  timeout: 30000,
  outputDir: '../../../.scratch/planner-overlap/browser-results',
  use: { baseURL: 'http://planner.test', screenshot: 'only-on-failure' },
});
