import { runRelease } from './deploymentRelease.mjs';

const releaseKey = process.argv[2];
const outcome = await runRelease(releaseKey);
if (outcome.error === 'invalid-release-key') {
  console.error(
    'Expected hosting:staging, hosting:prod, full:prod, functions:staging, or functions:prod'
  );
  process.exit(2);
}
process.exit(outcome.exitCode ?? 1);
