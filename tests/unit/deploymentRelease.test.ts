import { describe, expect, it, vi } from 'vitest';
import { evaluateFunctionsComparison } from '../../scripts/deploymentProvenance.mjs';
import {
  parseFunctionTargetsFromDeployCommand,
  parseVerifyArgv,
  runVerification,
  runVerificationWithPostDeployRetry,
  verificationFailureIsRetryable,
} from '../../scripts/deploymentVerification.mjs';
import {
  buildVerifyNodeCommand,
  releaseKeyToVerificationArgv,
  runRelease,
} from '../../scripts/deploymentRelease.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const STAMP = '2026-09-30T18:00:00.000Z';

function hostingBuildInfo(sha: string) {
  return {
    commitSha: sha,
    buildTimestamp: STAMP,
    environment: 'production',
    dirty: false,
    firebaseProjectId: 'ski-school-8f3ca',
  };
}

function cloudRunService(name: string, sha: string) {
  return {
    metadata: {
      name,
      labels: {
        'deployment-tool': 'cli-firebase',
        commit_sha: sha,
        commit_dirty: 'false',
      },
    },
  };
}

describe('deployment release and verification CLI', () => {
  it('parses hosting-only, functions-only, and full audit argv modes', () => {
    expect(parseVerifyArgv(['node', 'verify', '--environment', 'production']).mode).toBe(
      'hosting-only'
    );
    expect(
      parseVerifyArgv(['node', 'verify', '--environment', 'staging', '--functions-only']).mode
    ).toBe('functions-only');
    expect(
      parseVerifyArgv(['node', 'verify', '--environment', 'production', '--functions']).mode
    ).toBe('hosting-and-functions');
  });

  it('maps release keys to the correct verification scope and environment', () => {
    expect(
      releaseKeyToVerificationArgv('hosting:staging', {
        environment: 'staging',
        scope: 'hosting',
        deploy: 'x',
      })
    ).toEqual(['--environment', 'staging']);
    expect(
      releaseKeyToVerificationArgv('hosting:prod', {
        environment: 'production',
        scope: 'hosting',
        deploy: 'x',
      })
    ).toEqual(['--environment', 'production']);
    expect(
      releaseKeyToVerificationArgv('functions:staging', {
        environment: 'staging',
        scope: 'functions',
        deploy: 'firebase deploy --project staging --only functions',
      })
    ).toEqual(['--environment', 'staging', '--functions-only']);
    expect(
      releaseKeyToVerificationArgv('functions:prod', {
        environment: 'production',
        scope: 'functions',
        deploy: 'firebase deploy --project prod --only functions:executeCanonicalCommand',
      })
    ).toEqual([
      '--environment',
      'production',
      '--functions-only',
      '--function',
      'executeCanonicalCommand',
    ]);
  });

  it('parses selective function targets from deploy commands', () => {
    expect(
      parseFunctionTargetsFromDeployCommand(
        'firebase deploy --project prod --only functions:executeCanonicalCommand'
      )
    ).toEqual(['executeCanonicalCommand']);
    expect(
      parseFunctionTargetsFromDeployCommand(
        'firebase deploy --project prod --only functions:foo,functions:bar'
      )
    ).toEqual(['foo', 'bar']);
    expect(
      parseFunctionTargetsFromDeployCommand('firebase deploy --project prod --only functions')
    ).toBeNull();
  });

  it('keeps TLS verification enabled for spawned verify commands', () => {
    const command = buildVerifyNodeCommand(['--environment', 'production']);
    expect(command.args[0]).toBe('--use-system-ca');
    expect(command.args.join(' ')).not.toContain('NODE_TLS_REJECT_UNAUTHORIZED');
  });

  it('runs hosting-only verification without checking functions', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'no-cache, no-store' },
      text: async () => JSON.stringify(hostingBuildInfo(SHA_A)),
    }));
    const listServices = vi.fn();

    const result = await runVerification({
      argvMode: 'hosting-only',
      environment: 'production',
      target: { firebaseProjectId: 'ski-school-8f3ca', origin: 'https://example.test' },
      fetchImpl,
      listServicesImpl: listServices,
      env: {},
      gitInputs: { gitHead: SHA_A, gitStatus: '' },
      cwd: process.cwd(),
    });

    expect(result.exitCode).toBe(0);
    expect(result.lines?.join('\n')).toContain('Hosting MATCH');
    expect(result.lines?.join('\n')).toContain('Functions NOT CHECKED');
    expect(listServices).not.toHaveBeenCalled();
  });

  it('functions-only verification ignores unrelated hosting SHA', async () => {
    const fetchImpl = vi.fn();
    const result = await runVerification({
      argvMode: 'functions-only',
      environment: 'production',
      target: { firebaseProjectId: 'ski-school-8f3ca', origin: 'https://example.test' },
      fetchImpl,
      listServicesImpl: () => ({
        ok: true,
        services: [
          cloudRunService('executecanonicalcommand', SHA_A),
          cloudRunService('querylessonbookingreadmodels', SHA_A),
        ],
      }),
      gitInputs: { gitHead: SHA_A, gitStatus: '' },
      cwd: process.cwd(),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
    expect(result.lines?.join('\n')).toContain('Functions MATCH');
    expect(result.lines?.join('\n')).not.toContain('Hosting');
  });

  it('full functions audit still fails when any function is on another commit', async () => {
    const result = await runVerification({
      argvMode: 'hosting-and-functions',
      environment: 'production',
      target: {
        firebaseProjectId: 'ski-school-8f3ca',
        origin: 'https://ski-school-8f3ca.web.app',
      },
      fetchImpl: async () => ({
        ok: true,
        headers: { get: () => 'no-cache, no-store' },
        text: async () => JSON.stringify(hostingBuildInfo(SHA_A)),
      }),
      listServicesImpl: () => ({
        ok: true,
        services: [
          cloudRunService('executecanonicalcommand', SHA_A),
          cloudRunService('querylessonbookingreadmodels', SHA_B),
        ],
      }),
      gitInputs: { gitHead: SHA_A, gitStatus: '' },
      cwd: process.cwd(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.lines?.join('\n')).toContain('Functions MISMATCH');
  });

  it('selective functions verification checks only deployed targets', () => {
    const selective = evaluateFunctionsComparison({
      localCommitSha: SHA_A,
      localDirty: false,
      services: [
        cloudRunService('executecanonicalcommand', SHA_A),
        cloudRunService('querylessonbookingreadmodels', SHA_B),
      ],
      onlyFunctionNames: new Set(['executecanonicalcommand']),
    });
    expect(selective.match).toBe(true);
    expect(selective.rows).toHaveLength(1);
    expect(selective.rows[0]?.name).toBe('executecanonicalcommand');
  });

  it('does not run verification when deploy fails', async () => {
    const runPostVerify = vi.fn();
    const outcome = await runRelease('hosting:prod', {
      spawnDeploy: () => ({ status: 1 }),
      runPostVerify,
    });
    expect(outcome.deployed).toBe(false);
    expect(runPostVerify).not.toHaveBeenCalled();
    expect(outcome.exitCode).toBe(1);
  });

  it('fails the release when verification mismatches', async () => {
    const outcome = await runRelease('hosting:staging', {
      spawnDeploy: () => ({ status: 0 }),
      runPostVerify: async () => ({ exitCode: 1 }),
    });
    expect(outcome.deployed).toBe(true);
    expect(outcome.verified).toBe(false);
    expect(outcome.exitCode).toBe(1);
  });

  it('returns exit 0 when verification succeeds', async () => {
    const outcome = await runRelease('functions:prod', {
      spawnDeploy: () => ({ status: 0 }),
      runPostVerify: async () => ({ exitCode: 0 }),
    });
    expect(outcome.verified).toBe(true);
    expect(outcome.exitCode).toBe(0);
  });

  it('invokes functions-only verification for functions releases', async () => {
    const runPostVerify = vi.fn(async () => ({ exitCode: 0 }));
    await runRelease('functions:staging', {
      spawnDeploy: () => ({ status: 0 }),
      runPostVerify,
    });
    expect(runPostVerify).toHaveBeenCalledWith({
      verifyArgv: ['--environment', 'staging', '--functions-only'],
      spec: expect.objectContaining({ scope: 'functions', environment: 'staging' }),
      env: process.env,
    });
  });

  it('invokes hosting-only verification for hosting releases', async () => {
    const runPostVerify = vi.fn(async () => ({ exitCode: 0 }));
    await runRelease('hosting:prod', {
      spawnDeploy: () => ({ status: 0 }),
      runPostVerify,
    });
    expect(runPostVerify).toHaveBeenCalledWith({
      verifyArgv: ['--environment', 'production'],
      spec: expect.objectContaining({ scope: 'hosting', environment: 'production' }),
      env: process.env,
    });
  });

  it('retries only propagation-shaped failures and stops after bounded attempts', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'no-cache, no-store' },
        text: async () => JSON.stringify(hostingBuildInfo(SHA_B)),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'no-cache, no-store' },
        text: async () => JSON.stringify(hostingBuildInfo(SHA_A)),
      });

    const delays = [0, 0];
    const first = await runVerificationWithPostDeployRetry({
      argvMode: 'hosting-only',
      environment: 'production',
      target: { firebaseProjectId: 'ski-school-8f3ca', origin: 'https://example.test' },
      fetchImpl,
      retryDelaysMs: delays,
      gitInputs: { gitHead: SHA_A, gitStatus: '' },
      cwd: process.cwd(),
    });
    expect(first.exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const nonRetry = await runVerificationWithPostDeployRetry({
      argvMode: 'hosting-only',
      environment: 'production',
      target: { firebaseProjectId: 'ski-school-8f3ca', origin: 'https://example.test' },
      fetchImpl: vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'public, max-age=3600' },
        text: async () => JSON.stringify(hostingBuildInfo(SHA_A)),
      })),
      retryDelaysMs: [0, 0, 0],
      gitInputs: { gitHead: SHA_A, gitStatus: '' },
      cwd: process.cwd(),
    });
    expect(nonRetry.exitCode).toBe(1);
    expect(
      verificationFailureIsRetryable({
        mode: 'hosting-only',
        hosting: { match: false, reasons: ['cache'] },
        functions: null,
      })
    ).toBe(false);
  });
});
