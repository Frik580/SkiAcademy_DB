import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  BookingIdSchema,
  GuestSubjectIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { useLessonBookingStore } from '../../src/features/lesson-bookings/lessonBookingStore';
import {
  loadGuestSingleLessonBooking,
  useLessonBookingReadSync,
} from '../../src/features/lesson-bookings/useLessonBookingReadSync';
import { persistGuestBookingCredential } from '../../src/features/lesson-bookings/guestCredentialStorage';

const queryLessonBookingReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonBookingReadModelsMock(...args),
}));

function buildGuestReadItem(bookingId: string, revision: number) {
  const participantId = ParticipantIdSchema.parse('participant_fixture_01');
  const startsAt = timestampFromDate(new Date('2026-06-15T04:00:00.000Z'));
  const endsAt = timestampFromDate(new Date('2026-06-15T06:00:00.000Z'));
  return {
    bookingId: BookingIdSchema.parse(bookingId),
    revision,
    partyKind: 'individual' as const,
    participantIds: [participantId],
    participants: [{ participantId, displayName: 'Guest Student' }],
    instructor: {
      instructorId: InstructorIdSchema.parse('instructor_fixture_01'),
      displayName: 'Coach',
    },
    occurrence: {
      startsAt,
      endsAt,
      timeZone: 'Asia/Almaty',
      durationMinutes: 120,
    },
    lifecycle: { status: 'confirmed' as const },
    bookingOrigin: 'guest' as const,
    authorizedActions: {
      canRequestCancellation: true,
      canWithdrawCancellation: false,
      canReschedule: false,
    },
    paymentPresentation: { kind: 'withheld' as const },
    updatedAt: timestampFromDate(new Date('2026-06-01T00:00:00.000Z')),
  };
}

describe('lessonBooking read sync integration', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
    queryLessonBookingReadModelsMock.mockReset();
    localStorage.clear();
  });

  it('loads guest_single with stored credential and merges revision-aware state', async () => {
    const bookingId = 'booking_guest_single_01';
    persistGuestBookingCredential({
      bookingId: BookingIdSchema.parse(bookingId),
      guestSubjectId: GuestSubjectIdSchema.parse('guest_fixture_01'),
      nonce: 'nonce_fixture_16chars',
      signature: 'b'.repeat(64),
      expiresAt: timestampFromDate(new Date('2099-01-01T00:00:00.000Z')),
    });

    queryLessonBookingReadModelsMock.mockResolvedValueOnce({
      scope: 'guest_single',
      items: [buildGuestReadItem(bookingId, 2)],
      hasMore: false,
    });

    const readModel = await loadGuestSingleLessonBooking(bookingId);
    expect(readModel.revision).toBe(2);
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'guest_single',
        bookingId: BookingIdSchema.parse(bookingId),
        guestActionNonce: 'nonce_fixture_16chars',
      })
    );
    expect(useLessonBookingStore.getState().items.get(bookingId)?.revision).toBe(2);
  });

  it('does not fall back to legacy reads when guest credential is missing', async () => {
    await expect(loadGuestSingleLessonBooking('booking_missing_cred')).rejects.toThrow();
    expect(queryLessonBookingReadModelsMock).not.toHaveBeenCalled();
  });

  it('omits cursor on first account_history sync request', async () => {
    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({ scope: 'account_hot', items: [], hasMore: false })
      .mockResolvedValueOnce({ scope: 'account_history', items: [], hasMore: false });

    renderHook(() => useLessonBookingReadSync(true, 'account_fixture_01'));

    await waitFor(() => {
      expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
    });

    expect(queryLessonBookingReadModelsMock).toHaveBeenNthCalledWith(1, { scope: 'account_hot' });
    expect(queryLessonBookingReadModelsMock).toHaveBeenNthCalledWith(2, {
      scope: 'account_history',
    });
  });

  it('includes cursor on paginated account_history sync request', async () => {
    const cursor = 'cursor_page_2_fixture';
    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({ scope: 'account_hot', items: [], hasMore: false })
      .mockResolvedValueOnce({
        scope: 'account_history',
        items: [],
        hasMore: true,
        nextCursor: cursor,
      })
      .mockResolvedValueOnce({ scope: 'account_history', items: [], hasMore: false });

    renderHook(() => useLessonBookingReadSync(true, 'account_fixture_01'));

    await waitFor(() => {
      expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
    });

    useLessonBookingStore.getState().requestHistoryPage();

    await waitFor(() => {
      expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(3);
    });

    expect(queryLessonBookingReadModelsMock).toHaveBeenNthCalledWith(3, {
      scope: 'account_history',
      cursor,
    });
  });
});
