import { beforeEach, describe, expect, it } from 'vitest';
import type { InstructorCourseViewModel } from '../../src/features/instructor-courses/instructorCourseContracts';
import { useInstructorCourseStore } from '../../src/features/instructor-courses/instructorCourseStore';

function courseViewModel(
  canRecordAttendance: boolean,
  factualState: 'missing' | 'present' | 'absent' = 'present',
  attendanceRevision: number | undefined = 1
): InstructorCourseViewModel {
  return {
    courseId: 'course_store_authority_01',
    title: 'Authority Course',
    courseScheduleRevision: 1,
    courseDays: [
      {
        courseDayId: 'course_day_store_authority_01',
        dayOrder: 1,
        interval: {
          startsAt: { seconds: 1, nanoseconds: 0 },
          endsAt: { seconds: 2, nanoseconds: 0 },
        },
        timeZone: 'Asia/Almaty',
        revision: 1,
      },
    ],
    participants: [
      {
        enrollmentId: 'enrollment_store_authority_01',
        enrollmentRevision: 1,
        participantId: 'participant_store_authority_01',
        displayName: 'Canonical Student',
        lifecycleStatus: 'confirmed',
        authorizedActions: { canRecordAttendance },
        days: [
          {
            courseDayId: 'course_day_store_authority_01',
            dayOrder: 1,
            timeZone: 'Asia/Almaty',
            courseDayRevision: 1,
            factualState,
            attendanceId: factualState === 'missing' ? undefined : 'attendance_store_authority_01',
            attendanceRevision,
            authorizedActions: { canRecordAttendance },
          },
        ],
      },
    ],
  };
}

describe('instructorCourseStore', () => {
  beforeEach(() => {
    useInstructorCourseStore.getState().reset();
  });

  it('refreshes attendance authority even when factual state and revisions are unchanged', () => {
    useInstructorCourseStore
      .getState()
      .mergeCourses(new Map([['course_store_authority_01', courseViewModel(false)]]));
    useInstructorCourseStore
      .getState()
      .mergeCourses(new Map([['course_store_authority_01', courseViewModel(true)]]));

    const refreshed = useInstructorCourseStore
      .getState()
      .coursesById.get('course_store_authority_01');
    expect(refreshed?.participants[0]?.authorizedActions.canRecordAttendance).toBe(true);
    expect(refreshed?.participants[0]?.days[0]?.authorizedActions.canRecordAttendance).toBe(true);
  });

  it('replaces cached attendance with the refetched canonical state', () => {
    useInstructorCourseStore
      .getState()
      .mergeCourses(
        new Map([['course_store_authority_01', courseViewModel(true, 'missing', undefined)]])
      );
    useInstructorCourseStore
      .getState()
      .mergeCourses(new Map([['course_store_authority_01', courseViewModel(true, 'present', 1)]]));

    const refreshed = useInstructorCourseStore
      .getState()
      .coursesById.get('course_store_authority_01');
    expect(refreshed?.participants[0]?.days[0]?.factualState).toBe('present');
    expect(refreshed?.participants[0]?.days[0]?.attendanceRevision).toBe(1);
  });
});
