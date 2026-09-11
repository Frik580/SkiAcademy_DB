import { describe, expect, it } from 'vitest';
import type { AdminPlannerOccupancyItem } from '@ski-academy/shared-domain';
import {
  filterAvailabilitySlotsExcludingBooking,
  filterOccupancyExcludingBooking,
} from '../../src/features/booking-collaboration/useRescheduleBookingAvailability';

const occupancyItem = (bookingId: string | undefined): AdminPlannerOccupancyItem =>
  ({
    occupancyId: bookingId ?? 'occupancy_01',
    bookingId,
    instructorId: 'instructor_01',
    localDate: '2026-06-15',
    localTime: '08:00',
    durationMinutes: 120,
    occupancyKind: 'lesson_booking',
    interval: {
      startsAt: { seconds: 1, nanoseconds: 0 },
      endsAt: { seconds: 2, nanoseconds: 0 },
    },
    displayTitle: 'Lesson',
  }) as AdminPlannerOccupancyItem;

describe('reschedule booking occupancy filters', () => {
  it('excludes the booking being rescheduled from occupancy items', () => {
    const occupancy = [
      occupancyItem('booking_current'),
      occupancyItem('booking_other'),
      occupancyItem(undefined),
    ];
    expect(filterOccupancyExcludingBooking(occupancy, 'booking_current')).toEqual([
      occupancyItem('booking_other'),
      occupancyItem(undefined),
    ]);
  });

  it('excludes the booking being rescheduled from availability slots', () => {
    const slots = [
      {
        bookingId: 'booking_current',
        instructorId: 'instructor_01',
        date: '2026-06-15',
        time: '08:00',
        durationHours: 2,
        slotType: 'lesson' as const,
      },
      {
        bookingId: 'booking_other',
        instructorId: 'instructor_01',
        date: '2026-06-15',
        time: '10:00',
        durationHours: 2,
        slotType: 'lesson' as const,
      },
    ];
    expect(filterAvailabilitySlotsExcludingBooking(slots, 'booking_current')).toEqual([slots[1]]);
  });
});
