import { resolve } from 'node:path';
import { build, preview } from 'vite';

const config = {
  configFile: 'vite.config.ts',
  mode: 'staging',
  publicDir: false,
  build: {
    outDir: '.scratch/admin-issue-attendance/preview',
    emptyOutDir: true,
    rollupOptions: { input: 'tests/browser/admin-issue-attendance/index.html' },
  },
};

await build({
  ...config,
  logLevel: 'warn',
  plugins: [
    {
      name: 'attention-center-fixture-data',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer?.replaceAll('\\', '/').includes('/src/features/admin/')) return;
        if (
          [
            'useAdminAttentionChangeRequests',
            'AdminLevelRequests',
            'canonicalCommandClient',
            'canonicalReadModelClient',
            'adminIssueInboxRevisionCoordinator',
            'adminLessonBookingsRevisionCoordinator',
            'adminFinanceRevisionCoordinator',
          ].includes(source.split('/').at(-1))
        ) {
          return resolve('tests/browser/admin-issue-attendance/centerData.tsx');
        }
      },
    },
  ],
});

await preview({
  ...config,
  preview: { host: '127.0.0.1', port: 18765, strictPort: true },
});
