import { describe, expect, it } from 'vitest';
import type { Booking } from '../../src/types';
import {
  dayViewBookingForSlot,
  dayViewColSpanForBooking,
  scheduleBookingOverlapsSlot,
  scheduleBookingsForDay,
} from '../../src/features/admin/components/schedule/scheduleDayViewPlacement';

const instructorId = 'instructor_day_view_01';
const selectedDate = '2026-09-02';

function blockBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'block_day_view_01',
    userId: 'system_block_break',
    instructorId,
    instructorName: 'Coach',
    instructorAvatar: '',
    date: selectedDate,
    time: '12:00',
    durationHours: 1,
    totalPrice: 0,
    status: 'confirmed',
    difficulty: 'beginner',
    ...overrides,
  };
}

describe('schedule day view placement', () => {
  it.each([
    {
      label: 'day_off at 08:00 spanning the visible grid',
      booking: blockBooking({
        id: 'block_day_off',
        userId: 'system_block_day_off',
        time: '08:00',
        durationHours: 11,
      }),
      slot: '08:00',
      slotIndex: 0,
      startsHere: true,
    },
    {
      label: 'break at 12:00',
      booking: blockBooking({ time: '12:00', durationHours: 1 }),
      slot: '12:00',
      slotIndex: 4,
      startsHere: true,
    },
    {
      label: 'break starting before the first visible slot anchors at 08:00',
      booking: blockBooking({ time: '07:00', durationHours: 2 }),
      slot: '08:00',
      slotIndex: 0,
      startsHere: true,
    },
  ])('$label', ({ booking, slot, slotIndex, startsHere }) => {
    const weekRows = scheduleBookingsForDay([booking], instructorId, selectedDate);
    const daySlot = dayViewBookingForSlot([booking], instructorId, selectedDate, slot, slotIndex);

    expect(weekRows).toEqual([booking]);
    expect(daySlot).toEqual({ booking, startsHere });
  });

  it('uses half-open overlap boundaries for adjacent non-overlapping slots', () => {
    const booking = blockBooking({ time: '10:00', durationHours: 1 });
    expect(scheduleBookingOverlapsSlot(booking, '09:00')).toBe(false);
    expect(scheduleBookingOverlapsSlot(booking, '10:00')).toBe(true);
    expect(scheduleBookingOverlapsSlot(booking, '11:00')).toBe(false);
  });

  it('covers boundary cases for blocks crossing slot edges', () => {
    const startsBeforeDay = blockBooking({ time: '07:30', durationHours: 2 });
    expect(dayViewBookingForSlot([startsBeforeDay], instructorId, selectedDate, '08:00', 0)).toEqual(
      {
        booking: startsBeforeDay,
        startsHere: true,
      }
    );

    const endsAfterGrid = blockBooking({ time: '17:00', durationHours: 3 });
    expect(dayViewColSpanForBooking(endsAfterGrid, 9)).toBe(2);
    expect(dayViewBookingForSlot([endsAfterGrid], instructorId, selectedDate, '18:00', 10)).toEqual({
      booking: endsAfterGrid,
      startsHere: false,
    });
  });

  it('keeps day-off and break visible in day and week projections for the same instructor row', () => {
    const dayOff = blockBooking({
      id: 'block_day_off',
      userId: 'system_block_day_off',
      time: '08:00',
      durationHours: 11,
    });
    const breakBlock = blockBooking({
      id: 'block_break',
      userId: 'system_block_break',
      time: '12:00',
      durationHours: 1,
    });
    const bookings = [dayOff, breakBlock];

    expect(scheduleBookingsForDay(bookings, instructorId, selectedDate)).toEqual([
      dayOff,
      breakBlock,
    ]);
    expect(dayViewBookingForSlot(bookings, instructorId, selectedDate, '08:00', 0)?.booking).toBe(
      dayOff
    );
    expect(dayViewBookingForSlot(bookings, instructorId, selectedDate, '12:00', 4)?.booking).toBe(
      breakBlock
    );
  });
});
