import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
} from '@ski-academy/shared-domain';
import { useInstructorCourseStore } from '../../src/features/instructor-courses/instructorCourseStore';
import {
  createRecordCourseDayAttendanceAttemptId,
  deriveRecordCourseDayAttendanceIdempotencyKey,
} from '../../src/features/instructor-courses/deriveInstructorCourseIdempotencyKeys';

const executeAuthenticatedMock = vi.fn();
const queryEnrollmentMock = vi.fn();
const queryAttendanceMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) => executeAuthenticatedMock(...args),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseEnrollmentReadModels: (...args: unknown[]) => queryEnrollmentMock(...args),
  queryCourseAttendanceReadModels: (...args: unknown[]) => queryAttendanceMock(...args),
}));

import { useInstructorCourseAttendanceCommands } from '../../src/features/instructor-courses/useInstructorCourseAttendanceCommands';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';

const courseId = CourseIdSchema.parse('course_instructor_cmd_01');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_instructor_cmd_01');
const courseDayId = CourseDayIdSchema.parse('course_day_instructor_cmd_01');
const accountId = 'account_instructor_cmd_01';
const presentAttemptId = 'attempt_present_a';
const absentAttemptId = 'attempt_absent_b';
const presentAgainAttemptId = 'attempt_present_c';
const presentIdempotencyKey = deriveRecordCourseDayAttendanceIdempotencyKey(presentAttemptId);
const absentIdempotencyKey = deriveRecordCourseDayAttendanceIdempotencyKey(absentAttemptId);
const presentAgainIdempotencyKey =
  deriveRecordCourseDayAttendanceIdempotencyKey(presentAgainAttemptId);

