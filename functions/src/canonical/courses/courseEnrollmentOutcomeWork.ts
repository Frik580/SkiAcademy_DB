import { z } from 'zod';
import {
  CanonicalTimestampSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  SystemActorIdSchema,
  buildScheduledCommandIdempotencyKey,
  canonicalDeterministicHash,
  courseDayOccurrenceId,
  courseEnrollmentOutcomeDueAt,
  normalizeFirestoreDocument,
  systemCommandActor,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type Course,
  type CourseDay,
  type CourseEnrollment,
  DataScopeSchema,
  TestSessionIdSchema,
  assertSameCanonicalScope,
  canonicalScopeFields,
  parsePersistedCanonicalScope,
} from '@ski-academy/shared-domain';

export const COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION = 'course_enrollment_outcome_work';
export const COURSE_ENROLLMENT_OUTCOME_SYSTEM_ACTOR_ID = SystemActorIdSchema.parse(
  'system_actor_resolve_course_enrollment_outcome'
);

const CourseEnrollmentOutcomeWorkBaseSchema = z.object({
  dataScope: DataScopeSchema.optional(),
  testSessionId: TestSessionIdSchema.optional(),
  enrollmentId: CourseEnrollmentIdSchema,
  courseId: CourseIdSchema,
  participantId: ParticipantIdSchema,
  finalCourseDayId: CourseDayIdSchema,
  finalOccurrenceId: OccurrenceIdSchema,
  sourceCourseScheduleRevision: z.number().int().min(1),
  sourceFinalCourseDayRevision: z.number().int().min(1),
  sourceEnrollmentRevision: z.number().int().min(1),
  workRevision: z.number().int().min(1),
  updatedAt: CanonicalTimestampSchema,
});

export const CourseEnrollmentOutcomeWorkSchema = z.discriminatedUnion('status', [
  CourseEnrollmentOutcomeWorkBaseSchema.extend({
    status: z.literal('pending'),
    dueAt: CanonicalTimestampSchema,
    attemptCount: z.number().int().min(0),
  }).strict(),
  CourseEnrollmentOutcomeWorkBaseSchema.extend({
    status: z.literal('complete'),
    completedReason: z.enum(['lifecycle_ineligible', 'deadline_processed']),
  }).strict(),
  CourseEnrollmentOutcomeWorkBaseSchema.extend({
    status: z.literal('blocked'),
    blockedReason: z.enum(['invalid_enrollment', 'invalid_work', 'invalid_schedule']),
  }).strict(),
]);

export type CourseEnrollmentOutcomeWork = Readonly<
  z.output<typeof CourseEnrollmentOutcomeWorkSchema>
>;
export type PendingCourseEnrollmentOutcomeWork = Extract<
  CourseEnrollmentOutcomeWork,
  { readonly status: 'pending' }
>;

export function courseEnrollmentOutcomeWorkPath(
  enrollmentId: CourseEnrollment['enrollmentId']
): string {
  return `${COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION}/${enrollmentId}`;
}

export function parseCourseEnrollmentOutcomeWork(
  data: Record<string, unknown> | undefined
): CourseEnrollmentOutcomeWork | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = CourseEnrollmentOutcomeWorkSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

function workBase(input: {
  readonly enrollment: CourseEnrollment;
  readonly course: Course;
  readonly finalCourseDay: CourseDay;
  readonly workRevision: number;
  readonly updatedAt: CanonicalTimestamp;
}) {
  const scope = parsePersistedCanonicalScope(input.enrollment);
  assertSameCanonicalScope(scope, input.course);
  assertSameCanonicalScope(scope, input.finalCourseDay);
  return {
    ...canonicalScopeFields(scope),
    enrollmentId: input.enrollment.enrollmentId,
    courseId: input.enrollment.courseId,
    participantId: input.enrollment.participantId,
    finalCourseDayId: input.finalCourseDay.courseDayId,
    finalOccurrenceId: courseDayOccurrenceId(input.finalCourseDay),
    sourceCourseScheduleRevision: input.course.scheduleProjection.courseScheduleRevision,
    sourceFinalCourseDayRevision: input.finalCourseDay.revision,
    sourceEnrollmentRevision: input.enrollment.revision,
    workRevision: input.workRevision,
    updatedAt: input.updatedAt,
  } as const;
}

