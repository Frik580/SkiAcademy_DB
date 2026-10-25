import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { assertEmulators } = createRequire(import.meta.url)('./testFirestoreNetworkGuard.cjs');
const args = process.argv.slice(2).filter((arg) => {
  if (!arg.startsWith('--require-emulators=')) return true;
  assertEmulators(process.env, arg.slice('--require-emulators='.length).split(','));
  return false;
});

const root = fileURLToPath(new URL('../', import.meta.url));
const guard = fileURLToPath(new URL('./testFirestoreNetworkGuard.cjs', import.meta.url)).replaceAll(
  '\\',
  '/'
);
mkdirSync(new URL('../.scratch/test-egress/', import.meta.url), { recursive: true });
const ledger = fileURLToPath(
  new URL(`../.scratch/test-egress/vitest-${process.pid}.log`, import.meta.url)
);
writeFileSync(ledger, '');
const child = spawn(
  process.execPath,
  [
    '--require',
    guard,
    fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
    'run',
    ...args,
  ],
  {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, CARVE_TEST_EGRESS_LOG: ledger },
  }
);
const interrupt = () => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else child.kill('SIGINT');
};
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
let code;
try {
  code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}
const violations = readFileSync(ledger, 'utf8').trim();
if (violations) console.error(violations);
console.log(
  `Firestore egress ledger: ${ledger} (${violations ? 'BLOCKED ATTEMPT' : '0 attempts'})`
);
process.exitCode = violations ? 1 : code;
