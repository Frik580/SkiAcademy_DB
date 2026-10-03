import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { timestampFromDate } from '@ski-academy/shared-domain';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';

const executeAuthenticatedMock = vi.fn();
const executeGuestMock = vi.fn();
const queryEnrollmentMock = vi.fn();
const queryCatalogMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) => executeAuthenticatedMock(...args),
  executeGuestCanonicalCommand: (...args: unknown[]) => executeGuestMock(...args),
  previewAuthenticatedCommandIdentity: () => ({ commandKey: 'command_fixture_01' }),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseEnrollmentReadModels: (...args: unknown[]) => queryEnrollmentMock(...args),
  queryCourseCatalogReadModels: (...args: unknown[]) => queryCatalogMock(...args),
}));

import { useCourseEnrollmentCommands } from '../../src/features/course-enrollments/useCourseEnrollmentCommands';

describe('courseEnrollment commands integration', () => {
  beforeEach(() => {
    useCourseEnrollmentStore.getState().reset();
    executeAuthenticatedMock.mockReset();
    executeGuestMock.mockReset();
    queryEnrollmentMock.mockReset();
    queryCatalogMock.mockReset();
    localStorage.clear();
  });

  it('creates authenticated enrollment and refetches hot enrollments and catalog', async () => {
    const accountId = 'account_fixture_01';
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'success',
      payload: { outcome: 'created' },
    });
    queryEnrollmentMock.mockResolvedValueOnce({
      scope: 'account_hot',
      items: [],
      hasMore: false,
    });
    queryCatalogMock.mockResolvedValueOnce({ scope: 'product', items: [] });

    const { result } = renderHook(() => useCourseEnrollmentCommands(accountId));
    const created = await result.current.createAuthenticatedEnrollment({
      courseId: 'course_fixture_01',
      participantIds: ['participant_fixture_01'],
      exercisedCapability: 'account_owner',
      identity: {
        enrollmentId: '',
        idempotencyKey: 'create-course-enrollment:course_fixture_01:participant_fixture_01',
      },
    });

    expect(created).toEqual({ outcome: 'created' });
    expect(executeAuthenticatedMock).toHaveBeenCalledWith(
      accountId,
      expect.objectContaining({
        kind: 'create_course_enrollments',
      })
    );
    expect(queryEnrollmentMock).toHaveBeenCalledWith({ scope: 'account_hot' });
    expect(queryCatalogMock).toHaveBeenCalledWith({ scope: 'product' });
  });

  it('cancels a guest enrollment with the canonical command and cancellation-scoped credential', async () => {
    const expiresAt = timestampFromDate(new Date('2099-01-01T00:00:00.000Z'));
    const guestCredential = {
      enrollmentId: 'enrollment_guest_cancel_01',
      guestSubjectId: 'a'.repeat(64),
      nonce: 'lookup_nonce_fixture_01',
      signature: 'b'.repeat(64),
      expiresAt,
      cancellationCredential: {
        nonce: 'cancel_nonce_fixture_01',
        signature: 'c'.repeat(64),
        expiresAt,
      },
    };
    executeGuestMock.mockResolvedValueOnce({
      status: 'success',
      payload: { lifecycleStatus: 'cancelled' },
    });
    const { result } = renderHook(() => useCourseEnrollmentCommands(undefined));
    const outcome = await result.current.requestCancellation({
      enrollmentId: guestCredential.enrollmentId,
      expectedRevision: 1,
      idempotencyKey: 'cancel:enrollment_guest_cancel_01:1',
      exercisedCapability: 'account_owner',
      guestCredential: guestCredential as never,
    });
    expect(executeGuestMock).toHaveBeenCalledWith({
      kind: 'request_course_enrollment_cancellation',
      intent: { courseEnrollmentId: guestCredential.enrollmentId },
      idempotencyKey: 'cancel:enrollment_guest_cancel_01:1',
      expectedRevision: 1,
      guestActionNonce: guestCredential.cancellationCredential.nonce,
      guestActionSignature: guestCredential.cancellationCredential.signature,
    });
    expect(outcome).toEqual({ lifecycleStatus: 'cancelled', refreshFailed: false });
    expect(executeAuthenticatedMock).not.toHaveBeenCalled();
  });

  it('keeps authenticated enrollment successful when post-create refresh fails', async () => {
    const accountId = 'account_fixture_01';
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'success',
      payload: { outcome: 'created' },
    });
    queryEnrollmentMock.mockRejectedValueOnce(new Error('read failed'));
    queryCatalogMock.mockResolvedValueOnce({ scope: 'product', items: [] });

    const { result } = renderHook(() => useCourseEnrollmentCommands(accountId));
    const created = await result.current.createAuthenticatedEnrollment({
      courseId: 'course_fixture_01',
      participantIds: ['participant_fixture_01'],
      exercisedCapability: 'account_owner',
      identity: {
        enrollmentId: '',
        idempotencyKey: 'create-course-enrollment:course_fixture_01:participant_fixture_01',
      },
    });

    expect(created).toEqual({ outcome: 'created', refreshFailed: true });
    expect(executeAuthenticatedMock).toHaveBeenCalledTimes(1);
    expect(queryEnrollmentMock).toHaveBeenCalledTimes(1);
  });

  it('returns already_exists outcome for equivalent success without treating it as a new debit', async () => {
    const accountId = 'account_fixture_01';
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'success',
      payload: { outcome: 'already_exists' },
    });
    queryEnrollmentMock.mockResolvedValueOnce({
      scope: 'account_hot',
      items: [],
      hasMore: false,
    });
    queryCatalogMock.mockResolvedValueOnce({ scope: 'product', items: [] });

    const { result } = renderHook(() => useCourseEnrollmentCommands(accountId));
    const replayed = await result.current.createAuthenticatedEnrollment({
      courseId: 'course_fixture_01',
      participantIds: ['participant_fixture_01'],
      exercisedCapability: 'account_owner',
      identity: {
        enrollmentId: '',
        idempotencyKey: 'create-course-enrollment:course_fixture_01:participant_fixture_01',
      },
    });

    expect(replayed).toEqual({ outcome: 'already_exists' });
    expect(queryEnrollmentMock).toHaveBeenCalledWith({ scope: 'account_hot' });
  });

  it('creates guest enrollment, persists credential, and refreshes catalog seats', async () => {
    const enrollmentId = 'enrollment_guest_fixture_01';
    const credential = {
      enrollmentId,
      guestSubjectId: 'guest_fixture_01',
      nonce: 'nonce_fixture_16chars',
      signature: 'c'.repeat(64),
      expiresAt: timestampFromDate(new Date('2099-01-01T00:00:00.000Z')),
    };
    executeGuestMock.mockResolvedValueOnce({
      status: 'success',
      payload: { outcome: 'created', guestLinkCredentials: [credential] },
    });
    queryCatalogMock.mockResolvedValueOnce({
      scope: 'public',
      items: [
        {
          courseId: 'course_fixture_01',
          revision: 2,
          title: 'Guest Course',
          price: 50_000,
          capacity: {
            totalSeats: 5,
            availableSeats: 4,
            isCapacityFrozen: false,
            isEnrollmentEligible: true,
            isFull: false,
          },
          scheduleSummary: {
            startAt: { seconds: 1_800_000_000, nanoseconds: 0 },
            finalCourseDayEndsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
            courseDayCount: 1,
          },
          courseSchedule: {
            courseId: 'course_fixture_01',
            courseScheduleRevision: 1,
            courseDayCount: 1,
            startAt: { seconds: 1_800_000_000, nanoseconds: 0 },
            finalCourseDayEndsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
            courseDays: [
              {
                courseDayId: 'course_day_fixture_01',
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
          updatedAt: { seconds: 1_800_000_000, nanoseconds: 0 },
        },
      ],
    });
    queryEnrollmentMock.mockResolvedValueOnce({
      scope: 'guest_single',
      items: [],
      hasMore: false,
    });

    useCourseEnrollmentStore.getState().mergeCatalog(
      new Map([
        [
          'course_fixture_01',
          {
            courseId: 'course_fixture_01',
            revision: 1,
            title: 'Guest Course',
            priceMinorUnits: 50_000,
            totalSeats: 5,
            availableSeats: 5,
            isCapacityFrozen: false,
            isEnrollmentEligible: true,
            isFull: false,
            scheduleSummaryStartDate: '2027-01-15',
            scheduleSummaryEndDate: '2027-01-15',
            courseDayCount: 1,
            courseSchedule: {
              courseId: 'course_fixture_01',
              courseScheduleRevision: 1,
              courseDayCount: 1,
              startAt: { seconds: 1_800_000_000, nanoseconds: 0 },
              finalCourseDayEndsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
              courseDays: [
                {
                  courseDayId: 'course_day_fixture_01',
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
          },
        ],
      ])
    );

    const { result } = renderHook(() => useCourseEnrollmentCommands(undefined));
    const returned = await result.current.createGuestEnrollment({
      courseId: 'course_fixture_01',
      enrollmentId,
      participantId: 'participant_guest_fixture_01',
      identity: {
        enrollmentId,
        idempotencyKey: `create-guest-course-enrollment:${enrollmentId}`,
      },
      guestDisplayName: 'Guest',
      guestPhone: '+7 701 123 45 67',
      guestEmail: 'course@example.com',
      guestSkillLevel: 'intermediate',
      guestDiscipline: 'snowboard',
      guestAgeYears: 12,
    });

    expect(returned).toEqual(credential);
    expect(executeGuestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        guestPhone: '+7 701 123 45 67',
        guestEmail: 'course@example.com',
        guestParticipantSkillLevel: 'intermediate',
        guestParticipantDiscipline: 'snowboard',
        guestParticipantAgeYears: 12,
      })
    );
    expect(
      localStorage.getItem(`ski_academy_guest_course_enrollment_credential:${enrollmentId}`)
    ).toBeTruthy();
    expect(queryCatalogMock).toHaveBeenCalledWith({
      scope: 'public',
      courseId: 'course_fixture_01',
    });
    expect(
      useCourseEnrollmentStore.getState().catalogByCourseId.get('course_fixture_01')?.availableSeats
    ).toBe(4);
  });
});
