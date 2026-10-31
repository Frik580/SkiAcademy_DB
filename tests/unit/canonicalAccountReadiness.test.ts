import { describe, expect, it } from 'vitest';
import { isCanonicalAccountReadyForReads } from '../../src/features/profile/canonicalAccountReadiness';

const accountId = 'account_signup_123';
const canonical = {
  uid: accountId,
  accountId,
  dataScope: 'live',
  lifecycle: { status: 'active' },
  revision: 1,
  audit: { createdByCommandId: 'cmd_signup' },
};

describe('canonical Account readiness for client read sync', () => {
  it('waits for server initialization after a verified signup creates only the presentation profile', () => {
    expect(
      isCanonicalAccountReadyForReads(
        {
          uid: accountId,
          email: 'verified@example.com',
          role: 'user',
          dataScope: 'live',
        },
        accountId
      )
    ).toBe(false);
  });

  it('allows canonical reads after the server commits the Account', () => {
    expect(isCanonicalAccountReadyForReads(canonical, accountId)).toBe(true);
  });

  it('never accepts a different, disabled, or malformed canonical Account', () => {
    expect(isCanonicalAccountReadyForReads(canonical, 'another-uid')).toBe(false);
    expect(
      isCanonicalAccountReadyForReads(
        { ...canonical, lifecycle: { status: 'disabled' } },
        accountId
      )
    ).toBe(false);
    expect(isCanonicalAccountReadyForReads({ ...canonical, revision: undefined }, accountId)).toBe(
      false
    );
    expect(isCanonicalAccountReadyForReads({ ...canonical, audit: undefined }, accountId)).toBe(
      false
    );
  });

  it('preserves active canonical test accounts in their assigned read scope', () => {
    expect(isCanonicalAccountReadyForReads({ ...canonical, dataScope: 'test' }, accountId)).toBe(
      true
    );
  });
});
