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
  queryBookingProposalReadModels: (...args: unknown[]) => queryBookingProposalReadModelsMock(...args),
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
    queryLessonBookingReadModelsMock.mockResolvedValue({ scope: 'account_hot', items: [], hasMore: false });
    queryBookingProposalReadModelsMock.mockResolvedValue({ scope: 'account_open', items: [] });
    queryBookingChangeRequestReadModelsMock.mockResolvedValue({ scope: 'account_open', items: [] });
  });

  it('withdraws cancellation with expectedRevision and refetches reads', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({ status: 'success', payload: {} });
    const { result } = renderHook(() => useBookingCollaborationCommands({ accountId: 'account_fixture_01' }));
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
    const { result } = renderHook(() => useBookingCollaborationCommands({ accountId: 'account_fixture_01' }));
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
    const { result } = renderHook(() => useBookingCollaborationCommands({ accountId: 'account_fixture_01' }));
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
    queryLessonBookingReadModelsMock.mockResolvedValue({ scope: 'instructor_hot', items: [], hasMore: false });
    queryBookingProposalReadModelsMock.mockResolvedValue({ scope: 'instructor_open', items: [] });
    queryBookingChangeRequestReadModelsMock.mockResolvedValue({ scope: 'instructor_open', items: [] });

    const { result } = renderHook(() =>
      useBookingCollaborationCommands({
        accountId: 'account_fixture_01',
        instructorId: 'instructor_fixture_01',
      })
    );
    const requestId = await result.current.createChangeRequest({
      bookingId: 'booking_change_01',
      reason: 'Need to move lesson',
    });
    expect(executeAuthenticatedMock).toHaveBeenNthCalledWith(
      1,
      'account_fixture_01',
      expect.objectContaining({
        kind: 'create_booking_change_request',
        intent: expect.objectContaining({
          bookingId: BookingIdSchema.parse('booking_change_01'),
          bookingChangeRequestId: BookingChangeRequestIdSchema.parse(requestId),
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

  it('declines proposal via cancel_booking_proposal', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({ status: 'success', payload: {} });
    const { result } = renderHook(() => useBookingCollaborationCommands({ accountId: 'account_fixture_01' }));
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
});
