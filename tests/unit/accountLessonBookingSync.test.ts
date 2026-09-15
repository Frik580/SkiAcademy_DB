import { describe, expect, it } from 'vitest';
import {
  shouldSyncAccountLessonBookings,
  shouldSyncAccountLessonHistory,
  shouldSyncAccountParticipantLessonStats,
} from '../../src/store/accountLessonBookingSync';

describe('shouldSyncAccountLessonBookings (account_hot surfaces)', () => {
  it('does not sync when signed out', () => {
    expect(shouldSyncAccountLessonBookings({ pathname: '/cabinet', accountId: undefined })).toBe(
      false
    );
    expect(shouldSyncAccountLessonBookings({ pathname: '/', accountId: undefined })).toBe(false);
  });

  it('enables only surfaces that render current/upcoming lessons', () => {
    for (const pathname of [
      '/cabinet',
      '/cabinet/',
      '/cabinet/home',
      '/cabinet/calendar',
      '/cabinet/coach',
      '/cabinet/instructors',
    ]) {
      expect(shouldSyncAccountLessonBookings({ pathname, accountId: 'account_01' })).toBe(true);
    }
  });

  it('does not enable Training, History, Profile, public home, or workspaces', () => {
    for (const pathname of [
      '/',
      '/cabinet/training',
      '/cabinet/history',
      '/cabinet/development',
      '/cabinet/courses',
      '/cabinet/settings',
      '/cabinet/profile_personal',
      '/cabinet/profile_wallet',
      '/cabinet/profile_journey',
      '/cabinet/profile_achievements',
      '/cabinet/profile_season',
      '/instructor',
      '/admin',
    ]) {
      expect(shouldSyncAccountLessonBookings({ pathname, accountId: 'account_01' })).toBe(false);
    }
  });
});

describe('account lesson expensive-surface gates', () => {
  it('owns lesson history on both non-hot history surfaces', () => {
    // Journey renders completed lessons directly; completed is never account_hot.
    for (const pathname of [
      '/cabinet/history',
      '/cabinet/history/',
      '/cabinet/profile_journey',
      '/cabinet/profile_journey/',
    ]) {
      expect(shouldSyncAccountLessonHistory({ pathname, accountId: 'account_01' })).toBe(true);
    }
  });

  it('does not own lesson history elsewhere', () => {
    expect(shouldSyncAccountLessonHistory({ pathname: '/', accountId: 'account_01' })).toBe(false);
    expect(shouldSyncAccountLessonHistory({ pathname: '/cabinet', accountId: 'account_01' })).toBe(
      false
    );
    expect(
      shouldSyncAccountLessonHistory({ pathname: '/cabinet/calendar', accountId: 'account_01' })
    ).toBe(false);
    expect(
      shouldSyncAccountLessonHistory({
        pathname: '/cabinet/profile_wallet',
        accountId: 'account_01',
      })
    ).toBe(false);
    for (const pathname of ['/cabinet/history', '/cabinet/profile_journey']) {
      expect(shouldSyncAccountLessonHistory({ pathname, accountId: undefined })).toBe(false);
    }
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
