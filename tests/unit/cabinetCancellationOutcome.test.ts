import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { BookingIdSchema } from '@ski-academy/shared-domain';
import {
  presentCabinetCancellationNotifications,
  parseCancellationLifecycleFromCommandResult,
  resolveLessonCancellationLifecycleFromStore,
  resolveCourseCancellationLifecycleFromStore,
} from '../../src/features/student-cabinet/cabinetCancellationOutcome';
import { resolveCabinetCancellationOutcome } from '../../src/features/student-cabinet/resolveCabinetCancellationOutcome';
import { useLessonBookingStore } from '../../src/features/lesson-bookings/lessonBookingStore';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';
import type { CourseEnrollmentCabinetItem } from '../../src/features/course-enrollments';

const executeAuthenticatedMock = vi.fn();
const executeGuestMock = vi.fn();
const queryLessonReadModelsMock = vi.fn();
const queryCourseReadModelsMock = vi.fn();
const queryCatalogReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) => executeAuthenticatedMock(...args),
  executeGuestCanonicalCommand: (...args: unknown[]) => executeGuestMock(...args),
  previewAuthenticatedCommandIdentity: vi.fn(),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonReadModelsMock(...args),
  queryCourseEnrollmentReadModels: (...args: unknown[]) => queryCourseReadModelsMock(...args),
  queryCourseCatalogReadModels: (...args: unknown[]) => queryCatalogReadModelsMock(...args),
}));

import { useLessonBookingCommands } from '../../src/features/lesson-bookings/useLessonBookingCommands';
import { useCourseEnrollmentCommands } from '../../src/features/course-enrollments/useCourseEnrollmentCommands';

function lessonItem(status: LessonBookingCabinetItem['status']): LessonBookingCabinetItem {
  return {
    id: 'booking_cancel_test',
    bookingId: 'booking_cancel_test',
    revision: 4,
    status,
    date: '2026-06-15',
    time: '08:00',
    durationHours: 2,
    instructorId: 'instructor_01',
    instructorName: 'Coach',
    instructorAvatar: '',
    participantNames: ['Student'],
    partyKind: 'individual',
    payment: { kind: 'visible', paymentStatus: 'captured', price: 100 },
    bookingOrigin: 'account',
    isLessonBooking: true,
  };
}

function courseItem(
  lifecycleStatus: CourseEnrollmentCabinetItem['lifecycleStatus']
): CourseEnrollmentCabinetItem {
  return {
    enrollmentId: 'enrollment_cancel_test',
    revision: 3,
    courseId: 'course_01',
    participantId: 'participant_01',
    participantName: 'Student',
    lifecycleStatus,
    courseTitle: 'Camp',
    courseSchedule: { timeZone: 'Asia/Almaty', days: [] },
    scheduleStartDate: '2026-06-01',
    scheduleEndDate: '2026-06-05',
    bookingOrigin: 'account',
    authorizedActions: { canWithdraw: false, canRequestCancellation: true },
    updatedAtSeconds: 1,
  };
}

