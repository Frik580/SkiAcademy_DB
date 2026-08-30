import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { CourseDayIdSchema, CourseIdSchema } from '@ski-academy/shared-domain';
import { useInstructorCourseStore } from '../../src/features/instructor-courses/instructorCourseStore';

const queryEnrollmentMock = vi.fn();
const queryAttendanceMock = vi.fn();
const queryAssignmentMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseEnrollmentReadModels: (...args: unknown[]) => queryEnrollmentMock(...args),
  queryCourseAttendanceReadModels: (...args: unknown[]) => queryAttendanceMock(...args),
  queryInstructorCourseAssignmentReadModels: (...args: unknown[]) => queryAssignmentMock(...args),
}));

import { useInstructorCourseReadSync } from '../../src/features/instructor-courses/useInstructorCourseReadSync';

const courseId = CourseIdSchema.parse('course_instructor_sync_01');
const courseDayId = CourseDayIdSchema.parse('course_day_instructor_sync_01');

describe('useInstructorCourseReadSync', () => {
  beforeEach(() => {
    useInstructorCourseStore.getState().reset();
    queryEnrollmentMock.mockReset();
    queryAttendanceMock.mockReset();
    queryAssignmentMock.mockReset();
    queryAssignmentMock.mockResolvedValue({
      scope: 'instructor_assigned',
      items: [
        {
          courseId,
          revision: 1,
          title: 'BASE — First Turns',
          assignedCourseDayIds: [courseDayId],
          courseSchedule: {
            courseId,
            courseScheduleRevision: 1,
            courseDayCount: 1,
            startAt: { seconds: 1, nanoseconds: 0 },
            finalCourseDayEndsAt: { seconds: 2, nanoseconds: 0 },
            courseDays: [
              {
                courseDayId,
                dayOrder: 1,
                interval: {
                  startsAt: { seconds: 1, nanoseconds: 0 },
                  endsAt: { seconds: 2, nanoseconds: 0 },
                },
                timeZone: 'Asia/Almaty',
                revision: 1,
              },
            ],
          },
          updatedAt: { seconds: 1, nanoseconds: 0 },
        },
      ],
    });
    queryEnrollmentMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [],
      hasMore: false,
    });
    queryAttendanceMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [],
    });
  });

  it('loads canonical instructor assignment discovery then roster read models', async () => {
    renderHook(() =>
      useInstructorCourseReadSync({
        enabled: true,
        accountId: 'account_instructor_sync_01',
        instructorId: 'instructor_instructor_sync_01',
      })
    );

    await waitFor(() => {
      expect(useInstructorCourseStore.getState().loaded).toBe(true);
    });

    expect(queryAssignmentMock).toHaveBeenCalledWith({ scope: 'instructor_assigned' });
    expect(queryEnrollmentMock).toHaveBeenCalledWith({
      scope: 'instructor_roster',
      courseId: 'course_instructor_sync_01',
    });
    expect(queryAttendanceMock).toHaveBeenCalledWith({
      scope: 'instructor_roster',
      courseId: 'course_instructor_sync_01',
    });
    expect(useInstructorCourseStore.getState().assignedCourses).toEqual([
      {
        courseId: 'course_instructor_sync_01',
        title: 'BASE — First Turns',
      },
    ]);
  });

  it('loads only the selected assigned course when selectedCourseId is provided', async () => {
    renderHook(() =>
      useInstructorCourseReadSync({
        enabled: true,
        accountId: 'account_instructor_sync_01',
        instructorId: 'instructor_instructor_sync_01',
        selectedCourseId: 'course_instructor_sync_01',
      })
    );

    await waitFor(() => {
      expect(useInstructorCourseStore.getState().loaded).toBe(true);
    });

    expect(queryEnrollmentMock).toHaveBeenCalledTimes(1);
    expect(queryAttendanceMock).toHaveBeenCalledTimes(1);
  });
});
