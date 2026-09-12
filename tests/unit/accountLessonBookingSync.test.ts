import { describe, expect, it } from 'vitest';
import {
  shouldSyncAccountLessonBookings,
  shouldSyncAccountLessonHistory,
  shouldSyncAccountParticipantLessonStats,
} from '../../src/store/accountLessonBookingSync';

describe('shouldSyncAccountLessonBookings', () => {
  it('does not sync when signed out', () => {
    expect(shouldSyncAccountLessonBookings({ pathname: '/cabinet', accountId: undefined })).toBe(
      false
    );
    expect(shouldSyncAccountLessonBookings({ pathname: '/', accountId: undefined })).toBe(false);
  });

  it('syncs authenticated cabinet and home lesson surfaces', () => {
    expect(shouldSyncAccountLessonBookings({ pathname: '/cabinet', accountId: 'account_01' })).toBe(
      true
    );
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

describe('account lesson expensive-surface gates', () => {
  it('owns lesson history only on the real History route', () => {
    expect(shouldSyncAccountLessonHistory({ pathname: '/', accountId: 'account_01' })).toBe(false);
    expect(shouldSyncAccountLessonHistory({ pathname: '/cabinet', accountId: 'account_01' })).toBe(
      false
    );
    expect(
      shouldSyncAccountLessonHistory({ pathname: '/cabinet/history', accountId: 'account_01' })
    ).toBe(true);
    expect(
      shouldSyncAccountLessonHistory({ pathname: '/cabinet/history/', accountId: 'account_01' })
    ).toBe(true);
  });

  it('enables participant stats only for routes with visible consumers', () => {
    for (const pathname of [
      '/cabinet',
      '/cabinet/home',
      '/cabinet/coach',
      '/cabinet/instructors',
      '/cabinet/profile_achievements',
      '/cabinet/profile_season',
      '/cabinet/',
    ]) {
      expect(shouldSyncAccountParticipantLessonStats({ pathname, accountId: 'account_01' })).toBe(
        true
      );
    }
    for (const pathname of ['/', '/cabinet/training', '/cabinet/history', '/admin']) {
      expect(shouldSyncAccountParticipantLessonStats({ pathname, accountId: 'account_01' })).toBe(
        false
      );
    }
  });
});
