import { z } from 'zod';
import {
  AccountIdSchema,
  AdminIssueIdSchema,
  BookingChangeRequestIdSchema,
  BookingIdSchema,
  BookingProposalIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  InstructorRelationshipIdSchema,
  MonetaryEventIdSchema,
  ParticipantBlockIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  PaymentIdSchema,
} from '../identifiers';
import { AttendanceStatusSchema } from '../courseEnrollmentAttendanceAdminIssue';
import { MonetaryPaymentEffectSchema } from '../paymentWallet';
import { AggregateRevisionSchema, KztMinorUnitsSchema } from '../primitives';
import type { CommandKind } from './commandKinds';

const bookingTargetIntent = z.object({ bookingId: BookingIdSchema }).strict();
const courseEnrollmentTargetIntent = z
  .object({ courseEnrollmentId: CourseEnrollmentIdSchema })
  .strict();
const bookingProposalTargetIntent = z.object({ bookingProposalId: BookingProposalIdSchema }).strict();
const bookingChangeRequestTargetIntent = z
  .object({ bookingChangeRequestId: BookingChangeRequestIdSchema })
  .strict();
const participantAgeIntent = z.discriminatedUnion('kind', [
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
]);
const participantProfilePatchIntent = z
  .object({
    participantId: ParticipantIdSchema,
    displayName: z.string().trim().min(1).max(200).optional(),
    age: participantAgeIntent.optional(),
    skillLevel: z.string().trim().min(1).max(64).optional(),
    discipline: z.enum(['ski', 'snowboard']).optional(),
    instructorComment: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict()
  .superRefine((intent, context) => {
    const hasPatch =
      intent.displayName !== undefined ||
      intent.age !== undefined ||
      intent.skillLevel !== undefined ||
      intent.discipline !== undefined ||
      intent.instructorComment !== undefined;
    if (!hasPatch) {
      context.addIssue({
        code: 'custom',
        path: [],
        message: 'At least one profile field must be provided',
      });
    }
  });
const instructorRelationshipBasisIntent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('guardian_permission') }).strict(),
  z.object({ kind: z.literal('administration_assignment') }).strict(),
]);
const positiveKztIntent = KztMinorUnitsSchema.refine((value) => value > 0, 'Amount must be positive');
const providerPaymentSourceKindIntent = z.enum(['provider', 'manual_external', 'cash', 'bank_transfer']);
const recordProviderPaymentEventIntent = z
  .object({
    paymentId: PaymentIdSchema,
    amount: positiveKztIntent,
    sourceKind: providerPaymentSourceKindIntent,
    providerKind: z.string().trim().min(1).max(64).optional(),
    providerEventId: z.string().trim().min(1).max(128).optional(),
    providerTransactionRef: z.string().trim().min(1).max(128).optional(),
    manualReference: z.string().trim().min(1).max(128).optional(),
    payerAccountId: AccountIdSchema.optional(),
  })
  .strict()
  .superRefine((intent, context) => {
    if (intent.sourceKind === 'provider') {
      if (!intent.providerKind) {
        context.addIssue({
          code: 'custom',
          path: ['providerKind'],
          message: 'providerKind is required for provider source',
        });
      }
      if (!intent.providerEventId) {
        context.addIssue({
          code: 'custom',
          path: ['providerEventId'],
          message: 'providerEventId is required for provider source',
        });
      }
    }
    if (intent.sourceKind === 'manual_external' && !intent.manualReference) {
      context.addIssue({
        code: 'custom',
        path: ['manualReference'],
        message: 'manualReference is required for manual_external source',
      });
    }
  });
const recordManualWalletFundingIntent = z
  .object({
    accountId: AccountIdSchema,
    amount: positiveKztIntent,
    reasonExplanation: z.string().trim().min(1).max(1_000),
  })
  .strict();
const adjustServicePriceIntent = z
  .object({
    paymentId: PaymentIdSchema,
    newPrice: KztMinorUnitsSchema,
    fundingAmount: KztMinorUnitsSchema.optional(),
    walletAccountId: AccountIdSchema.optional(),
    reasonExplanation: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict()
  .superRefine((intent, context) => {
    if (intent.fundingAmount !== undefined && intent.fundingAmount <= 0) {
      context.addIssue({
        code: 'custom',
        path: ['fundingAmount'],
        message: 'fundingAmount must be positive when provided',
      });
    }
    if (intent.fundingAmount !== undefined && intent.walletAccountId === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['walletAccountId'],
        message: 'walletAccountId is required when fundingAmount is provided',
      });
    }
  });
