/**
 * End-to-end wiring tests: canonical occupancy response → booking time picker options.
 *
 * These tests prove that the full pipeline filters occupied slots from the
 * final picker options, without gaps between helpers.
 */
import { describe, expect, it } from 'vitest';
import type { AdminPlannerOccupancyItem, InstructorOccupancyReadModel } from '@ski-academy/shared-domain';
import { DEFAULT_LESSON_TIME_SLOTS } from '../../src/domain/availability';
import {
  getAvailableLessonStartTimes,
  mapInstructorOccupancyReadModelForBookingModal,
  resolveLessonStartTimeSelection,
} from '../../src/features/bookings/instructorOccupancyForBookingModal';
import {
  buildBookingTimePickerOptions,
  getVisibleBookingTimePickerValues,
} from '../../src/features/bookings/components/booking_modal/bookingTimePickerOptions';

const timeZone = 'Asia/Almaty';
const localDate = '2026-09-05';
const instructorId = 'inst_wiring_test';
const futureNow = new Date('2026-09-05T00:00:00');

function makeOccupancyItem(
  kind: AdminPlannerOccupancyItem['occupancyKind'],
  startHour: number,
  endHour: number,
  extra: Partial<AdminPlannerOccupancyItem> = {}
): AdminPlannerOccupancyItem {
  // Asia/Almaty is UTC+5 year-round (Kazakhstan abolished DST).
  // 2026-09-05T00:00:00+05:00 = 2026-09-04T19:00:00Z
  const dayStartUtc = Date.UTC(2026, 8, 4, 19, 0, 0) / 1000;
  return {
    occupancyKind: kind,
    occupancyId: `${kind}_${startHour}`,
    instructorId,
    interval: {
      startsAt: { seconds: dayStartUtc + startHour * 3600, nanoseconds: 0 },
      endsAt: { seconds: dayStartUtc + endHour * 3600, nanoseconds: 0 },
    },
    timeZone,
    localDate,
    localTime: `${String(startHour).padStart(2, '0')}:00`,
    durationMinutes: (endHour - startHour) * 60,
    displayTitle: 'Test',
    revision: 1,
    ...(kind === 'lesson_booking' ? { bookingId: `b_${startHour}` } : {}),
    ...(kind === 'availability_block' ? { blockId: `block_${startHour}`, blockKind: 'break' as const } : {}),
    ...(kind === 'course_day' ? { courseId: `c_${startHour}`, courseDayId: `cd_${startHour}` } : {}),
    ...extra,
  } as AdminPlannerOccupancyItem;
}

function buildReadModel(items: AdminPlannerOccupancyItem[]): InstructorOccupancyReadModel {
  return {
    instructorId,
    localDate,
    timeZone,
    window: {
      startsAt: { seconds: 0, nanoseconds: 0 },
      endsAt: { seconds: 86400, nanoseconds: 0 },
    },
    occupancy: items,
    truncated: false,
  };
}

function fullPipeline(
  items: AdminPlannerOccupancyItem[],
  durationHours = 2
): { visibleValues: string[]; selectedTime: string } {
  const model = buildReadModel(items);
  const mapped = mapInstructorOccupancyReadModelForBookingModal(model);

  const availableSlots = getAvailableLessonStartTimes({
    candidateStarts: DEFAULT_LESSON_TIME_SLOTS,
    durationHours,
    localDate,
    instructorId,
    occupancySlots: mapped.slots,
    occupancyCourses: mapped.courses,
    now: futureNow,
  });

  const options = buildBookingTimePickerOptions({
    isLoadingBookings: false,
    occupancyLoadFailed: false,
    availableSlots,
    t: (key: string) => key,
  });

  const visibleValues = getVisibleBookingTimePickerValues(options);
  const selectedTime = resolveLessonStartTimeSelection('08:00', availableSlots);

  return { visibleValues, selectedTime };
}

