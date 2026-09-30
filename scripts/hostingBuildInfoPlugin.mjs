import { resolveHostingBuildInfo, sameSourceIdentity } from './deploymentProvenance.mjs';

export function hostingBuildInfoPlugin() {
  let mode = 'production';
  let buildInfo = null;

  return {
    name: 'hosting-build-info',
    apply: 'build',
    configResolved(config) {
      mode = config.mode;
    },
    buildStart() {
      buildInfo = resolveHostingBuildInfo({
        mode,
        env: process.env,
        cwd: process.cwd(),
        buildTimestamp: new Date().toISOString(),
      });
    },
    generateBundle() {
      const current = resolveHostingBuildInfo({
        mode,
        env: process.env,
        cwd: process.cwd(),
        buildTimestamp: buildInfo.buildTimestamp,
      });
      if (!sameSourceIdentity(buildInfo, current)) {
        throw new Error('Source identity changed during the hosting build. Re-run the build.');
      }
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: `${JSON.stringify(buildInfo, null, 2)}\n`,
      });
    },
  };
}
