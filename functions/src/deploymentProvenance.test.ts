import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_PROJECT_ID, STAGING_PROJECT_ID } from './staging/configPromotionContract';
import {
  FUNCTIONS_E2E_PROJECT_ID,
  FUNCTIONS_PRODUCTION_PROJECT_ID,
  FUNCTIONS_STAGING_PROJECT_ID,
  createFunctionsRuntimeProvenance,
  functionsProvenanceLabels,
  parseBakedDeploymentProvenance,
  resolveFunctionsEnvironment,
} from './deploymentProvenance';
import { createFunctionsBuildProvenance } from '../../scripts/deploymentProvenance.mjs';

const SHA = 'c'.repeat(40);
const STAMP = '2026-09-30T18:00:00.000Z';

describe('functions deployment provenance', () => {
  it('keeps runtime project ids aligned with the canonical project contract', () => {
    expect(FUNCTIONS_PRODUCTION_PROJECT_ID).toBe(PRODUCTION_PROJECT_ID);
    expect(FUNCTIONS_STAGING_PROJECT_ID).toBe(STAGING_PROJECT_ID);
    expect(FUNCTIONS_E2E_PROJECT_ID).toBe('demo-ski-school-e2e');
  });

  it('receives the build provenance SHA instead of a static string', () => {
    const baked = createFunctionsBuildProvenance({
      commitSha: SHA,
      buildTimestamp: STAMP,
      dirty: false,
    });
    expect(parseBakedDeploymentProvenance(baked)).toEqual(baked);
    expect(functionsProvenanceLabels(baked)).toEqual({
      commit_sha: SHA,
      commit_dirty: 'false',
    });
  });

  it('resolves the running project instead of a baked environment', () => {
    const baked = parseBakedDeploymentProvenance({
      commitSha: SHA,
      buildTimestamp: STAMP,
      dirty: false,
    });
    expect(
      createFunctionsRuntimeProvenance(baked, { projectId: FUNCTIONS_PRODUCTION_PROJECT_ID })
    ).toMatchObject({
      commitSha: SHA,
      environment: 'production',
      firebaseProjectId: FUNCTIONS_PRODUCTION_PROJECT_ID,
    });
    expect(resolveFunctionsEnvironment({ projectId: FUNCTIONS_STAGING_PROJECT_ID })).toBe(
      'staging'
    );
    expect(
      resolveFunctionsEnvironment({
        projectId: FUNCTIONS_PRODUCTION_PROJECT_ID,
        functionsEmulator: 'true',
      })
    ).toBe('e2e');
    expect(
      resolveFunctionsEnvironment({
        projectId: 'other-project',
        firebaseEmulatorHub: '127.0.0.1:4400',
      })
    ).toBe('e2e');
    expect(resolveFunctionsEnvironment({ projectId: 'other-project' })).toBe('development');
  });

  it('rejects a functions payload that is missing a SHA or carries extra fields', () => {
    expect(() => parseBakedDeploymentProvenance({ buildTimestamp: STAMP, dirty: false })).toThrow(
      'Cannot determine source commit for functions build'
    );
    expect(() =>
      parseBakedDeploymentProvenance({
        commitSha: SHA,
        buildTimestamp: STAMP,
        dirty: false,
        token: 'super-secret-token',
      })
    ).toThrow(/unexpected fields/);
  });

  it('applies shared provenance labels before function exports are defined', () => {
    const index = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
    const bootstrap = readFileSync(resolve(__dirname, 'deploymentProvenanceBootstrap.ts'), 'utf8');
    expect(index.startsWith("import './deploymentProvenanceBootstrap';")).toBe(true);
    expect(bootstrap).toContain('setGlobalOptions');
    expect(bootstrap).toContain('functionsProvenanceLabels');
    expect(bootstrap).not.toContain('process.env');
  });
});
