import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { E2E_PROJECT_ID } from '../../e2e/emulator-config';
import {
  PRODUCTION_FIREBASE_PROJECT_ID,
  STAGING_FIREBASE_PROJECT_ID,
} from '../../src/infrastructure/firebase/firebaseEnvironmentGuard';
import {
  DIRTY_RELEASE_MESSAGE,
  HOSTING_ENVIRONMENTS,
  RELEASE_COMMANDS,
  createFunctionsBuildProvenance,
  createHostingBuildInfo,
  evaluateFunctionsComparison,
  evaluateHostingComparison,
  missingCommitMessage,
  parseHostingBuildInfo,
  prepareFunctionsBuildProvenance,
  prepareHostingBuildInfo,
  renderFunctionsProvenanceModule,
  resolveHostingBuildInfo,
  systemCaAlreadyEnabled,
} from '../../scripts/deploymentProvenance.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const STAMP = '2026-09-30T18:00:00.000Z';
const SECRET = 'super-secret-token';

function hosting(overrides: Record<string, unknown> = {}) {
  return prepareHostingBuildInfo({
    mode: 'production',
    release: false,
    gitHead: SHA_A,
    gitStatus: '',
    carveCommitSha: undefined,
    githubSha: SHA_B,
    buildTimestamp: STAMP,
    ...overrides,
  });
}

