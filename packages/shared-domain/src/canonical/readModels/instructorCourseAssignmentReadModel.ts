import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { CourseDayIdSchema, CourseIdSchema, InstructorIdSchema, TestSessionIdSchema } from '../identifiers';
import { CourseScheduleProjectionReadModelSchema } from './courseDayScheduleProjection';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from '../primitives';

export const INSTRUCTOR_COURSE_ASSIGNMENT_READ_SCOPES = ['instructor_assigned'] as const;
export type InstructorCourseAssignmentReadScope =
  (typeof INSTRUCTOR_COURSE_ASSIGNMENT_READ_SCOPES)[number];

export const InstructorCourseAssignmentReadScopeSchema = z.enum(
  INSTRUCTOR_COURSE_ASSIGNMENT_READ_SCOPES
);

export const INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_PAGE_SIZE_DEFAULT = 25;
export const INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_PAGE_SIZE_MAX = 50;
/** Max Firestore docs scanned per discovery stream per page request (roster + days). */
export const INSTRUCTOR_COURSE_ASSIGNMENT_DISCOVERY_SCAN_CEILING = 250;

export const InstructorCourseAssignmentReadModelSchema = z
  .object({
    courseId: CourseIdSchema,
    revision: AggregateRevisionSchema,
    title: z.string().trim().min(1).max(200),
    courseSchedule: CourseScheduleProjectionReadModelSchema,
    assignedCourseDayIds: z.array(CourseDayIdSchema).min(1).max(64),
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type InstructorCourseAssignmentReadModel = z.output<
  typeof InstructorCourseAssignmentReadModelSchema
>;

export const InstructorCourseAssignmentReadModelCursorReadScopeSchema = z.discriminatedUnion(
  'dataScope',
  [
    z.object({ dataScope: z.literal('live') }).strict(),
    z.object({ dataScope: z.literal('test'), testSessionId: TestSessionIdSchema }).strict(),
  ]
);

export type InstructorCourseAssignmentReadModelCursorReadScope = z.output<
  typeof InstructorCourseAssignmentReadModelCursorReadScopeSchema
>;

const InstructorCourseAssignmentSortKeySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    courseId: CourseIdSchema,
  })
  .strict();

export const InstructorCourseAssignmentReadModelCursorSchema = z
  .object({
    instructorId: InstructorIdSchema,
    readScope: InstructorCourseAssignmentReadModelCursorReadScopeSchema,
    roster: z
      .object({
        exhausted: z.boolean(),
        title: z.string().trim().min(1).max(200).optional(),
        documentId: CourseIdSchema.optional(),
      })
      .strict(),
    days: z
      .object({
        exhausted: z.boolean(),
        startsAtSeconds: z.number().int().nonnegative().optional(),
        startsAtNanoseconds: z.number().int().nonnegative().max(999_999_999).optional(),
        courseDayId: CourseDayIdSchema.optional(),
      })
      .strict(),
    lastEmitted: InstructorCourseAssignmentSortKeySchema.optional(),
  })
  .strict();

export type InstructorCourseAssignmentReadModelCursor = z.output<
  typeof InstructorCourseAssignmentReadModelCursorSchema
>;

export function compareInstructorCourseAssignmentSortKeys(
  left: Readonly<{ title: string; courseId: string }>,
  right: Readonly<{ title: string; courseId: string }>
): number {
  const titleCompare = left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
  return titleCompare !== 0 ? titleCompare : left.courseId.localeCompare(right.courseId);
}

export function encodeInstructorCourseAssignmentReadModelCursor(
  cursor: InstructorCourseAssignmentReadModelCursor
): string {
  return Buffer.from(
    JSON.stringify(InstructorCourseAssignmentReadModelCursorSchema.parse(cursor)),
    'utf8'
  ).toString('base64url');
}

export function decodeInstructorCourseAssignmentReadModelCursor(
  cursor: string
): InstructorCourseAssignmentReadModelCursor | undefined {
  try {
    const parsed = InstructorCourseAssignmentReadModelCursorSchema.safeParse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export const QueryInstructorCourseAssignmentReadModelsInputSchema = z
  .object({
    scope: InstructorCourseAssignmentReadScopeSchema,
    pageSize: z
      .number()
      .int()
      .positive()
      .max(INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_PAGE_SIZE_MAX)
      .optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export type QueryInstructorCourseAssignmentReadModelsInput = z.output<
  typeof QueryInstructorCourseAssignmentReadModelsInputSchema
>;

export const QueryInstructorCourseAssignmentReadModelsResultSchema = z
  .object({
    scope: InstructorCourseAssignmentReadScopeSchema,
    items: z
      .array(InstructorCourseAssignmentReadModelSchema)
      .max(INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_PAGE_SIZE_MAX),
    hasMore: z.boolean(),
    nextCursor: z.string().trim().min(1).max(512).optional(),
    discoveryScanIncomplete: z.boolean().optional(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.hasMore && !result.nextCursor) {
      context.addIssue({
        code: 'custom',
        path: ['nextCursor'],
        message: 'nextCursor is required when hasMore is true',
      });
    }
    if (!result.hasMore && result.nextCursor !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['nextCursor'],
        message: 'nextCursor must be omitted when hasMore is false',
      });
    }
  });

export type QueryInstructorCourseAssignmentReadModelsResult = z.output<
  typeof QueryInstructorCourseAssignmentReadModelsResultSchema
>;
