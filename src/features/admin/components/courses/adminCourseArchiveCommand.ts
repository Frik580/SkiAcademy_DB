import {
  AggregateRevisionSchema,
  CourseIdSchema,
  type AdminCourseListItem,
} from '@ski-academy/shared-domain';

export interface ArchiveCourseCommandSubmission {
  readonly kind: 'archive_course';
  readonly expectedRevision: number;
  readonly intent: {
    readonly courseId: ReturnType<typeof CourseIdSchema.parse>;
    readonly reasonExplanation: string;
  };
}

export interface ReactivateCourseCommandSubmission {
  readonly kind: 'reactivate_course';
  readonly expectedRevision: number;
  readonly intent: {
    readonly courseId: ReturnType<typeof CourseIdSchema.parse>;
    readonly reasonExplanation: string;
  };
}

/**
 * Build archive_course from compact admin_course_list v2 row metadata.
 * Uses authoritative courseId + Course aggregate revision only.
 */
export function buildArchiveCourseCommandFromListItem(
  course: Pick<AdminCourseListItem, 'courseId' | 'revision' | 'lifecycle' | 'authorizedActions'>,
  reasonExplanation = 'Admin course archive'
): ArchiveCourseCommandSubmission {
  if (course.lifecycle !== 'active') {
    throw new Error('Only an active Course can be archived.');
  }

  const archiveAction = course.authorizedActions.find((action) => action.kind === 'archive_course');
  if (!archiveAction) {
    throw new Error('Course archive is not authorized.');
  }
  const expectedRevision = AggregateRevisionSchema.parse(archiveAction.expectedRevision);

  return {
    kind: 'archive_course',
    expectedRevision,
    intent: {
      courseId: CourseIdSchema.parse(course.courseId),
      reasonExplanation,
    },
  };
}

/** Build reactivate_course only from the canonical action's OCC revision. */
export function buildReactivateCourseCommandFromListItem(
  course: Pick<AdminCourseListItem, 'courseId' | 'lifecycle' | 'authorizedActions'>,
  reasonExplanation = 'Admin course reactivation'
): ReactivateCourseCommandSubmission {
  if (course.lifecycle !== 'archived') {
    throw new Error('Only an archived Course can be reactivated.');
  }
  const action = course.authorizedActions.find(
    (candidate) => candidate.kind === 'reactivate_course'
  );
  if (!action) {
    throw new Error('Course reactivation is not authorized.');
  }
  return {
    kind: 'reactivate_course',
    expectedRevision: AggregateRevisionSchema.parse(action.expectedRevision),
    intent: {
      courseId: CourseIdSchema.parse(course.courseId),
      reasonExplanation,
    },
  };
}
