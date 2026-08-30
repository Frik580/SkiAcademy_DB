import { useCallback } from 'react';
import {
  AggregateRevisionSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
} from '@ski-academy/shared-domain';
import { executeAuthenticatedCanonicalCommand } from '../../lib/canonical/canonicalCommandClient';
import {
  CanonicalCommandClientError,
  mapCanonicalCommandResultError,
} from '../../lib/canonical/mapCanonicalCommandError';
import type { RecordCourseDayAttendanceInput } from './instructorCourseContracts';
import { useInstructorCourseStore } from './instructorCourseStore';
import { refetchInstructorCourseReadModels } from './useInstructorCourseReadSync';

export function useInstructorCourseAttendanceCommands(accountId: string | undefined) {
  const recordCourseDayAttendance = useCallback(
    async (input: RecordCourseDayAttendanceInput): Promise<void> => {
      if (!accountId) {
        throw new Error('Authentication is required.');
      }

      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'record_course_day_attendance',
        intent: {
          courseEnrollmentId: CourseEnrollmentIdSchema.parse(input.enrollmentId),
          courseDayId: CourseDayIdSchema.parse(input.courseDayId),
          attendanceStatus: input.attendanceStatus,
          ...(input.expectedAttendanceRevision !== undefined
            ? {
                expectedAttendanceRevision: AggregateRevisionSchema.parse(
                  input.expectedAttendanceRevision
                ),
              }
            : {}),
          ...(input.expectedEnrollmentRevision !== undefined
            ? {
                expectedEnrollmentRevision: AggregateRevisionSchema.parse(
                  input.expectedEnrollmentRevision
                ),
              }
            : {}),
        },
        idempotencyKey: input.idempotencyKey as never,
        exercisedCapability: 'instructor',
      });

      const error = mapCanonicalCommandResultError(result);
      if (error) {
        if (error.code === 'stale_version') {
          await refetchInstructorCourseReadModelsForCourseId(input.courseId);
        }
        throw error;
      }

      await refetchInstructorCourseReadModelsForCourseId(input.courseId);
    },
    [accountId]
  );

  return { recordCourseDayAttendance };
}

async function refetchInstructorCourseReadModelsForCourseId(courseId: string): Promise<void> {
  const assignment = useInstructorCourseStore
    .getState()
    .assignedCourses.find((course) => course.courseId === courseId);
  if (!assignment) {
    return;
  }
  await refetchInstructorCourseReadModels([assignment]);
}

export function isInstructorCourseAttendanceCommandError(
  error: unknown
): error is CanonicalCommandClientError {
  return error instanceof CanonicalCommandClientError;
}
