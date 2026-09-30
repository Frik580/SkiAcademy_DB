export const FUNCTIONS_PRODUCTION_PROJECT_ID = 'ski-school-8f3ca';
export const FUNCTIONS_STAGING_PROJECT_ID = 'ski-school-staging';
export const FUNCTIONS_E2E_PROJECT_ID = 'demo-ski-school-e2e';

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const BUILD_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type DeploymentEnvironment = 'production' | 'staging' | 'development' | 'e2e';

export interface BakedDeploymentProvenance {
  readonly commitSha: string;
  readonly buildTimestamp: string;
  readonly dirty: boolean;
}

export interface FunctionsRuntimeProvenance extends BakedDeploymentProvenance {
  readonly environment: DeploymentEnvironment;
  readonly firebaseProjectId: string;
}

export function parseBakedDeploymentProvenance(value: unknown): BakedDeploymentProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Cannot determine source commit for functions build');
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(['commitSha', 'buildTimestamp', 'dirty']);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error('Functions deployment provenance contained unexpected fields');
    }
  }
  const commitSha =
    typeof record.commitSha === 'string' ? record.commitSha.trim().toLowerCase() : '';
  if (!COMMIT_SHA_PATTERN.test(commitSha)) {
    throw new Error('Cannot determine source commit for functions build');
  }
  if (
    typeof record.buildTimestamp !== 'string' ||
    !BUILD_TIMESTAMP_PATTERN.test(record.buildTimestamp)
  ) {
    throw new Error('Functions deployment provenance is missing a build timestamp');
  }
  if (typeof record.dirty !== 'boolean') {
    throw new Error('Functions deployment provenance is missing dirty state');
  }
  return {
    commitSha,
    buildTimestamp: record.buildTimestamp,
    dirty: record.dirty,
  };
}

export function resolveFunctionsEnvironment(input: {
  projectId: string;
  functionsEmulator?: string;
  firebaseEmulatorHub?: string;
}): DeploymentEnvironment {
  if (
    input.functionsEmulator === 'true' ||
    (typeof input.firebaseEmulatorHub === 'string' && input.firebaseEmulatorHub.trim() !== '')
  ) {
    return 'e2e';
  }
  if (input.projectId === FUNCTIONS_PRODUCTION_PROJECT_ID) return 'production';
  if (input.projectId === FUNCTIONS_STAGING_PROJECT_ID) return 'staging';
  if (input.projectId === FUNCTIONS_E2E_PROJECT_ID) return 'e2e';
  return 'development';
}

export function createFunctionsRuntimeProvenance(
  baked: BakedDeploymentProvenance,
  input: { projectId: string; functionsEmulator?: string; firebaseEmulatorHub?: string }
): FunctionsRuntimeProvenance {
  const parsed = parseBakedDeploymentProvenance(baked);
  return {
    commitSha: parsed.commitSha,
    buildTimestamp: parsed.buildTimestamp,
    dirty: parsed.dirty,
    environment: resolveFunctionsEnvironment(input),
    firebaseProjectId: input.projectId,
  };
}

export function functionsProvenanceLabels(
  baked: BakedDeploymentProvenance
): Record<string, string> {
  const parsed = parseBakedDeploymentProvenance(baked);
  return {
    commit_sha: parsed.commitSha,
    commit_dirty: parsed.dirty ? 'true' : 'false',
  };
}
