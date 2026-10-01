import { execFileSync } from 'node:child_process';

export const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
export const BUILD_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const FUNCTIONS_REGION = 'us-central1';

export const HOSTING_ENVIRONMENTS = {
  production: {
    firebaseProjectId: 'ski-school-8f3ca',
    origin: 'https://ski-school-8f3ca.web.app',
  },
  staging: {
    firebaseProjectId: 'ski-school-staging',
    origin: 'https://ski-school-staging.web.app',
  },
  e2e: {
    firebaseProjectId: 'demo-ski-school-e2e',
    origin: null,
  },
  development: {
    firebaseProjectId: null,
    origin: null,
  },
};

const VITE_MODE_ENVIRONMENT = {
  production: 'production',
  staging: 'staging',
  development: 'development',
  e2e: 'e2e',
  test: 'e2e',
};

const HOSTING_BUILD_INFO_KEYS = [
  'commitSha',
  'buildTimestamp',
  'environment',
  'dirty',
  'firebaseProjectId',
];

export function normalizeCommitSha(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return COMMIT_SHA_PATTERN.test(trimmed) ? trimmed : null;
}

export function resolveCommitSha({ gitHead, carveCommitSha, githubSha }) {
  const head = normalizeCommitSha(gitHead);
  if (head) return { commitSha: head, source: 'git' };
  const explicit = normalizeCommitSha(carveCommitSha);
  if (explicit) return { commitSha: explicit, source: 'CARVE_COMMIT_SHA' };
  const github = normalizeCommitSha(githubSha);
  if (github) return { commitSha: github, source: 'GITHUB_SHA' };
  return { commitSha: null, source: 'missing' };
}

export function resolveDirty(gitStatus) {
  if (typeof gitStatus !== 'string') return null;
  return gitStatus.trim().length > 0;
}

export function createSourceIdentity({ gitHead, gitStatus, carveCommitSha, githubSha }) {
  const resolved = resolveCommitSha({ gitHead, carveCommitSha, githubSha });
  const dirtyState = resolveDirty(gitStatus);
  if (!resolved.commitSha) {
    return { commitSha: null, source: resolved.source, dirty: dirtyState === true };
  }
  return {
    commitSha: resolved.commitSha,
    source: resolved.source,
    dirty: dirtyState === null ? true : dirtyState,
  };
}

export function environmentForViteMode(mode) {
  const environment = VITE_MODE_ENVIRONMENT[mode];
  if (!environment) {
    throw new Error(`Cannot determine deployment environment for Vite mode "${mode}"`);
  }
  return environment;
}

export function missingCommitMessage(target) {
  if (target === 'production') return 'Cannot determine source commit for production build';
  if (target === 'staging') return 'Cannot determine source commit for staging build';
  if (target === 'functions') return 'Cannot determine source commit for functions build';
  return 'Cannot determine source commit for hosting build';
}

export const DIRTY_RELEASE_MESSAGE =
  'Refusing to create a release build from a dirty working tree';

function assertTimestamp(buildTimestamp) {
  if (typeof buildTimestamp !== 'string' || !BUILD_TIMESTAMP_PATTERN.test(buildTimestamp)) {
    throw new Error('Deployment provenance is missing a build timestamp');
  }
}

export function createHostingBuildInfo({ commitSha, buildTimestamp, environment, dirty }) {
  const normalizedSha = normalizeCommitSha(commitSha);
  if (!normalizedSha) throw new Error(missingCommitMessage(environment));
  assertTimestamp(buildTimestamp);
  if (typeof dirty !== 'boolean') {
    throw new Error('Deployment provenance is missing dirty state');
  }
  const known = HOSTING_ENVIRONMENTS[environment];
  if (!known) throw new Error(`Cannot determine deployment environment "${environment}"`);
  return {
    commitSha: normalizedSha,
    buildTimestamp,
    environment,
    dirty,
    firebaseProjectId: known.firebaseProjectId,
  };
}

export function createFunctionsBuildProvenance({ commitSha, buildTimestamp, dirty }) {
  const normalizedSha = normalizeCommitSha(commitSha);
  if (!normalizedSha) throw new Error(missingCommitMessage('functions'));
  assertTimestamp(buildTimestamp);
  if (typeof dirty !== 'boolean') {
    throw new Error('Deployment provenance is missing dirty state');
  }
  return {
    commitSha: normalizedSha,
    buildTimestamp,
    dirty,
  };
}