describe('booking time picker full wiring', () => {
  it('lesson_booking at 10:00–11:00 removes 10:00 from visible picker values (1h duration)', () => {
    const { visibleValues } = fullPipeline(
      [makeOccupancyItem('lesson_booking', 10, 11)],
      1
    );
    expect(visibleValues).not.toContain('10:00');
    expect(visibleValues).toContain('08:00');
    expect(visibleValues).toContain('09:00');
    expect(visibleValues).toContain('11:00');
  });

  it('lesson_booking at 10:00–12:00 removes 10:00 and 11:00 from visible picker (2h duration)', () => {
    const { visibleValues } = fullPipeline(
      [makeOccupancyItem('lesson_booking', 10, 12)],
      2
    );
    expect(visibleValues).not.toContain('10:00');
    expect(visibleValues).not.toContain('11:00');
    expect(visibleValues).toContain('08:00');
    expect(visibleValues).toContain('12:00');
  });

  it('2h duration candidate starting at 09:00 overlaps 10:00–11:00 booking → 09:00 removed', () => {
    const { visibleValues } = fullPipeline(
      [makeOccupancyItem('lesson_booking', 10, 11)],
      2
    );
    expect(visibleValues).not.toContain('09:00');
    expect(visibleValues).not.toContain('10:00');
    expect(visibleValues).toContain('08:00');
    expect(visibleValues).toContain('11:00');
  });

  it('availability_block (break) at 14:00–15:00 removes 14:00 from visible picker', () => {
    const { visibleValues } = fullPipeline(
      [makeOccupancyItem('availability_block', 14, 15)],
      1
    );
    expect(visibleValues).not.toContain('14:00');
    expect(visibleValues).toContain('13:00');
    expect(visibleValues).toContain('15:00');
  });

  it('course_day at 09:00–13:00 removes overlapping slots', () => {
    const { visibleValues } = fullPipeline(
      [makeOccupancyItem('course_day', 9, 13)],
      1
    );
    expect(visibleValues).not.toContain('09:00');
    expect(visibleValues).not.toContain('10:00');
    expect(visibleValues).not.toContain('11:00');
    expect(visibleValues).not.toContain('12:00');
    expect(visibleValues).toContain('08:00');
    expect(visibleValues).toContain('13:00');
  });

  it('multiple occupancy items removes all busy intervals', () => {
    const { visibleValues } = fullPipeline(
      [
        makeOccupancyItem('lesson_booking', 8, 9),
        makeOccupancyItem('availability_block', 12, 14),
      ],
      1
    );
    expect(visibleValues).not.toContain('08:00');
    expect(visibleValues).not.toContain('12:00');
    expect(visibleValues).not.toContain('13:00');
    expect(visibleValues).toContain('09:00');
    expect(visibleValues).toContain('14:00');
  });

  it('empty occupancy returns all candidate times', () => {
    const { visibleValues } = fullPipeline([], 1);
    expect(visibleValues).toEqual(
      expect.arrayContaining(['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'])
    );
  });

  it('occupied initial default 08:00 snaps to the nearest remaining start', () => {
    const { selectedTime } = fullPipeline(
      [makeOccupancyItem('lesson_booking', 8, 10)],
      2
    );
    expect(selectedTime).toBe('10:00');
  });

  it('available initial default 08:00 is preserved', () => {
    const { selectedTime } = fullPipeline([], 2);
    expect(selectedTime).toBe('08:00');
  });
});

describe('fail-closed behavior', () => {
  it('loading state shows loading placeholder, no selectable values', () => {
    const options = buildBookingTimePickerOptions({
      isLoadingBookings: true,
      occupancyLoadFailed: false,
      availableSlots: [],
      t: (key: string) => key,
    });
    const visible = getVisibleBookingTimePickerValues(options);
    expect(visible).toEqual([]);
    expect(options).toHaveLength(1);
    expect(options[0].disabled).toBe(true);
  });

  it('error state shows error placeholder, no selectable values', () => {
    const options = buildBookingTimePickerOptions({
      isLoadingBookings: false,
      occupancyLoadFailed: true,
      availableSlots: [],
      t: (key: string) => key,
    });
    const visible = getVisibleBookingTimePickerValues(options);
    expect(visible).toEqual([]);
    expect(options).toHaveLength(1);
    expect(options[0].disabled).toBe(true);
  });

  it('empty available slots shows no-slots placeholder', () => {
    const options = buildBookingTimePickerOptions({
      isLoadingBookings: false,
      occupancyLoadFailed: false,
      availableSlots: [],
      t: (key: string) => key,
    });
    const visible = getVisibleBookingTimePickerValues(options);
    expect(visible).toEqual([]);
  });
});

describe('duration consistency', () => {
  it('filtering uses the same duration that would be submitted', () => {
    const submitDuration = 2;
    const filterDuration = submitDuration;

    const model = buildReadModel([makeOccupancyItem('lesson_booking', 10, 11)]);
    const mapped = mapInstructorOccupancyReadModelForBookingModal(model);

    const available = getAvailableLessonStartTimes({
      candidateStarts: DEFAULT_LESSON_TIME_SLOTS,
      durationHours: filterDuration,
      localDate,
      instructorId,
      occupancySlots: mapped.slots,
      occupancyCourses: mapped.courses,
      now: futureNow,
    });

    expect(available).not.toContain('09:00');
    expect(available).not.toContain('10:00');
  });
});
