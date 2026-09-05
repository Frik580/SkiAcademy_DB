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
  const expectedRevision = AggregateRevisionSchema.parse(
    archiveAction?.expectedRevision ?? course.revision
  );

  return {
    kind: 'archive_course',
    expectedRevision,
    intent: {
      courseId: CourseIdSchema.parse(course.courseId),
      reasonExplanation,
    },
  };
}
