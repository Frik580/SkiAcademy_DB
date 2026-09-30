import { spawnSync } from 'node:child_process';
import { RELEASE_COMMANDS } from './deploymentProvenance.mjs';

const command = RELEASE_COMMANDS[process.argv[2]];
if (!command) {
  console.error('Expected hosting:staging, hosting:prod, functions:staging, or functions:prod');
  process.exit(2);
}

const result = spawnSync(command, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CARVE_RELEASE: '1' },
});

process.exit(result.status === null ? 1 : result.status);
