import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { BookingIdSchema, timestampFromDate } from '@ski-academy/shared-domain';
import { useLessonBookingStore } from '../../src/features/lesson-bookings/lessonBookingStore';

const executeAuthenticatedMock = vi.fn();
const executeGuestMock = vi.fn();
const queryReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) => executeAuthenticatedMock(...args),
  executeGuestCanonicalCommand: (...args: unknown[]) => executeGuestMock(...args),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryReadModelsMock(...args),
}));

import { useLessonBookingCommands } from '../../src/features/lesson-bookings/useLessonBookingCommands';

describe('lessonBooking commands integration', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
    executeAuthenticatedMock.mockReset();
    executeGuestMock.mockReset();
    queryReadModelsMock.mockReset();
    localStorage.clear();
  });

  it('creates authenticated booking via canonical command and refetches hot read models', async () => {
    const bookingId = 'booking_auth_create_01';
    const accountId = 'account_fixture_01';
    executeAuthenticatedMock.mockResolvedValueOnce({ status: 'success', payload: {} });
    queryReadModelsMock.mockResolvedValueOnce({
      scope: 'account_hot',
      items: [],
      hasMore: false,
    });

    const { result } = renderHook(() => useLessonBookingCommands(accountId));
    await result.current.createAuthenticatedBooking({
      instructorId: 'instructor_fixture_01',
      participantIds: ['participant_fixture_01'],
      exercisedCapability: 'account_owner',
      localDate: '2026-06-15',
      localTime: '08:00',
      durationMinutes: 120,
      timezone: 'Asia/Almaty',
      identity: {
        bookingId,
        idempotencyKey: `create-confirmed:${bookingId}`,
      },
      difficulty: 'intermediate',
      notes: '  Work on carving  ',
    });

    expect(executeAuthenticatedMock).toHaveBeenCalledWith(
      accountId,
      expect.objectContaining({
        kind: 'create_confirmed_booking',
        idempotencyKey: `create-confirmed:${bookingId}`,
        intent: expect.objectContaining({
          bookingId: BookingIdSchema.parse(bookingId),
          difficulty: 'intermediate',
          notes: 'Work on carving',
        }),
      })
    );
    expect(queryReadModelsMock).toHaveBeenCalledWith({ scope: 'account_hot' });
  });

  it('creates guest booking, persists credential, and does not call legacy callables', async () => {
    const bookingId = 'booking_guest_create_01';
    const credential = {
      bookingId: BookingIdSchema.parse(bookingId),
      guestSubjectId: 'guest_fixture_01',
      nonce: 'nonce_fixture_16chars',
      signature: 'c'.repeat(64),
      expiresAt: timestampFromDate(new Date('2099-01-01T00:00:00.000Z')),
    };
    executeGuestMock.mockResolvedValueOnce({
      status: 'success',
      payload: { guestActionCredential: credential },
    });

    const { result } = renderHook(() => useLessonBookingCommands(undefined));
    const returned = await result.current.createGuestBooking({
      instructorId: 'instructor_fixture_01',
      participantId: 'participant_fixture_01',
      localDate: '2026-06-15',
      localTime: '08:00',
      durationMinutes: 120,
      timezone: 'Asia/Almaty',
      identity: {
        bookingId,
        idempotencyKey: `create-guest-request:${bookingId}`,
      },
      guestDisplayName: 'Guest User',
      guestSkillLevel: 'beginner',
      guestDiscipline: 'ski',
      guestAgeYears: 12,
      difficulty: 'freeride',
      notes: 'First off-piste',
    });

    expect(returned.nonce).toBe('nonce_fixture_16chars');
    expect(localStorage.getItem(`ski_academy_guest_booking_credential:${bookingId}`)).toBeTruthy();
    expect(executeGuestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create_guest_booking_request',
        guestParticipantDisplayName: 'Guest User',
        guestParticipantSkillLevel: 'beginner',
        intent: expect.objectContaining({
          difficulty: 'freeride',
          notes: 'First off-piste',
        }),
      })
    );
  });

  it('requests authenticated cancellation with expected revision', async () => {
    const accountId = 'account_fixture_01';
    const bookingId = 'booking_cancel_01';
    executeAuthenticatedMock.mockResolvedValueOnce({ status: 'success', payload: {} });
    queryReadModelsMock.mockResolvedValueOnce({ scope: 'account_hot', items: [], hasMore: false });

    const { result } = renderHook(() => useLessonBookingCommands(accountId));
    await result.current.requestCancellation({
      bookingId,
      expectedRevision: 4,
      idempotencyKey: `cancel:${bookingId}:4`,
      exercisedCapability: 'account_owner',
    });

    expect(executeAuthenticatedMock).toHaveBeenCalledWith(
      accountId,
      expect.objectContaining({
        kind: 'request_booking_cancellation',
        expectedRevision: 4,
        intent: { bookingId: BookingIdSchema.parse(bookingId) },
      })
    );
  });

  it('surfaces canonical errors without legacy fallback', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'error',
      error: {
        code: 'insufficient_funds',
        message: 'Insufficient funds',
        retryable: false,
        correlationId: 'correlation_funds',
      },
    });

    const { result } = renderHook(() => useLessonBookingCommands('account_fixture_01'));
    await expect(
      result.current.createAuthenticatedBooking({
        instructorId: 'instructor_fixture_01',
        participantIds: ['participant_fixture_01'],
        exercisedCapability: 'account_owner',
        localDate: '2026-06-15',
        localTime: '08:00',
        durationMinutes: 120,
        timezone: 'Asia/Almaty',
        identity: {
          bookingId: 'booking_fail_01',
          idempotencyKey: 'create-confirmed:booking_fail_01',
        },
      })
    ).rejects.toMatchObject({ code: 'insufficient_funds' });
    expect(queryReadModelsMock).not.toHaveBeenCalled();
  });
});
