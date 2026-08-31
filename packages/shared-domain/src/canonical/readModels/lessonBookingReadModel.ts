import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  AccountIdSchema,
  ActorRefSchema,
  AdminIssueIdSchema,
  AttendanceIdSchema,
  BookingIdSchema,
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
} from '../courseEnrollmentAttendanceAdminIssue';
import {
  BookingLifecycleStatusSchema,
  BookingOriginSchema,
  BookingPartyKindSchema,
} from '../bookingOccurrenceProposalChange';
import { PaymentStatusSchema } from '../paymentWallet';
import { LessonBookingReadModelAuthorizedActionsSchema as LessonBookingAuthorizedActionsSchema } from './readModelAuthorizedActions';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  IanaTimeZoneSchema,
  KztMinorUnitsSchema,
  type CanonicalTimestamp,
} from '../primitives';

export const LESSON_BOOKING_READ_SCOPES = [
  'account_hot',
  'account_history',
  'instructor_hot',
  'guest_single',
  'admin_hot',
  'admin_history',
  'admin_detail',
] as const;
export type LessonBookingReadScope = (typeof LESSON_BOOKING_READ_SCOPES)[number];

export const LessonBookingReadScopeSchema = z.enum(LESSON_BOOKING_READ_SCOPES);

export const LESSON_BOOKING_READ_MODEL_PAGE_SIZE_DEFAULT = 25;
export const LESSON_BOOKING_READ_MODEL_PAGE_SIZE_MAX = 25;

export const LessonBookingReadModelParticipantProjectionSchema = z
  .object({
    participantId: ParticipantIdSchema,
    displayName: z.string().trim().min(1).max(200),
  })
  .strict();

export type LessonBookingReadModelParticipantProjection = z.output<
  typeof LessonBookingReadModelParticipantProjectionSchema
>;

export const LessonBookingReadModelInstructorProjectionSchema = z
  .object({
    instructorId: InstructorIdSchema,
    displayName: z.string().trim().min(1).max(200),
    avatarUrl: z.string().trim().min(1).max(2_048).optional(),
  })
  .strict();

export type LessonBookingReadModelInstructorProjection = z.output<
  typeof LessonBookingReadModelInstructorProjectionSchema
>;

export const LessonBookingReadModelOccurrenceProjectionSchema = z
  .object({
    startsAt: CanonicalTimestampSchema,
    endsAt: CanonicalTimestampSchema,
    timeZone: IanaTimeZoneSchema,
    durationMinutes: z
      .number()
      .finite()
      .int()
      .positive()
      .max(24 * 60),
  })
  .strict();

export type LessonBookingReadModelOccurrenceProjection = z.output<
  typeof LessonBookingReadModelOccurrenceProjectionSchema
>;

