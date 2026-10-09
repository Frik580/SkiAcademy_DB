import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const projectId = 'demo-ski-school-e2e';
const secretPath = fileURLToPath(new URL('../functions/.secret.local', import.meta.url));
const testSecret = 'GUEST_ACTION_TOKEN_SECRET=e2e-guest-action-token-secret\n';

async function run(relativeCli, args, env = process.env) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL(relativeCli, import.meta.url)), ...args],
    {
      cwd: root,
      env,
      stdio: 'inherit',
      windowsHide: true,
    }
  );
  const interrupt = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      child.kill('SIGINT');
    }
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

if (process.argv[2] === '--playwright') {
  if (process.env.GCLOUD_PROJECT !== projectId || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Run E2E through npm run test:e2e with the demo emulators.');
  }
  process.exitCode = await run('../node_modules/@playwright/test/cli.js', [
    'test',
    ...JSON.parse(process.env.CARVE_E2E_PLAYWRIGHT_ARGS ?? '[]'),
  ]);
} else {
  let createdSecret = false;
  if (existsSync(secretPath)) {
    if (!/^GUEST_ACTION_TOKEN_SECRET\s*=/m.test(readFileSync(secretPath, 'utf8'))) {
      throw new Error(
        'Existing functions/.secret.local lacks GUEST_ACTION_TOKEN_SECRET; preserve it and add a local test override.'
      );
    }
  } else {
    writeFileSync(secretPath, testSecret, { flag: 'wx' });
    createdSecret = true;
  }
  try {
    process.exitCode = await run(
      '../node_modules/firebase-tools/lib/bin/firebase.js',
      [
        'emulators:exec',
        '--project',
        projectId,
        '--only',
        'auth,firestore,functions,storage',
        'node scripts/runE2E.mjs --playwright',
      ],
      {
        ...process.env,
        CARVE_E2E_PLAYWRIGHT_ARGS: JSON.stringify(process.argv.slice(2)),
        GUEST_ACTION_TOKEN_SECRET: 'e2e-guest-action-token-secret',
      }
    );
  } finally {
    if (
      createdSecret &&
      existsSync(secretPath) &&
      readFileSync(secretPath, 'utf8') === testSecret
    ) {
      unlinkSync(secretPath);
    }
  }
}
