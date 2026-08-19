import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@ski-academy/shared-domain/entities': fileURLToPath(
        new URL('../packages/shared-domain/src/entities.ts', import.meta.url)
      ),
      '@ski-academy/shared-domain': fileURLToPath(
        new URL('../packages/shared-domain/src/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

