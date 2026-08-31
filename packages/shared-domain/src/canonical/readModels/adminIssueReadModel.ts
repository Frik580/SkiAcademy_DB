import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  AdminIssueKindSchema,
  AdminIssueLifecycleStatusSchema,
  AdminIssueSeveritySchema,
  AdminIssueSubjectRefSchema,
  AttendanceRecorderSchema,
  AttendanceStatusSchema,
} from '../courseEnrollmentAttendanceAdminIssue';
import {
  AdminIssueIdSchema,
  AttendanceIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  PaymentIdSchema,
} from '../identifiers';
import { PaymentStatusSchema } from '../paymentWallet';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  KztMinorUnitsSchema,
} from '../primitives';
import { AdminIssueReadModelAuthorizedActionsSchema } from './readModelAuthorizedActions';

export const ADMIN_ISSUE_READ_SCOPES = ['admin_open', 'admin_history', 'admin_detail'] as const;
export type AdminIssueReadScope = (typeof ADMIN_ISSUE_READ_SCOPES)[number];
export const AdminIssueReadScopeSchema = z.enum(ADMIN_ISSUE_READ_SCOPES);

export const ADMIN_ISSUE_READ_MODEL_PAGE_SIZE_DEFAULT = 20;
export const ADMIN_ISSUE_READ_MODEL_PAGE_SIZE_MAX = 50;

export const ADMIN_ISSUE_BLOCKING_CONDITIONS = [
  'none',
  'outcome',
  'delivery',
  'outcome_and_delivery',
] as const;
export const AdminIssueBlockingConditionSchema = z.enum(ADMIN_ISSUE_BLOCKING_CONDITIONS);
export type AdminIssueBlockingCondition = z.output<typeof AdminIssueBlockingConditionSchema>;

export const AdminIssueReadModelLifecycleSchema = z
  .object({
    status: AdminIssueLifecycleStatusSchema,
    openedAt: CanonicalTimestampSchema,
    lastDetectedAt: CanonicalTimestampSchema,
    reopenedAt: CanonicalTimestampSchema.optional(),
    resolvedAt: CanonicalTimestampSchema.optional(),
  })
  .strict();

