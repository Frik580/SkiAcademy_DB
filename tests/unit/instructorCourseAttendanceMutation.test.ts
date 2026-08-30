import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';
import { InstructorCourseStaleRefreshError } from '../../src/features/instructor-courses/useInstructorCourseAttendanceCommands';
import {
  instructorCourseAttendanceCellKey,
  useInstructorCourseAttendanceMutation,
  type InstructorCourseAttendanceActionInput,
} from '../../src/features/instructor-courses/useInstructorCourseAttendanceMutation';

const baseInput: InstructorCourseAttendanceActionInput = {
  courseId: 'course_mutation_01',
  enrollmentId: 'enrollment_mutation_01',
  courseDayId: 'course_day_mutation_01',
  attendanceStatus: 'present',
  expectedEnrollmentRevision: 7,
};

describe('useInstructorCourseAttendanceMutation', () => {
  it('submits missing -> present and missing -> absent as distinct user operations', async () => {
    const recordAttendance = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useInstructorCourseAttendanceMutation(recordAttendance));

    await act(async () => {
      await result.current.record(baseInput);
      await result.current.record({ ...baseInput, attendanceStatus: 'absent' });
    });

    expect(recordAttendance).toHaveBeenCalledTimes(2);
    expect(recordAttendance.mock.calls[0]?.[0]).toMatchObject({
      attendanceStatus: 'present',
      expectedEnrollmentRevision: 7,
    });
    expect(recordAttendance.mock.calls[0]?.[0]).not.toHaveProperty('expectedAttendanceRevision');
    expect(recordAttendance.mock.calls[1]?.[0]).toMatchObject({ attendanceStatus: 'absent' });
    expect(recordAttendance.mock.calls[0]?.[0].idempotencyKey).not.toBe(
      recordAttendance.mock.calls[1]?.[0].idempotencyKey
    );
  });

  it('passes the current attendance revision through present -> absent and absent -> present', async () => {
    const recordAttendance = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useInstructorCourseAttendanceMutation(recordAttendance));

    await act(async () => {
      await result.current.record({
        ...baseInput,
        attendanceStatus: 'absent',
        expectedAttendanceRevision: 4,
      });
      await result.current.record({
        ...baseInput,
        attendanceStatus: 'present',
        expectedAttendanceRevision: 5,
      });
    });

    expect(recordAttendance.mock.calls[0]?.[0]).toMatchObject({
      attendanceStatus: 'absent',
      expectedAttendanceRevision: 4,
    });
    expect(recordAttendance.mock.calls[1]?.[0]).toMatchObject({
      attendanceStatus: 'present',
      expectedAttendanceRevision: 5,
    });
  });

  it('creates three command identities for present -> absent -> present', async () => {
    const recordAttendance = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useInstructorCourseAttendanceMutation(recordAttendance));

    await act(async () => {
      await result.current.record(baseInput);
      await result.current.record({ ...baseInput, attendanceStatus: 'absent' });
      await result.current.record(baseInput);
    });

    const keys = recordAttendance.mock.calls.map((call) => call[0].idempotencyKey);
    expect(new Set(keys).size).toBe(3);
  });

  it('retries a retryable operation with the same command identity', async () => {
    const recordAttendance = vi
      .fn()
      .mockRejectedValueOnce(
        new CanonicalCommandClientError('internal', {
          correlationId: 'correlation_retry',
          retryable: true,
        })
      )
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useInstructorCourseAttendanceMutation(recordAttendance));

    await act(async () => {
      await result.current.record(baseInput);
    });
    expect(result.current.getState(baseInput)).toMatchObject({
      status: 'error',
      canRetry: true,
    });

    await act(async () => {
      await result.current.retry(baseInput);
    });

    expect(recordAttendance).toHaveBeenCalledTimes(2);
    expect(recordAttendance.mock.calls[1]?.[0].idempotencyKey).toBe(
      recordAttendance.mock.calls[0]?.[0].idempotencyKey
    );
    expect(result.current.getState(baseInput)).toBeUndefined();
  });

  it('does not replay stale_version and uses a fresh identity for the next user action', async () => {
    const recordAttendance = vi
      .fn()
      .mockRejectedValueOnce(
        new CanonicalCommandClientError('stale_version', {
          correlationId: 'correlation_stale',
          currentRevision: 8,
          retryable: true,
        })
      )
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useInstructorCourseAttendanceMutation(recordAttendance));

    await act(async () => {
      await result.current.record({ ...baseInput, expectedAttendanceRevision: 4 });
    });
    const staleKey = recordAttendance.mock.calls[0]?.[0].idempotencyKey;
    expect(result.current.getState(baseInput)).toMatchObject({
      status: 'error',
      canRetry: false,
      error: { code: 'stale_version', shouldRefresh: true },
    });

    await act(async () => {
      await result.current.retry(baseInput);
    });
    expect(recordAttendance).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.record({ ...baseInput, expectedAttendanceRevision: 8 });
    });
    expect(recordAttendance.mock.calls[1]?.[0]).toMatchObject({
      expectedAttendanceRevision: 8,
    });
    expect(recordAttendance.mock.calls[1]?.[0].idempotencyKey).not.toBe(staleKey);
  });

  it('blocks new mutations until a failed stale refetch is retried successfully', async () => {
    const staleError = new CanonicalCommandClientError('stale_version', {
      correlationId: 'correlation_stale_refresh_failed',
      currentRevision: 8,
      retryable: true,
    });
    const recordAttendance = vi
      .fn()
      .mockRejectedValueOnce(
        new InstructorCourseStaleRefreshError(staleError, new Error('read unavailable'))
      )
      .mockResolvedValueOnce(undefined);
    const refreshAttendance = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useInstructorCourseAttendanceMutation(recordAttendance, refreshAttendance)
    );

    await act(async () => {
      await result.current.record({ ...baseInput, expectedAttendanceRevision: 4 });
    });
    expect(result.current.getState(baseInput)).toMatchObject({
      status: 'error',
      staleRefreshFailed: true,
      error: { code: 'stale_version' },
    });

    await act(async () => {
      await result.current.record({ ...baseInput, expectedAttendanceRevision: 8 });
    });
    expect(recordAttendance).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.retryRefresh(baseInput);
    });
    expect(refreshAttendance).toHaveBeenCalledWith(baseInput.courseId);
    expect(result.current.getState(baseInput)).toBeUndefined();

    await act(async () => {
      await result.current.record({ ...baseInput, expectedAttendanceRevision: 8 });
    });
    expect(recordAttendance).toHaveBeenCalledTimes(2);
    expect(recordAttendance.mock.calls[1]?.[0].idempotencyKey).not.toBe(
      recordAttendance.mock.calls[0]?.[0].idempotencyKey
    );
  });

  it.each(['forbidden', 'invalid_transition'] as const)(
    'preserves a cell-scoped %s error',
    async (code) => {
      const recordAttendance = vi.fn().mockRejectedValue(
        new CanonicalCommandClientError(code, {
          correlationId: `correlation_${code}`,
          retryable: false,
        })
      );
      const { result } = renderHook(() => useInstructorCourseAttendanceMutation(recordAttendance));

      await act(async () => {
        await result.current.record(baseInput);
      });

      expect(result.current.getState(baseInput)).toMatchObject({
        status: 'error',
        canRetry: false,
        error: { code },
      });
    }
  );

  it('scopes pending state and conflicting-operation guards to enrollment + course day', async () => {
    let resolveFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const recordAttendance = vi
      .fn()
      .mockReturnValueOnce(firstPending)
      .mockResolvedValueOnce(undefined);
    const secondCell = {
      ...baseInput,
      enrollmentId: 'enrollment_mutation_02',
    };
    const { result } = renderHook(() => useInstructorCourseAttendanceMutation(recordAttendance));

    let firstOperation: Promise<void> | undefined;
    act(() => {
      firstOperation = result.current.record(baseInput);
    });
    await waitFor(() => {
      expect(result.current.getState(baseInput)?.status).toBe('pending');
    });

    await act(async () => {
      await result.current.record({ ...baseInput, attendanceStatus: 'absent' });
      await result.current.record(secondCell);
    });

    expect(recordAttendance).toHaveBeenCalledTimes(2);
    expect(result.current.getState(baseInput)?.status).toBe('pending');
    expect(result.current.getState(secondCell)).toBeUndefined();
    expect(instructorCourseAttendanceCellKey(baseInput)).not.toBe(
      instructorCourseAttendanceCellKey(secondCell)
    );

    await act(async () => {
      resolveFirst?.();
      await firstOperation;
    });
    expect(result.current.getState(baseInput)).toBeUndefined();
  });
});
