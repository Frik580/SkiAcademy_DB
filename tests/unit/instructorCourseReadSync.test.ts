import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  ParticipantIdSchema,
} from '@ski-academy/shared-domain';
import { useInstructorCourseStore } from '../../src/features/instructor-courses/instructorCourseStore';

const queryEnrollmentMock = vi.fn();
const queryAttendanceMock = vi.fn();
const queryAssignmentMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseEnrollmentReadModels: (...args: unknown[]) => queryEnrollmentMock(...args),
  queryCourseAttendanceReadModels: (...args: unknown[]) => queryAttendanceMock(...args),
  queryInstructorCourseAssignmentReadModels: (...args: unknown[]) => queryAssignmentMock(...args),
}));

import {
  refetchInstructorCourseReadModels,
  resetInstructorCourseRefetchQueuesForTests,
  useInstructorCourseReadSync,
} from '../../src/features/instructor-courses/useInstructorCourseReadSync';

const courseId = CourseIdSchema.parse('course_instructor_sync_01');
const secondCourseId = CourseIdSchema.parse('course_instructor_sync_02');
const courseDayId = CourseDayIdSchema.parse('course_day_instructor_sync_01');
const secondCourseDayId = CourseDayIdSchema.parse('course_day_instructor_sync_02');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_instructor_sync_01');
const participantId = ParticipantIdSchema.parse('participant_instructor_sync_01');

describe('useInstructorCourseReadSync', () => {
  beforeEach(() => {
    resetInstructorCourseRefetchQueuesForTests();
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
        assignedCourseDayIds: [courseDayId],
        courseSchedule: expect.objectContaining({
          courseId: 'course_instructor_sync_01',
          courseScheduleRevision: 1,
        }),
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

  it('ignores an obsolete request that fails after a newer reload succeeds', async () => {
    let rejectFirstEnrollment!: (reason: unknown) => void;
    const firstEnrollment = new Promise((_, reject) => {
      rejectFirstEnrollment = reject;
    });
    queryEnrollmentMock
      .mockImplementationOnce(() => firstEnrollment)
      .mockResolvedValueOnce({ scope: 'instructor_roster', items: [], hasMore: false });

    const { result } = renderHook(() =>
      useInstructorCourseReadSync({
        enabled: true,
        accountId: 'account_instructor_sync_01',
        instructorId: 'instructor_instructor_sync_01',
      })
    );

    await waitFor(() => {
      expect(queryEnrollmentMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.reload();
    });
    expect(useInstructorCourseStore.getState()).toMatchObject({
      loaded: true,
      rosterLoading: false,
      error: undefined,
    });

    await act(async () => {
      rejectFirstEnrollment(new Error('obsolete failure'));
      await Promise.resolve();
    });

    expect(useInstructorCourseStore.getState()).toMatchObject({
      loaded: true,
      rosterLoading: false,
      error: undefined,
    });
  });

  it('serializes same-course refetches so the newer snapshot commits last', async () => {
    const assignment = {
      courseId,
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
    };
    queryEnrollmentMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [
        {
          enrollmentId,
          revision: 1,
          courseId,
          participant: { participantId, displayName: 'Canonical Student' },
          lifecycle: { status: 'confirmed' },
          courseDisplay: { courseId, title: assignment.title },
          courseSchedule: assignment.courseSchedule,
          authorizedActions: { canRecordAttendance: true },
          updatedAt: { seconds: 1, nanoseconds: 0 },
        },
      ],
      hasMore: false,
    });

    let resolveOlderAttendance!: (value: unknown) => void;
    const olderAttendance = new Promise((resolve) => {
      resolveOlderAttendance = resolve;
    });
    const attendanceProjection = (factualState: 'present' | 'absent', revision: number) => ({
      scope: 'instructor_roster',
      items: [
        {
          enrollmentId,
          enrollmentRevision: 1,
          courseId,
          participantId,
          participantDisplayName: 'Canonical Student',
          days: [
            {
              courseDayId,
              factualState,
              attendanceId: 'attendance_instructor_sync_01',
              attendanceRevision: revision,
              attendanceStatus: factualState,
              courseDayRevision: 1,
              authorizedActions: { canRecordAttendance: true },
            },
          ],
        },
      ],
    });
    queryAttendanceMock
      .mockReturnValueOnce(olderAttendance)
      .mockResolvedValueOnce(attendanceProjection('absent', 2));

    const olderRefetch = refetchInstructorCourseReadModels([assignment]);
    await waitFor(() => expect(queryAttendanceMock).toHaveBeenCalledTimes(1));
    const newerRefetch = refetchInstructorCourseReadModels([assignment]);
    expect(queryAttendanceMock).toHaveBeenCalledTimes(1);
    resolveOlderAttendance(attendanceProjection('present', 1));
    await Promise.all([olderRefetch, newerRefetch]);
    expect(queryAttendanceMock).toHaveBeenCalledTimes(2);

    expect(
      useInstructorCourseStore.getState().coursesById.get(courseId)?.participants[0]?.days[0]
    ).toMatchObject({ factualState: 'absent', attendanceRevision: 2 });
  });

  it('allows different-course refetches to proceed independently', async () => {
    const firstAssignment = {
      courseId,
      title: 'Course A',
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
    };
    const secondAssignment = {
      ...firstAssignment,
      courseId: secondCourseId,
      title: 'Course B',
      assignedCourseDayIds: [secondCourseDayId],
      courseSchedule: {
        ...firstAssignment.courseSchedule,
        courseId: secondCourseId,
        courseDays: [
          {
            courseDayId: secondCourseDayId,
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
    };

    let resolveFirstAttendance!: (value: unknown) => void;
    const firstAttendance = new Promise((resolve) => {
      resolveFirstAttendance = resolve;
    });
    queryEnrollmentMock.mockResolvedValue({
      scope: 'instructor_roster',
      items: [],
      hasMore: false,
    });
    queryAttendanceMock
      .mockReturnValueOnce(firstAttendance)
      .mockResolvedValueOnce({ scope: 'instructor_roster', items: [] });

    const firstRefetch = refetchInstructorCourseReadModels([firstAssignment]);
    await waitFor(() => expect(queryAttendanceMock).toHaveBeenCalledTimes(1));
    const secondRefetch = refetchInstructorCourseReadModels([secondAssignment]);
    await waitFor(() => expect(queryAttendanceMock).toHaveBeenCalledTimes(2));

    resolveFirstAttendance({ scope: 'instructor_roster', items: [] });
    await Promise.all([firstRefetch, secondRefetch]);
  });

  it('does not poison the queue when a same-course refetch fails', async () => {
    const assignment = {
      courseId,
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
    };
    queryEnrollmentMock
      .mockRejectedValueOnce(new Error('read unavailable'))
      .mockResolvedValueOnce({ scope: 'instructor_roster', items: [], hasMore: false });
    queryAttendanceMock.mockResolvedValue({ scope: 'instructor_roster', items: [] });

    await expect(refetchInstructorCourseReadModels([assignment])).rejects.toThrow(
      'read unavailable'
    );
    await expect(refetchInstructorCourseReadModels([assignment])).resolves.toBeUndefined();
    expect(queryEnrollmentMock).toHaveBeenCalledTimes(2);
  });
});
