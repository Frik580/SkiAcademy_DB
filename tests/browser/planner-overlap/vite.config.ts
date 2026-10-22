import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import base from '../../../vite.config';
export default mergeConfig(
  base,
  defineConfig({
    build: {
      outDir: '.scratch/planner-overlap/harness',
      emptyOutDir: true,
      rollupOptions: { input: 'tests/browser/planner-overlap/index.html' },
    },
    plugins: [
      {
        name: 'planner-test-modal',
        enforce: 'pre',
        resolveId(source, importer) {
          if (source === './ScheduleSlotActionModal' && importer?.endsWith('ScheduleCalendar.tsx'))
            return fileURLToPath(new URL('./modal.tsx', import.meta.url));
        },
      },
    ],
  })
);
