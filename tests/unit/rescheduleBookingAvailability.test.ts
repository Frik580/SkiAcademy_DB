import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import type { AdminPlannerOccupancyItem } from '@ski-academy/shared-domain';
import {
  filterAvailabilitySlotsExcludingBooking,
  filterOccupancyExcludingBooking,
  useRescheduleBookingAvailability,
} from '../../src/features/booking-collaboration/useRescheduleBookingAvailability';

vi.mock('../../src/features/settings/schoolTimeZone', () => ({
  useSchoolTimeZone: () => ({
    timeZone: 'Asia/Almaty',
    ready: true,
    season: { kind: 'unconfigured' },
  }),
}));

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

const queryOccupancy = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryInstructorOccupancyReadModels: queryOccupancy,
}));
describe('reschedule timezone availability', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-03T00:00:00Z'));
    queryOccupancy.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('queries both days in the original booking timezone', async () => {
    queryOccupancy.mockRejectedValue(new Error('fixture stop after query'));
    const { result } = renderHook(
      () =>
        useRescheduleBookingAvailability({
          isOpen: true,
          instructorId: 'instructor_01',
          localDate: '2026-11-03',
          durationHours: 1,
          excludeBookingId: 'booking_current',
          timeZone: 'Asia/Almaty',
        }),
      { wrapper: LanguageProvider }
    );
    await waitFor(() => expect(result.current.isLoadingBookings).toBe(false));
    expect(queryOccupancy.mock.calls.map(([query]) => [query.localDate, query.timeZone])).toEqual([
      ['2026-11-03', 'Asia/Almaty'],
      ['2026-11-04', 'Asia/Almaty'],
    ]);
  });
  it.each([undefined, 'Invalid/Zone'])('fails closed for timezone %s', (timeZone) => {
    queryOccupancy.mockClear();
    const { result } = renderHook(
      () =>
        useRescheduleBookingAvailability({
          isOpen: true,
          instructorId: 'instructor_01',
          localDate: '2026-11-03',
          durationHours: 1,
          excludeBookingId: 'booking_current',
          timeZone,
        }),
      { wrapper: LanguageProvider }
    );
    expect(result.current.availableSlots).toEqual([]);
    expect(result.current.occupancyLoadFailed).toBe(true);
    expect(queryOccupancy).not.toHaveBeenCalled();
  });
});
