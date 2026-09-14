import { beforeEach, describe, expect, it, vi } from 'vitest';
import { timestampFromDate } from '@ski-academy/shared-domain';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';
import { persistGuestCourseEnrollmentCredential } from '../../src/features/course-enrollments/guestCourseEnrollmentCredentialStorage';
import { selectActiveGuestCourseEnrollment } from '../../src/features/course-enrollments/courseEnrollmentViewModel';
import { hydrateGuestCourseEnrollmentsFromStorage } from '../../src/features/course-enrollments/useCourseEnrollmentReadSync';

const queryEnrollmentMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseEnrollmentReadModels: (...args: unknown[]) => queryEnrollmentMock(...args),
  queryCourseCatalogReadModels: vi.fn(),
}));

describe('guest course enrollment reload hydration', () => {
  beforeEach(() => {
    useCourseEnrollmentStore.getState().reset();
    localStorage.clear();
    queryEnrollmentMock.mockReset();
  });

  it('hydrates stored guest enrollment so CTA state matches after reload', async () => {
    const enrollmentId = 'enrollment_guest_reload_01';
    persistGuestCourseEnrollmentCredential({
      enrollmentId,
      guestSubjectId: 'guest_reload_01',
      nonce: 'nonce_fixture_16chars',
      signature: 'd'.repeat(64),
      expiresAt: timestampFromDate(new Date('2099-01-01T00:00:00.000Z')),
    });
    queryEnrollmentMock.mockResolvedValueOnce({
      scope: 'guest_single',
      items: [
        {
          enrollmentId,
          revision: 1,
          courseId: 'course_reload_01',
          participant: { participantId: 'participant_guest_reload_01', displayName: 'Guest' },
          lifecycle: { status: 'pending' },
          courseDisplay: { courseId: 'course_reload_01', title: 'Reload Course' },
          courseSchedule: {
            courseId: 'course_reload_01',
            courseScheduleRevision: 1,
            courseDayCount: 1,
            startAt: { seconds: 1_800_000_000, nanoseconds: 0 },
            finalCourseDayEndsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
            courseDays: [
              {
                courseDayId: 'course_day_reload_01',
                dayOrder: 1,
                interval: {
                  startsAt: { seconds: 1_800_000_000, nanoseconds: 0 },
                  endsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
                },
                timeZone: 'Asia/Almaty',
                revision: 1,
              },
            ],
          },
          bookingOrigin: 'guest',
          authorizedActions: { canWithdraw: true, canRequestCancellation: false },
          updatedAt: { seconds: 1_800_000_000, nanoseconds: 0 },
        },
      ],
      hasMore: false,
    });

    await hydrateGuestCourseEnrollmentsFromStorage();

    const items = [...useCourseEnrollmentStore.getState().items.values()];
    expect(selectActiveGuestCourseEnrollment(items, 'course_reload_01')?.lifecycleStatus).toBe(
      'pending'
    );
  });
});
