import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: __dirname,
  test: {
    setupFiles: [
      fileURLToPath(new URL('../../tests/helpers/firestoreNetworkGuard.ts', import.meta.url)),
    ],
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
