import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  ParticipantIdSchema,
} from '../identifiers';
import {
  CourseEnrollmentCancellationReasonCodeSchema,
  CourseEnrollmentLifecycleStatusSchema,
} from '../courseEnrollmentAttendanceAdminIssue';
import { ImmutableBookingAttributionSchema } from '../bookingOccurrenceProposalChange';
import { PaymentStatusSchema } from '../paymentWallet';
import {
  CourseEnrollmentReadModelAuthorizedActionsSchema,
  InstructorCourseEnrollmentRosterAuthorizedActionsSchema,
} from './readModelAuthorizedActions';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  KztMinorUnitsSchema,
  type CanonicalTimestamp,
} from '../primitives';
import { CourseScheduleProjectionReadModelSchema } from './courseDayScheduleProjection';

export const COURSE_ENROLLMENT_READ_SCOPES = [
  'account_hot',
  'account_history',
  'instructor_roster',
  'guest_single',
] as const;
export type CourseEnrollmentReadScope = (typeof COURSE_ENROLLMENT_READ_SCOPES)[number];

export const CourseEnrollmentReadScopeSchema = z.enum(COURSE_ENROLLMENT_READ_SCOPES);

export const COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_DEFAULT = 25;
export const COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_MAX = 25;

export const CourseEnrollmentReadModelParticipantProjectionSchema = z
  .object({
    participantId: ParticipantIdSchema,
    displayName: z.string().trim().min(1).max(200),
  })
  .strict();

export type CourseEnrollmentReadModelParticipantProjection = z.output<
  typeof CourseEnrollmentReadModelParticipantProjectionSchema
>;

export const CourseEnrollmentReadModelCourseDisplaySchema = z
  .object({
    courseId: CourseIdSchema,
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export type CourseEnrollmentReadModelCourseDisplay = z.output<
  typeof CourseEnrollmentReadModelCourseDisplaySchema
>;

export const CourseEnrollmentReadModelLifecycleProjectionSchema = z
  .object({
    status: CourseEnrollmentLifecycleStatusSchema,
    reservationExpiresAt: CanonicalTimestampSchema.optional(),
    requestedAt: CanonicalTimestampSchema.optional(),
    cancelledAt: CanonicalTimestampSchema.optional(),
    withdrawnAt: CanonicalTimestampSchema.optional(),
    completedAt: CanonicalTimestampSchema.optional(),
    noShowAt: CanonicalTimestampSchema.optional(),
    reasonCode: CourseEnrollmentCancellationReasonCodeSchema.optional(),
  })
  .strict();

export type CourseEnrollmentReadModelLifecycleProjection = z.output<
  typeof CourseEnrollmentReadModelLifecycleProjectionSchema
>;

export const CourseEnrollmentReadModelPaymentPresentationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('visible'),
      paymentStatus: PaymentStatusSchema,
      paymentRevision: AggregateRevisionSchema,
      price: KztMinorUnitsSchema,
    })
    .strict(),
  z.object({ kind: z.literal('withheld') }).strict(),
]);

export type CourseEnrollmentReadModelPaymentPresentation = z.output<
  typeof CourseEnrollmentReadModelPaymentPresentationSchema
>;

export const CourseEnrollmentAttendanceSummaryPresentationSchema = z
  .object({
    recordedDayCount: z.number().finite().int().nonnegative(),
    presentDayCount: z.number().finite().int().nonnegative(),
    absentDayCount: z.number().finite().int().nonnegative(),
    projectionRevision: AggregateRevisionSchema,
  })
  .strict()
  .describe('Presentation-only rollup; factual per-day attendance uses CourseAttendanceReadModel');

export type CourseEnrollmentAttendanceSummaryPresentation = z.output<
  typeof CourseEnrollmentAttendanceSummaryPresentationSchema
>;

