import { describe, expect, it } from 'vitest';
import { resolveDataSyncScope } from '../../src/store/useDataSyncScope';

describe('resolveDataSyncScope', () => {
  it('loads nothing extra on the public home page', () => {
    expect(resolveDataSyncScope('/', false)).toEqual({
      shouldSyncUsersList: false,
      shouldSyncActivityLogs: false,
      shouldSyncReviews: false,
      shouldLoadBookingHistory: false,
    });
  });

  it('loads usersList and activityLogs on admin route', () => {
    expect(resolveDataSyncScope('/admin', false)).toEqual({
      shouldSyncUsersList: true,
      shouldSyncActivityLogs: true,
      shouldSyncReviews: false,
      shouldLoadBookingHistory: true,
    });
  });

  it('loads usersList, activityLogs, and reviews on instructor route', () => {
    expect(resolveDataSyncScope('/instructor', false)).toEqual({
      shouldSyncUsersList: true,
      shouldSyncActivityLogs: true,
      shouldSyncReviews: true,
      shouldLoadBookingHistory: true,
    });
  });

  it('loads activityLogs and reviews on cabinet routes but not usersList', () => {
    expect(resolveDataSyncScope('/cabinet', false)).toEqual({
      shouldSyncUsersList: false,
      shouldSyncActivityLogs: true,
      shouldSyncReviews: true,
      shouldLoadBookingHistory: true,
    });

    expect(resolveDataSyncScope('/cabinet/history', false)).toEqual({
      shouldSyncUsersList: false,
      shouldSyncActivityLogs: true,
      shouldSyncReviews: true,
      shouldLoadBookingHistory: true,
    });
  });

  it('loads reviews when instructor reviews modal is open on home', () => {
    expect(resolveDataSyncScope('/', true)).toEqual({
      shouldSyncUsersList: false,
      shouldSyncActivityLogs: false,
      shouldSyncReviews: true,
      shouldLoadBookingHistory: false,
    });
  });
});
