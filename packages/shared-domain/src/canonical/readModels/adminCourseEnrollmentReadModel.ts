import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { BookingOriginSchema } from '../bookingOccurrenceProposalChange';
import {
  AdminIssueIdSchema,
  AccountIdSchema,
  AttendanceIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  PaymentIdSchema,
} from '../identifiers';
import {
  AdminIssueKindSchema,
  AdminIssueLifecycleStatusSchema,
  AdminIssueSeveritySchema,
  AttendanceRecorderSchema,
  AttendanceStatusSchema,
  CourseEnrollmentLifecycleStatusSchema,
  CourseLifecycleStatusSchema,
} from '../courseEnrollmentAttendanceAdminIssue';
import { PaymentStatusSchema } from '../paymentWallet';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  KztMinorUnitsSchema,
} from '../primitives';

export const ADMIN_COURSE_ENROLLMENT_READ_SCOPES = [
  'admin_course_roster',
  'admin_enrollment_detail',
  'admin_pending_guest',
  'admin_history',
] as const;

export const AdminCourseEnrollmentReadScopeSchema = z.enum(ADMIN_COURSE_ENROLLMENT_READ_SCOPES);
export type AdminCourseEnrollmentReadScope = z.output<typeof AdminCourseEnrollmentReadScopeSchema>;

export const ADMIN_COURSE_ENROLLMENT_PAGE_SIZE_DEFAULT = 20;
export const ADMIN_COURSE_ENROLLMENT_PAGE_SIZE_MAX = 50;

export const AdminCourseEnrollmentIdentityPresentationSchema = z
  .object({
    participantId: ParticipantIdSchema,
    displayName: z.string().trim().min(1).max(200),
  })
  .strict();

export const AdminCourseEnrollmentPayerPresentationSchema = z
  .object({
    accountId: AccountIdSchema,
    displayName: z.string().trim().min(1).max(200),
  })
  .strict();

export const AdminCourseEnrollmentCoursePresentationSchema = z
  .object({
    courseId: CourseIdSchema,
    title: z.string().trim().min(1).max(200),
    lifecycle: CourseLifecycleStatusSchema,
    revision: AggregateRevisionSchema,
  })
  .strict();

export const AdminCourseEnrollmentPaymentPresentationSchema = z
  .object({
    paymentId: PaymentIdSchema,
    status: PaymentStatusSchema,
    revision: AggregateRevisionSchema,
    price: KztMinorUnitsSchema,
    paid: KztMinorUnitsSchema,
    refunded: KztMinorUnitsSchema,
    retained: KztMinorUnitsSchema,
    settled: KztMinorUnitsSchema,
    writtenOff: KztMinorUnitsSchema,
    outstanding: KztMinorUnitsSchema,
  })
  .strict();

export const AdminCourseEnrollmentIssueSummarySchema = z
  .object({
    issueId: AdminIssueIdSchema,
    revision: AggregateRevisionSchema,
    kind: AdminIssueKindSchema,
    severity: AdminIssueSeveritySchema,
    lifecycleStatus: AdminIssueLifecycleStatusSchema,
  })
  .strict();

