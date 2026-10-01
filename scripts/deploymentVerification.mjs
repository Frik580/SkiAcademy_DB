import { spawnSync } from 'node:child_process';
import {
  FUNCTIONS_REGION,
  HOSTING_ENVIRONMENTS,
  createSourceIdentity,
  evaluateFunctionsComparison,
  evaluateHostingComparison,
  parseHostingBuildInfo,
  readGitProvenanceInputs,
} from './deploymentProvenance.mjs';

export const POST_DEPLOY_VERIFY_RETRY_DELAYS_MS = [0, 3000, 7000, 15000, 20000];

const FATAL_HOSTING_REASONS = new Set(['local-dirty', 'environment', 'project', 'cache']);
const PROPAGATION_HOSTING_REASONS = new Set(['sha']);

export function readCliOption(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

export function parseVerifyArgv(argv) {
  const environment = readCliOption(argv, '--environment');
  const target = HOSTING_ENVIRONMENTS[environment];
  if (!target?.origin && !argv.includes('--functions-only')) {
    return { error: 'Expected --environment production or --environment staging' };
  }
  if (!target?.firebaseProjectId) {
    return { error: 'Expected --environment production or --environment staging' };
  }

  const functionsOnly = argv.includes('--functions-only');
  const fullAudit = argv.includes('--functions') && !functionsOnly;
  const functionArg = readCliOption(argv, '--function');

  let onlyFunctionNames = null;
  if (functionArg !== null) {
    onlyFunctionNames = functionArg
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (onlyFunctionNames.length === 0) {
      return { error: 'Expected --function <name> or --function name1,name2' };
    }
  }

  if (functionsOnly) {
    return {
      environment,
      target,
      mode: 'functions-only',
      onlyFunctionNames,
    };
  }

  if (fullAudit) {
    return {
      environment,
      target,
      mode: 'hosting-and-functions',
      onlyFunctionNames,
    };
  }

  return {
    environment,
    target,
    mode: 'hosting-only',
    onlyFunctionNames: null,
  };
}

export function parseFunctionTargetsFromDeployCommand(deployCommand) {
  if (typeof deployCommand !== 'string' || deployCommand.trim() === '') return null;
  const onlyMatch = deployCommand.match(/--only\s+([^\s&]+)/);
  if (!onlyMatch) return null;
  const onlyValue = onlyMatch[1];
  const parts = onlyValue.split(',').map((part) => part.trim());
  const names = [];
  for (const part of parts) {
    if (part === 'functions') return null;
    if (part.startsWith('functions:')) {
      const name = part.slice('functions:'.length).trim();
      if (name) names.push(name);
    }
  }
  return names.length > 0 ? names : null;
}

export function onlyFunctionNameSet(names) {
  if (names === null || names === undefined) return null;
  return new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean));
}

function hostingFailureIsRetryable(reasons) {
  if (!reasons || reasons.length === 0) return false;
  return reasons.every((reason) => PROPAGATION_HOSTING_REASONS.has(reason));
}

function functionsFailureIsRetryable(reasons, rows) {
  if (!reasons || reasons.length === 0) return false;
  if (reasons.includes('local-dirty')) return false;
  if (reasons.includes('missing-target')) return false;
  if (reasons.includes('unverified') && rows.length === 0) return true;
  if (!reasons.includes('functions')) return false;
  return rows.every((row) => row.status === 'sha' || row.status === 'unverified');
}

export function verificationFailureIsRetryable({ mode, hosting, functions }) {
  if (mode === 'hosting-only') {
    return hostingFailureIsRetryable(hosting?.reasons);
  }
  if (mode === 'functions-only') {
    return functionsFailureIsRetryable(functions?.reasons, functions?.rows ?? []);
  }
  if (hosting && !hosting.match) {
    if (hosting.reasons?.some((reason) => FATAL_HOSTING_REASONS.has(reason))) return false;
    if (!hostingFailureIsRetryable(hosting.reasons)) return false;
  }
  if (functions && !functions.match) {
    if (!functionsFailureIsRetryable(functions.reasons, functions.rows ?? [])) return false;
  }
  return true;
}

