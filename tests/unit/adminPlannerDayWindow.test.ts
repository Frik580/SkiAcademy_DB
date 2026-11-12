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
import {
  formatDateLocalYMD,
  getWeekRange,
} from '../../src/features/admin/components/schedule/scheduleUtils';
import { parsePlannerLocalDateInput } from '../../src/features/admin/components/schedule/scheduleDateInput';
import {
  mapPlannerOccupancyToBookings,
  normalizeScheduleTime,
  plannerLocalDateTime,
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
  it.each([
    ['Europe/Paris', '2026-03-29', '2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z'],
    ['Europe/Paris', '2026-10-25', '2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z'],
    ['America/New_York', '2026-03-08', '2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z'],
    ['America/New_York', '2026-11-01', '2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z'],
    ['Asia/Almaty', '2026-09-10', '2026-09-09T19:00:00Z', '2026-09-10T19:00:00Z'],
  ])('filters and clips half-open boundaries in %s on %s', (zone, date, start, end) => {
    const startSeconds = Date.parse(start) / 1_000;
    const endSeconds = Date.parse(end) / 1_000;
    expect(plannerDayWindow(date, zone)).toEqual({
      startsAt: { seconds: startSeconds, nanoseconds: 0 },
      endsAt: { seconds: endSeconds, nanoseconds: 0 },
    });
    for (const occupancyKind of ['lesson_booking', 'availability_block', 'course_day'] as const) {
      const items = [
        ['last_minute', endSeconds - 60, endSeconds],
        ['next_midnight', endSeconds, endSeconds + 60],
        ['ends_at_start', startSeconds - 60, startSeconds],
        ['crosses_start', startSeconds - 60, startSeconds + 60],
        ['crosses_end', endSeconds - 60, endSeconds + 60],
      ].map(([id, from, to]) =>
        blockItem({
          occupancyId: String(id),
          occupancyKind,
          timeZone: zone,
          interval: {
            startsAt: { seconds: Number(from), nanoseconds: 0 },
            endsAt: { seconds: Number(to), nanoseconds: 0 },
          },
        })
      );
      const filtered = filterOccupancyForLocalDate(items, date, zone);
      expect(filtered.map((item) => item.occupancyId)).toEqual([
        'last_minute',
        'crosses_start',
        'crosses_end',
      ]);
      const nextDate = new Date(`${date}T00:00:00Z`);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      expect(
        filterOccupancyForLocalDate(items, nextDate.toISOString().slice(0, 10), zone).map(
          (item) => item.occupancyId
        )
      ).toEqual(['next_midnight', 'crosses_end']);
      if (occupancyKind !== 'course_day') {
        const mapped = mapPlannerOccupancyToBookings(filtered, date, zone);
        expect(mapped.map((item) => [item.date, item.time, item.durationHours])).toEqual([
          [date, '23:59', 1 / 60],
          [date, '00:00', 1 / 60],
          [date, '23:59', 1 / 60],
        ]);
      }
    }
  });

  it('uses the school calendar date for today even across the browser date boundary', () => {
    const instant = Date.parse('2026-03-29T23:30:00Z') / 1_000;
    expect(plannerLocalDateTime(instant, 'Europe/Paris').date).toBe('2026-03-30');
    expect(plannerLocalDateTime(instant, 'America/New_York').date).toBe('2026-03-29');
    expect(plannerFetchWindow('2026-03-29', 'day')).toEqual(
      plannerFetchWindow('2026-03-29', 'week')
    );
    expect(plannerFetchWindow('2026-03-29', 'week').localDate).toBe('2026-03-23');
  });

  it('uses the Monday-aligned week fetch window for both day and week views', () => {
    const weekStart = formatDateLocalYMD(
      getWeekRange(parsePlannerLocalDateInput('2026-09-10')).start
    );
    expect(weekStart).toBe('2026-09-07');
    expect(plannerFetchWindow('2026-09-10', 'day')).toEqual({
      localDate: weekStart,
      view: 'week',
    });
    expect(plannerFetchWindow('2026-09-10', 'week')).toEqual({
      localDate: weekStart,
      view: 'week',
    });
    expect(plannerFetchWindow('2026-09-07', 'week')).toEqual({
      localDate: weekStart,
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
    expect(dayViewBookingForSlot(bookings, instructorId, localDate, '08:00', 0)?.booking.id).toBe(
      'block_spanning_day'
    );
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
