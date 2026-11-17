import { configDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { hostingBuildInfoPlugin } from './scripts/hostingBuildInfoPlugin.mjs';

let e2eBuild = false;

// https://vitejs.dev/config/
export default defineConfig({
  optimizeDeps: {
    // Scan the application entry, not every HTML fixture in the repository.
    entries: ['index.html'],
  },
  build: {
    manifest: true,
  },
  resolve: {
    alias: {
      '@ski-academy/shared-domain/canonical': fileURLToPath(
        new URL('./packages/shared-domain/src/canonical/', import.meta.url)
      ),
      '@ski-academy/shared-domain/booking': fileURLToPath(
        new URL('./packages/shared-domain/src/booking.ts', import.meta.url)
      ),
      '@ski-academy/shared-domain/resortSlideImages': fileURLToPath(
        new URL('./packages/shared-domain/src/resortSlideImages.ts', import.meta.url)
      ),
      '@ski-academy/shared-domain/entities': fileURLToPath(
        new URL('./packages/shared-domain/src/entities.ts', import.meta.url)
      ),
      '@ski-academy/shared-domain': fileURLToPath(
        new URL('./packages/shared-domain/src/index.ts', import.meta.url)
      ),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    hostingBuildInfoPlugin(),
    {
      name: 'e2e-app-probe',
      apply: 'build',
      configResolved(config) {
        e2eBuild = config.mode === 'e2e';
      },
      transformIndexHtml: {
        order: 'pre',
        handler() {
          return e2eBuild
            ? [
                {
                  tag: 'script',
                  attrs: { type: 'module', src: '/e2e/app-probe.ts' },
                  injectTo: 'body',
                },
              ]
            : [];
        },
      },
    },
  ],
  server: {
    port: 3000,
    host: true,
    strictPort: true,
  },
  test: {
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/firestore.rules.test.ts',
      'tests/storage.rules.test.ts',
    ],
  },
});
