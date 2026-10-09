import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { E2E_PROJECT_ID } from '../../e2e/emulator-config';
import {
  assertFirebaseEnvironment,
  FirebaseEnvironmentGuardError,
  PRODUCTION_FIREBASE_PROJECT_ID,
  STAGING_FIREBASE_PROJECT_ID,
} from '../../src/infrastructure/firebase/firebaseEnvironmentGuard';

const repoRoot = process.cwd();

/** Execute the real runner with process and filesystem effects intercepted. */
async function captureE2ERunner(argv: string[] = [], env: Record<string, string> = {}) {
  const runnerPath = resolve(repoRoot, 'scripts/runE2E.mjs');
  const source = readFileSync(runnerPath, 'utf8')
    .replace(/^import .* from 'node:[^']+';\r?\n/gm, '')
    .replace(/import\.meta\.url/g, 'runnerUrl');
  const spawn = vi.fn(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('exit', 0));
    return child;
  });
  const writeFileSync = vi.fn();
  const unlinkSync = vi.fn();
  const runnerProcess = {
    argv: [process.execPath, runnerPath, ...argv],
    execPath: process.execPath,
    platform: process.platform,
    env,
    on: vi.fn(),
    off: vi.fn(),
    exitCode: undefined,
  };
  await runInNewContext(`(async () => {\n${source}\n})()`, {
    runnerUrl: pathToFileURL(runnerPath).href,
    URL,
    fileURLToPath,
    process: runnerProcess,
    spawn,
    spawnSync: vi.fn(),
    existsSync: () => true,
    readFileSync: () => 'GUEST_ACTION_TOKEN_SECRET=e2e-guest-action-token-secret\n',
    writeFileSync,
    unlinkSync,
  });
  expect(writeFileSync).not.toHaveBeenCalled();
  expect(unlinkSync).not.toHaveBeenCalled();
  return spawn;
}

function parseEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  return values;
}

/** Same file order Vite uses: later mode files override `.env`. */
function mergeViteEnv(
  mode: string,
  files: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const name of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    const text = files[name];
    if (text !== undefined) Object.assign(merged, parseEnv(text));
  }
  return merged;
}

function resolveViteModeEnv(
  mode: string,
  files: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  return mergeViteEnv(mode, files);
}

describe('firebase environment guard', () => {
  it('rejects a staging hostname that is wired to the production project', () => {
    for (const hostname of ['ski-school-staging.web.app', 'ski-school-staging.firebaseapp.com']) {
      expect(() =>
        assertFirebaseEnvironment({
          hostname,
          projectId: PRODUCTION_FIREBASE_PROJECT_ID,
          useEmulators: false,
        })
      ).toThrow(FirebaseEnvironmentGuardError);
    }
  });

  it('rejects a production hostname that is wired to the staging project', () => {
    for (const hostname of ['ski-school-8f3ca.web.app', 'ski-school-8f3ca.firebaseapp.com']) {
      expect(() =>
        assertFirebaseEnvironment({
          hostname,
          projectId: STAGING_FIREBASE_PROJECT_ID,
          useEmulators: false,
        })
      ).toThrow(FirebaseEnvironmentGuardError);
    }
  });

  it('rejects localhost when the Firebase project is production', () => {
    expect(() =>
      assertFirebaseEnvironment({
        hostname: 'localhost',
        projectId: PRODUCTION_FIREBASE_PROJECT_ID,
        useEmulators: false,
      })
    ).toThrow(FirebaseEnvironmentGuardError);
  });

  it('allows localhost when the Firebase project is staging', () => {
    expect(() =>
      assertFirebaseEnvironment({
        hostname: 'localhost',
        projectId: STAGING_FIREBASE_PROJECT_ID,
        useEmulators: false,
      })
    ).not.toThrow();
  });

  it('allows local hosts when Firebase emulator routing is explicitly enabled', () => {
    expect(() =>
      assertFirebaseEnvironment({
        hostname: '127.0.0.1',
        projectId: PRODUCTION_FIREBASE_PROJECT_ID,
        useEmulators: true,
      })
    ).not.toThrow();
  });

  it('allows the matching project on each hosting hostname', () => {
    expect(() =>
      assertFirebaseEnvironment({
        hostname: 'ski-school-staging.web.app',
        projectId: STAGING_FIREBASE_PROJECT_ID,
        useEmulators: false,
      })
    ).not.toThrow();
    expect(() =>
      assertFirebaseEnvironment({
        hostname: 'ski-school-8f3ca.firebaseapp.com',
        projectId: PRODUCTION_FIREBASE_PROJECT_ID,
        useEmulators: false,
      })
    ).not.toThrow();
  });
});

