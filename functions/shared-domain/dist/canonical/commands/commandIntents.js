"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandIntentSchemaByKind = void 0;
exports.parseCommandIntent = parseCommandIntent;
const zod_1 = require("zod");
const identifiers_1 = require("../identifiers");
const primitives_1 = require("../primitives");
const bookingTargetIntent = zod_1.z.object({ bookingId: identifiers_1.BookingIdSchema }).strict();
const courseEnrollmentTargetIntent = zod_1.z
    .object({ courseEnrollmentId: identifiers_1.CourseEnrollmentIdSchema })
    .strict();
const bookingProposalTargetIntent = zod_1.z.object({ bookingProposalId: identifiers_1.BookingProposalIdSchema }).strict();
const bookingChangeRequestTargetIntent = zod_1.z
    .object({ bookingChangeRequestId: identifiers_1.BookingChangeRequestIdSchema })
    .strict();
const participantAgeIntent = zod_1.z.discriminatedUnion('kind', [
    zod_1.z
        .object({
        kind: zod_1.z.literal('birth_date'),
        birthDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
        .strict(),
    zod_1.z
        .object({
        kind: zod_1.z.literal('age_years'),
        years: zod_1.z.number().finite().int().min(0).max(125),
    })
        .strict(),
]);
const participantProfilePatchIntent = zod_1.z
    .object({
    participantId: identifiers_1.ParticipantIdSchema,
    displayName: zod_1.z.string().trim().min(1).max(200).optional(),
    age: participantAgeIntent.optional(),
    skillLevel: zod_1.z.string().trim().min(1).max(64).optional(),
    discipline: zod_1.z.enum(['ski', 'snowboard']).optional(),
    instructorComment: zod_1.z.string().trim().min(1).max(2_000).optional(),
})
    .strict()
    .superRefine((intent, context) => {
    const hasPatch = intent.displayName !== undefined ||
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
const instructorRelationshipBasisIntent = zod_1.z.discriminatedUnion('kind', [
    zod_1.z.object({ kind: zod_1.z.literal('guardian_permission') }).strict(),
    zod_1.z.object({ kind: zod_1.z.literal('administration_assignment') }).strict(),
]);
const paymentTargetIntent = zod_1.z.object({ paymentId: identifiers_1.PaymentIdSchema }).strict();
const positiveKztIntent = primitives_1.KztMinorUnitsSchema.refine((value) => value > 0, 'Amount must be positive');
const providerPaymentSourceKindIntent = zod_1.z.enum(['provider', 'manual_external', 'cash', 'bank_transfer']);
const recordProviderPaymentEventIntent = zod_1.z
    .object({
    paymentId: identifiers_1.PaymentIdSchema,
    amount: positiveKztIntent,
    sourceKind: providerPaymentSourceKindIntent,
    providerKind: zod_1.z.string().trim().min(1).max(64).optional(),
    providerEventId: zod_1.z.string().trim().min(1).max(128).optional(),
    providerTransactionRef: zod_1.z.string().trim().min(1).max(128).optional(),
    manualReference: zod_1.z.string().trim().min(1).max(128).optional(),
    payerAccountId: identifiers_1.AccountIdSchema.optional(),
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
const recordManualWalletFundingIntent = zod_1.z
    .object({
    accountId: identifiers_1.AccountIdSchema,
    amount: positiveKztIntent,
    reasonExplanation: zod_1.z.string().trim().min(1).max(1_000),
})
    .strict();
const adjustServicePriceIntent = zod_1.z
    .object({
    paymentId: identifiers_1.PaymentIdSchema,
    newPrice: primitives_1.KztMinorUnitsSchema,
    fundingAmount: primitives_1.KztMinorUnitsSchema.optional(),
    walletAccountId: identifiers_1.AccountIdSchema.optional(),
    reasonExplanation: zod_1.z.string().trim().min(1).max(1_000).optional(),
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
const courseDayTargetIntent = zod_1.z.object({ courseDayId: identifiers_1.CourseDayIdSchema }).strict();
const emptyIntent = zod_1.z.object({}).strict();
exports.CommandIntentSchemaByKind = {
    create_confirmed_booking: zod_1.z
        .object({
        bookingId: identifiers_1.BookingIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
        participantIds: zod_1.z.array(identifiers_1.ParticipantIdSchema).min(1).max(8),
        payerAccountId: identifiers_1.AccountIdSchema.optional(),
        reasonExplanation: zod_1.z.string().trim().min(1).max(1_000).optional(),
    })
        .strict(),
    create_guest_booking_request: zod_1.z
        .object({
        bookingId: identifiers_1.BookingIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
        participantIds: zod_1.z.array(identifiers_1.ParticipantIdSchema).min(1).max(8),
    })
        .strict(),
    confirm_guest_booking: bookingTargetIntent,
    link_guest_booking_to_account: zod_1.z
        .object({
        bookingId: identifiers_1.BookingIdSchema,
        participantId: identifiers_1.ParticipantIdSchema,
    })
        .strict(),
    request_booking_cancellation: bookingTargetIntent,
    withdraw_booking_cancellation_request: bookingTargetIntent,
    resolve_booking_cancellation: zod_1.z
        .object({
        bookingId: identifiers_1.BookingIdSchema,
        decision: zod_1.z.enum(['approve', 'reject', 'direct_cancel']),
        refundAmount: primitives_1.KztMinorUnitsSchema.optional(),
        reasonExplanation: zod_1.z.string().trim().min(1).max(1_000).optional(),
        manualExternalReference: zod_1.z.string().trim().min(1).max(128).optional(),
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
    reschedule_booking: zod_1.z
        .object({
        bookingId: identifiers_1.BookingIdSchema,
        reasonExplanation: zod_1.z.string().trim().min(1).max(1_000).optional(),
    })
        .strict(),
    change_booking_instructor: zod_1.z
        .object({
        bookingId: identifiers_1.BookingIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
        fundingAmount: primitives_1.KztMinorUnitsSchema.optional(),
        walletAccountId: identifiers_1.AccountIdSchema.optional(),
        reasonExplanation: zod_1.z.string().trim().min(1).max(1_000).optional(),
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
    change_booking_duration: zod_1.z
        .object({
        bookingId: identifiers_1.BookingIdSchema,
        durationMinutes: zod_1.z.number().finite().int().positive().max(24 * 60),
        fundingAmount: primitives_1.KztMinorUnitsSchema.optional(),
        walletAccountId: identifiers_1.AccountIdSchema.optional(),
        reasonExplanation: zod_1.z.string().trim().min(1).max(1_000).optional(),
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
    change_booking_party: bookingTargetIntent,
    complete_booking: bookingTargetIntent,
    record_booking_no_show: bookingTargetIntent,
    create_course_enrollments: zod_1.z
        .object({
        courseId: identifiers_1.CourseIdSchema,
        participantIds: zod_1.z.array(identifiers_1.ParticipantIdSchema).min(1).max(8),
    })
        .strict(),
    transfer_course_enrollment: courseEnrollmentTargetIntent,
    withdraw_course_enrollment: courseEnrollmentTargetIntent,
    request_course_enrollment_cancellation: courseEnrollmentTargetIntent,
    resolve_course_enrollment_cancellation: courseEnrollmentTargetIntent,
    create_booking_proposal: zod_1.z
        .object({
        bookingProposalId: identifiers_1.BookingProposalIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
        participantId: identifiers_1.ParticipantIdSchema,
    })
        .strict(),
    accept_booking_proposal: bookingProposalTargetIntent,
    cancel_booking_proposal: bookingProposalTargetIntent,
    expire_booking_proposal: bookingProposalTargetIntent,
    create_booking_change_request: zod_1.z
        .object({
        bookingChangeRequestId: identifiers_1.BookingChangeRequestIdSchema,
        bookingId: identifiers_1.BookingIdSchema,
    })
        .strict(),
    withdraw_booking_change_request: bookingChangeRequestTargetIntent,
    resolve_booking_change_request: bookingChangeRequestTargetIntent,
    expire_guest_reservation: bookingTargetIntent,
    enforce_payment_start_gate: zod_1.z
        .object({
        subjectKind: zod_1.z.enum(['booking', 'course_enrollment']),
        subjectId: zod_1.z.string().min(1).max(128),
    })
        .strict(),
    resolve_attendance_outcome: zod_1.z
        .object({
        subjectKind: zod_1.z.enum(['booking', 'course_enrollment']),
        subjectId: zod_1.z.string().min(1).max(128),
    })
        .strict(),
    create_participant: zod_1.z
        .object({
        participantId: identifiers_1.ParticipantIdSchema,
        displayName: zod_1.z.string().trim().min(1).max(200),
        age: participantAgeIntent,
        skillLevel: zod_1.z.string().trim().min(1).max(64),
        discipline: zod_1.z.enum(['ski', 'snowboard']),
        instructorComment: zod_1.z.string().trim().min(1).max(2_000).optional(),
    })
        .strict(),
    update_participant_profile: participantProfilePatchIntent,
    assign_participant_management: zod_1.z
        .object({
        participantManagementId: identifiers_1.ParticipantManagementIdSchema,
        participantId: identifiers_1.ParticipantIdSchema,
        authority: zod_1.z.enum(['self', 'parent_guardian']),
    })
        .strict(),
    revoke_participant_management: zod_1.z
        .object({
        participantManagementId: identifiers_1.ParticipantManagementIdSchema,
    })
        .strict(),
    create_instructor_relationship: zod_1.z
        .object({
        instructorRelationshipId: identifiers_1.InstructorRelationshipIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
        participantId: identifiers_1.ParticipantIdSchema,
        basis: instructorRelationshipBasisIntent,
    })
        .strict(),
    revoke_instructor_relationship: zod_1.z
        .object({
        instructorRelationshipId: identifiers_1.InstructorRelationshipIdSchema,
    })
        .strict(),
    block_participant: zod_1.z
        .object({
        participantBlockId: identifiers_1.ParticipantBlockIdSchema,
        participantId: identifiers_1.ParticipantIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
        reason: zod_1.z.string().trim().min(1).max(1_000),
    })
        .strict(),
    unblock_participant: zod_1.z
        .object({
        participantBlockId: identifiers_1.ParticipantBlockIdSchema,
    })
        .strict(),
    record_provider_payment_event: recordProviderPaymentEventIntent,
    record_manual_wallet_funding: recordManualWalletFundingIntent,
    adjust_service_price: adjustServicePriceIntent,
    record_financial_correction: paymentTargetIntent,
    record_audit_correction: emptyIntent,
    create_course_day: zod_1.z
        .object({
        courseDayId: identifiers_1.CourseDayIdSchema,
        courseId: identifiers_1.CourseIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
    })
        .strict(),
    reassign_course_day_instructor: courseDayTargetIntent,
};
function parseCommandIntent(kind, input) {
    return exports.CommandIntentSchemaByKind[kind].safeParse(input);
}
