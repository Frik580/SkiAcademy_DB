import { describe, expect, it } from 'vitest';
import {
  InstructorIdSchema,
  timestampFromDate,
  type AdminPlannerOccupancyItem,
} from '@ski-academy/shared-domain';
import {
  filterOccupancyForLocalDate,
  plannerDayWindow,
  plannerFetchWindow,
} from '../../src/features/admin/operations/adminPlannerDayWindow';
import { formatDateLocalYMD, getWeekRange } from '../../src/features/admin/components/schedule/scheduleUtils';
import { parsePlannerLocalDateInput } from '../../src/features/admin/components/schedule/scheduleDateInput';
import {
  mapPlannerOccupancyToBookings,
  normalizeScheduleTime,
} from '../../src/features/admin/operations/adminPlannerMapping';
import { dayViewBookingForSlot } from '../../src/features/admin/components/schedule/scheduleDayViewPlacement';

const instructorId = InstructorIdSchema.parse('instructor_day_window_01');
const timeZone = 'Asia/Almaty';
const localDate = '2026-09-02';

function blockItem(
  overrides: Partial<AdminPlannerOccupancyItem> & Pick<AdminPlannerOccupancyItem, 'occupancyId'>
): AdminPlannerOccupancyItem {
  return {
    occupancyKind: 'availability_block',
    blockId: overrides.occupancyId,
    blockKind: 'break',
    instructorId,
    interval: {
      startsAt: timestampFromDate(new Date('2026-09-02T07:00:00.000Z')),
      endsAt: timestampFromDate(new Date('2026-09-02T08:00:00.000Z')),
    },
    timeZone,
    localDate,
    localTime: '12:00',
    durationMinutes: 60,
    displayTitle: 'Break',
    revision: 1,
    ...overrides,
  };
}

describe('admin planner day window', () => {
  it('uses the week fetch window for day view so data matches week columns', () => {
    const weekStart = formatDateLocalYMD(getWeekRange(parsePlannerLocalDateInput('2026-09-10')).start);
    expect(plannerFetchWindow('2026-09-10', 'day')).toEqual({
      localDate: weekStart,
      view: 'week',
    });
    expect(plannerFetchWindow('2026-09-10', 'week')).toEqual({
      localDate: '2026-09-10',
      view: 'week',
    });
  });

  it('keeps occupancy that overlaps the selected day even when localDate starts earlier', () => {
    const spanning = blockItem({
      occupancyId: 'block_spanning_day',
      localDate: '2026-09-01',
      localTime: '23:00',
      interval: {
        startsAt: timestampFromDate(new Date('2026-09-01T18:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-09-02T08:00:00.000Z')),
      },
    });
    const filtered = filterOccupancyForLocalDate([spanning], localDate, timeZone);
    expect(filtered).toHaveLength(1);
    const bookings = mapPlannerOccupancyToBookings(filtered, localDate);
    expect(bookings[0]).toMatchObject({
      date: localDate,
      time: '00:00',
      userId: 'system_block_break',
    });
    expect(
      dayViewBookingForSlot(bookings, instructorId, localDate, '08:00', 0)?.booking.id
    ).toBe('block_spanning_day');
  });

  it('normalizes schedule times and applies half-open overlap boundaries', () => {
    expect(normalizeScheduleTime('9:00')).toBe('09:00');
    const window = plannerDayWindow(localDate, timeZone);
    expect(window.startsAt.seconds).toBeLessThan(window.endsAt.seconds);
    expect(
      filterOccupancyForLocalDate(
        [
          blockItem({
            occupancyId: 'block_exact_boundary',
            interval: {
              startsAt: window.endsAt,
              endsAt: timestampFromDate(new Date(window.endsAt.seconds * 1_000 + 3_600_000)),
            },
          }),
        ],
        localDate,
        timeZone
      )
    ).toHaveLength(0);
  });
});
