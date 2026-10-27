import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Serve the same compiled module graph as Hosting. A dev-server HTML 200 does
// not mean Vite's cold dependency transforms are ready for browser navigation.
export default defineConfig({
  ...base,
  testMatch: 'booking-chat-media.spec.ts',
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js build --mode e2e --outDir .scratch/chat-media-dist && node node_modules/vite/bin/vite.js preview --mode e2e --outDir .scratch/chat-media-dist --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
