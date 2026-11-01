import { defineConfig, devices } from '@playwright/test';

const port = 5173;
const liveFixtures = process.env.CARVE_E2E_LIVE_FIXTURES !== 'false';
const hostingSecurity = process.env.CARVE_TEST_HOSTING === 'true';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  globalSetup: hostingSecurity ? undefined : './e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: hostingSecurity
    ? undefined
    : [
        {
          command: `npm exec vite -- preview --mode e2e --outDir .scratch/e2e-app --host 127.0.0.1 --port ${port} --strictPort`,
          url: `http://127.0.0.1:${port}`,
          reuseExistingServer: false,
          timeout: 120_000,
        },
        ...(liveFixtures
          ? [
              {
                command:
                  'npm exec vite -- --mode e2e --config e2e/vite.live.config.ts --host 127.0.0.1 --port 5174 --strictPort',
                url: 'http://127.0.0.1:5174/src/app/routes/CabinetRouteContainer.tsx',
                reuseExistingServer: false,
                timeout: 120_000,
              },
            ]
          : []),
      ],
});