describe('instructor course attendance commands', () => {
  beforeEach(() => {
    executeAuthenticatedMock.mockReset();
    queryEnrollmentMock.mockReset();
    queryAttendanceMock.mockReset();
    useInstructorCourseStore.getState().reset();
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

  it('submits record_course_day_attendance with instructor capability and revisions', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({ status: 'success', payload: {} });

    const { result } = renderHook(() => useInstructorCourseAttendanceCommands(accountId));
    await result.current.recordCourseDayAttendance({
      courseId,
      enrollmentId,
      courseDayId,
      attendanceStatus: 'present',
      expectedAttendanceRevision: 4,
      expectedEnrollmentRevision: 9,
      idempotencyKey: presentIdempotencyKey,
    });

    expect(executeAuthenticatedMock).toHaveBeenCalledWith(
      accountId,
      expect.objectContaining({
        kind: 'record_course_day_attendance',
        exercisedCapability: 'instructor',
        idempotencyKey: presentIdempotencyKey,
        intent: {
          courseEnrollmentId: enrollmentId,
          courseDayId,
          attendanceStatus: 'present',
          expectedAttendanceRevision: 4,
          expectedEnrollmentRevision: 9,
        },
      })
    );
    expect(queryEnrollmentMock).toHaveBeenCalledWith({
      scope: 'instructor_roster',
      courseId,
    });
    expect(queryAttendanceMock).toHaveBeenCalledWith({
      scope: 'instructor_roster',
      courseId,
    });
  });

  it('keeps idempotency key stable for retries of the same user action', () => {
    const first = deriveRecordCourseDayAttendanceIdempotencyKey(presentAttemptId);
    const second = deriveRecordCourseDayAttendanceIdempotencyKey(presentAttemptId);
    expect(first).toBe(second);
    expect(first).toBe('record-course-day-attendance:attempt_present_a');
  });

  it('uses distinct idempotency keys for present -> absent -> present transitions', () => {
    expect(presentIdempotencyKey).not.toBe(absentIdempotencyKey);
    expect(absentIdempotencyKey).not.toBe(presentAgainIdempotencyKey);
    expect(presentIdempotencyKey).not.toBe(presentAgainIdempotencyKey);
  });

  it('creates distinct attempt ids for separate user actions', () => {
    const first = createRecordCourseDayAttendanceAttemptId();
    const second = createRecordCourseDayAttendanceAttemptId();
    expect(first).not.toBe(second);
    expect(deriveRecordCourseDayAttendanceIdempotencyKey(first)).not.toBe(
      deriveRecordCourseDayAttendanceIdempotencyKey(second)
    );
  });

  it('submits present -> absent -> present with distinct command identities', async () => {
    executeAuthenticatedMock
      .mockResolvedValueOnce({ status: 'success', payload: {} })
      .mockResolvedValueOnce({ status: 'success', payload: {} })
      .mockResolvedValueOnce({ status: 'success', payload: {} })
      .mockResolvedValueOnce({ status: 'success', payload: {} });

    const { result } = renderHook(() => useInstructorCourseAttendanceCommands(accountId));

    await result.current.recordCourseDayAttendance({
      courseId,
      enrollmentId,
      courseDayId,
      attendanceStatus: 'present',
      idempotencyKey: presentIdempotencyKey,
    });
    await result.current.recordCourseDayAttendance({
      courseId,
      enrollmentId,
      courseDayId,
      attendanceStatus: 'present',
      idempotencyKey: presentIdempotencyKey,
    });
    await result.current.recordCourseDayAttendance({
      courseId,
      enrollmentId,
      courseDayId,
      attendanceStatus: 'absent',
      idempotencyKey: absentIdempotencyKey,
    });
    await result.current.recordCourseDayAttendance({
      courseId,
      enrollmentId,
      courseDayId,
      attendanceStatus: 'present',
      idempotencyKey: presentAgainIdempotencyKey,
    });

    expect(executeAuthenticatedMock).toHaveBeenCalledTimes(4);
    expect(executeAuthenticatedMock.mock.calls[0]?.[1]).toMatchObject({
      idempotencyKey: presentIdempotencyKey,
      intent: { attendanceStatus: 'present' },
    });
    expect(executeAuthenticatedMock.mock.calls[1]?.[1]).toMatchObject({
      idempotencyKey: presentIdempotencyKey,
      intent: { attendanceStatus: 'present' },
    });
    expect(executeAuthenticatedMock.mock.calls[2]?.[1]).toMatchObject({
      idempotencyKey: absentIdempotencyKey,
      intent: { attendanceStatus: 'absent' },
    });
    expect(executeAuthenticatedMock.mock.calls[3]?.[1]).toMatchObject({
      idempotencyKey: presentAgainIdempotencyKey,
      intent: { attendanceStatus: 'present' },
    });
  });

  it('refetches canonical read models after stale_version', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'error',
      error: {
        code: 'stale_version',
        message: 'Stale version',
        retryable: true,
        correlationId: 'correlation_stale',
        currentRevision: 10,
      },
    });

    const { result } = renderHook(() => useInstructorCourseAttendanceCommands(accountId));
    await expect(
      result.current.recordCourseDayAttendance({
        courseId,
        enrollmentId,
        courseDayId,
        attendanceStatus: 'present',
        expectedAttendanceRevision: 4,
        idempotencyKey: presentIdempotencyKey,
      })
    ).rejects.toBeInstanceOf(CanonicalCommandClientError);

    expect(queryEnrollmentMock).toHaveBeenCalledWith({
      scope: 'instructor_roster',
      courseId,
    });
    expect(queryAttendanceMock).toHaveBeenCalledWith({
      scope: 'instructor_roster',
      courseId,
    });
  });

  it('preserves authorization and transition canonical error codes', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'error',
      error: {
        code: 'forbidden',
        message: 'Forbidden',
        retryable: false,
        correlationId: 'correlation_forbidden',
      },
    });

    const { result } = renderHook(() => useInstructorCourseAttendanceCommands(accountId));
    await expect(
      result.current.recordCourseDayAttendance({
        courseId,
        enrollmentId,
        courseDayId,
        attendanceStatus: 'absent',
        idempotencyKey: absentIdempotencyKey,
      })
    ).rejects.toMatchObject({ code: 'forbidden' });

    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'error',
      error: {
        code: 'invalid_transition',
        message: 'Invalid transition',
        retryable: false,
        correlationId: 'correlation_invalid_transition',
      },
    });

    await expect(
      result.current.recordCourseDayAttendance({
        courseId,
        enrollmentId,
        courseDayId,
        attendanceStatus: 'absent',
        idempotencyKey: deriveRecordCourseDayAttendanceIdempotencyKey('attempt_absent_retry'),
      })
    ).rejects.toMatchObject({ code: 'invalid_transition' });
  });
});
