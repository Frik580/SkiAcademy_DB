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

/**
 * Detail/roster/attendance loads only for an explicitly selected course.
 * Discovery (assigned list) is separate — never eager-load all assigned courses.
 */
export function resolveInstructorCourseLoadTargets(input: {
  readonly assignedCourses: readonly InstructorAssignedCourseRef[];
  readonly selectedCourseId?: string;
}): InstructorAssignedCourseRef[] {
  if (!input.selectedCourseId) {
    return [];
  }
  const selected = input.assignedCourses.find(
    (course) => course.courseId === input.selectedCourseId
  );
  return selected ? [selected] : [];
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
  const discoveryGeneration = useRef(0);
  const rosterGeneration = useRef(0);
  const assignedCourses = useInstructorCourseStore((state) => state.assignedCourses);

  const loadDiscovery = useCallback(async () => {
    const generation = ++discoveryGeneration.current;
    const isCurrent = () => discoveryGeneration.current === generation;
    if (!enabled || !accountId || !instructorId) {
      return;
    }

    useInstructorCourseStore.getState().setDiscoveryLoading(true);
    useInstructorCourseStore.getState().setError(undefined, undefined);
    try {
      const nextAssigned = await loadInstructorAssignedCourses();
      if (!isCurrent()) {
        return;
      }
      useInstructorCourseStore.getState().setAssignedCourses(nextAssigned);
      if (nextAssigned.length === 0) {
        useInstructorCourseStore.getState().setLoaded(true);
      }
    } catch (error) {
      if (!isCurrent()) {
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
      if (isCurrent()) {
        useInstructorCourseStore.getState().setDiscoveryLoading(false);
      }
    }
  }, [accountId, enabled, instructorId]);

  const loadSelectedRoster = useCallback(async () => {
    const generation = ++rosterGeneration.current;
    const isCurrent = () => rosterGeneration.current === generation;
    if (!enabled || !accountId || !instructorId || !selectedCourseId) {
      return;
    }

    const targets = resolveInstructorCourseLoadTargets({
      assignedCourses: useInstructorCourseStore.getState().assignedCourses,
      selectedCourseId,
    });
    if (targets.length === 0) {
      return;
    }

    useInstructorCourseStore.getState().setRosterLoading(true);
    useInstructorCourseStore.getState().setError(undefined, undefined);
    try {
      await refetchInstructorCourseReadModels(targets, isCurrent, {
        supersedePending: true,
      });
      if (!isCurrent()) {
        return;
      }
      useInstructorCourseStore.getState().setLoaded(true);
    } catch (error) {
      if (!isCurrent()) {
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
      if (isCurrent()) {
        useInstructorCourseStore.getState().setRosterLoading(false);
      }
    }
  }, [accountId, enabled, instructorId, selectedCourseId]);

  const load = useCallback(async () => {
    await loadDiscovery();
    await loadSelectedRoster();
  }, [loadDiscovery, loadSelectedRoster]);

  useEffect(() => {
    if (!enabled || !accountId || !instructorId) {
      useInstructorCourseStore.getState().reset();
      return;
    }
    void loadDiscovery();
    return () => {
      discoveryGeneration.current += 1;
    };
  }, [accountId, enabled, instructorId, loadDiscovery]);

  useEffect(() => {
    if (!enabled || !accountId || !instructorId || !selectedCourseId) {
      return;
    }
    if (!assignedCourses.some((course) => course.courseId === selectedCourseId)) {
      return;
    }
    void loadSelectedRoster();
    return () => {
      rosterGeneration.current += 1;
    };
  }, [accountId, assignedCourses, enabled, instructorId, loadSelectedRoster, selectedCourseId]);

  return { reload: load };
}
