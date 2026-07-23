import { describe, expect, it } from 'vitest';
import {
  blocksInstructorAvailability,
  isCourseBooking,
  toAvailabilitySlot,
} from '../../src/lib/availabilitySlots';
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

  it.each(['cancelled', 'completed'] as const)(
    'does not block inactive status %s',
    (status) => {
      expect(blocksInstructorAvailability(baseBooking({ status }))).toBe(false);
    }
  );

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
      toAvailabilitySlot(
        baseBooking({ userId: 'system_block_maintenance', status: 'confirmed' })
      )
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
