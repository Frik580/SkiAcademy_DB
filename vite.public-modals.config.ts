import { defineConfig, mergeConfig } from 'vite';
import appConfig from './vite.config';

export default mergeConfig(
  appConfig,
  defineConfig({
    build: {
      outDir: '.scratch/ca-05/preview',
      emptyOutDir: true,
      rollupOptions: { input: 'tests/browser/public-modals/index.html' },
    },
  })
);