export const LessonBookingReadModelLifecycleProjectionSchema = z
  .object({
    status: BookingLifecycleStatusSchema,
    reservationExpiresAt: CanonicalTimestampSchema.optional(),
    requestedAt: CanonicalTimestampSchema.optional(),
    cancelledAt: CanonicalTimestampSchema.optional(),
    completedAt: CanonicalTimestampSchema.optional(),
    noShowAt: CanonicalTimestampSchema.optional(),
    reasonCode: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export type LessonBookingReadModelLifecycleProjection = z.output<
  typeof LessonBookingReadModelLifecycleProjectionSchema
>;

export const LessonBookingReadModelPaymentPresentationSchema = z.discriminatedUnion('kind', [
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

export type LessonBookingReadModelPaymentPresentation = z.output<
  typeof LessonBookingReadModelPaymentPresentationSchema
>;

export const LessonBookingAdminParticipantProjectionSchema = z
  .object({
    participantId: ParticipantIdSchema,
    displayName: z.string().trim().min(1).max(200),
    skillLevel: z.string().trim().min(1).max(64),
    discipline: z.enum(['ski', 'snowboard']),
    age: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('birth_date'),
          birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .strict(),
      z
        .object({
          kind: z.literal('age_years'),
          years: z.number().finite().int().min(0).max(125),
        })
        .strict(),
    ]),
  })
  .strict();

export const LessonBookingAdminAccountIdentitySchema = z
  .object({
    accountId: AccountIdSchema,
    displayName: z.string().trim().min(1).max(200),
  })
  .strict();

export const LessonBookingAdminPaymentAccountingSchema = z
  .object({
    paymentId: PaymentIdSchema,
    status: PaymentStatusSchema,
    revision: AggregateRevisionSchema,
    currency: z.literal('KZT'),
    originalPrice: KztMinorUnitsSchema,
    price: KztMinorUnitsSchema,
    paid: KztMinorUnitsSchema,
    refunded: KztMinorUnitsSchema,
    retained: KztMinorUnitsSchema,
    settled: KztMinorUnitsSchema,
    writtenOff: KztMinorUnitsSchema,
    outstanding: KztMinorUnitsSchema,
  })
  .strict();

export const LessonBookingAdminCancellationFinancialProjectionSchema = z
  .object({
    timing: z.enum(['direct_cancel', 'pending_request', 'after_start_rejected']),
    maximumRefund: KztMinorUnitsSchema,
    suggestedRefund: KztMinorUnitsSchema,
  })
  .strict();

export const LessonBookingAdminIssueSummarySchema = z
  .object({
    issueId: AdminIssueIdSchema,
    kind: AdminIssueKindSchema,
    severity: AdminIssueSeveritySchema,
    lifecycleStatus: AdminIssueLifecycleStatusSchema,
    revision: AggregateRevisionSchema,
    blocksOutcome: z.boolean(),
    blocksDelivery: z.boolean(),
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export const LessonBookingAdminAttendancePresentationSchema = z
  .object({
    participantId: ParticipantIdSchema,
    attendanceId: AttendanceIdSchema.optional(),
    attendanceStatus: AttendanceStatusSchema.optional(),
    revision: AggregateRevisionSchema.optional(),
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
  .strict()
  .superRefine((value, context) => {
    const evidenceFields = [
      value.attendanceId,
      value.attendanceStatus,
      value.revision,
      value.recordedBy,
      value.recordedAt,
      value.lastChangedBy,
      value.updatedAt,
    ];
    const presentCount = evidenceFields.filter((field) => field !== undefined).length;
    if (presentCount !== 0 && presentCount !== evidenceFields.length) {
      context.addIssue({
        code: 'custom',
        path: ['attendanceId'],
        message: 'Attendance evidence must be projected completely or represented as missing',
      });
    }
  });

export const LessonBookingAdminAuthorizedActionsSchema = z
  .object({
    canConfirmGuest: z.boolean(),
    canDirectCancel: z.boolean(),
    canReschedule: z.boolean(),
    canChangeInstructor: z.boolean(),
    canChangeDuration: z.boolean(),
    canRecordAttendance: z.boolean(),
    canResolveCancellation: z.boolean(),
    canResolveAttendanceOutcome: z.boolean(),
    canLinkGuestToAccount: z.literal(false),
  })
  .strict();

export const LessonBookingAdminProjectionSchema = z
  .object({
    participants: z.array(LessonBookingAdminParticipantProjectionSchema).min(1).max(8),
    attribution: z
      .object({
        bookingOrigin: BookingOriginSchema,
        bookedBy: ActorRefSchema,
      })
      .strict(),
    payer: LessonBookingAdminAccountIdentitySchema.optional(),
    payment: LessonBookingAdminPaymentAccountingSchema,
    cancellationFinancial: LessonBookingAdminCancellationFinancialProjectionSchema,
    relatedIssues: z.array(LessonBookingAdminIssueSummarySchema).max(50),
    attendance: z.array(LessonBookingAdminAttendancePresentationSchema).min(1).max(8),
    scheduleRevision: AggregateRevisionSchema,
    serviceParticipantIds: z.array(ParticipantIdSchema).min(1).max(8),
    authorizedActions: LessonBookingAdminAuthorizedActionsSchema,
  })
  .strict();

export type LessonBookingAdminProjection = z.output<typeof LessonBookingAdminProjectionSchema>;

export const LessonBookingReadModelSchema = z
  .object({
    bookingId: BookingIdSchema,
    revision: AggregateRevisionSchema,
    partyKind: BookingPartyKindSchema,
    participantIds: z.array(ParticipantIdSchema).min(1).max(8),
    participants: z.array(LessonBookingReadModelParticipantProjectionSchema).min(1).max(8),
    instructor: LessonBookingReadModelInstructorProjectionSchema,
    occurrence: LessonBookingReadModelOccurrenceProjectionSchema,
    lifecycle: LessonBookingReadModelLifecycleProjectionSchema,
    bookingOrigin: BookingOriginSchema,
    authorizedActions: LessonBookingAuthorizedActionsSchema,
    paymentPresentation: LessonBookingReadModelPaymentPresentationSchema.optional(),
    admin: LessonBookingAdminProjectionSchema.optional(),
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type LessonBookingReadModel = z.output<typeof LessonBookingReadModelSchema>;

export const LessonBookingReadModelCursorSchema = z
  .object({
    scope: LessonBookingReadScopeSchema.optional(),
    updatedAtSeconds: z.number().int().nonnegative(),
    updatedAtNanoseconds: z.number().int().nonnegative().max(999_999_999),
    bookingId: BookingIdSchema,
  })
  .strict();

export type LessonBookingReadModelCursor = z.output<typeof LessonBookingReadModelCursorSchema>;

export const QueryLessonBookingReadModelsInputSchema = z
  .object({
    scope: LessonBookingReadScopeSchema,
    pageSize: z.number().int().positive().max(LESSON_BOOKING_READ_MODEL_PAGE_SIZE_MAX).optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    bookingId: BookingIdSchema.optional(),
    guestActionNonce: z.string().trim().min(1).max(256).optional(),
    guestActionSignature: z.string().trim().min(1).max(256).optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.scope === 'guest_single') {
      if (!input.bookingId) {
        context.addIssue({
          code: 'custom',
          path: ['bookingId'],
          message: 'bookingId is required for guest_single scope',
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
      if (input.bookingId !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['bookingId'],
          message: 'bookingId is not allowed for account scopes',
        });
      }
    }
    if (input.scope === 'instructor_hot') {
      if (input.bookingId !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['bookingId'],
          message: 'bookingId is not allowed for instructor_hot scope',
        });
      }
      if (input.guestActionNonce !== undefined || input.guestActionSignature !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['guestActionNonce'],
          message: 'Guest credential is not allowed for instructor_hot scope',
        });
      }
    }
    if (input.scope === 'admin_detail') {
      if (!input.bookingId) {
        context.addIssue({
          code: 'custom',
          path: ['bookingId'],
          message: 'bookingId is required for admin_detail scope',
        });
      }
      if (
        input.pageSize !== undefined ||
        input.cursor !== undefined ||
        input.guestActionNonce !== undefined ||
        input.guestActionSignature !== undefined
      ) {
        context.addIssue({
          code: 'custom',
          path: ['scope'],
          message: 'List pagination and guest credentials are not allowed for admin_detail scope',
        });
      }
    }
    if (input.scope === 'admin_hot' || input.scope === 'admin_history') {
      if (input.bookingId !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['bookingId'],
          message: 'bookingId is not allowed for Admin list scopes',
        });
      }
      if (input.guestActionNonce !== undefined || input.guestActionSignature !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['guestActionNonce'],
          message: 'Guest credentials are not allowed for Admin list scopes',
        });
      }
    }
  });