describe('cabinet cancellation outcome', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
    useCourseEnrollmentStore.getState().reset();
    executeAuthenticatedMock.mockReset();
    executeGuestMock.mockReset();
    queryLessonReadModelsMock.mockReset();
    queryCourseReadModelsMock.mockReset();
    queryCatalogReadModelsMock.mockReset();
  });

  it('1. immediate lesson cancel shows lesson cancelled notification keys', () => {
    const notifications = presentCabinetCancellationNotifications('lesson', {
      lifecycleStatus: 'cancelled',
      refreshFailed: false,
    });
    expect(notifications).toEqual([
      {
        type: 'success',
        titleKey: 'lessonCancelledImmediate',
        messageKey: 'lessonCancelledImmediateDesc',
      },
    ]);
  });

  it('2. approval-required lesson cancel shows request notification keys', () => {
    const notifications = presentCabinetCancellationNotifications('lesson', {
      lifecycleStatus: 'pending_cancellation',
      refreshFailed: false,
    });
    expect(notifications).toEqual([
      {
        type: 'success',
        titleKey: 'lessonCancellationRequested',
        messageKey: 'lessonCancellationRequestedDesc',
      },
    ]);
  });

  it('3. immediate course cancel shows course cancelled notification keys', () => {
    const notifications = presentCabinetCancellationNotifications('course', {
      lifecycleStatus: 'cancelled',
      refreshFailed: false,
    });
    expect(notifications[0]).toMatchObject({
      type: 'success',
      titleKey: 'courseCancelledImmediate',
    });
  });

  it('4. approval-required course cancel shows course request notification keys', () => {
    const notifications = presentCabinetCancellationNotifications('course', {
      lifecycleStatus: 'pending_cancellation',
      refreshFailed: false,
    });
    expect(notifications[0]).toMatchObject({
      type: 'success',
      titleKey: 'courseCancellationRequested',
    });
  });

  it('5. command success with refresh failure keeps success outcome and adds warning', async () => {
    const notifications = presentCabinetCancellationNotifications('lesson', {
      lifecycleStatus: 'cancelled',
      refreshFailed: true,
    });
    expect(notifications).toHaveLength(2);
    expect(notifications[0]).toMatchObject({
      type: 'success',
      titleKey: 'lessonCancelledImmediate',
    });
    expect(notifications[1]).toMatchObject({
      type: 'warning',
      titleKey: 'cabinetCancellationRefreshWarning',
    });

    const outcome = await resolveCabinetCancellationOutcome({
      entityKind: 'lesson',
      entityId: 'booking_cancel_test',
      nextRevision: 5,
      commandResult: {
        status: 'success',
        kind: 'request_booking_cancellation',
        correlationId: 'correlation_cancel_01',
        payload: { lifecycleStatus: 'cancelled' },
      },
      refresh: async () => {
        throw new Error('read failed');
      },
      readLifecycleFromStore: () => undefined,
    });
    expect(outcome).toEqual({ lifecycleStatus: 'cancelled', refreshFailed: true });
  });

  it('parses lifecycle status from canonical command payload', () => {
    expect(
      parseCancellationLifecycleFromCommandResult('lesson', {
        status: 'success',
        payload: { lifecycleStatus: 'pending_cancellation' },
      })
    ).toBe('pending_cancellation');
  });

  it('updates lesson store after successful refresh and exposes cancelled card state', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'success',
      kind: 'request_booking_cancellation',
      correlationId: 'correlation_cancel_02',
      payload: { lifecycleStatus: 'cancelled' },
    });
    queryLessonReadModelsMock
      .mockResolvedValueOnce({ scope: 'account_hot', items: [], hasMore: false })
      .mockResolvedValueOnce({
        scope: 'account_history',
        items: [
          {
            bookingId: 'booking_cancel_test',
            revision: 5,
            lifecycle: { status: 'cancelled', cancelledAt: { seconds: 1, nanoseconds: 0 } },
            occurrence: {
              startsAt: { seconds: 1_718_438_400, nanoseconds: 0 },
              endsAt: { seconds: 1_718_439_200, nanoseconds: 0 },
              durationMinutes: 120,
              timeZone: 'Asia/Almaty',
            },
            instructor: {
              instructorId: 'instructor_01',
              displayName: 'Coach',
            },
            participants: [{ displayName: 'Student' }],
            partyKind: 'individual',
            paymentPresentation: { kind: 'visible', paymentStatus: 'captured', price: 100 },
            bookingOrigin: 'account',
            authorizedActions: {
              canRequestCancellation: false,
              canWithdrawCancellation: false,
            },
          },
        ],
        hasMore: false,
      });

    const { result } = renderHook(() => useLessonBookingCommands('account_fixture_01'));
    const outcome = await result.current.requestCancellation({
      bookingId: 'booking_cancel_test',
      expectedRevision: 4,
      idempotencyKey: 'cancel:booking_cancel_test:4',
      exercisedCapability: 'account_owner',
    });

    expect(outcome).toEqual({ lifecycleStatus: 'cancelled', refreshFailed: false });
    expect(useLessonBookingStore.getState().items.get('booking_cancel_test')?.status).toBe(
      'cancelled'
    );
    expect(
      resolveLessonCancellationLifecycleFromStore(
        'booking_cancel_test',
        useLessonBookingStore.getState().items
      )
    ).toBe('cancelled');
  });

  it('updates course store after pending cancellation refresh', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'success',
      kind: 'request_course_enrollment_cancellation',
      correlationId: 'correlation_cancel_03',
      payload: { lifecycleStatus: 'pending_cancellation' },
    });
    queryCourseReadModelsMock.mockResolvedValueOnce({
      scope: 'account_hot',
      items: [
        {
          enrollmentId: 'enrollment_cancel_test',
          revision: 4,
          courseId: 'course_01',
          participant: { participantId: 'participant_01', displayName: 'Student' },
          lifecycle: {
            status: 'pending_cancellation',
            requestedAt: { seconds: 1, nanoseconds: 0 },
          },
          courseDisplay: { title: 'Camp' },
          courseSchedule: {
            courseId: 'course_01',
            courseScheduleRevision: 1,
            courseDayCount: 1,
            startAt: { seconds: 1_800_000_000, nanoseconds: 0 },
            finalCourseDayEndsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
            courseDays: [
              {
                courseDayId: 'course_day_01',
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
          bookingOrigin: 'account',
          authorizedActions: { canWithdraw: true, canRequestCancellation: false },
          updatedAt: { seconds: 1, nanoseconds: 0 },
        },
      ],
      hasMore: false,
    });
    queryCatalogReadModelsMock.mockResolvedValueOnce({
      scope: 'public',
      items: [],
      hasMore: false,
    });

    const { result } = renderHook(() => useCourseEnrollmentCommands('account_fixture_01'));
    const outcome = await result.current.requestCancellation({
      enrollmentId: 'enrollment_cancel_test',
      expectedRevision: 3,
      idempotencyKey: 'cancel:enrollment_cancel_test:3',
      exercisedCapability: 'account_owner',
    });

    expect(outcome).toEqual({ lifecycleStatus: 'pending_cancellation', refreshFailed: false });
    expect(
      useCourseEnrollmentStore.getState().items.get('enrollment_cancel_test')?.lifecycleStatus
    ).toBe('pending_cancellation');
    expect(
      resolveCourseCancellationLifecycleFromStore(
        'enrollment_cancel_test',
        useCourseEnrollmentStore.getState().items
      )
    ).toBe('pending_cancellation');
  });

  it('patches lesson store when account_hot no longer returns cancelled booking', async () => {
    useLessonBookingStore
      .getState()
      .mergeItems(new Map([['booking_cancel_test', lessonItem('confirmed')]]));
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'success',
      kind: 'request_booking_cancellation',
      correlationId: 'correlation_cancel_patch',
      payload: { lifecycleStatus: 'cancelled' },
    });
    queryLessonReadModelsMock
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: [],
        hasMore: false,
      })
      .mockResolvedValueOnce({
        scope: 'account_history',
        items: [],
        hasMore: false,
      });

    const { result } = renderHook(() => useLessonBookingCommands('account_fixture_01'));
    const outcome = await result.current.requestCancellation({
      bookingId: 'booking_cancel_test',
      expectedRevision: 4,
      idempotencyKey: 'cancel:booking_cancel_test:4',
      exercisedCapability: 'account_owner',
    });

    expect(outcome).toEqual({ lifecycleStatus: 'cancelled', refreshFailed: false });
    expect(useLessonBookingStore.getState().items.get('booking_cancel_test')?.status).toBe(
      'cancelled'
    );
  });
});