export const AdminIssueInboxItemSchema = z
  .object({
    issueId: AdminIssueIdSchema,
    revision: AggregateRevisionSchema,
    kind: AdminIssueKindSchema,
    severity: AdminIssueSeveritySchema,
    lifecycle: AdminIssueReadModelLifecycleSchema,
    subjectRef: AdminIssueSubjectRefSchema,
    summaryCode: AdminIssueKindSchema,
    actionRequirement: z.enum(['action_required', 'informational']),
    blockingCondition: AdminIssueBlockingConditionSchema,
    occurrenceId: OccurrenceIdSchema.optional(),
    participantId: ParticipantIdSchema.optional(),
    courseDayId: CourseDayIdSchema.optional(),
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminIssueInboxItem = z.output<typeof AdminIssueInboxItemSchema>;

export const AdminIssueSubjectPresentationSchema = z.discriminatedUnion('availability', [
  z
    .object({
      availability: z.literal('available'),
      revision: AggregateRevisionSchema,
      lifecycleStatus: z.string().trim().min(1).max(64),
      courseId: CourseIdSchema.optional(),
    })
    .strict(),
  z.object({ availability: z.literal('missing') }).strict(),
]);

export const AdminIssueParticipantPresentationSchema = z
  .object({
    participantId: ParticipantIdSchema,
    displayName: z.string().trim().min(1).max(200),
  })
  .strict();

export const AdminIssuePaymentPresentationSchema = z
  .object({
    paymentId: PaymentIdSchema,
    paymentStatus: PaymentStatusSchema,
    revision: AggregateRevisionSchema,
    price: KztMinorUnitsSchema,
    settledAmount: KztMinorUnitsSchema,
    outstandingAmount: KztMinorUnitsSchema,
  })
  .strict();

export const AdminIssueAttendancePresentationSchema = z
  .object({
    attendanceId: AttendanceIdSchema,
    attendanceStatus: AttendanceStatusSchema,
    revision: AggregateRevisionSchema,
    participantId: ParticipantIdSchema,
    occurrenceId: OccurrenceIdSchema,
    courseDayId: CourseDayIdSchema.optional(),
    recordedBy: AttendanceRecorderSchema,
    recordedAt: CanonicalTimestampSchema,
    lastChangedBy: AttendanceRecorderSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export const ADMIN_ISSUE_RESOLUTION_GUIDANCE = [
  'record_attendance',
  'fund_payment',
  'resolve_cancellation',
  'reconcile_subject',
  'correct_finance',
  'correct_attendance_outcome',
] as const;
export const AdminIssueResolutionGuidanceSchema = z.enum(ADMIN_ISSUE_RESOLUTION_GUIDANCE);
export type AdminIssueResolutionGuidance = z.output<typeof AdminIssueResolutionGuidanceSchema>;

export const AdminIssueReferenceProjectionSchema = z
  .object({
    participantId: ParticipantIdSchema.optional(),
    courseId: CourseIdSchema.optional(),
    courseDayId: CourseDayIdSchema.optional(),
    paymentId: PaymentIdSchema.optional(),
    attendanceIds: z.array(AttendanceIdSchema).max(64),
  })
  .strict();

export const AdminIssueDetailReadModelSchema = AdminIssueInboxItemSchema.extend({
  subject: AdminIssueSubjectPresentationSchema,
  participant: AdminIssueParticipantPresentationSchema.optional(),
  payment: AdminIssuePaymentPresentationSchema.optional(),
  attendance: z.array(AdminIssueAttendancePresentationSchema).max(64),
  references: AdminIssueReferenceProjectionSchema,
  resolutionGuidance: AdminIssueResolutionGuidanceSchema,
  authorizedActions: AdminIssueReadModelAuthorizedActionsSchema,
}).strict();

export type AdminIssueDetailReadModel = z.output<typeof AdminIssueDetailReadModelSchema>;

export const AdminIssueReadModelCursorSchema = z
  .object({
    scope: z.enum(['admin_open', 'admin_history']),
    severity: AdminIssueSeveritySchema.optional(),
    updatedAtSeconds: z.number().int().nonnegative(),
    updatedAtNanoseconds: z.number().int().nonnegative().max(999_999_999),
    issueId: AdminIssueIdSchema,
  })
  .strict();

export type AdminIssueReadModelCursor = z.output<typeof AdminIssueReadModelCursorSchema>;

export const QueryAdminIssueReadModelsInputSchema = z
  .object({
    scope: AdminIssueReadScopeSchema,
    issueId: AdminIssueIdSchema.optional(),
    severity: AdminIssueSeveritySchema.optional(),
    pageSize: z.number().int().positive().max(ADMIN_ISSUE_READ_MODEL_PAGE_SIZE_MAX).optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.scope === 'admin_detail') {
      if (!input.issueId) {
        context.addIssue({
          code: 'custom',
          path: ['issueId'],
          message: 'issueId is required for admin_detail scope',
        });
      }
      if (
        input.severity !== undefined ||
        input.pageSize !== undefined ||
        input.cursor !== undefined
      ) {
        context.addIssue({
          code: 'custom',
          path: ['scope'],
          message: 'List filters and pagination are not allowed for admin_detail scope',
        });
      }
    } else if (input.issueId !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['issueId'],
        message: 'issueId is only allowed for admin_detail scope',
      });
    }
  });

export type QueryAdminIssueReadModelsInput = z.output<typeof QueryAdminIssueReadModelsInputSchema>;

const AdminIssueListReadModelsResultSchema = z
  .object({
    scope: z.enum(['admin_open', 'admin_history']),
    items: z.array(AdminIssueInboxItemSchema),
    nextCursor: z.string().trim().min(1).max(512).optional(),
    hasMore: z.boolean(),
  })
  .strict();

const AdminIssueDetailReadModelsResultSchema = z
  .object({
    scope: z.literal('admin_detail'),
    item: AdminIssueDetailReadModelSchema.optional(),
  })
  .strict();

export const QueryAdminIssueReadModelsResultSchema = z.discriminatedUnion('scope', [
  AdminIssueListReadModelsResultSchema,
  AdminIssueDetailReadModelsResultSchema,
]);

export type QueryAdminIssueReadModelsResult = z.output<
  typeof QueryAdminIssueReadModelsResultSchema
>;

export function encodeAdminIssueReadModelCursor(cursor: AdminIssueReadModelCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeAdminIssueReadModelCursor(
  encoded: string
): AdminIssueReadModelCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const result = AdminIssueReadModelCursorSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
