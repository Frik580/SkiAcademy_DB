import { describe, expect, it } from 'vitest';
import { shouldSyncAccountLessonBookings } from '../../src/store/accountLessonBookingSync';

describe('shouldSyncAccountLessonBookings', () => {
  it('does not sync when signed out', () => {
    expect(shouldSyncAccountLessonBookings({ pathname: '/cabinet', accountId: undefined })).toBe(
      false
    );
    expect(shouldSyncAccountLessonBookings({ pathname: '/', accountId: undefined })).toBe(false);
  });

  it('syncs authenticated cabinet and home lesson surfaces', () => {
    expect(
      shouldSyncAccountLessonBookings({ pathname: '/cabinet', accountId: 'account_01' })
    ).toBe(true);
    expect(
      shouldSyncAccountLessonBookings({ pathname: '/cabinet/history', accountId: 'account_01' })
    ).toBe(true);
    expect(shouldSyncAccountLessonBookings({ pathname: '/', accountId: 'account_01' })).toBe(true);
  });

  it('does not sync instructor or admin workspaces', () => {
    expect(
      shouldSyncAccountLessonBookings({ pathname: '/instructor', accountId: 'account_01' })
    ).toBe(false);
    expect(shouldSyncAccountLessonBookings({ pathname: '/admin', accountId: 'account_01' })).toBe(
      false
    );
  });
});
