import { defineConfig, mergeConfig } from 'vite';
import appConfig from './vite.config';

// Exercise the application's production CSS pipeline with an unauthenticated fixture.
// The fixture is only included by this test config, never by a normal Hosting build.
export default mergeConfig(
  appConfig,
  defineConfig({
    build: {
      outDir: '.scratch/journey-geometry/dist',
      rollupOptions: {
        input: {
          app: 'index.html',
          journey: 'tests/browser/journey-geometry/index.html',
        },
      },
    },
  })
);
