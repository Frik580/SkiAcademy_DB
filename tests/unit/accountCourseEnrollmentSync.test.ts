import { describe, expect, it } from 'vitest';
import { shouldSyncAccountCourseEnrollments } from '../../src/store/accountCourseEnrollmentSync';

describe('shouldSyncAccountCourseEnrollments', () => {
  it('does not sync when signed out', () => {
    expect(shouldSyncAccountCourseEnrollments({ pathname: '/cabinet', accountId: undefined })).toBe(
      false
    );
    expect(shouldSyncAccountCourseEnrollments({ pathname: '/', accountId: undefined })).toBe(false);
  });

  it('syncs authenticated cabinet and home course surfaces', () => {
    expect(
      shouldSyncAccountCourseEnrollments({ pathname: '/cabinet', accountId: 'account_01' })
    ).toBe(true);
    expect(
      shouldSyncAccountCourseEnrollments({ pathname: '/cabinet/courses', accountId: 'account_01' })
    ).toBe(true);
    expect(shouldSyncAccountCourseEnrollments({ pathname: '/', accountId: 'account_01' })).toBe(
      true
    );
  });

  it('does not sync instructor or admin workspaces', () => {
    expect(
      shouldSyncAccountCourseEnrollments({ pathname: '/instructor', accountId: 'account_01' })
    ).toBe(false);
    expect(
      shouldSyncAccountCourseEnrollments({ pathname: '/admin', accountId: 'account_01' })
    ).toBe(false);
  });
});