export const AdminCourseEnrollmentAttendanceDaySchema = z
  .object({
    courseDayId: CourseDayIdSchema,
    startsAt: CanonicalTimestampSchema,
    endsAt: CanonicalTimestampSchema,
    instructorIds: z.array(InstructorIdSchema).min(1).max(16),
    attendanceId: AttendanceIdSchema.optional(),
    attendanceStatus: AttendanceStatusSchema.optional(),
    attendanceRevision: AggregateRevisionSchema.optional(),
    recordedBy: AttendanceRecorderSchema.optional(),
    recordedAt: CanonicalTimestampSchema.optional(),
    lastChangedBy: AttendanceRecorderSchema.optional(),
    updatedAt: CanonicalTimestampSchema.optional(),
    authorizedActions: z
      .object({
        canRecordPresent: z.boolean(),
        canRecordAbsent: z.boolean(),
        reasonRequired: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const AdminCourseEnrollmentAuthorizedActionsSchema = z
  .object({
    canResolveCancellation: z.boolean(),
    canTransfer: z.boolean(),
    canReconcile: z.boolean(),
    canResolveAttendanceOutcome: z.boolean(),
    canApproveGuest: z.literal(false),
    canLinkGuest: z.literal(false),
    canWithdraw: z.literal(false),
  })
  .strict();

export const AdminCourseEnrollmentRosterItemSchema = z
  .object({
    enrollmentId: CourseEnrollmentIdSchema,
    revision: AggregateRevisionSchema,
    course: AdminCourseEnrollmentCoursePresentationSchema,
    participant: AdminCourseEnrollmentIdentityPresentationSchema,
    payer: AdminCourseEnrollmentPayerPresentationSchema.optional(),
    lifecycleStatus: CourseEnrollmentLifecycleStatusSchema,
    guestState: z.enum(['not_guest', 'pending_unlinked', 'linked']),
    payment: AdminCourseEnrollmentPaymentPresentationSchema.optional(),
    attendanceSummary: z
      .object({
        recordedDayCount: z.number().int().nonnegative(),
        presentDayCount: z.number().int().nonnegative(),
        absentDayCount: z.number().int().nonnegative(),
        projectionRevision: AggregateRevisionSchema,
      })
      .strict()
      .optional(),
    relatedIssues: z.array(AdminCourseEnrollmentIssueSummarySchema).max(32),
    authorizedActions: AdminCourseEnrollmentAuthorizedActionsSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminCourseEnrollmentRosterItem = z.output<
  typeof AdminCourseEnrollmentRosterItemSchema
>;

export const AdminCourseEnrollmentDetailReadModelSchema =
  AdminCourseEnrollmentRosterItemSchema.extend({
    originalCourseId: CourseIdSchema,
    paymentId: PaymentIdSchema,
    payerAccountId: AccountIdSchema.optional(),
    capacity: z
      .object({
        totalSeats: z.number().int().positive(),
        availableSeats: z.number().int().nonnegative(),
        seatHeldByEnrollment: z.boolean(),
      })
      .strict(),
    cancellation: z
      .object({
        requestedAt: CanonicalTimestampSchema.optional(),
        maximumRefund: KztMinorUnitsSchema,
        refundDestination: z.enum(['wallet', 'manual_external']),
      })
      .strict()
      .optional(),
    transfer: z
      .object({
        eligible: z.boolean(),
        blockedReason: z.enum(['lifecycle', 'attendance_recorded', 'course_started']).optional(),
        targetOptions: z
          .array(
            z
              .object({
                courseId: CourseIdSchema,
                title: z.string().trim().min(1).max(200),
                revision: AggregateRevisionSchema,
                availableSeats: z.number().int().positive(),
                price: KztMinorUnitsSchema,
              })
              .strict()
          )
          .max(100),
      })
      .strict(),
    reconciliation: z
      .object({
        eligible: z.boolean(),
        evidenceIssueIds: z.array(AdminIssueIdSchema).max(32),
      })
      .strict(),
    attendanceDays: z.array(AdminCourseEnrollmentAttendanceDaySchema).max(64),
    auditContext: z
      .object({
        bookingOrigin: BookingOriginSchema,
        createdAt: CanonicalTimestampSchema,
        updatedAt: CanonicalTimestampSchema,
      })
      .strict(),
  }).strict();

export type AdminCourseEnrollmentDetailReadModel = z.output<
  typeof AdminCourseEnrollmentDetailReadModelSchema
>;

export const AdminCourseEnrollmentReadModelCursorSchema = z
  .object({
    scope: z.enum(['admin_course_roster', 'admin_pending_guest', 'admin_history']),
    courseId: CourseIdSchema.optional(),
    updatedAtSeconds: z.number().int().nonnegative(),
    updatedAtNanoseconds: z.number().int().nonnegative().max(999_999_999),
    enrollmentId: CourseEnrollmentIdSchema,
  })
  .strict();

export type AdminCourseEnrollmentReadModelCursor = z.output<
  typeof AdminCourseEnrollmentReadModelCursorSchema
>;

const AdminCourseEnrollmentListInputSchema = z
  .object({
    scope: z.enum(['admin_course_roster', 'admin_pending_guest', 'admin_history']),
    courseId: CourseIdSchema.optional(),
    pageSize: z.number().int().positive().max(ADMIN_COURSE_ENROLLMENT_PAGE_SIZE_MAX).optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

const AdminCourseEnrollmentDetailInputSchema = z
  .object({
    scope: z.literal('admin_enrollment_detail'),
    enrollmentId: CourseEnrollmentIdSchema,
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export const QueryAdminCourseEnrollmentReadModelsInputSchema = z.discriminatedUnion('scope', [
  AdminCourseEnrollmentListInputSchema,
  AdminCourseEnrollmentDetailInputSchema,
]);

export type QueryAdminCourseEnrollmentReadModelsInput = z.output<
  typeof QueryAdminCourseEnrollmentReadModelsInputSchema
>;

export const QueryAdminCourseEnrollmentReadModelsResultSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.enum(['admin_course_roster', 'admin_pending_guest', 'admin_history']),
      items: z.array(AdminCourseEnrollmentRosterItemSchema),
      nextCursor: z.string().trim().min(1).max(512).optional(),
      hasMore: z.boolean(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_enrollment_detail'),
      item: AdminCourseEnrollmentDetailReadModelSchema.optional(),
    })
    .strict(),
]);

export type QueryAdminCourseEnrollmentReadModelsResult = z.output<
  typeof QueryAdminCourseEnrollmentReadModelsResultSchema
>;

export function encodeAdminCourseEnrollmentCursor(
  cursor: AdminCourseEnrollmentReadModelCursor
): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeAdminCourseEnrollmentCursor(
  value: string
): AdminCourseEnrollmentReadModelCursor | undefined {
  try {
    const parsed = AdminCourseEnrollmentReadModelCursorSchema.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
