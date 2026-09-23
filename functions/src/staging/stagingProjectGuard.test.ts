import { describe, expect, it, vi } from 'vitest';
import { assertStagingMutationEnvironment, resolveStagingProjectId } from './stagingProjectGuard';

describe('staging project mutation guard', () => {
  it('allows exactly the physical staging project', () => {
    expect(resolveStagingProjectId({ explicitProjectId: 'ski-school-staging' })).toBe(
      'ski-school-staging'
    );
  });

  it('rejects production before a mutation callback can run', () => {
    const mutation = vi.fn();
    expect(() => {
      resolveStagingProjectId({ explicitProjectId: 'ski-school-8f3ca' });
      mutation();
    }).toThrow('STAGING ONLY: refusing to mutate project ski-school-8f3ca');
    expect(mutation).not.toHaveBeenCalled();
  });

  it('rejects a missing project id before a mutation callback can run', () => {
    const mutation = vi.fn();
    expect(() => {
      resolveStagingProjectId({});
      mutation();
    }).toThrow('STAGING ONLY: refusing to mutate project <missing>');
    expect(mutation).not.toHaveBeenCalled();
  });

  it('rejects conflicting explicit and environment project ids', () => {
    expect(() =>
      assertStagingMutationEnvironment({
        explicitProjectId: 'ski-school-staging',
        env: { GOOGLE_CLOUD_PROJECT: 'ski-school-8f3ca' },
      })
    ).toThrow('STAGING ONLY: refusing conflicting project ids');
  });

  it('rejects emulator routing for mutation commands', () => {
    expect(() =>
      assertStagingMutationEnvironment({
        explicitProjectId: 'ski-school-staging',
        env: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
      })
    ).toThrow('STAGING ONLY: refusing mutation while Firebase emulator hosts are configured');
  });
});
