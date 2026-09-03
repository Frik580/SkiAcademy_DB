import { describe, expect, it } from 'vitest';
import type { AdminPlannerOccupancyItem, InstructorOccupancyReadModel } from '@ski-academy/shared-domain';
import { DEFAULT_LESSON_TIME_SLOTS } from '../../src/domain/availability';
import {
  getAvailableLessonStartTimes,
  lessonIntervalsOverlap,
  mapInstructorOccupancyReadModelForBookingModal,
  mapInstructorOccupancyToAvailabilitySlots,
  mapInstructorOccupancyToCourses,
  resolveLessonStartTimeSelection,
} from '../../src/features/bookings/instructorOccupancyForBookingModal';
import type { AvailabilitySlot, Course } from '../../src/types';
import {
  buildBookingTimePickerOptions,
  getVisibleBookingTimePickerValues,
} from '../../src/features/bookings/components/booking_modal/bookingTimePickerOptions';

const timeZone = 'Asia/Almaty';
const localDate = '2026-01-15';
const instructorId = 'instructor_guest_availability';
const futureNow = new Date('2026-01-15T00:00:00');

function occupancyItem(
  overrides: Partial<AdminPlannerOccupancyItem> & Pick<AdminPlannerOccupancyItem, 'occupancyKind' | 'occupancyId'>
): AdminPlannerOccupancyItem {
  return {
    instructorId,
    interval: {
      startsAt: { seconds: 1_736_928_000, nanoseconds: 0 },
      endsAt: { seconds: 1_736_931_600, nanoseconds: 0 },
    },
    timeZone,
    localDate,
    localTime: '09:00',
    durationMinutes: 60,
    displayTitle: 'Occupied',
    ...overrides,
  } as AdminPlannerOccupancyItem;
}

function slot(
  time: string,
  durationHours: number,
  bookingId = `slot_${time}`
): AvailabilitySlot {
  return {
    bookingId,
    instructorId,
    date: localDate,
    time,
    durationHours,
    slotType: 'lesson',
  };
}

function block(
  time: string,
  durationHours: number,
  bookingId = `block_${time}`
): AvailabilitySlot {
  return {
    bookingId,
    instructorId,
    date: localDate,
    time,
    durationHours,
    slotType: 'block',
  };
}

function courseDayCourse(startTime: string, endTime: string, title = 'Group camp'): Course {
  return {
    id: 'course_day_1',
    title,
    duration: '2h',
    description: title,
    dates: `15.01.2026, ${startTime} - ${endTime}`,
    instructorIds: [instructorId],
    availableSeats: 0,
    totalSeats: 0,
    price: 0,
    bgImageUrl: '',
  };
}

function availableStarts(
  occupancySlots: AvailabilitySlot[] = [],
  occupancyCourses: Course[] = [],
  durationHours = 1
): string[] {
  return getAvailableLessonStartTimes({
    candidateStarts: DEFAULT_LESSON_TIME_SLOTS,
    durationHours,
    localDate,
    instructorId,
    occupancySlots,
    occupancyCourses,
    now: futureNow,
  });
}

function visiblePickerValues(
  availableSlots: string[],
  overrides: Partial<Parameters<typeof buildBookingTimePickerOptions>[0]> = {}
): string[] {
  const options = buildBookingTimePickerOptions({
    isLoadingBookings: false,
    occupancyLoadFailed: false,
    availableSlots,
    t: (key) => key,
    ...overrides,
  });
  return getVisibleBookingTimePickerValues(options);
}

describe('lessonIntervalsOverlap', () => {
  it('treats adjacent half-open intervals as non-overlapping', () => {
    expect(lessonIntervalsOverlap(10 * 60, 11 * 60, 9 * 60, 10 * 60)).toBe(false);
    expect(lessonIntervalsOverlap(9 * 60, 10 * 60, 10 * 60, 11 * 60)).toBe(false);
  });

  it('detects overlapping intervals', () => {
    expect(lessonIntervalsOverlap(10 * 60, 12 * 60, 11 * 60, 12 * 60)).toBe(true);
  });
});

describe('mapInstructorOccupancyToAvailabilitySlots', () => {
  it('maps lesson bookings and administrative blocks but not course days', () => {
    const slots = mapInstructorOccupancyToAvailabilitySlots(
      [
        occupancyItem({
          occupancyKind: 'lesson_booking',
          occupancyId: 'booking_existing',
          bookingId: 'booking_existing',
          localTime: '10:00',
        }),
        occupancyItem({
          occupancyKind: 'availability_block',
          occupancyId: 'block_break',
          blockId: 'block_break',
          blockKind: 'break',
          localTime: '12:00',
        }),
        occupancyItem({
          occupancyKind: 'course_day',
          occupancyId: 'course_day:1',
          courseId: 'course_1',
          courseDayId: 'course_day_1',
          localTime: '14:00',
        }),
      ],
      localDate,
      timeZone
    );

    expect(slots).toHaveLength(2);
    expect(slots.map((entry) => entry.bookingId)).toEqual(['booking_existing', 'block_break']);
  });
});

describe('mapInstructorOccupancyReadModelForBookingModal', () => {
  it('returns course projections for course-day occupancy on the selected day', () => {
    const model: InstructorOccupancyReadModel = {
      instructorId,
      localDate,
      timeZone,
      window: {
        startsAt: { seconds: 1_736_918_400, nanoseconds: 0 },
        endsAt: { seconds: 1_736_944_800, nanoseconds: 0 },
      },
      occupancy: [
        occupancyItem({
          occupancyKind: 'course_day',
          occupancyId: 'course_day_1:instructor_guest_availability',
          courseId: 'course_1',
          courseDayId: 'course_day_1',
          displayTitle: 'Group camp',
          localTime: '14:00',
          durationMinutes: 120,
        }),
      ],
      truncated: false,
    };

    const mapped = mapInstructorOccupancyReadModelForBookingModal(model);
    expect(mapped.slots).toHaveLength(0);
    expect(mapped.courses).toHaveLength(1);
    expect(mapped.courses[0]?.instructorIds).toEqual([instructorId]);
  });
});

