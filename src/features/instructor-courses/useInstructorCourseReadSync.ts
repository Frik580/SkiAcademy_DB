import { useCallback, useEffect, useRef } from 'react';
import {
  CourseIdSchema,
  type CourseId,
  type InstructorCourseEnrollmentRosterItem,
} from '@ski-academy/shared-domain';
import {
  queryCourseAttendanceReadModels,
  queryCourseEnrollmentReadModels,
  queryInstructorCourseAssignmentReadModels,
} from '../../lib/canonical/canonicalReadModelClient';
import type {
  InstructorAssignedCourseRef,
  InstructorCourseViewModel,
} from './instructorCourseContracts';
import { classifyInstructorCourseReadError } from './presentInstructorCourseReadError';
import { useInstructorCourseStore } from './instructorCourseStore';
import {
  buildInstructorCourseViewModel,
  mapInstructorCourseAssignmentReadModelsToAssignedCourses,
} from './instructorCourseViewModel';

interface CourseRefetchQueueState {
  tail: Promise<void>;
  latestEnqueueId: number;
}

const courseRefetchStates = new Map<string, CourseRefetchQueueState>();

function getCourseRefetchState(courseId: string): CourseRefetchQueueState {
  let state = courseRefetchStates.get(courseId);
  if (!state) {
    state = { tail: Promise.resolve(), latestEnqueueId: 0 };
    courseRefetchStates.set(courseId, state);
  }
  return state;
}

export function resetInstructorCourseRefetchQueuesForTests(): void {
  courseRefetchStates.clear();
}

function enqueueCourseRefetch<T>(
  courseId: string,
  task: (isAuthoritative: () => boolean) => Promise<T>,
  options?: { readonly supersedePending?: boolean }
): Promise<T> {
  const state = getCourseRefetchState(courseId);
  const enqueueId = state.latestEnqueueId + 1;
  state.latestEnqueueId = enqueueId;

  const waitFor: Promise<void> = options?.supersedePending ? Promise.resolve() : state.tail;
  const result = waitFor.then(async () => {
    const isAuthoritative = () => state.latestEnqueueId === enqueueId;
    if (!isAuthoritative()) {
      return undefined as T;
    }
    return task(isAuthoritative);
  });

  state.tail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export interface InstructorCourseReadSyncInput {
  readonly enabled: boolean;
  readonly accountId?: string;
  readonly instructorId?: string;
  readonly selectedCourseId?: string;
}

async function loadInstructorRosterEnrollments(
  courseId: CourseId
): Promise<readonly InstructorCourseEnrollmentRosterItem[]> {
  const items: InstructorCourseEnrollmentRosterItem[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const result = await queryCourseEnrollmentReadModels({
      scope: 'instructor_roster',
      courseId,
      ...(cursor ? { cursor } : {}),
    });
    if (result.scope !== 'instructor_roster') {
      break;
    }
    items.push(...result.items);
    hasMore = result.hasMore;
    cursor = result.nextCursor;
    if (hasMore && !cursor) {
      break;
    }
  }

  return items;
}

export function resolveInstructorCourseLoadTargets(input: {
  readonly assignedCourses: readonly InstructorAssignedCourseRef[];
  readonly selectedCourseId?: string;
}): InstructorAssignedCourseRef[] {
  if (input.selectedCourseId) {
    const selected = input.assignedCourses.find(
      (course) => course.courseId === input.selectedCourseId
    );
    return selected ? [selected] : [];
  }
  return [...input.assignedCourses];
}

export async function refetchInstructorCourseReadModels(
  targets: readonly InstructorAssignedCourseRef[],
  shouldCommit: () => boolean = () => true,
  options?: { readonly supersedePending?: boolean }
): Promise<void> {
  await Promise.all(
    targets.map((assignment) =>
      enqueueCourseRefetch(
        assignment.courseId,
        async (isAuthoritative) => {
          const parsedCourseId = CourseIdSchema.parse(assignment.courseId);
          const [rosterItems, attendanceResult] = await Promise.all([
            loadInstructorRosterEnrollments(parsedCourseId),
            queryCourseAttendanceReadModels({
              scope: 'instructor_roster',
              courseId: parsedCourseId,
            }),
          ]);
          if (!shouldCommit() || !isAuthoritative()) {
            return;
          }
          const viewModel = buildInstructorCourseViewModel({
            rosterItems,
            attendanceItems: attendanceResult.items,
            fallback: assignment,
          });
          if (viewModel) {
            useInstructorCourseStore
              .getState()
              .mergeCourses(
                new Map<string, InstructorCourseViewModel>([[assignment.courseId, viewModel]])
              );
          }
        },
        options
      )
    )
  );
}

export async function loadInstructorAssignedCourses(): Promise<InstructorAssignedCourseRef[]> {
  const result = await queryInstructorCourseAssignmentReadModels({
    scope: 'instructor_assigned',
  });
  return mapInstructorCourseAssignmentReadModelsToAssignedCourses(result.items);
}

export function useInstructorCourseReadSync(input: InstructorCourseReadSyncInput) {
  const { enabled, accountId, instructorId, selectedCourseId } = input;
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    const isCurrentRequest = () => requestGeneration.current === generation;
    if (!enabled || !accountId || !instructorId) {
      return;
    }

    useInstructorCourseStore.getState().setDiscoveryLoading(true);
    useInstructorCourseStore.getState().setRosterLoading(false);
    useInstructorCourseStore.getState().setError(undefined, undefined);
    let assignedCourses: InstructorAssignedCourseRef[] = [];
    try {
      assignedCourses = await loadInstructorAssignedCourses();
      if (!isCurrentRequest()) {
        return;
      }
      useInstructorCourseStore.getState().setAssignedCourses(assignedCourses);
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      const errorCode = classifyInstructorCourseReadError(error);
      useInstructorCourseStore
        .getState()
        .setError(
          error instanceof Error ? error.message : 'Failed to load instructor course read models.',
          errorCode
        );
      return;
    } finally {
      if (isCurrentRequest()) {
        useInstructorCourseStore.getState().setDiscoveryLoading(false);
      }
    }

    const targets = resolveInstructorCourseLoadTargets({
      assignedCourses,
      selectedCourseId,
    });
    if (targets.length === 0) {
      if (isCurrentRequest()) {
        useInstructorCourseStore.getState().setLoaded(true);
      }
      return;
    }

    useInstructorCourseStore.getState().setRosterLoading(true);
    try {
      await refetchInstructorCourseReadModels(targets, isCurrentRequest, {
        supersedePending: true,
      });
      if (!isCurrentRequest()) {
        return;
      }
      useInstructorCourseStore.getState().setLoaded(true);
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      const errorCode = classifyInstructorCourseReadError(error);
      useInstructorCourseStore
        .getState()
        .setError(
          error instanceof Error ? error.message : 'Failed to load instructor course read models.',
          errorCode
        );
    } finally {
      if (isCurrentRequest()) {
        useInstructorCourseStore.getState().setRosterLoading(false);
      }
    }
  }, [accountId, enabled, instructorId, selectedCourseId]);

  useEffect(() => {
    if (!enabled || !accountId || !instructorId) {
      useInstructorCourseStore.getState().reset();
      return;
    }
    void load();
    return () => {
      requestGeneration.current += 1;
    };
  }, [accountId, enabled, instructorId, load, selectedCourseId]);

  return { reload: load };
}
