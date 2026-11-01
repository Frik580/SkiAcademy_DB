import { mergeConfig } from 'vite';
import appConfig from '../vite.config';

// Compile the real cabinet route before live-store E2E browsers start.
export default mergeConfig(appConfig, {
  server: {
    warmup: {
      clientFiles: ['./src/app/routes/CabinetRouteContainer.tsx'],
    },
  },
});
