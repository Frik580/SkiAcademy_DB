import { describe, expect, it } from 'vitest';
import { CourseDayIdSchema, CourseIdSchema, timestampFromDate } from '@ski-academy/shared-domain';
import {
  formatInstructorCourseAssignedDaysSummary,
  formatInstructorCourseScheduleSummary,
} from '../../src/features/instructor-courses/instructorCoursePresentation';

const courseId = CourseIdSchema.parse('course_presentation_01');
const dayOneId = CourseDayIdSchema.parse('course_day_presentation_01');
const dayTwoId = CourseDayIdSchema.parse('course_day_presentation_02');
const dayStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
const dayTwoStart = timestampFromDate(new Date('2026-02-03T03:00:00.000Z'));
const dayTwoEnd = timestampFromDate(new Date('2026-02-03T05:00:00.000Z'));

const courseSchedule = {
  courseId,
  courseScheduleRevision: 1,
  courseDayCount: 2,
  startAt: dayStart,
  finalCourseDayEndsAt: dayTwoEnd,
  courseDays: [
    {
      courseDayId: dayOneId,
      dayOrder: 1,
      interval: { startsAt: dayStart, endsAt: dayEnd },
      timeZone: 'Asia/Almaty',
      revision: 1,
    },
    {
      courseDayId: dayTwoId,
      dayOrder: 2,
      interval: { startsAt: dayTwoStart, endsAt: dayTwoEnd },
      timeZone: 'Asia/Almaty',
      revision: 1,
    },
  ],
} as const;

describe('instructorCoursePresentation', () => {
  it('formats schedule summary from assigned course days only', () => {
    expect(
      formatInstructorCourseScheduleSummary({
        assignedCourseDayIds: [dayOneId, dayTwoId],
        courseSchedule,
      })
    ).toContain('2026-02-01');
    expect(
      formatInstructorCourseScheduleSummary({
        assignedCourseDayIds: [dayOneId, dayTwoId],
        courseSchedule,
      })
    ).toContain('2026-02-03');
  });

  it('shows assigned day numbers for partial course-day assignment', () => {
    expect(
      formatInstructorCourseAssignedDaysSummary({
        assignedCourseDayIds: [dayTwoId],
        courseSchedule,
      })
    ).toBe('2');
  });
});
