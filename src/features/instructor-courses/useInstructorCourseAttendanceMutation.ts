import { useCallback, useRef, useState } from 'react';
import type { PresentedCanonicalCommandError } from './presentInstructorCourseCommandError';
import { presentCanonicalCommandError } from './presentInstructorCourseCommandError';
import {
  createRecordCourseDayAttendanceAttemptId,
  deriveRecordCourseDayAttendanceIdempotencyKey,
} from './deriveInstructorCourseIdempotencyKeys';
import type { RecordCourseDayAttendanceInput } from './instructorCourseContracts';
import {
  isInstructorCourseAttendanceCommandError,
  isInstructorCourseStaleRefreshError,
} from './useInstructorCourseAttendanceCommands';

export type InstructorCourseAttendanceActionInput = Omit<
  RecordCourseDayAttendanceInput,
  'idempotencyKey'
>;

export interface InstructorCourseAttendanceMutationState {
  readonly status: 'pending' | 'refreshing' | 'error';
  readonly attendanceStatus: InstructorCourseAttendanceActionInput['attendanceStatus'];
  readonly error?: PresentedCanonicalCommandError;
  readonly canRetry: boolean;
  readonly staleRefreshFailed?: boolean;
}

interface AttendanceOperation {
  readonly input: RecordCourseDayAttendanceInput;
}

type RecordAttendance = (input: RecordCourseDayAttendanceInput) => Promise<void>;
type RefreshAttendance = (courseId: string) => Promise<void>;

interface StaleRefreshFailure {
  readonly courseId: string;
  readonly state: InstructorCourseAttendanceMutationState;
}

export function instructorCourseAttendanceCellKey(input: {
  readonly enrollmentId: string;
  readonly courseDayId: string;
}): string {
  return `${input.enrollmentId}\u0000${input.courseDayId}`;
}

export function useInstructorCourseAttendanceMutation(
  recordAttendance: RecordAttendance,
  refreshAttendance?: RefreshAttendance
) {
  const [states, setStates] = useState<
    ReadonlyMap<string, InstructorCourseAttendanceMutationState>
  >(() => new Map());
  const operations = useRef(new Map<string, AttendanceOperation>());
  const staleRefreshFailures = useRef(new Map<string, StaleRefreshFailure>());
  const inFlightCells = useRef(new Set<string>());

  const updateState = useCallback(
    (key: string, state: InstructorCourseAttendanceMutationState | undefined) => {
      setStates((current) => {
        const next = new Map(current);
        if (state) {
          next.set(key, state);
        } else {
          next.delete(key);
        }
        return next;
      });
    },
    []
  );

  const execute = useCallback(
    async (key: string, operation: AttendanceOperation): Promise<void> => {
      if (inFlightCells.current.has(key)) {
        return;
      }

      inFlightCells.current.add(key);
      updateState(key, {
        status: 'pending',
        attendanceStatus: operation.input.attendanceStatus,
        canRetry: false,
      });

      try {
        await recordAttendance(operation.input);
        operations.current.delete(key);
        staleRefreshFailures.current.delete(key);
        updateState(key, undefined);
      } catch (error) {
        const presented = presentCanonicalCommandError(error);
        const staleRefreshFailed = isInstructorCourseStaleRefreshError(error);
        const canRetry =
          presented.code !== 'stale_version' &&
          isInstructorCourseAttendanceCommandError(error) &&
          error.retryable;

        if (!canRetry) {
          operations.current.delete(key);
        }
        const nextState: InstructorCourseAttendanceMutationState = {
          status: 'error',
          attendanceStatus: operation.input.attendanceStatus,
          error: presented,
          canRetry,
          ...(staleRefreshFailed ? { staleRefreshFailed: true } : {}),
        };
        if (staleRefreshFailed) {
          staleRefreshFailures.current.set(key, {
            courseId: operation.input.courseId,
            state: nextState,
          });
        } else {
          staleRefreshFailures.current.delete(key);
        }
        updateState(key, nextState);
      } finally {
        inFlightCells.current.delete(key);
      }
    },
    [recordAttendance, updateState]
  );

  const record = useCallback(
    async (input: InstructorCourseAttendanceActionInput): Promise<void> => {
      const key = instructorCourseAttendanceCellKey(input);
      if (inFlightCells.current.has(key) || staleRefreshFailures.current.has(key)) {
        return;
      }

      const attemptId = createRecordCourseDayAttendanceAttemptId();
      const operation: AttendanceOperation = {
        input: {
          ...input,
          idempotencyKey: deriveRecordCourseDayAttendanceIdempotencyKey(attemptId),
        },
      };
      operations.current.set(key, operation);
      await execute(key, operation);
    },
    [execute]
  );

  const retry = useCallback(
    async (input: { readonly enrollmentId: string; readonly courseDayId: string }) => {
      const key = instructorCourseAttendanceCellKey(input);
      const operation = operations.current.get(key);
      if (!operation) {
        return;
      }
      await execute(key, operation);
    },
    [execute]
  );

  const retryRefresh = useCallback(
    async (input: { readonly enrollmentId: string; readonly courseDayId: string }) => {
      const key = instructorCourseAttendanceCellKey(input);
      const failure = staleRefreshFailures.current.get(key);
      if (!failure || !refreshAttendance || inFlightCells.current.has(key)) {
        return;
      }

      inFlightCells.current.add(key);
      updateState(key, { ...failure.state, status: 'refreshing' });
      try {
        await refreshAttendance(failure.courseId);
        staleRefreshFailures.current.delete(key);
        updateState(key, undefined);
      } catch {
        updateState(key, failure.state);
      } finally {
        inFlightCells.current.delete(key);
      }
    },
    [refreshAttendance, updateState]
  );

  const getState = useCallback(
    (input: { readonly enrollmentId: string; readonly courseDayId: string }) =>
      states.get(instructorCourseAttendanceCellKey(input)),
    [states]
  );

  return { record, retry, retryRefresh, getState };
}