describe('deployment provenance', () => {
  it('uses the supplied Git SHA instead of a hardcoded or GitHub SHA', () => {
    const info = hosting();
    expect(info.commitSha).toBe(SHA_A);
    expect(info.commitSha).not.toBe(SHA_B);
    expect(JSON.stringify(info)).not.toContain(SECRET);
  });

  it('records a clean tree as dirty false', () => {
    expect(hosting().dirty).toBe(false);
  });

  it('preserves environment and the canonical Firebase project', () => {
    expect(HOSTING_ENVIRONMENTS.production.firebaseProjectId).toBe(PRODUCTION_FIREBASE_PROJECT_ID);
    expect(HOSTING_ENVIRONMENTS.staging.firebaseProjectId).toBe(STAGING_FIREBASE_PROJECT_ID);
    expect(HOSTING_ENVIRONMENTS.e2e.firebaseProjectId).toBe(E2E_PROJECT_ID);

    expect(hosting({ mode: 'production' })).toMatchObject({
      environment: 'production',
      firebaseProjectId: PRODUCTION_FIREBASE_PROJECT_ID,
    });
    expect(hosting({ mode: 'staging' })).toMatchObject({
      environment: 'staging',
      firebaseProjectId: STAGING_FIREBASE_PROJECT_ID,
    });
    expect(hosting({ mode: 'e2e' })).toMatchObject({
      environment: 'e2e',
      firebaseProjectId: E2E_PROJECT_ID,
    });
    expect(hosting({ mode: 'development' })).toMatchObject({
      environment: 'development',
      firebaseProjectId: null,
    });
  });

  it('records a dirty tree instead of claiming a clean commit', () => {
    const info = hosting({ gitStatus: ' M src/app.ts' });
    expect(info.commitSha).toBe(SHA_A);
    expect(info.dirty).toBe(true);
  });

  it('fails a release build when the source commit or clean tree is unavailable', () => {
    expect(() => hosting({ gitHead: null, githubSha: undefined })).toThrow(
      missingCommitMessage('production')
    );
    expect(() => hosting({ mode: 'staging', gitHead: 'short', githubSha: undefined })).toThrow(
      missingCommitMessage('staging')
    );
    expect(() => hosting({ release: true, gitStatus: ' M src/app.ts' })).toThrow(
      DIRTY_RELEASE_MESSAGE
    );
    expect(() =>
      prepareFunctionsBuildProvenance({
        release: true,
        gitHead: null,
        gitStatus: null,
        carveCommitSha: undefined,
        githubSha: undefined,
        buildTimestamp: STAMP,
      })
    ).toThrow(missingCommitMessage('functions'));
  });

  it('accepts an explicit commit SHA when Git metadata is absent and marks it dirty', () => {
    const info = prepareFunctionsBuildProvenance({
      release: false,
      gitHead: null,
      gitStatus: null,
      carveCommitSha: SHA_A,
      githubSha: SHA_B,
      buildTimestamp: STAMP,
    });
    expect(info).toEqual({ commitSha: SHA_A, buildTimestamp: STAMP, dirty: true });
  });

  it('puts the supplied SHA in the Hosting artifact and nowhere else', () => {
    const info = createHostingBuildInfo({
      commitSha: SHA_A,
      buildTimestamp: STAMP,
      environment: 'production',
      dirty: false,
    });
    const serialized = JSON.stringify(info);
    expect(serialized).toContain(SHA_A);
    expect(Object.keys(info)).toEqual([
      'commitSha',
      'buildTimestamp',
      'environment',
      'dirty',
      'firebaseProjectId',
    ]);
    expect(parseHostingBuildInfo(info)).toEqual(info);
    expect(() => parseHostingBuildInfo({ ...info, apiKey: SECRET })).toThrow(/unexpected fields/);
  });

  it('puts the supplied SHA in the Functions provenance module', () => {
    const provenance = createFunctionsBuildProvenance({
      commitSha: SHA_A,
      buildTimestamp: STAMP,
      dirty: false,
    });
    const source = renderFunctionsProvenanceModule({ ...provenance, token: SECRET });
    expect(source).toContain(SHA_A);
    expect(source).not.toContain(SECRET);
    expect(source).toContain('dirty: false');
  });

  it('matches only an identical clean SHA and rejects a different SHA', () => {
    const buildInfo = hosting();
    expect(
      evaluateHostingComparison({
        localCommitSha: SHA_A,
        localDirty: false,
        buildInfo,
        expectedEnvironment: 'production',
        cacheControl: 'no-cache, no-store, must-revalidate',
      }).match
    ).toBe(true);
    const mismatch = evaluateHostingComparison({
      localCommitSha: SHA_B,
      localDirty: false,
      buildInfo,
      expectedEnvironment: 'production',
      cacheControl: 'no-store',
    });
    expect(mismatch.match).toBe(false);
    expect(mismatch.reasons).toContain('sha');
  });

  it('does not treat a cached Hosting manifest or mixed Function SHAs as a match', () => {
    const buildInfo = hosting();
    expect(
      evaluateHostingComparison({
        localCommitSha: SHA_A,
        localDirty: false,
        buildInfo,
        expectedEnvironment: 'production',
        cacheControl: 'public, max-age=31536000',
      }).reasons
    ).toContain('cache');

    const mixed = evaluateFunctionsComparison({
      localCommitSha: SHA_A,
      localDirty: false,
      services: [
        {
          metadata: {
            name: 'executecanonicalcommand',
            labels: {
              'deployment-tool': 'cli-firebase',
              commit_sha: SHA_A,
              commit_dirty: 'false',
            },
          },
        },
        {
          metadata: {
            name: 'querylessonbookingreadmodels',
            labels: {
              'goog-managed-by': 'cloudfunctions',
              commit_sha: SHA_B,
              commit_dirty: 'false',
            },
          },
        },
      ],
    });
    expect(mixed.match).toBe(false);
    expect(mixed.rows.map((row) => [row.name, row.status])).toEqual([
      ['executecanonicalcommand', 'match'],
      ['querylessonbookingreadmodels', 'sha'],
    ]);
  });

  it('reports functions without a commit label as unverified', () => {
    const result = evaluateFunctionsComparison({
      localCommitSha: SHA_A,
      localDirty: false,
      services: [
        {
          metadata: {
            name: 'scheduledpurgeexpirednotifications',
            labels: { 'firebase-functions-hash': 'abc' },
          },
        },
      ],
    });
    expect(result.match).toBe(false);
    expect(result.rows[0]).toMatchObject({ status: 'unverified', commitSha: null });
  });

  it('reads only rev-parse and status, and ignores unrelated environment values', () => {
    const calls: string[] = [];
    const info = resolveHostingBuildInfo({
      mode: 'staging',
      env: {
        CARVE_COMMIT_SHA: SHA_B,
        GITHUB_SHA: SHA_B,
        SECRET_TOKEN: SECRET,
        VITE_FIREBASE_API_KEY: SECRET,
      },
      cwd: 'not-a-real-checkout',
      buildTimestamp: STAMP,
      runGitCommand(_cwd: string, args: string[]) {
        calls.push(args.join(' '));
        if (args[0] === 'rev-parse') return SHA_A;
        return '';
      },
    });
    expect(calls).toEqual(['rev-parse HEAD', 'status --porcelain']);
    expect(info).toEqual({
      commitSha: SHA_A,
      buildTimestamp: STAMP,
      environment: 'staging',
      dirty: false,
      firebaseProjectId: STAGING_FIREBASE_PROJECT_ID,
    });
    expect(JSON.stringify(info)).not.toContain(SECRET);
  });

  it('derives a clean temporary checkout SHA from Git without hardcoding it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'carve-provenance-'));
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Provenance Test',
      GIT_AUTHOR_EMAIL: 'provenance@example.com',
      GIT_COMMITTER_NAME: 'Provenance Test',
      GIT_COMMITTER_EMAIL: 'provenance@example.com',
    };
    const git = (args: string[]) => {
      execFileSync('git', args, {
        cwd: directory,
        env: gitEnv,
        stdio: 'ignore',
        windowsHide: true,
      });
    };
    try {
      git(['init']);
      writeFileSync(join(directory, 'source.txt'), 'provenance\n');
      git(['add', 'source.txt']);
      git(['commit', '-m', 'provenance']);
      const head = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: directory,
        encoding: 'utf8',
        env: gitEnv,
      }).trim();
      const clean = resolveHostingBuildInfo({
        mode: 'production',
        env: { CARVE_RELEASE: '1' },
        cwd: directory,
        buildTimestamp: STAMP,
      });
      expect(clean.commitSha).toBe(head);
      expect(clean.dirty).toBe(false);
      expect(head).toHaveLength(40);

      writeFileSync(join(directory, 'uncommitted.txt'), 'dirty\n');
      const dirty = resolveHostingBuildInfo({
        mode: 'production',
        env: {},
        cwd: directory,
        buildTimestamp: STAMP,
      });
      expect(dirty.commitSha).toBe(head);
      expect(dirty.dirty).toBe(true);
      expect(() =>
        resolveHostingBuildInfo({
          mode: 'production',
          env: { CARVE_RELEASE: '1' },
          cwd: directory,
          buildTimestamp: STAMP,
        })
      ).toThrow(DIRTY_RELEASE_MESSAGE);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('wires release deploys and the Hosting cache header', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const functionsPkg = JSON.parse(readFileSync('functions/package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const hosting = JSON.parse(readFileSync('firebase.json', 'utf8')) as {
      hosting: {
        headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
      };
    };
    expect(pkg.scripts['deploy:prod']).toBe('node scripts/runReleaseCommand.mjs hosting:prod');
    expect(pkg.scripts['deploy:staging']).toBe(
      'node scripts/runReleaseCommand.mjs hosting:staging'
    );
    expect(pkg.scripts['deploy:functions:prod']).toBe(
      'node scripts/runReleaseCommand.mjs functions:prod'
    );
    expect(pkg.scripts['deploy:verify']).toBe('node --use-system-ca scripts/verifyDeployment.mjs');
    expect(pkg.scripts['deploy:verify']).not.toContain('NODE_TLS_REJECT_UNAUTHORIZED');
    expect(readFileSync('scripts/verifyDeployment.mjs', 'utf8')).not.toContain(
      'NODE_TLS_REJECT_UNAUTHORIZED'
    );
    expect(systemCaAlreadyEnabled(['--use-system-ca'], {})).toBe(true);
    expect(systemCaAlreadyEnabled([], { NODE_USE_SYSTEM_CA: '1' })).toBe(true);
    expect(systemCaAlreadyEnabled([], {})).toBe(false);
    expect(functionsPkg.scripts.build).toContain('writeFunctionsProvenance.mjs');
    expect(functionsPkg.scripts.build).toContain('--check');
    expect(RELEASE_COMMANDS['hosting:prod']).toContain(
      'firebase deploy --project prod --only hosting'
    );
    expect(RELEASE_COMMANDS['functions:staging']).toContain('--only functions');
    const buildInfo = hosting.hosting.headers.find((entry) => entry.source === '/build-info.json');
    expect(buildInfo?.headers).toEqual([
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
    ]);
  });
});