describe('vite firebase env resolution', () => {
  it('lets a mode file override a production .env', () => {
    const development = mergeViteEnv('development', {
      '.env': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\nVITE_FIREBASE_MEASUREMENT_ID=G-PROD\n',
      '.env.development':
        'VITE_FIREBASE_PROJECT_ID=ski-school-staging\nVITE_FIREBASE_MEASUREMENT_ID=\n',
    });
    const staging = mergeViteEnv('staging', {
      '.env': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\n',
      '.env.staging': 'VITE_FIREBASE_PROJECT_ID=ski-school-staging\n',
    });
    const production = mergeViteEnv('production', {
      '.env': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\n',
      '.env.development': 'VITE_FIREBASE_PROJECT_ID=ski-school-staging\n',
    });

    expect(development.VITE_FIREBASE_PROJECT_ID).toBe(STAGING_FIREBASE_PROJECT_ID);
    expect(development.VITE_FIREBASE_MEASUREMENT_ID).toBe('');
    expect(staging.VITE_FIREBASE_PROJECT_ID).toBe(STAGING_FIREBASE_PROJECT_ID);
    expect(production.VITE_FIREBASE_PROJECT_ID).toBe(PRODUCTION_FIREBASE_PROJECT_ID);
  });

  it('development mode overrides a production base and rejects a missing local override', () => {
    const env = resolveViteModeEnv('development', {
      '.env': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\n',
      '.env.development': 'VITE_FIREBASE_PROJECT_ID=ski-school-staging\n',
    });
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe(STAGING_FIREBASE_PROJECT_ID);
    expect(env.VITE_USE_FIREBASE_EMULATORS ?? 'false').toBe('false');
    expect(() =>
      assertFirebaseEnvironment({
        hostname: 'localhost',
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        useEmulators: env.VITE_USE_FIREBASE_EMULATORS === 'true',
      })
    ).not.toThrow();

    const missingOverride = resolveViteModeEnv('development', {
      '.env': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\n',
    });
    expect(missingOverride.VITE_FIREBASE_PROJECT_ID).toBe(PRODUCTION_FIREBASE_PROJECT_ID);
    expect(() =>
      assertFirebaseEnvironment({
        hostname: 'localhost',
        projectId: missingOverride.VITE_FIREBASE_PROJECT_ID,
        useEmulators: false,
      })
    ).toThrow(FirebaseEnvironmentGuardError);
  });

  it('staging mode resolves to the staging project without enabling emulators', () => {
    const env = resolveViteModeEnv('staging', {
      '.env': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\n',
      '.env.staging': 'VITE_FIREBASE_PROJECT_ID=ski-school-staging\n',
    });
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe(STAGING_FIREBASE_PROJECT_ID);
    expect(env.VITE_USE_FIREBASE_EMULATORS ?? 'false').toBe('false');
    expect(() =>
      assertFirebaseEnvironment({
        hostname: 'localhost',
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        useEmulators: env.VITE_USE_FIREBASE_EMULATORS === 'true',
      })
    ).not.toThrow();

    const missingStagingConfig = resolveViteModeEnv('staging', {
      '.env': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\n',
    });
    expect(() =>
      assertFirebaseEnvironment({
        hostname: 'localhost',
        projectId: missingStagingConfig.VITE_FIREBASE_PROJECT_ID,
        useEmulators: false,
      })
    ).toThrow(FirebaseEnvironmentGuardError);
  });

  it('production mode resolves to production with emulators disabled', () => {
    const env = resolveViteModeEnv('production', {
      '.env': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\n',
    });
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe(PRODUCTION_FIREBASE_PROJECT_ID);
    expect(env.VITE_USE_FIREBASE_EMULATORS ?? 'false').toBe('false');
    expect(() =>
      assertFirebaseEnvironment({
        hostname: 'ski-school-8f3ca.web.app',
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        useEmulators: env.VITE_USE_FIREBASE_EMULATORS === 'true',
      })
    ).not.toThrow();
  });

  it('e2e mode uses the isolated emulator project and requires emulator routing', async () => {
    const e2eEnvFile = readFileSync(resolve(repoRoot, '.env.e2e'), 'utf8');
    const env = resolveViteModeEnv('e2e', {
      '.env': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\nVITE_USE_FIREBASE_EMULATORS=false\n',
      '.env.e2e': e2eEnvFile,
    });
    expect(env.VITE_USE_FIREBASE_EMULATORS).toBe('true');
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe(E2E_PROJECT_ID);
    expect(() =>
      assertFirebaseEnvironment({
        hostname: '127.0.0.1',
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        useEmulators: env.VITE_USE_FIREBASE_EMULATORS === 'true',
      })
    ).not.toThrow();
    expect(() =>
      assertFirebaseEnvironment({
        hostname: '127.0.0.1',
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        useEmulators: false,
      })
    ).toThrow(FirebaseEnvironmentGuardError);

    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['test:e2e']).toBe(
      'npm run build:functions && node scripts/runE2E.mjs'
    );
    const spawn = await captureE2ERunner(['--project=chromium'], {
      GCLOUD_PROJECT: PRODUCTION_FIREBASE_PROJECT_ID,
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [
        resolve(repoRoot, 'node_modules/firebase-tools/lib/bin/firebase.js'),
        'emulators:exec',
        '--project',
        E2E_PROJECT_ID,
        '--only',
        'auth,firestore,functions,storage',
        'node scripts/runE2E.mjs --playwright',
      ],
      expect.objectContaining({
        cwd: fileURLToPath(new URL('../', pathToFileURL(resolve(repoRoot, 'scripts/runE2E.mjs')))),
        env: expect.objectContaining({
          CARVE_E2E_PLAYWRIGHT_ARGS: JSON.stringify(['--project=chromium']),
        }),
      })
    );
    const emulatorEnv = {
      GCLOUD_PROJECT: E2E_PROJECT_ID,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9299',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
      CARVE_E2E_PLAYWRIGHT_ARGS: JSON.stringify(['--project=chromium']),
    };
    const playwrightSpawn = await captureE2ERunner(['--playwright'], emulatorEnv);
    expect(playwrightSpawn).toHaveBeenCalledTimes(1);
    expect(playwrightSpawn).toHaveBeenCalledWith(
      process.execPath,
      [resolve(repoRoot, 'node_modules/@playwright/test/cli.js'), 'test', '--project=chromium'],
      expect.objectContaining({ env: emulatorEnv })
    );
    for (const unsafeEnv of [
      {},
      { ...emulatorEnv, GCLOUD_PROJECT: PRODUCTION_FIREBASE_PROJECT_ID },
      { ...emulatorEnv, FIRESTORE_EMULATOR_HOST: '' },
    ]) {
      await expect(captureE2ERunner(['--playwright'], unsafeEnv)).rejects.toThrow(
        'Run E2E through npm run test:e2e with the demo emulators.'
      );
    }
    expect(readFileSync(resolve(repoRoot, 'playwright.config.ts'), 'utf8')).toMatch(
      /npm run dev -- --mode e2e/
    );
  });

  it('npm run dev uses the staging mode instead of the ignored development config', () => {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts.dev).toBe('vite --mode staging');
    expect(packageJson.scripts.build).toBe('tsc && vite build');
    expect(packageJson.scripts['build:prod']).toBe('tsc && vite build --mode production');

    const resolvedWithoutDevelopmentFile = resolveViteModeEnv('staging', {
      '.env': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\n',
      '.env.development': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\n',
      '.env.staging': 'VITE_FIREBASE_PROJECT_ID=ski-school-staging\n',
    });
    expect(resolvedWithoutDevelopmentFile.VITE_FIREBASE_PROJECT_ID).toBe(
      STAGING_FIREBASE_PROJECT_ID
    );
    expect(resolvedWithoutDevelopmentFile.VITE_USE_FIREBASE_EMULATORS ?? 'false').toBe('false');
  });

  it('rejects manual deploy scripts that omit an explicit Firebase project', () => {
    const manifests = ['package.json', 'functions/package.json'];
    for (const manifest of manifests) {
      const packageJson = JSON.parse(readFileSync(resolve(repoRoot, manifest), 'utf8')) as {
        scripts?: Record<string, string>;
      };
      for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
        if (!command.includes('firebase deploy')) continue;
        expect(command, `${manifest} script ${name}`).toMatch(/--project (staging|prod)(?:\s|$)/);
      }
    }
  });
});