describe('getAvailableLessonStartTimes', () => {
  it('hides lesson booking start times from final options', () => {
    const starts = availableStarts([slot('10:00', 1)]);
    expect(starts).not.toContain('10:00');
    expect(starts).toContain('09:00');
    expect(starts).toContain('11:00');
  });

  it('hides break-overlapping start times', () => {
    const starts = availableStarts([block('12:00', 1)]);
    expect(starts).not.toContain('12:00');
  });

  it('hides all starts when day off covers the working day', () => {
    const starts = availableStarts([block('08:00', 11, 'day_off')]);
    expect(starts).toHaveLength(0);
  });

  it('hides course-day overlapping starts but keeps adjacent starts', () => {
    const starts = availableStarts([], [courseDayCourse('14:00', '16:00')]);
    expect(starts).not.toContain('14:00');
    expect(starts).not.toContain('15:00');
    expect(starts).toContain('16:00');
  });

  it('hides candidates whose full lesson duration overlaps occupancy', () => {
    const starts = availableStarts([slot('11:00', 1)], [], 2);
    expect(starts).toContain('09:00');
    expect(starts).not.toContain('10:00');
    expect(starts).not.toContain('11:00');
    expect(starts).toContain('12:00');
  });

  it('recomputes options when duration changes', () => {
    const occupancy = [block('13:00', 1)];
    const oneHourStarts = availableStarts(occupancy, [], 1);
    const twoHourStarts = availableStarts(occupancy, [], 2);

    expect(oneHourStarts).toContain('12:00');
    expect(twoHourStarts).not.toContain('12:00');
  });

  it('changes visible starts after instructor-specific occupancy changes', () => {
    const instructorAStarts = getAvailableLessonStartTimes({
      candidateStarts: DEFAULT_LESSON_TIME_SLOTS,
      durationHours: 1,
      localDate,
      instructorId: 'instructor_a',
      occupancySlots: [],
      occupancyCourses: [],
      now: futureNow,
    });
    const instructorBStarts = getAvailableLessonStartTimes({
      candidateStarts: DEFAULT_LESSON_TIME_SLOTS,
      durationHours: 1,
      localDate,
      instructorId: 'instructor_b',
      occupancySlots: [slot('10:00', 1)],
      occupancyCourses: [],
      now: futureNow,
    });

    expect(instructorAStarts).toContain('10:00');
    expect(instructorBStarts).not.toContain('10:00');
  });

  it('clears selection when a previously free start becomes occupied after refetch', () => {
    const before = availableStarts([]);
    const after = availableStarts([slot('10:00', 1)]);

    expect(before).toContain('10:00');
    expect(after).not.toContain('10:00');
  });
});

describe('resolveLessonStartTimeSelection', () => {
  it('clears selected time when duration change makes it unavailable', () => {
    const twoHourStarts = availableStarts([block('13:00', 1)], [], 2);
    expect(resolveLessonStartTimeSelection('12:00', twoHourStarts)).toBe('');
  });

  it('clears selected time when switching to an instructor where it is busy', () => {
    const instructorBStarts = getAvailableLessonStartTimes({
      candidateStarts: DEFAULT_LESSON_TIME_SLOTS,
      durationHours: 1,
      localDate,
      instructorId: 'instructor_b',
      occupancySlots: [slot('10:00', 1)],
      occupancyCourses: [],
      now: futureNow,
    });

    expect(resolveLessonStartTimeSelection('10:00', instructorBStarts)).toBe('');
  });

  it('clears selected time when occupancy refetch makes it busy', () => {
    const afterRefetch = availableStarts([slot('10:00', 1)]);
    expect(resolveLessonStartTimeSelection('10:00', afterRefetch)).toBe('');
  });

  it('keeps selection empty after backend conflict refetch hides the previous slot', () => {
    const afterRefetch = availableStarts([slot('10:00', 1)]);

    expect(resolveLessonStartTimeSelection('', afterRefetch)).toBe('');
    expect(resolveLessonStartTimeSelection('10:00', afterRefetch)).toBe('');
  });

  it('preserves a selected time that remains available', () => {
    const starts = availableStarts([]);
    expect(resolveLessonStartTimeSelection('09:00', starts)).toBe('09:00');
  });
});

describe('buildBookingTimePickerOptions', () => {
  it('does not expose occupied starts in visible wheel values', () => {
    const available = availableStarts([slot('10:00', 1)]);
    const visible = visiblePickerValues(available);

    expect(visible).not.toContain('10:00');
    expect(visible).toEqual(available);
  });

  it('blocks untrusted slots while occupancy is loading', () => {
    const visible = visiblePickerValues(['10:00', '11:00'], { isLoadingBookings: true });
    expect(visible).toHaveLength(0);
  });

  it('blocks untrusted slots when occupancy load failed', () => {
    const visible = visiblePickerValues(['10:00', '11:00'], { occupancyLoadFailed: true });
    expect(visible).toHaveLength(0);
  });

  it('shows empty-state placeholder when no starts remain after filtering', () => {
    const options = buildBookingTimePickerOptions({
      isLoadingBookings: false,
      occupancyLoadFailed: false,
      availableSlots: [],
      t: (key) => key,
    });

    expect(getVisibleBookingTimePickerValues(options)).toHaveLength(0);
    expect(options).toEqual([{ value: '', label: 'noSlotsAvailable', disabled: true }]);
  });
});