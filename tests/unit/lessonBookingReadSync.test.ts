import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BookingIdSchema,
  GuestSubjectIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { useLessonBookingStore } from '../../src/features/lesson-bookings/lessonBookingStore';
import { loadGuestSingleLessonBooking } from '../../src/features/lesson-bookings/useLessonBookingReadSync';
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
});
