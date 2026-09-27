import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  TestSessionIdSchema,
  type CourseDayId,
  type CourseId,
} from '../identifiers';
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
/**
 * Opaque cursor ceiling. Must fit a max-length title, canonical ids, and a
 * course-day document path. 512 was too small once the day boundary stored a path.
 */
export const INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_CURSOR_MAX_LENGTH = 4096;

const COURSE_DAY_DOCUMENT_PATH_PATTERN =
  /^courses\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/days\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})$/;

export function instructorCourseAssignmentDayDocumentPath(
  courseId: CourseId,
  courseDayId: CourseDayId
): string {
  return `courses/${courseId}/days/${courseDayId}`;
}

/** Server-validated collection-group identity. Rejects any non-course-day path. */
export function parseInstructorCourseAssignmentDayDocumentPath(
  documentPath: string
): { readonly courseId: CourseId; readonly courseDayId: CourseDayId } | undefined {
  const match = COURSE_DAY_DOCUMENT_PATH_PATTERN.exec(documentPath);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  const courseId = CourseIdSchema.safeParse(match[1]);
  const courseDayId = CourseDayIdSchema.safeParse(match[2]);
  if (!courseId.success || !courseDayId.success) {
    return undefined;
  }
  const canonicalPath = instructorCourseAssignmentDayDocumentPath(
    courseId.data,
    courseDayId.data
  );
  if (canonicalPath !== documentPath) {
    return undefined;
  }
  return { courseId: courseId.data, courseDayId: courseDayId.data };
}

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
        documentPath: z.string().min(1).max(300).optional(),
      })
      .strict()
      .superRefine((days, context) => {
        const present = [
          days.startsAtSeconds !== undefined,
          days.startsAtNanoseconds !== undefined,
          days.documentPath !== undefined,
        ].filter(Boolean).length;
        if (present !== 0 && present !== 3) {
          context.addIssue({
            code: 'custom',
            message: 'Day cursor boundary must include startsAt and documentPath together',
          });
        }
        if (
          days.documentPath !== undefined &&
          parseInstructorCourseAssignmentDayDocumentPath(days.documentPath) === undefined
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Day cursor documentPath must be a courses/{courseId}/days/{courseDayId} path',
          });
        }
      }),
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
    cursor: z
      .string()
      .trim()
      .min(1)
      .max(INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_CURSOR_MAX_LENGTH)
      .optional(),
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
    nextCursor: z
      .string()
      .trim()
      .min(1)
      .max(INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_CURSOR_MAX_LENGTH)
      .optional(),
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
