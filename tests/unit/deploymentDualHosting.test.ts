import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { runRelease } from '../../scripts/deploymentRelease.mjs';
import {
  HOSTING_ENVIRONMENTS,
  prepareHostingBuildInfo,
} from '../../scripts/deploymentProvenance.mjs';
import {
  parseVerifyArgv,
  runVerification,
  runVerificationWithPostDeployRetry,
} from '../../scripts/deploymentVerification.mjs';

const SHA = 'a'.repeat(40);
const manifest = {
  commitSha: SHA,
  environment: 'production',
  firebaseProjectId: 'ski-school-8f3ca',
  dirty: false,
  buildTimestamp: '2026-10-31T01:00:00.000Z',
};
const response = (info = manifest, cache = 'no-cache, no-store, must-revalidate') => ({
  ok: true,
  status: 200,
  headers: { get: () => cache },
  text: async () => JSON.stringify(info),
});
const options = {
  argvMode: 'hosting-only',
  environment: 'production',
  target: HOSTING_ENVIRONMENTS.production,
  gitInputs: { gitHead: SHA, gitStatus: '' },
  env: {},
};

describe('dual production Hosting release', () => {
  it.each(['hosting:prod', 'full:prod'])(
    'orders %s build/deploy, primary verification, clone, and sync verification',
    async (key) => {
      const calls: string[] = [];
      const spawnDeploy = vi.fn((command: string) => {
        calls.push(command);
        return { status: 0 };
      });
      const runPostVerify = vi.fn(async ({ verifyArgv }: { verifyArgv: string[] }) => {
        calls.push(verifyArgv.join(' '));
        return { exitCode: 0 };
      });
      const result = await runRelease(key, { spawnDeploy, runPostVerify });
      expect(result.exitCode).toBe(0);
      expect(calls).toHaveLength(4);
      expect(calls[0]).toBe(
        key === 'full:prod'
          ? 'npm run build:prod && firebase deploy --project prod'
          : 'npm run build:prod && firebase deploy --project prod --only hosting'
      );
      expect(calls[1]).toContain('--primary-only');
      expect(calls[2]).toBe(
        'firebase hosting:clone ski-school-8f3ca:live carveacademy:live --project ski-school-8f3ca'
      );
      expect(calls[3]).not.toContain('--primary-only');
      expect(calls[3].includes('--functions')).toBe(key === 'full:prod');
      expect(calls.filter((call) => call.includes('build:prod'))).toHaveLength(1);
      expect(calls.filter((call) => call.includes('firebase deploy'))).toHaveLength(1);
    }
  );

  it.each([1, 2])('stops after build/primary deploy failure %s without cloning', async (status) => {
    const spawnDeploy = vi.fn(() => ({ status }));
    const runPostVerify = vi.fn();
    const result = await runRelease('hosting:prod', { spawnDeploy, runPostVerify });
    expect(result.exitCode).toBe(status);
    expect(spawnDeploy).toHaveBeenCalledTimes(1);
    expect(runPostVerify).not.toHaveBeenCalled();
  });

  it('does not clone when primary verification fails', async () => {
    const spawnDeploy = vi.fn(() => ({ status: 0 }));
    const result = await runRelease('hosting:prod', {
      spawnDeploy,
      runPostVerify: async () => ({ exitCode: 1 }),
    });
    expect(spawnDeploy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ exitCode: 1, deployed: true, verified: false });
  });

  it.each(['commitSha', 'firebaseProjectId'])(
    'blocks clone on primary %s mismatch through the real verifier',
    async (field) => {
      const spawnDeploy = vi.fn(() => ({ status: 0 }));
      const fetchImpl = vi.fn(async () =>
        response({
          ...manifest,
          [field]: field === 'commitSha' ? 'b'.repeat(40) : 'ski-school-staging',
        })
      );
      const result = await runRelease('hosting:prod', {
        spawnDeploy,
        runPostVerify: async ({ verifyArgv }: { verifyArgv: string[] }) => {
          const parsed = parseVerifyArgv(verifyArgv);
          return runVerification({
            ...options,
            target: parsed.target,
            fetchImpl,
            expectedHostingBuildInfo: manifest,
          });
        },
      });
      expect(result.exitCode).toBe(1);
      expect(spawnDeploy).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );

  it.each([1, null])('reports partial release when clone fails with status %s', async (status) => {
    const spawnDeploy = vi.fn().mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status });
    const runPostVerify = vi.fn(async () => ({ exitCode: 0 }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await runRelease('hosting:prod', { spawnDeploy, runPostVerify });
      expect(result).toMatchObject({ exitCode: 1, deployed: true, verified: false });
      expect(runPostVerify).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Partial production release'));
    } finally {
      error.mockRestore();
    }
  });

  it('returns nonzero after clone if destination verification fails', async () => {
    const runPostVerify = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0 })
      .mockResolvedValueOnce({ exitCode: 2 });
    const result = await runRelease('hosting:prod', {
      spawnDeploy: () => ({ status: 0 }),
      runPostVerify,
    });
    expect(result).toMatchObject({ exitCode: 2, deployed: true, verified: false });
  });

  it('leaves staging independent and performs no clone', async () => {
    const spawnDeploy = vi.fn(() => ({ status: 0 }));
    const runPostVerify = vi.fn(async () => ({ exitCode: 0 }));
    await runRelease('hosting:staging', { spawnDeploy, runPostVerify });
    expect(spawnDeploy).toHaveBeenCalledExactlyOnceWith(
      'npm run build:staging && firebase deploy --project staging --only hosting',
      process.env
    );
    expect(runPostVerify).toHaveBeenCalledTimes(1);
    expect(HOSTING_ENVIRONMENTS.staging).not.toHaveProperty('secondaryOrigin');
  });

  it('routes full release through safeguards without enabling multisite deploy', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts['deploy:prod:full']).toBe('node scripts/runReleaseCommand.mjs full:prod');
    const config = JSON.parse(readFileSync('firebase.json', 'utf8'));
    expect(Array.isArray(config.hosting)).toBe(false);
    expect(config.hosting.site).toBeUndefined();
    expect(config.hosting.target).toBeUndefined();
  });

  it.each(['production', 'staging'])('retains dirty release rejection for %s builds', (mode) => {
    expect(() =>
      prepareHostingBuildInfo({
        mode,
        release: true,
        gitHead: SHA,
        gitStatus: ' M source.ts',
        buildTimestamp: manifest.buildTimestamp,
      })
    ).toThrow('Refusing to create a release build from a dirty working tree');
  });
});