export async function fetchHostingBuildInfo(origin, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${origin}/build-info.json`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
  const cacheControl = response.headers.get('cache-control') ?? '';
  if (!response.ok) {
    return { ok: false, cacheControl, error: `status ${response.status}` };
  }
  const buildInfo = parseHostingBuildInfo(JSON.parse(await response.text()));
  return { ok: true, cacheControl, buildInfo };
}

export function listCloudRunServices(projectId, spawnImpl = spawnSync) {
  const listed = spawnImpl(
    'gcloud',
    [
      'run',
      'services',
      'list',
      `--project=${projectId}`,
      `--region=${FUNCTIONS_REGION}`,
      '--format=json',
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      shell: process.platform === 'win32',
    }
  );
  if (listed.status !== 0 || !listed.stdout) {
    return { ok: false, services: null };
  }
  try {
    const services = JSON.parse(listed.stdout);
    if (!Array.isArray(services)) return { ok: false, services: null };
    return { ok: true, services };
  } catch {
    return { ok: false, services: null };
  }
}

export async function runVerification({
  cwd = process.cwd(),
  argvMode,
  environment,
  target,
  onlyFunctionNames = null,
  fetchImpl = globalThis.fetch,
  listServicesImpl,
  env = process.env,
  gitInputs = null,
}) {
  const git = gitInputs ?? readGitProvenanceInputs(cwd);
  const local = createSourceIdentity({
    gitHead: git.gitHead,
    gitStatus: git.gitStatus,
    carveCommitSha: env.CARVE_COMMIT_SHA,
    githubSha: env.GITHUB_SHA,
  });
  if (!local.commitSha) {
    return {
      exitCode: 2,
      retryable: false,
      localHeadLines: null,
      error: 'Cannot determine source commit for local HEAD',
    };
  }

  const lines = [];
  const push = (title, blockLines) => {
    lines.push(title);
    for (const line of blockLines) lines.push(line);
    lines.push('');
  };

  push('Local HEAD', [`commit: ${local.commitSha}`, `dirty: ${local.dirty}`]);

  let exitCode = 0;
  let hostingResult = null;
  let functionsResult = null;

  const shouldCheckHosting = argvMode !== 'functions-only';
  const shouldCheckFunctions = argvMode === 'functions-only' || argvMode === 'hosting-and-functions';

  if (shouldCheckHosting) {
    try {
      const fetched = await fetchHostingBuildInfo(target.origin, fetchImpl);
      if (!fetched.ok) {
        push(`${environment} Hosting`, ['commit: UNVERIFIED', `environment: ${environment}`]);
        lines.push('Hosting MISMATCH');
        if (!shouldCheckFunctions) {
          lines.push('Functions NOT CHECKED');
        }
        return {
          exitCode: 2,
          retryable: false,
          localHeadLines: [`commit: ${local.commitSha}`, `dirty: ${local.dirty}`],
          lines,
          error: `Hosting provenance request failed: ${fetched.error}`,
        };
      }

      push(`${environment} Hosting`, [
        `commit: ${fetched.buildInfo.commitSha}`,
        `environment: ${fetched.buildInfo.environment}`,
        `dirty: ${fetched.buildInfo.dirty}`,
        `project: ${fetched.buildInfo.firebaseProjectId}`,
        `built: ${fetched.buildInfo.buildTimestamp}`,
      ]);

      hostingResult = evaluateHostingComparison({
        localCommitSha: local.commitSha,
        localDirty: local.dirty,
        buildInfo: fetched.buildInfo,
        expectedEnvironment: environment,
        cacheControl: fetched.cacheControl,
      });
      lines.push(hostingResult.match ? 'Hosting MATCH' : 'Hosting MISMATCH');
      if (!hostingResult.match) {
        lines.push(`reasons: ${hostingResult.reasons.join(', ')}`);
        exitCode = 1;
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'request failed';
      push(`${environment} Hosting`, ['commit: UNVERIFIED', `environment: ${environment}`]);
      lines.push('Hosting MISMATCH');
      if (!shouldCheckFunctions) {
        lines.push('Functions NOT CHECKED');
      }
      return {
        exitCode: 2,
        retryable: false,
        lines,
        error: `Hosting provenance request failed: ${message.split('\n')[0]}`,
      };
    }
  }

  if (!shouldCheckFunctions) {
    lines.push('Functions NOT CHECKED');
    const success = exitCode === 0;
    if (success) lines.push('Deployment provenance verified.');
    const retryable = verificationFailureIsRetryable({
      mode: argvMode,
      hosting: hostingResult,
      functions: null,
    });
    return {
      exitCode,
      retryable,
      mode: argvMode,
      hosting: hostingResult,
      functions: null,
      lines,
      success,
    };
  }

  const listFn = listServicesImpl ?? ((projectId) => listCloudRunServices(projectId));
  const listed = listFn(target.firebaseProjectId);
  if (!listed.ok) {
    lines.push('Functions NOT VERIFIED');
    const code = exitCode === 0 ? 2 : exitCode;
    return {
      exitCode: code,
      retryable: false,
      mode: argvMode,
      hosting: hostingResult,
      functions: null,
      lines,
      success: false,
    };
  }

  const nameFilter = onlyFunctionNameSet(onlyFunctionNames);
  functionsResult = evaluateFunctionsComparison({
    localCommitSha: local.commitSha,
    localDirty: local.dirty,
    services: listed.services,
    onlyFunctionNames: nameFilter,
  });

  lines.push('Functions');
  for (const row of functionsResult.rows) {
    lines.push(
      `${row.name} commit: ${row.commitSha ?? 'UNVERIFIED'} dirty: ${
        row.dirty === null ? 'UNVERIFIED' : row.dirty
      } ${row.status.toUpperCase()}`
    );
  }
  lines.push(functionsResult.match ? 'Functions MATCH' : 'Functions MISMATCH');
  if (!functionsResult.match) {
    lines.push(`reasons: ${functionsResult.reasons.join(', ')}`);
    if (exitCode === 0) exitCode = 1;
  }

  const retryable = verificationFailureIsRetryable({
    mode: argvMode,
    hosting: hostingResult,
    functions: functionsResult,
  });

  const success = exitCode === 0;
  if (success) lines.push('Deployment provenance verified.');

  return {
    exitCode,
    retryable,
    mode: argvMode,
    hosting: hostingResult,
    functions: functionsResult,
    lines,
    success,
  };
}

export function printVerificationLines(lines) {
  for (const line of lines) console.log(line);
}

export async function runVerificationWithPostDeployRetry(options) {
  const delays = options.retryDelaysMs ?? POST_DEPLOY_VERIFY_RETRY_DELAYS_MS;
  let lastResult = null;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
    lastResult = await runVerification(options);
    if (lastResult.exitCode === 0 || !lastResult.retryable) {
      return lastResult;
    }
  }
  return lastResult;
}