const financialCorrectionReasonIntent = z.string().trim().min(1).max(1_000);
const recordFinancialCorrectionIntent = z.discriminatedUnion('correctionKind', [
  z
    .object({
      correctionKind: z.literal('admin_refund'),
      paymentId: PaymentIdSchema,
      amount: positiveKztIntent,
      expectedPaymentRevision: AggregateRevisionSchema,
      walletAccountId: AccountIdSchema.optional(),
      expectedWalletRevision: AggregateRevisionSchema.optional(),
      manualExternalReference: z.string().trim().min(1).max(128).optional(),
      adminIssueId: AdminIssueIdSchema.optional(),
      expectedAdminIssueRevision: AggregateRevisionSchema.optional(),
      reasonExplanation: financialCorrectionReasonIntent,
    })
    .strict(),
  z
    .object({
      correctionKind: z.literal('write_off'),
      paymentId: PaymentIdSchema,
      amount: positiveKztIntent,
      expectedPaymentRevision: AggregateRevisionSchema,
      adminIssueId: AdminIssueIdSchema.optional(),
      expectedAdminIssueRevision: AggregateRevisionSchema.optional(),
      reasonExplanation: financialCorrectionReasonIntent,
    })
    .strict(),
  z
    .object({
      correctionKind: z.literal('reverse_write_off'),
      paymentId: PaymentIdSchema,
      amount: positiveKztIntent,
      expectedPaymentRevision: AggregateRevisionSchema,
      adminIssueId: AdminIssueIdSchema.optional(),
      expectedAdminIssueRevision: AggregateRevisionSchema.optional(),
      reasonExplanation: financialCorrectionReasonIntent,
    })
    .strict(),
  z
    .object({
      correctionKind: z.literal('compensating_event'),
      paymentId: PaymentIdSchema,
      correctsEventId: MonetaryEventIdSchema,
      paymentEffect: MonetaryPaymentEffectSchema,
      expectedPaymentRevision: AggregateRevisionSchema,
      walletBalanceDelta: z.number().finite().int().optional(),
      walletAccountId: AccountIdSchema.optional(),
      expectedWalletRevision: AggregateRevisionSchema.optional(),
      adminIssueId: AdminIssueIdSchema.optional(),
      expectedAdminIssueRevision: AggregateRevisionSchema.optional(),
      reasonExplanation: financialCorrectionReasonIntent,
    })
    .strict(),
]);
const recordAuditCorrectionIntent = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('reconcile_payment'),
      paymentId: PaymentIdSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('reconcile_wallet'),
      accountId: AccountIdSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('rebuild_payment_projection'),
      paymentId: PaymentIdSchema,
      expectedPaymentRevision: AggregateRevisionSchema,
      reasonExplanation: financialCorrectionReasonIntent,
    })
    .strict(),
  z
    .object({
      operation: z.literal('rebuild_wallet_projection'),
      accountId: AccountIdSchema,
      expectedWalletRevision: AggregateRevisionSchema,
      reasonExplanation: financialCorrectionReasonIntent,
    })
    .strict(),
]);

