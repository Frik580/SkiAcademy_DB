import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  BookingIdSchema,
  BookingProposalIdSchema,
  BookingChangeRequestIdSchema,
} from '@ski-academy/shared-domain';
import { useBookingCollaborationStore } from '../../src/features/booking-collaboration/bookingCollaborationStore';
import { useLessonBookingStore } from '../../src/features/lesson-bookings/lessonBookingStore';

const executeAuthenticatedMock = vi.fn();
const queryLessonBookingReadModelsMock = vi.fn();
const queryBookingProposalReadModelsMock = vi.fn();
const queryBookingChangeRequestReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) => executeAuthenticatedMock(...args),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonBookingReadModelsMock(...args),
  queryBookingProposalReadModels: (...args: unknown[]) =>
    queryBookingProposalReadModelsMock(...args),
  queryBookingChangeRequestReadModels: (...args: unknown[]) =>
    queryBookingChangeRequestReadModelsMock(...args),
}));

import { useBookingCollaborationCommands } from '../../src/features/booking-collaboration/useBookingCollaborationCommands';

describe('booking collaboration integration', () => {
  beforeEach(() => {
    useBookingCollaborationStore.getState().reset();
    useLessonBookingStore.getState().reset();
    executeAuthenticatedMock.mockReset();
    queryLessonBookingReadModelsMock.mockReset();
    queryBookingProposalReadModelsMock.mockReset();
    queryBookingChangeRequestReadModelsMock.mockReset();
    queryLessonBookingReadModelsMock.mockResolvedValue({
      scope: 'account_hot',
      items: [],
      hasMore: false,
    });
    queryBookingProposalReadModelsMock.mockResolvedValue({ scope: 'account_open', items: [] });
    queryBookingChangeRequestReadModelsMock.mockResolvedValue({ scope: 'account_open', items: [] });
  });

  it('withdraws cancellation with expectedRevision and refetches reads', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({ status: 'success', payload: {} });
    const { result } = renderHook(() =>
      useBookingCollaborationCommands({ accountId: 'account_fixture_01' })
    );
    await result.current.withdrawCancellation({
      bookingId: 'booking_withdraw_01',
      expectedRevision: 5,
      exercisedCapability: 'account_owner',
    });
    expect(executeAuthenticatedMock).toHaveBeenCalledWith(
      'account_fixture_01',
      expect.objectContaining({
        kind: 'withdraw_booking_cancellation_request',
        expectedRevision: 5,
        intent: { bookingId: BookingIdSchema.parse('booking_withdraw_01') },
      })
    );
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith({ scope: 'account_hot' });
  });

  it('reschedules via canonical command and refetches on success', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({ status: 'success', payload: {} });
    const { result } = renderHook(() =>
      useBookingCollaborationCommands({ accountId: 'account_fixture_01' })
    );
    await result.current.rescheduleBooking({
      bookingId: 'booking_reschedule_01',
      expectedRevision: 3,
      localDate: '2026-06-16',
      localTime: '10:00',
      durationMinutes: 120,
      exercisedCapability: 'account_owner',
    });
    expect(executeAuthenticatedMock).toHaveBeenCalledWith(
      'account_fixture_01',
      expect.objectContaining({
        kind: 'reschedule_booking',
        expectedRevision: 3,
        calendarInput: expect.objectContaining({ localDate: '2026-06-16', localTime: '10:00' }),
      })
    );
  });

  it('surfaces insufficient_funds on proposal accept without local patch', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'error',
      error: {
        code: 'insufficient_funds',
        message: 'Insufficient funds',
        retryable: false,
        correlationId: 'correlation_funds',
      },
    });
    const { result } = renderHook(() =>
      useBookingCollaborationCommands({ accountId: 'account_fixture_01' })
    );
    await expect(
      result.current.acceptProposal({
        proposalId: 'booking_proposal_accept_01',
        expectedRevision: 1,
        exercisedCapability: 'account_owner',
      })
    ).rejects.toMatchObject({ code: 'insufficient_funds' });
    expect(queryBookingProposalReadModelsMock).not.toHaveBeenCalled();
  });

  it('creates and withdraws instructor change requests canonically', async () => {
    executeAuthenticatedMock
      .mockResolvedValueOnce({ status: 'success', payload: {} })
      .mockResolvedValueOnce({ status: 'success', payload: {} });
    queryLessonBookingReadModelsMock.mockResolvedValue({
      scope: 'instructor_hot',
      items: [],
      hasMore: false,
    });
    queryBookingProposalReadModelsMock.mockResolvedValue({ scope: 'instructor_open', items: [] });
    queryBookingChangeRequestReadModelsMock.mockResolvedValue({
      scope: 'instructor_open',
      items: [],
    });

    const { result } = renderHook(() =>
      useBookingCollaborationCommands({
        accountId: 'account_fixture_01',
        instructorId: 'instructor_fixture_01',
      })
    );
    const requestId = await result.current.createChangeRequest({
      bookingId: 'booking_change_01',
      reason: 'Need to move lesson',
      expectedRevision: 4,
    });
    expect(executeAuthenticatedMock).toHaveBeenNthCalledWith(
      1,
      'account_fixture_01',
      expect.objectContaining({
        kind: 'create_booking_change_request',
        expectedRevision: 4,
        exercisedCapability: 'instructor',
        intent: expect.objectContaining({
          bookingId: BookingIdSchema.parse('booking_change_01'),
          bookingChangeRequestId: BookingChangeRequestIdSchema.parse(requestId),
          reason: 'Need to move lesson',
        }),
      })
    );
    await result.current.withdrawChangeRequest({ requestId, expectedRevision: 1 });
    expect(executeAuthenticatedMock).toHaveBeenNthCalledWith(
      2,
      'account_fixture_01',
      expect.objectContaining({
        kind: 'withdraw_booking_change_request',
        expectedRevision: 1,
      })
    );
  });

  it('surfaces stale_version when instructor change request uses stale booking revision', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'error',
      error: {
        code: 'stale_version',
        message: 'Stale version',
        retryable: true,
        correlationId: 'correlation_stale_change_request',
        currentRevision: 5,
      },
    });
    const { result } = renderHook(() =>
      useBookingCollaborationCommands({
        accountId: 'account_fixture_01',
        instructorId: 'instructor_fixture_01',
      })
    );
    await expect(
      result.current.createChangeRequest({
        bookingId: 'booking_change_stale_01',
        reason: 'Need to move lesson',
        expectedRevision: 4,
      })
    ).rejects.toMatchObject({ code: 'stale_version', currentRevision: 5 });
    expect(queryBookingChangeRequestReadModelsMock).not.toHaveBeenCalled();
  });

  it('declines proposal via cancel_booking_proposal', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({ status: 'success', payload: {} });
    const { result } = renderHook(() =>
      useBookingCollaborationCommands({ accountId: 'account_fixture_01' })
    );
    await result.current.declineProposal({
      proposalId: 'booking_proposal_decline_01',
      expectedRevision: 2,
      exercisedCapability: 'account_owner',
    });
    expect(executeAuthenticatedMock).toHaveBeenCalledWith(
      'account_fixture_01',
      expect.objectContaining({
        kind: 'cancel_booking_proposal',
        intent: {
          bookingProposalId: BookingProposalIdSchema.parse('booking_proposal_decline_01'),
        },
      })
    );
  });

  it('records instructor attendance through canonical facts and refetches both scopes', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({ status: 'success', payload: {} });
    const { result } = renderHook(() =>
      useBookingCollaborationCommands({
        accountId: 'account_fixture_01',
        instructorId: 'instructor_fixture_01',
      })
    );

    await result.current.recordLessonAttendance({
      bookingId: 'booking_attendance_01',
      participantId: 'participant_attendance_01',
      attendanceStatus: 'present',
    });

    expect(executeAuthenticatedMock).toHaveBeenCalledWith(
      'account_fixture_01',
      expect.objectContaining({
        kind: 'record_booking_attendance',
        exercisedCapability: 'instructor',
        idempotencyKey:
          'attendance:booking_attendance_01:participant_attendance_01:present:missing',
        intent: {
          bookingId: BookingIdSchema.parse('booking_attendance_01'),
          participantId: 'participant_attendance_01',
          attendanceStatus: 'present',
        },
      })
    );
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith({ scope: 'instructor_hot' });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith({
      scope: 'instructor_history',
    });
  });

  it('sends expectedAttendanceRevision for a correction and uses a distinct attempt identity', async () => {
    executeAuthenticatedMock.mockResolvedValue({ status: 'success', payload: {} });
    const { result } = renderHook(() =>
      useBookingCollaborationCommands({
        accountId: 'account_fixture_01',
        instructorId: 'instructor_fixture_01',
      })
    );

    await result.current.recordLessonAttendance({
      bookingId: 'booking_attendance_01',
      participantId: 'participant_attendance_01',
      attendanceStatus: 'present',
    });
    await result.current.recordLessonAttendance({
      bookingId: 'booking_attendance_01',
      participantId: 'participant_attendance_01',
      attendanceStatus: 'absent',
      expectedAttendanceRevision: 1,
    });

    expect(executeAuthenticatedMock.mock.calls[0]?.[1]).toMatchObject({
      idempotencyKey: 'attendance:booking_attendance_01:participant_attendance_01:present:missing',
      intent: { attendanceStatus: 'present' },
    });
    expect(executeAuthenticatedMock.mock.calls[0]?.[1].intent).not.toHaveProperty(
      'expectedAttendanceRevision'
    );
    expect(executeAuthenticatedMock.mock.calls[1]?.[1]).toMatchObject({
      idempotencyKey: 'attendance:booking_attendance_01:participant_attendance_01:absent:1',
      intent: {
        attendanceStatus: 'absent',
        expectedAttendanceRevision: 1,
      },
    });
  });

  it('refetches on stale_version and does not replay the correction', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'error',
      error: {
        code: 'stale_version',
        message: 'Stale version',
        retryable: true,
        correlationId: 'correlation_stale_attendance',
        currentRevision: 2,
      },
    });
    const { result } = renderHook(() =>
      useBookingCollaborationCommands({
        accountId: 'account_fixture_01',
        instructorId: 'instructor_fixture_01',
      })
    );

    await expect(
      result.current.recordLessonAttendance({
        bookingId: 'booking_attendance_01',
        participantId: 'participant_attendance_01',
        attendanceStatus: 'absent',
        expectedAttendanceRevision: 1,
      })
    ).rejects.toMatchObject({ code: 'stale_version', currentRevision: 2 });
    expect(executeAuthenticatedMock).toHaveBeenCalledTimes(1);
    expect(queryLessonBookingReadModelsMock).not.toHaveBeenCalled();
  });
});
