import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { timestampFromDate } from '@ski-academy/shared-domain';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';
import { readGuestCourseEnrollmentCredential } from '../../src/features/course-enrollments/guestCourseEnrollmentCredentialStorage';
import { useCourseEnrollmentCommands } from '../../src/features/course-enrollments/useCourseEnrollmentCommands';
import { selectActiveGuestCourseEnrollment } from '../../src/features/course-enrollments/courseEnrollmentViewModel';
import { hydrateGuestCourseEnrollmentsFromStorage } from '../../src/features/course-enrollments/useCourseEnrollmentReadSync';

const queryEnrollmentMock = vi.fn();
const executeGuestCommandMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeGuestCanonicalCommand: (...args: unknown[]) => executeGuestCommandMock(...args),
  executeAuthenticatedCanonicalCommand: vi.fn(),
  previewAuthenticatedCommandIdentity: vi.fn(),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseEnrollmentReadModels: (...args: unknown[]) => queryEnrollmentMock(...args),
  queryCourseCatalogReadModels: vi.fn(async () => ({ scope: 'public', items: [], hasMore: false })),
}));

describe('guest course enrollment reload hydration', () => {
  beforeEach(() => {
    useCourseEnrollmentStore.getState().reset();
    localStorage.clear();
    queryEnrollmentMock.mockReset();
    executeGuestCommandMock.mockReset();
  });

  it('persists a successful create credential, loads pending into the store, and restores it after reload', async () => {
    const enrollmentId = 'enrollment_guest_reload_01';
    const credential = {
      enrollmentId,
      guestSubjectId: 'guest_reload_01',
      nonce: 'nonce_fixture_16chars',
      signature: 'd'.repeat(64),
      expiresAt: timestampFromDate(new Date('2099-01-01T00:00:00.000Z')),
    };
    executeGuestCommandMock.mockResolvedValue({
      status: 'success',
      kind: 'create_course_enrollments',
      payload: {
        outcome: 'created',
        guestLinkCredentials: [credential],
        adminCoursesRevision: 23,
        adminFinanceRevision: 50,
      },
    });
    queryEnrollmentMock.mockResolvedValue({
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

    const { result } = renderHook(() => useCourseEnrollmentCommands(undefined));
    await act(async () => {
      expect(
        await result.current.createGuestEnrollment({
          courseId: 'course_reload_01',
          enrollmentId,
          participantId: 'participant_guest_reload_01',
          identity: { enrollmentId, idempotencyKey: 'guest-visibility-create' },
          guestDisplayName: 'Guest',
          guestPhone: '+555',
          guestAgeYears: 30,
          guestDiscipline: 'ski',
          guestSkillLevel: 'beginner',
        })
      ).toEqual(credential);
    });
    expect(readGuestCourseEnrollmentCredential(enrollmentId).credential).toEqual(credential);
    expect(queryEnrollmentMock).toHaveBeenCalledWith({
      scope: 'guest_single',
      enrollmentId,
      guestActionNonce: credential.nonce,
      guestActionSignature: credential.signature,
    });
    expect(useCourseEnrollmentStore.getState().items.get(enrollmentId)?.lifecycleStatus).toBe(
      'pending'
    );
    useCourseEnrollmentStore.getState().reset();
    await hydrateGuestCourseEnrollmentsFromStorage();

    const items = [...useCourseEnrollmentStore.getState().items.values()];
    expect(selectActiveGuestCourseEnrollment(items, 'course_reload_01')?.lifecycleStatus).toBe(
      'pending'
    );
  });
});
