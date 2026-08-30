import { useCallback, useEffect } from 'react';
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
import type { InstructorAssignedCourseRef, InstructorCourseViewModel } from './instructorCourseContracts';
import { classifyInstructorCourseReadError } from './presentInstructorCourseReadError';
import { useInstructorCourseStore } from './instructorCourseStore';
import {
  buildInstructorCourseViewModel,
  mapInstructorCourseAssignmentReadModelsToAssignedCourses,
  mergeInstructorCourseViewModels,
} from './instructorCourseViewModel';

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
  targets: readonly InstructorAssignedCourseRef[]
): Promise<void> {
  const nextCourses = new Map<string, InstructorCourseViewModel>();

  await Promise.all(
    targets.map(async (assignment) => {
      const parsedCourseId = CourseIdSchema.parse(assignment.courseId);
      const [rosterItems, attendanceResult] = await Promise.all([
        loadInstructorRosterEnrollments(parsedCourseId),
        queryCourseAttendanceReadModels({
          scope: 'instructor_roster',
          courseId: parsedCourseId,
        }),
      ]);
      const viewModel = buildInstructorCourseViewModel({
        rosterItems,
        attendanceItems: attendanceResult.items,
        fallback: assignment,
      });
      if (viewModel) {
        nextCourses.set(assignment.courseId, viewModel);
      }
    })
  );

  const state = useInstructorCourseStore.getState();
  const merged = mergeInstructorCourseViewModels(state.coursesById, nextCourses);
  useInstructorCourseStore.getState().mergeCourses(merged);
}

export async function loadInstructorAssignedCourses(): Promise<InstructorAssignedCourseRef[]> {
  const result = await queryInstructorCourseAssignmentReadModels({
    scope: 'instructor_assigned',
  });
  return mapInstructorCourseAssignmentReadModelsToAssignedCourses(result.items);
}

export function useInstructorCourseReadSync(input: InstructorCourseReadSyncInput) {
  const { enabled, accountId, instructorId, selectedCourseId } = input;

  const load = useCallback(async () => {
    if (!enabled || !accountId || !instructorId) {
      return;
    }

    useInstructorCourseStore.getState().setDiscoveryLoading(true);
    useInstructorCourseStore.getState().setRosterLoading(false);
    useInstructorCourseStore.getState().setError(undefined, undefined);
    let assignedCourses: InstructorAssignedCourseRef[] = [];
    try {
      assignedCourses = await loadInstructorAssignedCourses();
      useInstructorCourseStore.getState().setAssignedCourses(assignedCourses);
    } catch (error) {
      const errorCode = classifyInstructorCourseReadError(error);
      useInstructorCourseStore
        .getState()
        .setError(
          error instanceof Error ? error.message : 'Failed to load instructor course read models.',
          errorCode
        );
      return;
    } finally {
      useInstructorCourseStore.getState().setDiscoveryLoading(false);
    }

    const targets = resolveInstructorCourseLoadTargets({
      assignedCourses,
      selectedCourseId,
    });
    if (targets.length === 0) {
      useInstructorCourseStore.getState().setLoaded(true);
      return;
    }

    useInstructorCourseStore.getState().setRosterLoading(true);
    try {
      await refetchInstructorCourseReadModels(targets);
      useInstructorCourseStore.getState().setLoaded(true);
    } catch (error) {
      const errorCode = classifyInstructorCourseReadError(error);
      useInstructorCourseStore
        .getState()
        .setError(
          error instanceof Error ? error.message : 'Failed to load instructor course read models.',
          errorCode
        );
    } finally {
      useInstructorCourseStore.getState().setRosterLoading(false);
    }
  }, [accountId, enabled, instructorId, selectedCourseId]);

  useEffect(() => {
    if (!enabled || !accountId || !instructorId) {
      useInstructorCourseStore.getState().reset();
      return;
    }
    void load();
  }, [accountId, enabled, instructorId, load, selectedCourseId]);

  return { reload: load };
}