export const CommandIntentSchemaByKind = {
  create_confirmed_booking: z
    .object({
      bookingId: BookingIdSchema,
      instructorId: InstructorIdSchema,
      participantIds: z.array(ParticipantIdSchema).min(1).max(8),
      payerAccountId: AccountIdSchema.optional(),
      reasonExplanation: z.string().trim().min(1).max(1_000).optional(),
    })
    .strict(),
  create_guest_booking_request: z
    .object({
      bookingId: BookingIdSchema,
      instructorId: InstructorIdSchema,
      participantIds: z.array(ParticipantIdSchema).min(1).max(8),
    })
    .strict(),
  confirm_guest_booking: bookingTargetIntent,
  link_guest_booking_to_account: z
    .object({
      bookingId: BookingIdSchema,
      participantId: ParticipantIdSchema,
    })
    .strict(),
  request_booking_cancellation: bookingTargetIntent,
  withdraw_booking_cancellation_request: bookingTargetIntent,
  resolve_booking_cancellation: z
    .object({
      bookingId: BookingIdSchema,
      decision: z.enum(['approve', 'reject', 'direct_cancel']),
      refundAmount: KztMinorUnitsSchema.optional(),
      reasonExplanation: z.string().trim().min(1).max(1_000).optional(),
      manualExternalReference: z.string().trim().min(1).max(128).optional(),
    })
    .strict()
    .superRefine((intent, context) => {
      if (intent.decision === 'reject') {
        if (intent.refundAmount !== undefined) {
          context.addIssue({
            code: 'custom',
            path: ['refundAmount'],
            message: 'refundAmount is not allowed when rejecting cancellation',
          });
        }
        return;
      }

      if (intent.refundAmount === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['refundAmount'],
          message: 'refundAmount is required for approve and direct_cancel',
        });
      }
    }),
  reschedule_booking: z
    .object({
      bookingId: BookingIdSchema,
      reasonExplanation: z.string().trim().min(1).max(1_000).optional(),
    })
    .strict(),
  change_booking_instructor: z
    .object({
      bookingId: BookingIdSchema,
      instructorId: InstructorIdSchema,
      fundingAmount: KztMinorUnitsSchema.optional(),
      walletAccountId: AccountIdSchema.optional(),
      reasonExplanation: z.string().trim().min(1).max(1_000).optional(),
    })
    .strict()
    .superRefine((intent, context) => {
      if (intent.fundingAmount !== undefined && intent.fundingAmount <= 0) {
        context.addIssue({
          code: 'custom',
          path: ['fundingAmount'],
          message: 'fundingAmount must be positive when provided',
        });
      }
      if (intent.fundingAmount !== undefined && intent.walletAccountId === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['walletAccountId'],
          message: 'walletAccountId is required when fundingAmount is provided',
        });
      }
    }),
  change_booking_duration: z
    .object({
      bookingId: BookingIdSchema,
      durationMinutes: z.number().finite().int().positive().max(24 * 60),
      fundingAmount: KztMinorUnitsSchema.optional(),
      walletAccountId: AccountIdSchema.optional(),
      reasonExplanation: z.string().trim().min(1).max(1_000).optional(),
    })
    .strict()
    .superRefine((intent, context) => {
      if (intent.fundingAmount !== undefined && intent.fundingAmount <= 0) {
        context.addIssue({
          code: 'custom',
          path: ['fundingAmount'],
          message: 'fundingAmount must be positive when provided',
        });
      }
      if (intent.fundingAmount !== undefined && intent.walletAccountId === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['walletAccountId'],
          message: 'walletAccountId is required when fundingAmount is provided',
        });
      }
    }),
  change_booking_party: z
    .object({
      bookingId: BookingIdSchema,
      participantIdsToAdd: z.array(ParticipantIdSchema).max(7).optional(),
      participantIdsToRemove: z.array(ParticipantIdSchema).max(7).optional(),
      refundPercentBasisPoints: z.number().int().min(0).max(10_000).optional(),
      reasonExplanation: z.string().trim().min(1).max(1_000).optional(),
    })
    .strict()
    .superRefine((intent, context) => {
      const addCount = intent.participantIdsToAdd?.length ?? 0;
      const removeCount = intent.participantIdsToRemove?.length ?? 0;
      if (addCount === 0 && removeCount === 0) {
        context.addIssue({
          code: 'custom',
          path: [],
          message: 'At least one participant add or remove must be provided',
        });
      }
      const addSet = new Set(intent.participantIdsToAdd ?? []);
      const removeSet = new Set(intent.participantIdsToRemove ?? []);
      for (const participantId of addSet) {
        if (removeSet.has(participantId)) {
          context.addIssue({
            code: 'custom',
            path: ['participantIdsToAdd'],
            message: 'Participant cannot be both added and removed in one command',
          });
        }
      }
      if (intent.refundPercentBasisPoints !== undefined && removeCount === 0) {
        context.addIssue({
          code: 'custom',
          path: ['refundPercentBasisPoints'],
          message: 'refundPercentBasisPoints is only valid for participant removal',
        });
      }
    }),
  rollback_unpaid_booking_party_additions: bookingTargetIntent,
  record_booking_attendance: z
    .object({
      bookingId: BookingIdSchema,
      participantId: ParticipantIdSchema,
      attendanceStatus: AttendanceStatusSchema,
      expectedAttendanceRevision: AggregateRevisionSchema.optional(),
      reasonExplanation: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict(),
  complete_booking: bookingTargetIntent,
  record_booking_no_show: bookingTargetIntent,
  create_course_enrollments: z
    .object({
      courseId: CourseIdSchema,
      participantIds: z.array(ParticipantIdSchema).min(1).max(8),
    })
    .strict(),
  transfer_course_enrollment: courseEnrollmentTargetIntent,
  withdraw_course_enrollment: courseEnrollmentTargetIntent,
  request_course_enrollment_cancellation: courseEnrollmentTargetIntent,
  resolve_course_enrollment_cancellation: courseEnrollmentTargetIntent,
  create_booking_proposal: z
    .object({
      bookingProposalId: BookingProposalIdSchema,
      instructorId: InstructorIdSchema,
      participantId: ParticipantIdSchema,
    })
    .strict(),
  accept_booking_proposal: bookingProposalTargetIntent,
  cancel_booking_proposal: bookingProposalTargetIntent,
  expire_booking_proposal: bookingProposalTargetIntent,
  create_booking_change_request: z
    .object({
      bookingChangeRequestId: BookingChangeRequestIdSchema,
      bookingId: BookingIdSchema,
      reason: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  withdraw_booking_change_request: bookingChangeRequestTargetIntent,
  resolve_booking_change_request: z
    .object({
      bookingChangeRequestId: BookingChangeRequestIdSchema,
      resolution: z.enum(['rescheduled', 'booking_cancelled', 'no_change']),
      refundAmount: KztMinorUnitsSchema.optional(),
      reasonExplanation: z.string().trim().min(1).max(1_000).optional(),
    })
    .strict()
    .superRefine((intent, context) => {
      if (intent.resolution === 'booking_cancelled' && intent.refundAmount === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['refundAmount'],
          message: 'refundAmount is required when cancelling the booking',
        });
      }
      if (intent.resolution === 'booking_cancelled') {
        const explanation = intent.reasonExplanation?.trim();
        if (!explanation) {
          context.addIssue({
            code: 'custom',
            path: ['reasonExplanation'],
            message: 'reasonExplanation is required when cancelling the booking',
          });
        }
      }
      if (intent.resolution === 'rescheduled') {
        const explanation = intent.reasonExplanation?.trim();
        if (!explanation) {
          context.addIssue({
            code: 'custom',
            path: ['reasonExplanation'],
            message: 'reasonExplanation is required when rescheduling the booking',
          });
        }
      }
    }),
  expire_guest_reservation: bookingTargetIntent,
  enforce_payment_start_gate: z
    .object({
      subjectKind: z.enum(['booking', 'course_enrollment']),
      subjectId: z.string().min(1).max(128),
    })
    .strict(),
  resolve_attendance_outcome: z
    .object({
      subjectKind: z.enum(['booking', 'course_enrollment']),
      subjectId: z.string().min(1).max(128),
    })
    .strict(),
  create_participant: z
    .object({
      participantId: ParticipantIdSchema,
      displayName: z.string().trim().min(1).max(200),
      age: participantAgeIntent,
      skillLevel: z.string().trim().min(1).max(64),
      discipline: z.enum(['ski', 'snowboard']),
      instructorComment: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict(),
  update_participant_profile: participantProfilePatchIntent,
  assign_participant_management: z
    .object({
      participantManagementId: ParticipantManagementIdSchema,
      participantId: ParticipantIdSchema,
      authority: z.enum(['self', 'parent_guardian']),
    })
    .strict(),
  revoke_participant_management: z
    .object({
      participantManagementId: ParticipantManagementIdSchema,
    })
    .strict(),
  create_instructor_relationship: z
    .object({
      instructorRelationshipId: InstructorRelationshipIdSchema,
      instructorId: InstructorIdSchema,
      participantId: ParticipantIdSchema,
      basis: instructorRelationshipBasisIntent,
    })
    .strict(),
  revoke_instructor_relationship: z
    .object({
      instructorRelationshipId: InstructorRelationshipIdSchema,
    })
    .strict(),
  block_participant: z
    .object({
      participantBlockId: ParticipantBlockIdSchema,
      participantId: ParticipantIdSchema,
      instructorId: InstructorIdSchema,
      reason: z.string().trim().min(1).max(1_000),
    })
    .strict(),
  unblock_participant: z
    .object({
      participantBlockId: ParticipantBlockIdSchema,
    })
    .strict(),
  record_provider_payment_event: recordProviderPaymentEventIntent,
  record_manual_wallet_funding: recordManualWalletFundingIntent,
  adjust_service_price: adjustServicePriceIntent,
  record_financial_correction: recordFinancialCorrectionIntent,
  record_audit_correction: recordAuditCorrectionIntent,
  create_course_day: z
    .object({
      courseDayId: CourseDayIdSchema,
      courseId: CourseIdSchema,
      instructorId: InstructorIdSchema,
    })
    .strict(),
  reassign_course_day_instructor: z
    .object({
      courseId: CourseIdSchema,
      courseDayId: CourseDayIdSchema,
      instructorId: InstructorIdSchema,
      reasonExplanation: z.string().trim().min(1).max(1_000).optional(),
    })
    .strict(),
} satisfies Record<CommandKind, z.ZodType>;

export type CommandIntentForKind<Kind extends CommandKind> = z.output<
  (typeof CommandIntentSchemaByKind)[Kind]
>;

export type CommandIntentMap = {
  [Kind in CommandKind]: CommandIntentForKind<Kind>;
};

export function parseCommandIntent<Kind extends CommandKind>(
  kind: Kind,
  input: unknown
): z.ZodSafeParseResult<CommandIntentForKind<Kind>> {
  return CommandIntentSchemaByKind[kind].safeParse(input) as z.ZodSafeParseResult<
    CommandIntentForKind<Kind>
  >;
}
