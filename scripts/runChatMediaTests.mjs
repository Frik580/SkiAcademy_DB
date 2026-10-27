import { spawnSync } from 'node:child_process';
import process from 'node:process';

let failed = false;
for (const args of [
  [
    '--config',
    'vitest.config.ts',
    'tests/storage.rules.test.ts',
    'tests/integration/bookingQueryContracts.test.ts',
  ],
  ['--config', 'functions/vitest.config.ts', 'src/chat/chatMedia.emulator.test.ts'],
]) {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/runVitest.mjs',
      '--require-emulators=firestore,storage,auth',
      ...args,
      '--no-file-parallelism',
      '--testTimeout=60000',
      '--hookTimeout=60000',
    ],
    { stdio: 'inherit', env: process.env, windowsHide: true }
  );
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
