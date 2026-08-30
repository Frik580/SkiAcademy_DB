import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { CourseDayIdSchema, CourseIdSchema } from '../identifiers';
import { CourseScheduleProjectionReadModelSchema } from './courseDayScheduleProjection';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from '../primitives';

export const INSTRUCTOR_COURSE_ASSIGNMENT_READ_SCOPES = ['instructor_assigned'] as const;
export type InstructorCourseAssignmentReadScope =
  (typeof INSTRUCTOR_COURSE_ASSIGNMENT_READ_SCOPES)[number];

export const InstructorCourseAssignmentReadScopeSchema = z.enum(
  INSTRUCTOR_COURSE_ASSIGNMENT_READ_SCOPES
);

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

export const QueryInstructorCourseAssignmentReadModelsInputSchema = z
  .object({
    scope: InstructorCourseAssignmentReadScopeSchema,
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export type QueryInstructorCourseAssignmentReadModelsInput = z.output<
  typeof QueryInstructorCourseAssignmentReadModelsInputSchema
>;

export const QueryInstructorCourseAssignmentReadModelsResultSchema = z
  .object({
    scope: InstructorCourseAssignmentReadScopeSchema,
    items: z.array(InstructorCourseAssignmentReadModelSchema),
  })
  .strict();

export type QueryInstructorCourseAssignmentReadModelsResult = z.output<
  typeof QueryInstructorCourseAssignmentReadModelsResultSchema
>;