export type QueryLessonBookingReadModelsInput = z.output<
  typeof QueryLessonBookingReadModelsInputSchema
>;

export const QueryLessonBookingReadModelsResultSchema = z
  .object({
    scope: LessonBookingReadScopeSchema,
    items: z.array(LessonBookingReadModelSchema),
    nextCursor: z.string().trim().min(1).max(512).optional(),
    hasMore: z.boolean(),
  })
  .strict();

export type QueryLessonBookingReadModelsResult = z.output<
  typeof QueryLessonBookingReadModelsResultSchema
>;

export function encodeLessonBookingReadModelCursor(cursor: LessonBookingReadModelCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeLessonBookingReadModelCursor(
  encoded: string
): LessonBookingReadModelCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const result = LessonBookingReadModelCursorSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function mergeRevisionAwareReadModel<T extends { readonly revision: number }>(
  cached: T | undefined,
  incoming: T
): T {
  if (!cached) return incoming;
  return incoming.revision >= cached.revision ? incoming : cached;
}

export function isLessonBookingHot(input: {
  readonly lifecycleStatus: LessonBookingReadModelLifecycleProjection['status'];
  readonly endsAt: CanonicalTimestamp;
  readonly now: CanonicalTimestamp;
}): boolean {
  if (
    input.lifecycleStatus === 'cancelled' ||
    input.lifecycleStatus === 'completed' ||
    input.lifecycleStatus === 'no_show'
  ) {
    return false;
  }
  const endsAtSeconds = input.endsAt.seconds;
  const endsAtNanos = input.endsAt.nanoseconds;
  const nowSeconds = input.now.seconds;
  const nowNanos = input.now.nanoseconds;
  if (endsAtSeconds < nowSeconds) return false;
  if (endsAtSeconds === nowSeconds && endsAtNanos < nowNanos) return false;
  return true;
}