export function prepareHostingBuildInfo({
  mode,
  release,
  gitHead,
  gitStatus,
  carveCommitSha,
  githubSha,
  buildTimestamp,
}) {
  const environment = environmentForViteMode(mode);
  const identity = createSourceIdentity({ gitHead, gitStatus, carveCommitSha, githubSha });
  if (!identity.commitSha) throw new Error(missingCommitMessage(environment));
  if (release && identity.dirty) throw new Error(DIRTY_RELEASE_MESSAGE);
  return createHostingBuildInfo({
    commitSha: identity.commitSha,
    buildTimestamp,
    environment,
    dirty: identity.dirty,
  });
}

export function prepareFunctionsBuildProvenance({
  release,
  gitHead,
  gitStatus,
  carveCommitSha,
  githubSha,
  buildTimestamp,
}) {
  const identity = createSourceIdentity({ gitHead, gitStatus, carveCommitSha, githubSha });
  if (!identity.commitSha) throw new Error(missingCommitMessage('functions'));
  if (release && identity.dirty) throw new Error(DIRTY_RELEASE_MESSAGE);
  return createFunctionsBuildProvenance({
    commitSha: identity.commitSha,
    buildTimestamp,
    dirty: identity.dirty,
  });
}

export function renderFunctionsProvenanceModule(provenance) {
  const safe = createFunctionsBuildProvenance(provenance);
  return [
    '/** Generated by scripts/writeFunctionsProvenance.mjs. Do not edit. */',
    'export const BAKED_DEPLOYMENT_PROVENANCE = {',
    `  commitSha: '${safe.commitSha}',`,
    `  buildTimestamp: '${safe.buildTimestamp}',`,
    `  dirty: ${safe.dirty ? 'true' : 'false'},`,
    '} as const;',
    '',
  ].join('\n');
}

export function runGit(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

export function readGitProvenanceInputs(cwd, run = runGit) {
  return {
    gitHead: run(cwd, ['rev-parse', 'HEAD']),
    gitStatus: run(cwd, ['status', '--porcelain']),
  };
}

export function isReleaseEnvironment(env) {
  return env.CARVE_RELEASE === '1';
}

export function systemCaAlreadyEnabled(execArgv, env = {}) {
  return execArgv.includes('--use-system-ca') || env.NODE_USE_SYSTEM_CA === '1';
}

export function resolveHostingBuildInfo({ mode, env, cwd, buildTimestamp, runGitCommand = runGit }) {
  const git = readGitProvenanceInputs(cwd, runGitCommand);
  return prepareHostingBuildInfo({
    mode,
    release: isReleaseEnvironment(env),
    gitHead: git.gitHead,
    gitStatus: git.gitStatus,
    carveCommitSha: env.CARVE_COMMIT_SHA,
    githubSha: env.GITHUB_SHA,
    buildTimestamp,
  });
}

export function resolveFunctionsBuildProvenance({
  env,
  cwd,
  buildTimestamp,
  runGitCommand = runGit,
}) {
  const git = readGitProvenanceInputs(cwd, runGitCommand);
  return prepareFunctionsBuildProvenance({
    release: isReleaseEnvironment(env),
    gitHead: git.gitHead,
    gitStatus: git.gitStatus,
    carveCommitSha: env.CARVE_COMMIT_SHA,
    githubSha: env.GITHUB_SHA,
    buildTimestamp,
  });
}

export function sameSourceIdentity(left, right) {
  return left.commitSha === right.commitSha && left.dirty === right.dirty;
}

export function parseHostingBuildInfo(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Hosting provenance response was not a build info object');
  }
  const record = value;
  const extraKeys = Object.keys(record).filter((key) => !HOSTING_BUILD_INFO_KEYS.includes(key));
  if (extraKeys.length > 0) {
    throw new Error('Hosting provenance response contained unexpected fields');
  }
  return createHostingBuildInfo({
    commitSha: record.commitSha,
    buildTimestamp: record.buildTimestamp,
    environment: record.environment,
    dirty: record.dirty,
  });
}

