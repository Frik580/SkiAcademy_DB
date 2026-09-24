import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertFirebaseEnvironment,
  FirebaseEnvironmentGuardError,
  PRODUCTION_FIREBASE_PROJECT_ID,
  STAGING_FIREBASE_PROJECT_ID,
} from '../../src/infrastructure/firebase/firebaseEnvironmentGuard';

const repoRoot = process.cwd();

const VITE_ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.staging',
  '.env.e2e',
] as const;

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

function readEnvFile(name: string): Record<string, string> | null {
  const path = resolve(repoRoot, name);
  if (!existsSync(path)) return null;
  return parseEnv(readFileSync(path, 'utf8'));
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

function resolveViteModeEnv(mode: string): Record<string, string> {
  const files: Record<string, string | undefined> = {};
  for (const name of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    const path = resolve(repoRoot, name);
    files[name] = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  }
  return mergeViteEnv(mode, files);
}

function localEnvFile(name: string): Record<string, string> | null {
  const values = readEnvFile(name);
  if (values) return values;
  if (process.env.CI) return null;
  throw new Error(`${name} is required to verify Firebase env resolution outside CI.`);
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

  it('allows the Playwright emulator host even when the emulator project id is production', () => {
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

  it('development mode resolves to the staging Firebase project', () => {
    const env = resolveViteModeEnv('development');
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe(STAGING_FIREBASE_PROJECT_ID);
    expect(env.VITE_FIREBASE_AUTH_DOMAIN).toBe('ski-school-staging.firebaseapp.com');
    expect(env.VITE_FIREBASE_STORAGE_BUCKET).toBe('ski-school-staging.firebasestorage.app');
    expect(env.VITE_FIREBASE_MESSAGING_SENDER_ID).toBe('1005648185457');
    expect(env.VITE_FIREBASE_APP_ID).toBe('1:1005648185457:web:865c157151c6e9db6e73d0');
    expect(env.VITE_FIREBASE_DATABASE_ID).toBe('(default)');
    expect(env.VITE_FIREBASE_FUNCTIONS_REGION).toBe('us-central1');
    expect(env.VITE_FIREBASE_API_KEY).toBeTruthy();
    expect(env.VITE_FIREBASE_MEASUREMENT_ID ?? '').toBe('');
  });

  it('staging mode resolves to the staging Firebase project', () => {
    if (!localEnvFile('.env.staging')) return;
    const env = resolveViteModeEnv('staging');
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe(STAGING_FIREBASE_PROJECT_ID);
    expect(env.VITE_FIREBASE_STORAGE_BUCKET).toBe('ski-school-staging.firebasestorage.app');
    expect(env.VITE_FIREBASE_MEASUREMENT_ID ?? '').toBe('');
  });

  it('production mode resolves to the production Firebase project', () => {
    if (!localEnvFile('.env')) return;
    const env = resolveViteModeEnv('production');
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe(PRODUCTION_FIREBASE_PROJECT_ID);
    expect(env.VITE_FIREBASE_AUTH_DOMAIN).toBe('ski-school-8f3ca.firebaseapp.com');
    expect(env.VITE_FIREBASE_STORAGE_BUCKET).toBe('ski-school-8f3ca.firebasestorage.app');
    expect(env.VITE_FIREBASE_MESSAGING_SENDER_ID).toBe('782358732601');
  });

  it('e2e mode keeps emulator routing even though its project id matches production', () => {
    const env = resolveViteModeEnv('e2e');
    expect(env.VITE_USE_FIREBASE_EMULATORS).toBe('true');
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe(PRODUCTION_FIREBASE_PROJECT_ID);
    expect(() =>
      assertFirebaseEnvironment({
        hostname: '127.0.0.1',
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        useEmulators: env.VITE_USE_FIREBASE_EMULATORS === 'true',
      })
    ).not.toThrow();
  });

  it('does not let development mode inherit the production project id from .env', () => {
    const development = readEnvFile('.env.development');
    if (!development) {
      if (process.env.CI) return;
      throw new Error(
        '.env.development is required to verify the development-mode fallback outside CI.'
      );
    }
    expect(development.VITE_FIREBASE_PROJECT_ID).toBe(STAGING_FIREBASE_PROJECT_ID);
    const shared = localEnvFile('.env');
    if (!shared) return;
    expect(shared.VITE_FIREBASE_PROJECT_ID).toBe(PRODUCTION_FIREBASE_PROJECT_ID);
    expect(resolveViteModeEnv('development').VITE_FIREBASE_PROJECT_ID).toBe(
      STAGING_FIREBASE_PROJECT_ID
    );
    expect(VITE_ENV_FILES).toContain('.env.development');
  });

  it('npm run dev uses staging mode and ignores .env.development', () => {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts.dev).toBe('vite --mode staging');
    expect(packageJson.scripts.build).toBe('tsc && vite build');
    expect(packageJson.scripts['build:prod']).toBe('tsc && vite build --mode production');

    const resolvedWithoutDevelopmentFile = mergeViteEnv('staging', {
      '.env': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\n',
      '.env.development': 'VITE_FIREBASE_PROJECT_ID=ski-school-8f3ca\n',
      '.env.staging': 'VITE_FIREBASE_PROJECT_ID=ski-school-staging\n',
    });
    expect(resolvedWithoutDevelopmentFile.VITE_FIREBASE_PROJECT_ID).toBe(
      STAGING_FIREBASE_PROJECT_ID
    );

    if (!localEnvFile('.env.staging')) return;
    expect(resolveViteModeEnv('staging').VITE_FIREBASE_PROJECT_ID).toBe(
      STAGING_FIREBASE_PROJECT_ID
    );
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
