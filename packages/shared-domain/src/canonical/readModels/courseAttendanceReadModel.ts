import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  AttendanceStatusSchema,
  CourseEnrollmentAttendanceSummarySchema,
} from '../courseEnrollmentAttendanceAdminIssue';
import {
  AttendanceIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  ParticipantIdSchema,
} from '../identifiers';
import { CourseAttendanceReadModelAuthorizedActionsSchema } from './readModelAuthorizedActions';
import { AggregateRevisionSchema } from '../primitives';

export const COURSE_ATTENDANCE_FACTUAL_STATES = ['missing', 'present', 'absent'] as const;
export type CourseAttendanceFactualState = (typeof COURSE_ATTENDANCE_FACTUAL_STATES)[number];

export const CourseAttendanceFactualStateSchema = z.enum(COURSE_ATTENDANCE_FACTUAL_STATES);

export const COURSE_ATTENDANCE_READ_SCOPES = [
  'account_enrollment',
  'instructor_roster',
] as const;
export type CourseAttendanceReadScope = (typeof COURSE_ATTENDANCE_READ_SCOPES)[number];

export const CourseAttendanceReadScopeSchema = z.enum(COURSE_ATTENDANCE_READ_SCOPES);

export const CourseAttendanceDayProjectionSchema = z
  .object({
    courseDayId: CourseDayIdSchema,
    factualState: CourseAttendanceFactualStateSchema,
    attendanceId: AttendanceIdSchema.optional(),
    attendanceRevision: AggregateRevisionSchema.optional(),
    attendanceStatus: AttendanceStatusSchema.optional(),
    courseDayRevision: AggregateRevisionSchema,
    authorizedActions: CourseAttendanceReadModelAuthorizedActionsSchema,
  })
  .strict()
  .superRefine((projection, context) => {
    if (projection.factualState === 'missing') {
      if (projection.attendanceId !== undefined || projection.attendanceStatus !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['factualState'],
          message: 'missing attendance must not include attendanceId or attendanceStatus',
        });
      }
      return;
    }
    if (!projection.attendanceId || !projection.attendanceStatus || projection.attendanceRevision === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['attendanceId'],
        message: 'recorded attendance requires attendanceId, attendanceStatus, and attendanceRevision',
      });
    }
    if (
      projection.factualState === 'present' &&
      projection.attendanceStatus !== undefined &&
      projection.attendanceStatus !== 'present'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['factualState'],
        message: 'present factualState requires present attendanceStatus',
      });
    }
    if (
      projection.factualState === 'absent' &&
      projection.attendanceStatus !== undefined &&
      projection.attendanceStatus !== 'absent'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['factualState'],
        message: 'absent factualState requires absent attendanceStatus',
      });
    }
  });

export type CourseAttendanceDayProjection = z.output<typeof CourseAttendanceDayProjectionSchema>;

export const CourseAttendanceEnrollmentProjectionSchema = z
  .object({
    enrollmentId: CourseEnrollmentIdSchema,
    enrollmentRevision: AggregateRevisionSchema,
    courseId: CourseIdSchema,
    participantId: ParticipantIdSchema,
    participantDisplayName: z.string().trim().min(1).max(200),
    days: z.array(CourseAttendanceDayProjectionSchema).min(1).max(64),
    attendanceSummary: CourseEnrollmentAttendanceSummarySchema.optional(),
  })
  .strict();

export type CourseAttendanceEnrollmentProjection = z.output<
  typeof CourseAttendanceEnrollmentProjectionSchema
>;

export const QueryCourseAttendanceReadModelsInputSchema = z
  .object({
    scope: CourseAttendanceReadScopeSchema,
    enrollmentId: CourseEnrollmentIdSchema.optional(),
    courseId: CourseIdSchema.optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.scope === 'account_enrollment' && !input.enrollmentId) {
      context.addIssue({
        code: 'custom',
        path: ['enrollmentId'],
        message: 'enrollmentId is required for account_enrollment scope',
      });
    }
    if (input.scope === 'instructor_roster' && !input.courseId) {
      context.addIssue({
        code: 'custom',
        path: ['courseId'],
        message: 'courseId is required for instructor_roster scope',
      });
    }
  });

export type QueryCourseAttendanceReadModelsInput = z.output<
  typeof QueryCourseAttendanceReadModelsInputSchema
>;

export const QueryCourseAttendanceReadModelsResultSchema = z
  .object({
    scope: CourseAttendanceReadScopeSchema,
    items: z.array(CourseAttendanceEnrollmentProjectionSchema),
  })
  .strict();

export type QueryCourseAttendanceReadModelsResult = z.output<
  typeof QueryCourseAttendanceReadModelsResultSchema
>;

export function resolveCourseAttendanceFactualState(input: {
  readonly attendanceStatus: z.infer<typeof AttendanceStatusSchema> | undefined;
  readonly matchesCurrentOccurrence: boolean;
}): CourseAttendanceFactualState {
  if (!input.attendanceStatus || !input.matchesCurrentOccurrence) {
    return 'missing';
  }
  return input.attendanceStatus;
}
