import { describe, expect, it } from 'vitest';
import {
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  buildInstructorCourseViewModel,
  mapInstructorCourseAssignmentReadModelsToAssignedCourses,
  mapRosterItemToParticipant,
} from '../../src/features/instructor-courses/instructorCourseViewModel';

const courseId = CourseIdSchema.parse('course_instructor_vm_01');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_instructor_vm_01');
const courseDayOneId = CourseDayIdSchema.parse('course_day_instructor_vm_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_instructor_vm_02');
const participantId = ParticipantIdSchema.parse('participant_instructor_vm_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
const dayTwoStart = timestampFromDate(new Date('2026-02-02T03:00:00.000Z'));
const dayTwoEnd = timestampFromDate(new Date('2026-02-02T05:00:00.000Z'));

const courseSchedule = {
  courseId,
  courseScheduleRevision: 3,
  courseDayCount: 2,
  startAt: dayOneStart,
  finalCourseDayEndsAt: dayTwoEnd,
  courseDays: [
    {
      courseDayId: courseDayOneId,
      dayOrder: 1,
      interval: { startsAt: dayOneStart, endsAt: dayOneEnd },
      timeZone: 'Asia/Almaty',
      revision: 11,
    },
    {
      courseDayId: courseDayTwoId,
      dayOrder: 2,
      interval: { startsAt: dayTwoStart, endsAt: dayTwoEnd },
      timeZone: 'Asia/Almaty',
      revision: 12,
    },
  ],
} as const;

const rosterItem = {
  enrollmentId,
  revision: 7,
  courseId,
  participant: {
    participantId,
    displayName: 'Canonical Student',
  },
  lifecycle: { status: 'confirmed' as const },
  courseDisplay: { courseId, title: 'BASE — First Turns' },
  courseSchedule,
  authorizedActions: { canRecordAttendance: true },
  updatedAt: decidedAt,
};

describe('instructor course view model merge', () => {
  it('joins CourseDays, roster, and attendance projections', () => {
    const viewModel = buildInstructorCourseViewModel({
      rosterItems: [rosterItem],
      attendanceItems: [
        {
          enrollmentId,
          enrollmentRevision: 7,
          courseId,
          participantId,
          participantDisplayName: 'Canonical Student',
          days: [
            {
              courseDayId: courseDayOneId,
              factualState: 'present',
              attendanceId: 'attendance_instructor_vm_01',
              attendanceRevision: 2,
              attendanceStatus: 'present',
              courseDayRevision: 11,
              authorizedActions: { canRecordAttendance: true },
            },
            {
              courseDayId: courseDayTwoId,
              factualState: 'missing',
              courseDayRevision: 12,
              authorizedActions: { canRecordAttendance: false },
            },
          ],
        },
      ],
    });

    expect(viewModel).toMatchObject({
      courseId,
      title: 'BASE — First Turns',
      courseScheduleRevision: 3,
      courseDays: expect.arrayContaining([
        expect.objectContaining({ courseDayId: courseDayOneId }),
        expect.objectContaining({ courseDayId: courseDayTwoId }),
      ]),
    });
    expect(viewModel?.participants).toHaveLength(1);
    expect(viewModel?.participants[0]).toMatchObject({
      enrollmentId,
      enrollmentRevision: 7,
      displayName: 'Canonical Student',
      lifecycleStatus: 'confirmed',
      authorizedActions: { canRecordAttendance: true },
    });
    expect(viewModel?.participants[0]?.days[0]).toMatchObject({
      courseDayId: courseDayOneId,
      factualState: 'present',
      attendanceRevision: 2,
      authorizedActions: { canRecordAttendance: true },
    });
    expect(viewModel?.participants[0]?.days[1]).toMatchObject({
      courseDayId: courseDayTwoId,
      factualState: 'missing',
      authorizedActions: { canRecordAttendance: false },
    });
  });

  it('uses participant displayName from canonical roster projection', () => {
    const participant = mapRosterItemToParticipant(rosterItem, undefined, courseSchedule.courseDays);
    expect(participant.displayName).toBe('Canonical Student');
    expect(participant.participantId).toBe(participantId);
  });

  it('defaults missing attendance to factualState missing', () => {
    const participant = mapRosterItemToParticipant(rosterItem, undefined, courseSchedule.courseDays);
    expect(participant.days.every((day) => day.factualState === 'missing')).toBe(true);
    expect(participant.days.every((day) => day.authorizedActions.canRecordAttendance === false)).toBe(
      true
    );
  });

  it('passes enrollment and attendance revisions through', () => {
    const participant = mapRosterItemToParticipant(
      rosterItem,
      {
        enrollmentId,
        enrollmentRevision: 7,
        courseId,
        participantId,
        participantDisplayName: 'Canonical Student',
        days: [
          {
            courseDayId: courseDayOneId,
            factualState: 'absent',
            attendanceId: 'attendance_instructor_vm_02',
            attendanceRevision: 5,
            attendanceStatus: 'absent',
            courseDayRevision: 11,
            authorizedActions: { canRecordAttendance: true },
          },
          {
            courseDayId: courseDayTwoId,
            factualState: 'missing',
            courseDayRevision: 12,
            authorizedActions: { canRecordAttendance: false },
          },
        ],
      },
      courseSchedule.courseDays
    );

    expect(participant.enrollmentRevision).toBe(7);
    expect(participant.days[0]?.attendanceRevision).toBe(5);
    expect(participant.days[0]?.factualState).toBe('absent');
  });

  it('maps canonical instructor assignment read models to assigned course refs', () => {
    expect(
      mapInstructorCourseAssignmentReadModelsToAssignedCourses([
        {
          courseId,
          revision: 1,
          title: 'BASE — First Turns',
          assignedCourseDayIds: [courseDayOneId],
          courseSchedule,
          updatedAt: decidedAt,
        },
      ])
    ).toEqual([{ courseId, title: 'BASE — First Turns' }]);
  });
});
