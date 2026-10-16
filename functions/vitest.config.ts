import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@ski-academy/shared-domain/testing': fileURLToPath(
        new URL('../packages/shared-domain/src/testing/index.ts', import.meta.url)
      ),
      '@ski-academy/shared-domain/entities': fileURLToPath(
        new URL('../packages/shared-domain/src/entities.ts', import.meta.url)
      ),
      '@ski-academy/shared-domain': fileURLToPath(
        new URL('../packages/shared-domain/src/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    setupFiles: [
      fileURLToPath(new URL('../tests/helpers/firestoreNetworkGuard.ts', import.meta.url)),
    ],
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
