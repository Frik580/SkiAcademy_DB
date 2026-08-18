import { describe, expect, it } from 'vitest';
import {
  buildHourLockIds,
  calculateBookingTotalPrice,
  hasOverlappingAvailabilitySlot,
  matchesExistingBookingRequest,
} from '@ski-academy/shared-domain';
import { BookingDocumentSchema, createBookingDraft } from '@ski-academy/shared-domain/entities';

const booking = {
  id: 'booking-1',
  userId: 'user-1',
  instructorId: 'instructor-1',
  instructorName: 'Coach',
  instructorAvatar: '',
  date: '2026-12-02',
  time: '10:00',
  durationHours: 2,
  status: 'confirmed' as const,
  difficulty: 'beginner' as const,
};

describe('shared booking domain', () => {
  it('uses the same lock IDs for a multi-hour booking in every runtime', () => {
    expect(buildHourLockIds(booking)).toEqual([
      'instructor-1__2026-12-02__10:00',
      'instructor-1__2026-12-02__11:00',
    ]);
  });

  it('recognizes equivalent retries but rejects a changed booking request', () => {
    expect(matchesExistingBookingRequest({ ...booking }, booking)).toBe(true);
    expect(matchesExistingBookingRequest({ ...booking, time: '11:00' }, booking)).toBe(false);
  });

  it('calculates server-authoritative lesson, course, and system-block prices', () => {
    expect(calculateBookingTotalPrice({ ...booking, instructorPricePerHour: 50 })).toBe(100);
    expect(
      calculateBookingTotalPrice({
        ...booking,
        instructorId: 'course_carving',
        coursePrice: 175,
      })
    ).toBe(175);
    expect(calculateBookingTotalPrice({ ...booking, userId: 'system_block_1' })).toBe(0);
  });

  it('detects interval overlap while excluding the booking being edited', () => {
    const existing = [
      {
        bookingId: booking.id,
        instructorId: booking.instructorId,
        date: booking.date,
        time: '10:00',
        durationHours: 2,
        slotType: 'lesson' as const,
      },
    ];

    expect(hasOverlappingAvailabilitySlot({ time: '11:00', durationHours: 1 }, existing)).toBe(
      true
    );
    expect(
      hasOverlappingAvailabilitySlot({ time: '11:00', durationHours: 1 }, existing, booking.id)
    ).toBe(false);
  });

  it('shares a validated booking contract and safe initial booking state', () => {
    const draft = createBookingDraft({
      userId: 'user-1',
      instructorId: 'instructor-1',
      instructorName: 'Coach',
      date: '2026-12-02',
      time: '10:00',
      durationHours: 1,
    });

    expect(draft).toMatchObject({ status: 'pending', difficulty: 'beginner', totalPrice: 0 });
    expect(BookingDocumentSchema.safeParse(draft).success).toBe(true);
    expect(BookingDocumentSchema.safeParse({ ...draft, durationHours: 0 }).success).toBe(false);
  });
});