export function hostingCacheRequiresRevalidation(cacheControl) {
  const value = typeof cacheControl === 'string' ? cacheControl.toLowerCase() : '';
  return value.includes('no-cache') || value.includes('no-store');
}

export function evaluateHostingComparison({ localCommitSha, localDirty, buildInfo, expectedEnvironment, cacheControl }) {
  const reasons = [];
  if (localDirty) reasons.push('local-dirty');
  if (buildInfo.dirty) reasons.push('remote-dirty');
  if (buildInfo.commitSha !== localCommitSha) reasons.push('sha');
  if (buildInfo.environment !== expectedEnvironment) reasons.push('environment');
  const expectedProject = HOSTING_ENVIRONMENTS[expectedEnvironment]?.firebaseProjectId;
  if (!expectedProject || buildInfo.firebaseProjectId !== expectedProject) reasons.push('project');
  if (!hostingCacheRequiresRevalidation(cacheControl)) reasons.push('cache');
  return { match: reasons.length === 0, reasons };
}

export function isCloudFunctionService(service) {
  const labels = service?.metadata?.labels;
  if (!labels || typeof labels !== 'object') return false;
  const tool = labels['deployment-tool'];
  return (
    (typeof tool === 'string' && tool.startsWith('cli-firebase')) ||
    labels['goog-managed-by'] === 'cloudfunctions' ||
    typeof labels['firebase-functions-hash'] === 'string'
  );
}

export function normalizeFunctionServiceName(name) {
  if (typeof name !== 'string' || name.trim() === '') return '';
  const short = name.includes('/') ? name.split('/').pop() : name;
  return short.trim().toLowerCase();
}

export function evaluateFunctionsComparison({
  localCommitSha,
  localDirty,
  services,
  onlyFunctionNames = null,
}) {
  const rows = [];
  const only =
    onlyFunctionNames instanceof Set && onlyFunctionNames.size > 0 ? onlyFunctionNames : null;
  for (const service of services) {
    if (!isCloudFunctionService(service)) continue;
    const name = service?.metadata?.name;
    if (typeof name !== 'string' || name.trim() === '') continue;
    if (only) {
      const normalized = normalizeFunctionServiceName(name);
      if (!only.has(normalized)) continue;
    }
    const labels = service.metadata.labels ?? {};
    const commitSha = normalizeCommitSha(labels.commit_sha);
    const dirtyLabel = labels.commit_dirty;
    if (!commitSha || (dirtyLabel !== 'true' && dirtyLabel !== 'false')) {
      rows.push({ name, commitSha: null, dirty: null, status: 'unverified' });
      continue;
    }
    const dirty = dirtyLabel === 'true';
    let status = 'match';
    if (dirty) status = 'dirty';
    else if (commitSha !== localCommitSha) status = 'sha';
    rows.push({ name, commitSha, dirty, status });
  }
  rows.sort((left, right) => left.name.localeCompare(right.name));
  const reasons = [];
  if (localDirty) reasons.push('local-dirty');
  if (rows.length === 0) reasons.push(only ? 'missing-target' : 'unverified');
  if (rows.some((row) => row.status !== 'match')) reasons.push('functions');
  return {
    match: reasons.length === 0,
    reasons,
    rows,
  };
}

export const RELEASE_TARGET_SPECS = {
  'hosting:staging': {
    environment: 'staging',
    scope: 'hosting',
    deploy: 'npm run build:staging && firebase deploy --project staging --only hosting',
  },
  'hosting:prod': {
    environment: 'production',
    scope: 'hosting',
    deploy: 'npm run build:prod && firebase deploy --project prod --only hosting',
  },
  'functions:staging': {
    environment: 'staging',
    scope: 'functions',
    deploy: 'firebase deploy --project staging --only functions',
  },
  'functions:prod': {
    environment: 'production',
    scope: 'functions',
    deploy: 'firebase deploy --project prod --only functions',
  },
};

export const RELEASE_COMMANDS = Object.fromEntries(
  Object.entries(RELEASE_TARGET_SPECS).map(([key, value]) => [key, value.deploy])
);
