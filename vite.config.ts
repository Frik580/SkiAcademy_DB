/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    manifest: true,
  },
  resolve: {
    alias: {
      '@ski-academy/shared-domain': fileURLToPath(
        new URL('./packages/shared-domain/src/index.ts', import.meta.url)
      ),
    },
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: true,
    strictPort: true,
  },
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/firestore.rules.test.ts',
      'tests/storage.rules.test.ts',
    ],
  },
});
