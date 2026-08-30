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
  const refetchCourseAttendance = useCallback(
    (courseId: string) => refetchInstructorCourseReadModelsForCourseId(courseId),
    []
  );
  const recordCourseDayAttendance = useCallback(
    async (input: RecordCourseDayAttendanceInput): Promise<void> => {
      if (!accountId) {
        throw new Error('Authentication is required.');
      }

      let result;
      try {
        result = await executeAuthenticatedCanonicalCommand(accountId, {
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
      } catch (error) {
        if (isInstructorCourseAttendanceCommandError(error) && error.code === 'stale_version') {
          await refetchAfterStaleVersion(input.courseId, error);
        }
        throw error;
      }

      const error = mapCanonicalCommandResultError(result);
      if (error) {
        if (error.code === 'stale_version') {
          await refetchAfterStaleVersion(input.courseId, error);
        }
        throw error;
      }

      await refetchInstructorCourseReadModelsForCourseId(input.courseId);
    },
    [accountId]
  );

  return { recordCourseDayAttendance, refetchCourseAttendance };
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

async function refetchAfterStaleVersion(
  courseId: string,
  staleError: CanonicalCommandClientError
): Promise<void> {
  try {
    await refetchInstructorCourseReadModelsForCourseId(courseId);
  } catch (refreshError) {
    throw new InstructorCourseStaleRefreshError(staleError, refreshError);
  }
}

export class InstructorCourseStaleRefreshError extends CanonicalCommandClientError {
  readonly refreshError: unknown;

  constructor(staleError: CanonicalCommandClientError, refreshError: unknown) {
    super('stale_version', {
      correlationId: staleError.correlationId,
      currentRevision: staleError.currentRevision,
      details: staleError.details,
      retryable: false,
      cause: staleError,
    });
    this.name = 'InstructorCourseStaleRefreshError';
    this.refreshError = refreshError;
  }
}

export function isInstructorCourseStaleRefreshError(
  error: unknown
): error is InstructorCourseStaleRefreshError {
  return error instanceof InstructorCourseStaleRefreshError;
}

export function isInstructorCourseAttendanceCommandError(
  error: unknown
): error is CanonicalCommandClientError {
  return error instanceof CanonicalCommandClientError;
}
