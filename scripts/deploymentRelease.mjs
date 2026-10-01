import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_TARGET_SPECS } from './deploymentProvenance.mjs';
import {
  parseFunctionTargetsFromDeployCommand,
  parseVerifyArgv,
  printVerificationLines,
  runVerificationWithPostDeployRetry,
} from './deploymentVerification.mjs';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const verifyScriptPath = join(scriptsDir, 'verifyDeployment.mjs');

export function releaseKeyToVerificationArgv(releaseKey, spec) {
  const environment = spec.environment;
  if (spec.scope === 'hosting') {
    return ['--environment', environment];
  }
  const argv = ['--environment', environment, '--functions-only'];
  const targets = parseFunctionTargetsFromDeployCommand(spec.deploy);
  if (targets && targets.length > 0) {
    argv.push('--function', targets.join(','));
  }
  return argv;
}

export function buildVerifyNodeCommand(verifyArgv) {
  return {
    execPath: process.execPath,
    args: ['--use-system-ca', verifyScriptPath, ...verifyArgv],
  };
}

export async function runRelease(
  releaseKey,
  {
    spawnDeploy = defaultSpawnDeploy,
    runPostVerify = defaultRunPostVerify,
    env = process.env,
  } = {}
) {
  const spec = RELEASE_TARGET_SPECS[releaseKey];
  if (!spec) {
    return { exitCode: 2, error: 'invalid-release-key' };
  }

  const deployResult = spawnDeploy(spec.deploy, env);
  if (deployResult.status !== 0) {
    return { exitCode: deployResult.status === null ? 1 : deployResult.status, deployed: false };
  }

  const verifyArgv = releaseKeyToVerificationArgv(releaseKey, spec);
  const verifyResult = await runPostVerify({ verifyArgv, spec, env });
  if (verifyResult.exitCode !== 0) {
    console.error('Deployment completed, but provenance verification failed.');
  }
  return {
    exitCode: verifyResult.exitCode,
    deployed: true,
    verified: verifyResult.exitCode === 0,
  };
}

function defaultSpawnDeploy(command, env) {
  return spawnSync(command, {
    stdio: 'inherit',
    shell: true,
    env: { ...env, CARVE_RELEASE: '1' },
  });
}

async function defaultRunPostVerify({ verifyArgv, env }) {
  const parsed = parseVerifyArgv(['node', verifyScriptPath, ...verifyArgv]);
  if (parsed.error) {
    console.error(parsed.error);
    return { exitCode: 2 };
  }

  return await runPostDeployVerificationInProcess({
    parsed,
    env,
  });
}

export async function runPostDeployVerificationInProcess({ parsed, env, ...retryOptions }) {
  const result = await runVerificationWithPostDeployRetry({
    cwd: process.cwd(),
    argvMode: parsed.mode,
    environment: parsed.environment,
    target: parsed.target,
    onlyFunctionNames: parsed.onlyFunctionNames,
    env,
    ...retryOptions,
  });
  printVerificationLines(result.lines ?? []);
  if (result.error) {
    console.error(result.error);
  }
  return { exitCode: result.exitCode ?? 1 };
}
