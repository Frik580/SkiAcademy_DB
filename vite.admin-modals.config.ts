import { defineConfig, mergeConfig } from 'vite';
import appConfig from './vite.config';

// Keep component fixtures independent from the application's E2E dependency cache.
export default mergeConfig(
  appConfig,
  defineConfig({
    cacheDir: '.scratch/admin-modal-unification/vite-cache',
  })
);
