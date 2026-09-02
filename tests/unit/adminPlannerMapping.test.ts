import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AdministrativeAvailabilityBlockIdSchema,
  BookingIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
  type AdminPlannerOccupancyItem,
} from '@ski-academy/shared-domain';
import { parseCourseDates } from '../../src/lib/i18n/courseDates';
import {
  mapPlannerCourses,
  mapPlannerOccupancyToBookings,
} from '../../src/features/admin/operations/adminPlannerMapping';
import {
  dayViewBookingForSlot,
  scheduleBookingsForDay,
} from '../../src/features/admin/components/schedule/scheduleDayViewPlacement';

const instructorId = InstructorIdSchema.parse('instructor_planner_mapping_01');

function interval(start: string, end: string) {
  return {
    startsAt: timestampFromDate(new Date(start)),
    endsAt: timestampFromDate(new Date(end)),
  };
}

describe('Admin Planner compatibility mapping', () => {
  it('uses payer Account identity for Lesson Booking client lookup', () => {
    const bookingId = BookingIdSchema.parse('booking_planner_mapping_01');
    const participantId = ParticipantIdSchema.parse('participant_planner_mapping_01');
    const payerAccountId = AccountIdSchema.parse('account_planner_mapping_01');
    const item: AdminPlannerOccupancyItem = {
      occupancyKind: 'lesson_booking',
      occupancyId: bookingId,
      bookingId,
      instructorId,
      participantId,
      payerAccountId,
      interval: interval('2026-09-02T04:00:00.000Z', '2026-09-02T05:00:00.000Z'),
      timeZone: 'Asia/Almaty',
      localDate: '2026-09-02',
      localTime: '09:00',
      durationMinutes: 60,
      displayTitle: 'Canonical Participant',
      lifecycleStatus: 'confirmed',
      revision: 1,
    };

    expect(participantId).not.toBe(payerAccountId);
    const mapped = mapPlannerOccupancyToBookings([item]);
    expect(mapped).toEqual([
      expect.objectContaining({
        id: bookingId,
        userId: payerAccountId,
        instructorId,
        date: '2026-09-02',
        time: '09:00',
      }),
    ]);
    expect(mapped[0]?.userId).not.toBe(participantId);
  });

  it.each([
    { blockKind: 'break' as const, expectedUserId: 'system_block_break' },
    { blockKind: 'day_off' as const, expectedUserId: 'system_block_day_off' },
  ])('preserves $blockKind presentation in the same Booking-shaped table input', (input) => {
    const blockId = AdministrativeAvailabilityBlockIdSchema.parse(
      `block_planner_mapping_${input.blockKind}`
    );
    const item: AdminPlannerOccupancyItem = {
      occupancyKind: 'availability_block',
      occupancyId: blockId,
      blockId,
      blockKind: input.blockKind,
      instructorId,
      interval: interval('2026-09-02T07:00:00.000Z', '2026-09-02T08:00:00.000Z'),
      timeZone: 'Asia/Almaty',
      localDate: '2026-09-02',
      localTime: '12:00',
      durationMinutes: 60,
      displayTitle: input.blockKind,
      revision: 1,
    };

    expect(mapPlannerOccupancyToBookings([item])).toEqual([
      expect.objectContaining({
        id: blockId,
        userId: input.expectedUserId,
        instructorId,
      }),
    ]);
  });

  it('projects each CourseDay once as a course interval and never as a fake lesson', () => {
    const courseId = CourseIdSchema.parse('course_planner_mapping_01');
    const courseDayId = CourseDayIdSchema.parse('course_day_planner_mapping_01');
    const item: AdminPlannerOccupancyItem = {
      occupancyKind: 'course_day',
      occupancyId: `${courseDayId}:${instructorId}`,
      courseId,
      courseDayId,
      instructorId,
      interval: interval('2026-09-02T05:00:00.000Z', '2026-09-02T07:00:00.000Z'),
      timeZone: 'Asia/Almaty',
      localDate: '2026-09-02',
      localTime: '10:00',
      durationMinutes: 120,
      displayTitle: 'Canonical Course Day',
      revision: 1,
      courseRevision: 3,
    };

    expect(mapPlannerOccupancyToBookings([item])).toEqual([]);
    const courses = mapPlannerCourses([item]);
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({
      id: `${courseDayId}:${instructorId}`,
      title: 'Canonical Course Day',
      instructorIds: [instructorId],
    });
    const parsed = parseCourseDates(courses[0]!.dates);
    expect(parsed.isValid).toBe(true);
    expect(parsed.startTime).toBe('10:00');
    expect(parsed.endTime).toBe('12:00');
  });

  it('maps the same availability block into week and day timetable rows', () => {
    const blockId = AdministrativeAvailabilityBlockIdSchema.parse('block_planner_day_week');
    const occupancy: AdminPlannerOccupancyItem[] = [
      {
        occupancyKind: 'availability_block',
        occupancyId: blockId,
        blockId,
        blockKind: 'day_off',
        instructorId,
        interval: interval('2026-09-02T03:00:00.000Z', '2026-09-02T14:00:00.000Z'),
        timeZone: 'Asia/Almaty',
        localDate: '2026-09-02',
        localTime: '08:00',
        durationMinutes: 660,
        displayTitle: 'day_off',
        revision: 1,
      },
      {
        occupancyKind: 'availability_block',
        occupancyId: AdministrativeAvailabilityBlockIdSchema.parse('block_planner_break_day_week'),
        blockId: AdministrativeAvailabilityBlockIdSchema.parse('block_planner_break_day_week'),
        blockKind: 'break',
        instructorId,
        interval: interval('2026-09-02T07:00:00.000Z', '2026-09-02T08:00:00.000Z'),
        timeZone: 'Asia/Almaty',
        localDate: '2026-09-02',
        localTime: '12:00',
        durationMinutes: 60,
        displayTitle: 'break',
        revision: 1,
      },
    ];
    const bookings = mapPlannerOccupancyToBookings(occupancy);
    expect(scheduleBookingsForDay(bookings, instructorId, '2026-09-02')).toHaveLength(2);
    expect(
      dayViewBookingForSlot(bookings, instructorId, '2026-09-02', '08:00', 0)?.booking.userId
    ).toBe('system_block_day_off');
    expect(
      dayViewBookingForSlot(bookings, instructorId, '2026-09-02', '12:00', 4)?.booking.userId
    ).toBe('system_block_break');
  });
});