describe('dual production verification', () => {
  it('retries stale timestamps during primary and secondary propagation', async () => {
    const stale = {
      ...manifest,
      commitSha: 'b'.repeat(40),
      buildTimestamp: '2026-10-30T01:00:00.000Z',
    };
    const primary = parseVerifyArgv(['--environment', 'production', '--primary-only']);
    const primaryFetch = vi
      .fn()
      .mockResolvedValueOnce(response(stale))
      .mockResolvedValueOnce(response());
    const result = await runVerificationWithPostDeployRetry({
      ...options,
      target: primary.target,
      fetchImpl: primaryFetch,
      expectedHostingBuildInfo: manifest,
      retryDelaysMs: [0, 0],
    });
    expect(result.exitCode).toBe(0);
    expect(primaryFetch).toHaveBeenCalledTimes(2);

    const secondaryFetch = vi
      .fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response(stale))
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response());
    const synced = await runVerificationWithPostDeployRetry({
      ...options,
      fetchImpl: secondaryFetch,
      expectedHostingBuildInfo: manifest,
      retryDelaysMs: [0, 0],
    });
    expect(synced.exitCode).toBe(0);
    expect(secondaryFetch).toHaveBeenCalledTimes(4);
  });
  it('checks both endpoints and reports synchronization', async () => {
    const fetchImpl = vi.fn(async () => response());
    const result = await runVerification({ ...options, fetchImpl });
    expect(result.exitCode).toBe(0);
    expect(fetchImpl.mock.calls.map((args: unknown[]) => args[0])).toEqual([
      'https://ski-school-8f3ca.web.app/build-info.json',
      'https://carveacademy.web.app/build-info.json',
    ]);
    expect(result.lines).toContain('Production Hosting Sync: PASS');
  });

  it.each([
    ['SHA', { commitSha: 'b'.repeat(40) }],
    ['project', { firebaseProjectId: 'ski-school-staging' }],
    ['timestamp', { buildTimestamp: '2026-10-31T02:00:00.000Z' }],
    ['dirty', { dirty: true }],
    ['environment', { environment: 'staging' }],
  ])('rejects secondary %s mismatch', async (_name, patch) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ ...manifest, ...patch }));
    const result = await runVerification({ ...options, fetchImpl });
    expect(result.exitCode).toBe(1);
    expect(result.lines).toContain('Production Hosting Sync: FAIL');
  });

  it.each(['', 'public, max-age=3600'])('rejects secondary cache header %s', async (cache) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response(manifest, cache));
    const result = await runVerification({ ...options, fetchImpl });
    expect(result.exitCode).toBe(1);
    expect(result.retryable).toBe(false);
  });

  it.each(['http', 'network', 'json', 'missing timestamp', 'missing project'])(
    'rejects secondary fetch error: %s',
    async (failure) => {
      const fetchImpl = vi.fn().mockResolvedValueOnce(response());
      if (failure === 'network') fetchImpl.mockRejectedValueOnce(new Error('offline'));
      else if (failure === 'http')
        fetchImpl.mockResolvedValueOnce({ ...response(), ok: false, status: 503 });
      else if (failure === 'json')
        fetchImpl.mockResolvedValueOnce({ ...response(), text: async () => '<html>' });
      else {
        const info: Record<string, unknown> = { ...manifest };
        delete info[failure === 'missing timestamp' ? 'buildTimestamp' : 'firebaseProjectId'];
        fetchImpl.mockResolvedValueOnce({ ...response(), text: async () => JSON.stringify(info) });
      }
      const result = await runVerification({ ...options, fetchImpl });
      expect(result.exitCode).toBe(2);
    }
  );

  it('retains a primary mismatch when secondary matches', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ ...manifest, firebaseProjectId: 'wrong' }))
      .mockResolvedValueOnce(response());
    const result = await runVerification({ ...options, fetchImpl });
    expect(result.exitCode).toBe(1);
    expect(result.hosting?.reasons).toContain('project');
  });

  it('checks the exact local build timestamp before cloning', async () => {
    const parsed = parseVerifyArgv(['--environment', 'production', '--primary-only']);
    const fetchImpl = vi.fn(async () => response());
    const result = await runVerification({
      ...options,
      target: parsed.target,
      fetchImpl,
      expectedHostingBuildInfo: { ...manifest, buildTimestamp: '2026-10-31T03:00:00.000Z' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(1);
    expect(result.hosting?.reasons).toContain('timestamp');
  });
});
