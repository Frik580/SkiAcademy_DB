import { describe, expect, it } from 'vitest';
import {
  blocksInstructorAvailability,
  fitsLessonDaySchedule,
  isBookingSlotInPast,
  isCourseBooking,
  toAvailabilitySlot,
  toLocalDateStr,
} from '../../src/domain/availability';
import type { Booking } from '../../src/types';

const baseBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-1',
  userId: 'user-1',
  instructorId: 'instructor-1',
  instructorName: 'Instructor',
  instructorAvatar: '',
  date: '2026-12-01',
  time: '09:00',
  durationHours: 2,
  totalPrice: 100,
  status: 'confirmed',
  difficulty: 'beginner',
  ...overrides,
});

describe('isCourseBooking', () => {
  it('returns true for course instructor ids', () => {
    expect(isCourseBooking({ instructorId: 'course_abc123' })).toBe(true);
  });

  it('returns false for regular instructor ids', () => {
    expect(isCourseBooking({ instructorId: 'instructor-1' })).toBe(false);
  });
});

describe('blocksInstructorAvailability', () => {
  it.each(['pending', 'confirmed', 'pending_cancellation'] as const)(
    'blocks active status %s',
    (status) => {
      expect(blocksInstructorAvailability(baseBooking({ status }))).toBe(true);
    }
  );

  it.each(['cancelled', 'completed'] as const)('does not block inactive status %s', (status) => {
    expect(blocksInstructorAvailability(baseBooking({ status }))).toBe(false);
  });

  it('does not block course bookings', () => {
    expect(
      blocksInstructorAvailability(
        baseBooking({ instructorId: 'course_course-1', status: 'confirmed' })
      )
    ).toBe(false);
  });

  it('does not block deleted bookings', () => {
    expect(
      blocksInstructorAvailability(baseBooking({ isDeleted: true, status: 'confirmed' }))
    ).toBe(false);
  });
});

describe('toAvailabilitySlot', () => {
  it('maps a lesson booking to an availability slot', () => {
    expect(toAvailabilitySlot(baseBooking())).toEqual({
      bookingId: 'booking-1',
      instructorId: 'instructor-1',
      date: '2026-12-01',
      time: '09:00',
      durationHours: 2,
      slotType: 'lesson',
    });
  });

  it('marks system blocks separately from lessons', () => {
    expect(
      toAvailabilitySlot(baseBooking({ userId: 'system_block_maintenance', status: 'confirmed' }))
    ).toEqual({
      bookingId: 'booking-1',
      instructorId: 'instructor-1',
      date: '2026-12-01',
      time: '09:00',
      durationHours: 2,
      slotType: 'block',
    });
  });
});

describe('toLocalDateStr', () => {
  it('formats local calendar date as YYYY-MM-DD', () => {
    expect(toLocalDateStr(new Date(2026, 7, 3, 23, 59))).toBe('2026-08-03');
  });
});

describe('isBookingSlotInPast', () => {
  const noon = new Date(2026, 7, 3, 12, 0);

  it('returns false for future dates', () => {
    expect(isBookingSlotInPast('2026-08-04', '08:00', noon)).toBe(false);
  });

  it('returns true for earlier slots today', () => {
    expect(isBookingSlotInPast('2026-08-03', '08:00', noon)).toBe(true);
    expect(isBookingSlotInPast('2026-08-03', '11:00', noon)).toBe(true);
  });

  it('returns false for current or later slots today', () => {
    expect(isBookingSlotInPast('2026-08-03', '12:00', noon)).toBe(false);
    expect(isBookingSlotInPast('2026-08-03', '14:00', noon)).toBe(false);
  });
});

describe('fitsLessonDaySchedule', () => {
  it('allows slots that end by 19:00', () => {
    expect(fitsLessonDaySchedule('17:00', 2)).toBe(true);
  });

  it('rejects slots that extend past 19:00', () => {
    expect(fitsLessonDaySchedule('18:00', 2)).toBe(false);
  });
});