export const CourseEnrollmentReadModelSchema = z
  .object({
    enrollmentId: CourseEnrollmentIdSchema,
    revision: AggregateRevisionSchema,
    courseId: CourseIdSchema,
    originalCourseId: CourseIdSchema.optional(),
    participant: CourseEnrollmentReadModelParticipantProjectionSchema,
    lifecycle: CourseEnrollmentReadModelLifecycleProjectionSchema,
    courseDisplay: CourseEnrollmentReadModelCourseDisplaySchema,
    courseSchedule: CourseScheduleProjectionReadModelSchema,
    bookingOrigin: ImmutableBookingAttributionSchema.shape.bookingOrigin,
    authorizedActions: CourseEnrollmentReadModelAuthorizedActionsSchema,
    paymentPresentation: CourseEnrollmentReadModelPaymentPresentationSchema.optional(),
    attendanceSummary: CourseEnrollmentAttendanceSummaryPresentationSchema.optional(),
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type CourseEnrollmentReadModel = z.output<typeof CourseEnrollmentReadModelSchema>;

export const InstructorCourseEnrollmentRosterItemSchema = z
  .object({
    enrollmentId: CourseEnrollmentIdSchema,
    revision: AggregateRevisionSchema,
    courseId: CourseIdSchema,
    participant: CourseEnrollmentReadModelParticipantProjectionSchema,
    lifecycle: CourseEnrollmentReadModelLifecycleProjectionSchema,
    courseDisplay: CourseEnrollmentReadModelCourseDisplaySchema,
    courseSchedule: CourseScheduleProjectionReadModelSchema,
    authorizedActions: InstructorCourseEnrollmentRosterAuthorizedActionsSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type InstructorCourseEnrollmentRosterItem = z.output<
  typeof InstructorCourseEnrollmentRosterItemSchema
>;

export const CourseEnrollmentReadModelCursorSchema = z
  .object({
    updatedAtSeconds: z.number().int().nonnegative(),
    updatedAtNanoseconds: z.number().int().nonnegative().max(999_999_999),
    enrollmentId: CourseEnrollmentIdSchema,
  })
  .strict();

export type CourseEnrollmentReadModelCursor = z.output<typeof CourseEnrollmentReadModelCursorSchema>;

export const QueryCourseEnrollmentReadModelsInputSchema = z
  .object({
    scope: CourseEnrollmentReadScopeSchema,
    pageSize: z
      .number()
      .int()
      .positive()
      .max(COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_MAX)
      .optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    enrollmentId: CourseEnrollmentIdSchema.optional(),
    courseId: CourseIdSchema.optional(),
    guestActionNonce: z.string().trim().min(1).max(256).optional(),
    guestActionSignature: z.string().trim().min(1).max(256).optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.scope === 'guest_single') {
      if (!input.enrollmentId) {
        context.addIssue({
          code: 'custom',
          path: ['enrollmentId'],
          message: 'enrollmentId is required for guest_single scope',
        });
      }
      if (!input.guestActionNonce || !input.guestActionSignature) {
        context.addIssue({
          code: 'custom',
          path: ['guestActionNonce'],
          message: 'Guest credential is required for guest_single scope',
        });
      }
    }
    if (input.scope === 'account_hot' || input.scope === 'account_history') {
      if (input.enrollmentId !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['enrollmentId'],
          message: 'enrollmentId is not allowed for account scopes',
        });
      }
    }
    if (input.scope === 'instructor_roster') {
      if (input.enrollmentId !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['enrollmentId'],
          message: 'enrollmentId is not allowed for instructor_roster scope',
        });
      }
      if (!input.courseId) {
        context.addIssue({
          code: 'custom',
          path: ['courseId'],
          message: 'courseId is required for instructor_roster scope',
        });
      }
      if (input.guestActionNonce !== undefined || input.guestActionSignature !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['guestActionNonce'],
          message: 'Guest credential is not allowed for instructor_roster scope',
        });
      }
    }
  });

export type QueryCourseEnrollmentReadModelsInput = z.output<
  typeof QueryCourseEnrollmentReadModelsInputSchema
>;

export const QueryCourseEnrollmentReadModelsResultSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.enum(['account_hot', 'account_history', 'guest_single']),
      items: z.array(CourseEnrollmentReadModelSchema),
      nextCursor: z.string().trim().min(1).max(512).optional(),
      hasMore: z.boolean(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('instructor_roster'),
      items: z.array(InstructorCourseEnrollmentRosterItemSchema),
      nextCursor: z.string().trim().min(1).max(512).optional(),
      hasMore: z.boolean(),
    })
    .strict(),
]);

export type QueryCourseEnrollmentReadModelsResult = z.output<
  typeof QueryCourseEnrollmentReadModelsResultSchema
>;

export function encodeCourseEnrollmentReadModelCursor(
  cursor: CourseEnrollmentReadModelCursor
): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCourseEnrollmentReadModelCursor(
  encoded: string
): CourseEnrollmentReadModelCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const result = CourseEnrollmentReadModelCursorSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function isCourseEnrollmentHot(input: {
  readonly lifecycleStatus: CourseEnrollmentReadModelLifecycleProjection['status'];
  readonly finalCourseDayEndsAt: CanonicalTimestamp;
  readonly now: CanonicalTimestamp;
}): boolean {
  if (
    input.lifecycleStatus === 'cancelled' ||
    input.lifecycleStatus === 'withdrawn' ||
    input.lifecycleStatus === 'completed' ||
    input.lifecycleStatus === 'no_show'
  ) {
    return false;
  }
  const endsAtSeconds = input.finalCourseDayEndsAt.seconds;
  const endsAtNanos = input.finalCourseDayEndsAt.nanoseconds;
  const nowSeconds = input.now.seconds;
  const nowNanos = input.now.nanoseconds;
  if (endsAtSeconds < nowSeconds) return false;
  if (endsAtSeconds === nowSeconds && endsAtNanos < nowNanos) return false;
  return true;
}
