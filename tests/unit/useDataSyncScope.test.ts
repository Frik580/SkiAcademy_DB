import { describe, expect, it } from 'vitest';
import { resolveDataSyncScope } from '../../src/store/useDataSyncScope';

describe('resolveDataSyncScope', () => {
  it('loads nothing extra on the public home page', () => {
    expect(resolveDataSyncScope('/', false)).toEqual({
      catalogueScope: 'full',
      shouldSyncUsersList: false,
      shouldSyncActivityLogs: false,
      shouldSyncReviews: false,
      shouldLoadBookingHistory: false,
      shouldUseCanonicalLessonBookings: false,
      shouldUseCanonicalCourseEnrollments: false,
      shouldLoadLegacyCourseBookings: false,
    });
  });

  it('loads usersList and activityLogs on admin route without canonical lesson bookings', () => {
    expect(resolveDataSyncScope('/admin', false)).toEqual({
      catalogueScope: 'full',
      shouldSyncUsersList: true,
      shouldSyncActivityLogs: true,
      shouldSyncReviews: false,
      shouldLoadBookingHistory: true,
      shouldUseCanonicalLessonBookings: false,
      shouldUseCanonicalCourseEnrollments: false,
      shouldLoadLegacyCourseBookings: false,
    });
  });

  it('loads usersList, activityLogs, and reviews on instructor route', () => {
    expect(resolveDataSyncScope('/instructor', false)).toEqual({
      catalogueScope: 'instructor',
      shouldSyncUsersList: true,
      shouldSyncActivityLogs: true,
      shouldSyncReviews: true,
      shouldLoadBookingHistory: true,
      shouldUseCanonicalLessonBookings: false,
      shouldUseCanonicalCourseEnrollments: false,
      shouldLoadLegacyCourseBookings: false,
    });
  });

  it('uses canonical lesson and course enrollments on cabinet routes without legacy course bookings', () => {
    expect(resolveDataSyncScope('/cabinet', false)).toEqual({
      catalogueScope: 'full',
      shouldSyncUsersList: false,
      shouldSyncActivityLogs: true,
      shouldSyncReviews: true,
      shouldLoadBookingHistory: false,
      shouldUseCanonicalLessonBookings: true,
      shouldUseCanonicalCourseEnrollments: true,
      shouldLoadLegacyCourseBookings: false,
    });

    expect(resolveDataSyncScope('/cabinet/history', false)).toEqual({
      catalogueScope: 'full',
      shouldSyncUsersList: false,
      shouldSyncActivityLogs: true,
      shouldSyncReviews: true,
      shouldLoadBookingHistory: false,
      shouldUseCanonicalLessonBookings: true,
      shouldUseCanonicalCourseEnrollments: true,
      shouldLoadLegacyCourseBookings: false,
    });
  });

  it('loads reviews when instructor reviews modal is open on home', () => {
    expect(resolveDataSyncScope('/', true)).toEqual({
      catalogueScope: 'full',
      shouldSyncUsersList: false,
      shouldSyncActivityLogs: false,
      shouldSyncReviews: true,
      shouldLoadBookingHistory: false,
      shouldUseCanonicalLessonBookings: false,
      shouldUseCanonicalCourseEnrollments: false,
      shouldLoadLegacyCourseBookings: false,
    });
  });
});