export function pendingCourseEnrollmentOutcomeWork(input: {
  readonly enrollment: CourseEnrollment;
  readonly course: Course;
  readonly finalCourseDay: CourseDay;
  readonly workRevision: number;
  readonly updatedAt: CanonicalTimestamp;
  readonly attemptCount?: number;
}): PendingCourseEnrollmentOutcomeWork {
  return CourseEnrollmentOutcomeWorkSchema.parse({
    ...workBase(input),
    status: 'pending',
    dueAt: courseEnrollmentOutcomeDueAt(input.finalCourseDay.interval.endsAt),
    attemptCount: input.attemptCount ?? 0,
  }) as PendingCourseEnrollmentOutcomeWork;
}

export function completeCourseEnrollmentOutcomeWork(input: {
  readonly enrollment: CourseEnrollment;
  readonly course: Course;
  readonly finalCourseDay: CourseDay;
  readonly completedReason: 'lifecycle_ineligible' | 'deadline_processed';
  readonly workRevision: number;
  readonly updatedAt: CanonicalTimestamp;
}): CourseEnrollmentOutcomeWork {
  return CourseEnrollmentOutcomeWorkSchema.parse({
    ...workBase(input),
    status: 'complete',
    completedReason: input.completedReason,
  });
}

export function completePendingCourseEnrollmentOutcomeWork(
  work: PendingCourseEnrollmentOutcomeWork,
  input: {
    readonly updatedAt: CanonicalTimestamp;
    readonly completedReason: 'lifecycle_ineligible' | 'deadline_processed';
  }
): CourseEnrollmentOutcomeWork {
  const base = CourseEnrollmentOutcomeWorkBaseSchema.parse(work);
  return CourseEnrollmentOutcomeWorkSchema.parse({
    ...base,
    ...canonicalScopeFields(parsePersistedCanonicalScope(work)),
    status: 'complete',
    completedReason: input.completedReason,
    workRevision: work.workRevision + 1,
    updatedAt: input.updatedAt,
  });
}

export function blockPendingCourseEnrollmentOutcomeWork(
  work: PendingCourseEnrollmentOutcomeWork,
  input: {
    readonly updatedAt: CanonicalTimestamp;
    readonly blockedReason: 'invalid_enrollment' | 'invalid_work' | 'invalid_schedule';
  }
): CourseEnrollmentOutcomeWork {
  const base = CourseEnrollmentOutcomeWorkBaseSchema.parse(work);
  return CourseEnrollmentOutcomeWorkSchema.parse({
    ...base,
    ...canonicalScopeFields(parsePersistedCanonicalScope(work)),
    status: 'blocked',
    blockedReason: input.blockedReason,
    workRevision: work.workRevision + 1,
    updatedAt: input.updatedAt,
  });
}

export function resolveCourseEnrollmentOutcomeEnvelope(
  work: Pick<
    PendingCourseEnrollmentOutcomeWork,
    'enrollmentId' | 'finalOccurrenceId' | 'sourceEnrollmentRevision'
  >
): CommandEnvelope<'resolve_attendance_outcome'> {
  return {
    kind: 'resolve_attendance_outcome',
    context: {
      actor: systemCommandActor(COURSE_ENROLLMENT_OUTCOME_SYSTEM_ACTOR_ID),
      exercisedCapability: 'system',
      idempotencyKey: buildScheduledCommandIdempotencyKey({
        systemActorId: COURSE_ENROLLMENT_OUTCOME_SYSTEM_ACTOR_ID,
        commandKind: 'resolve_attendance_outcome',
        subjectId: work.enrollmentId,
        occurrenceId: work.finalOccurrenceId,
        deadlineId: `instructor_window_revision_${work.sourceEnrollmentRevision}`,
      }),
      correlationId: CorrelationIdSchema.parse(
        canonicalDeterministicHash([
          'resolve-course-enrollment-outcome-sweep:v1',
          work.enrollmentId,
          work.finalOccurrenceId,
          String(work.sourceEnrollmentRevision),
        ])
      ),
      source: 'scheduler',
    },
    intent: { subjectKind: 'course_enrollment', subjectId: work.enrollmentId },
  };
}
