"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyFinancialShapeSchema = exports.LEGACY_FINANCIAL_FIELD_NAMES = exports.MonetaryEventSchema = exports.MonetaryEventActorSchema = exports.MonetaryPaymentEffectSchema = exports.REFUND_DESTINATION_KINDS = exports.MONETARY_SOURCE_KINDS = exports.MONETARY_EVENT_KINDS = exports.WalletSchema = exports.PaymentSchema = exports.IncrementalRequirementSchema = exports.IncrementalRequirementStateSchema = exports.PaymentSubjectRefSchema = exports.PaymentStatusSchema = exports.PaymentSubjectTypeSchema = exports.PAYMENT_STATUSES = exports.PAYMENT_SUBJECT_TYPES = void 0;
exports.deriveRetainedAmount = deriveRetainedAmount;
exports.derivePaymentStatus = derivePaymentStatus;
exports.isPaymentFullyFundedForService = isPaymentFullyFundedForService;
exports.validatePaymentAccounting = validatePaymentAccounting;
exports.containsLegacyFinancialFields = containsLegacyFinancialFields;
exports.paymentIdMatchesSubject = paymentIdMatchesSubject;
exports.writeOffDoesNotAuthorizeService = writeOffDoesNotAuthorizeService;
exports.monetaryEventRecordsProvenanceAtEvent = monetaryEventRecordsProvenanceAtEvent;
const zod_1 = require("zod");
const identifiers_1 = require("./identifiers");
const primitives_1 = require("./primitives");
const PersistedAggregateRevisionSchema = primitives_1.AggregateRevisionSchema.refine((revision) => revision >= 1, 'Persisted aggregate revision must be at least one');
const PersistedEventRevisionSchema = primitives_1.AggregateRevisionSchema.refine((revision) => revision >= 0, 'Event revision must be non-negative');
exports.PAYMENT_SUBJECT_TYPES = ['booking', 'course_enrollment'];
exports.PAYMENT_STATUSES = [
    'unpaid',
    'partially_paid',
    'paid',
    'refunded',
    'partially_refunded',
];
exports.PaymentSubjectTypeSchema = zod_1.z.enum(exports.PAYMENT_SUBJECT_TYPES);
exports.PaymentStatusSchema = zod_1.z.enum(exports.PAYMENT_STATUSES);
exports.PaymentSubjectRefSchema = zod_1.z.discriminatedUnion('subjectType', [
    zod_1.z.object({ subjectType: zod_1.z.literal('booking'), subjectId: identifiers_1.BookingIdSchema }).strict(),
    zod_1.z
        .object({ subjectType: zod_1.z.literal('course_enrollment'), subjectId: identifiers_1.CourseEnrollmentIdSchema })
        .strict(),
]);
exports.IncrementalRequirementStateSchema = zod_1.z.enum(['active', 'fully_funded', 'rolled_back']);
exports.IncrementalRequirementSchema = zod_1.z
    .object({
    incrementalRequirementId: identifiers_1.IncrementalRequirementIdSchema,
    participantId: identifiers_1.ParticipantIdSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
    createdByCommandId: identifiers_1.CommandIdSchema,
    requiredPriceDelta: primitives_1.KztMinorUnitsSchema,
    allocatedSettledAmount: primitives_1.KztMinorUnitsSchema,
    allocatedRetainedAmount: primitives_1.KztMinorUnitsSchema,
    state: exports.IncrementalRequirementStateSchema,
})
    .strict()
    .superRefine((requirement, context) => {
    if (requirement.allocatedRetainedAmount > requirement.allocatedSettledAmount) {
        context.addIssue({
            code: 'custom',
            path: ['allocatedRetainedAmount'],
            message: 'allocatedRetainedAmount must not exceed allocatedSettledAmount',
        });
    }
    if (requirement.allocatedSettledAmount > requirement.requiredPriceDelta) {
        context.addIssue({
            code: 'custom',
            path: ['allocatedSettledAmount'],
            message: 'allocatedSettledAmount must not exceed requiredPriceDelta',
        });
    }
});
function deriveRetainedAmount(paidAmount, refundedAmount) {
    return primitives_1.KztMinorUnitsSchema.parse(paidAmount - refundedAmount);
}
function derivePaymentStatus(fields) {
    if (fields.refundedAmount > 0) {
        return fields.retainedAmount === 0 ? 'refunded' : 'partially_refunded';
    }
    if (fields.price === 0)
        return 'paid';
    if (fields.settledAmount === 0)
        return 'unpaid';
    if (fields.settledAmount === fields.price &&
        fields.writtenOffAmount === 0 &&
        fields.outstandingAmount === 0) {
        return 'paid';
    }
    return 'partially_paid';
}
function isPaymentFullyFundedForService(fields) {
    return (fields.retainedAmount === fields.price &&
        fields.settledAmount === fields.price &&
        fields.writtenOffAmount === 0 &&
        fields.outstandingAmount === 0);
}
function validatePaymentAccounting(fields, context, basePath = []) {
    const add = (path, message) => {
        context.addIssue({ code: 'custom', path: [...basePath, path], message });
    };
    if (fields.refundedAmount > fields.paidAmount) {
        add('refundedAmount', 'refundedAmount must not exceed paidAmount');
    }
    if (fields.retainedAmount !== fields.paidAmount - fields.refundedAmount) {
        add('retainedAmount', 'retainedAmount must equal paidAmount - refundedAmount');
    }
    if (fields.retainedAmount < 0) {
        add('retainedAmount', 'retainedAmount must be non-negative');
    }
    if (fields.retainedAmount > fields.settledAmount) {
        add('retainedAmount', 'retainedAmount must not exceed settledAmount');
    }
    if (fields.settledAmount > fields.paidAmount) {
        add('settledAmount', 'settledAmount must not exceed paidAmount');
    }
    if (fields.settledAmount > fields.price) {
        add('settledAmount', 'settledAmount must not exceed price');
    }
    if (fields.writtenOffAmount < 0) {
        add('writtenOffAmount', 'writtenOffAmount must be non-negative');
    }
    if (fields.outstandingAmount < 0) {
        add('outstandingAmount', 'outstandingAmount must be non-negative');
    }
    if (fields.price !== fields.settledAmount + fields.writtenOffAmount + fields.outstandingAmount) {
        add('price', 'price must equal settledAmount + writtenOffAmount + outstandingAmount');
    }
}
exports.PaymentSchema = zod_1.z
    .object({
    paymentId: identifiers_1.PaymentIdSchema,
    subjectType: exports.PaymentSubjectTypeSchema,
    subjectId: zod_1.z.union([identifiers_1.BookingIdSchema, identifiers_1.CourseEnrollmentIdSchema]),
    currency: zod_1.z.literal('KZT'),
    originalPrice: primitives_1.KztMinorUnitsSchema,
    price: primitives_1.KztMinorUnitsSchema,
    paidAmount: primitives_1.KztMinorUnitsSchema,
    refundedAmount: primitives_1.KztMinorUnitsSchema,
    retainedAmount: primitives_1.KztMinorUnitsSchema,
    settledAmount: primitives_1.KztMinorUnitsSchema,
    writtenOffAmount: primitives_1.KztMinorUnitsSchema,
    outstandingAmount: primitives_1.KztMinorUnitsSchema,
    paymentStatus: exports.PaymentStatusSchema,
    payerAccountId: identifiers_1.AccountIdSchema.optional(),
    incrementalRequirements: zod_1.z.array(exports.IncrementalRequirementSchema).max(7),
    revision: PersistedAggregateRevisionSchema,
    eventRevision: PersistedEventRevisionSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
})
    .strict()
    .superRefine((payment, context) => {
    if ((0, primitives_1.compareCanonicalTimestamps)(payment.updatedAt, payment.createdAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['updatedAt'],
            message: 'updatedAt must not precede createdAt',
        });
    }
    const subjectRef = exports.PaymentSubjectRefSchema.safeParse({
        subjectType: payment.subjectType,
        subjectId: payment.subjectId,
    });
    if (!subjectRef.success) {
        context.addIssue({
            code: 'custom',
            path: ['subjectId'],
            message: 'subjectId must match subjectType',
        });
    }
    validatePaymentAccounting(payment, context);
    const derivedStatus = derivePaymentStatus(payment);
    if (payment.paymentStatus !== derivedStatus) {
        context.addIssue({
            code: 'custom',
            path: ['paymentStatus'],
            message: 'paymentStatus must match derived payment status',
        });
    }
    let allocatedSettledTotal = 0;
    let allocatedRetainedTotal = 0;
    payment.incrementalRequirements.forEach((requirement, index) => {
        allocatedSettledTotal += requirement.allocatedSettledAmount;
        allocatedRetainedTotal += requirement.allocatedRetainedAmount;
        if (requirement.allocatedSettledAmount > payment.settledAmount) {
            context.addIssue({
                code: 'custom',
                path: ['incrementalRequirements', index, 'allocatedSettledAmount'],
                message: 'Allocation settled amount must not exceed root settledAmount',
            });
        }
        if (requirement.allocatedRetainedAmount > payment.retainedAmount) {
            context.addIssue({
                code: 'custom',
                path: ['incrementalRequirements', index, 'allocatedRetainedAmount'],
                message: 'Allocation retained amount must not exceed root retainedAmount',
            });
        }
    });
    if (allocatedSettledTotal > payment.settledAmount) {
        context.addIssue({
            code: 'custom',
            path: ['incrementalRequirements'],
            message: 'Sum of allocation settled amounts must not exceed root settledAmount',
        });
    }
    if (allocatedRetainedTotal > payment.retainedAmount) {
        context.addIssue({
            code: 'custom',
            path: ['incrementalRequirements'],
            message: 'Sum of allocation retained amounts must not exceed root retainedAmount',
        });
    }
});
exports.WalletSchema = zod_1.z
    .object({
    accountId: identifiers_1.AccountIdSchema,
    currency: zod_1.z.literal('KZT'),
    balance: primitives_1.KztMinorUnitsSchema,
    revision: PersistedAggregateRevisionSchema,
    eventRevision: PersistedEventRevisionSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
})
    .strict()
    .superRefine((wallet, context) => {
    if ((0, primitives_1.compareCanonicalTimestamps)(wallet.updatedAt, wallet.createdAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['updatedAt'],
            message: 'updatedAt must not precede createdAt',
        });
    }
});
exports.MONETARY_EVENT_KINDS = [
    'wallet_credit',
    'wallet_adjustment',
    'booking_charge',
    'course_charge',
    'external_payment',
    'manual_payment',
    'refund_to_wallet',
    'manual_external_refund',
    'admin_price_adjustment',
    'write_off',
    'correction',
];
exports.MONETARY_SOURCE_KINDS = [
    'wallet',
    'provider',
    'cash',
    'bank_transfer',
    'manual_external',
    'admin_adjustment',
    'system',
];
exports.REFUND_DESTINATION_KINDS = ['wallet', 'manual_external'];
exports.MonetaryPaymentEffectSchema = zod_1.z
    .object({
    priceDelta: zod_1.z.number().finite().int().optional(),
    paidAmountDelta: zod_1.z.number().finite().int().optional(),
    refundedAmountDelta: zod_1.z.number().finite().int().optional(),
    settledAmountDelta: zod_1.z.number().finite().int().optional(),
    writtenOffAmountDelta: zod_1.z.number().finite().int().optional(),
    outstandingAmountDelta: zod_1.z.number().finite().int().optional(),
})
    .strict()
    .refine((effect) => Object.values(effect).some((value) => value !== undefined), 'paymentEffect must contain at least one signed delta');
exports.MonetaryEventActorSchema = zod_1.z.discriminatedUnion('kind', [
    zod_1.z.object({ kind: zod_1.z.literal('account'), accountId: identifiers_1.AccountIdSchema }).strict(),
    zod_1.z.object({ kind: zod_1.z.literal('guest'), guestSubjectId: identifiers_1.GuestSubjectIdSchema }).strict(),
    zod_1.z.object({ kind: zod_1.z.literal('system'), systemActorId: identifiers_1.SystemActorIdSchema }).strict(),
    zod_1.z.object({ kind: zod_1.z.literal('provider'), providerId: identifiers_1.ProviderIdSchema }).strict(),
]);
exports.MonetaryEventSchema = zod_1.z
    .object({
    eventId: identifiers_1.MonetaryEventIdSchema,
    eventKind: zod_1.z.enum(exports.MONETARY_EVENT_KINDS),
    currency: zod_1.z.literal('KZT'),
    paymentId: identifiers_1.PaymentIdSchema.optional(),
    subjectType: exports.PaymentSubjectTypeSchema.optional(),
    subjectId: zod_1.z.union([identifiers_1.BookingIdSchema, identifiers_1.CourseEnrollmentIdSchema]).optional(),
    walletAccountId: identifiers_1.AccountIdSchema.optional(),
    paymentEffect: exports.MonetaryPaymentEffectSchema.optional(),
    walletBalanceDelta: zod_1.z.number().finite().int().optional(),
    sourceKind: zod_1.z.enum(exports.MONETARY_SOURCE_KINDS),
    payerAccountIdAtEvent: identifiers_1.AccountIdSchema.optional(),
    providerKind: zod_1.z.string().trim().min(1).max(64).optional(),
    providerEventId: zod_1.z.string().trim().min(1).max(128).optional(),
    providerTransactionRef: zod_1.z.string().trim().min(1).max(128).optional(),
    manualReference: zod_1.z.string().trim().min(1).max(128).optional(),
    refundDestinationKind: zod_1.z.enum(exports.REFUND_DESTINATION_KINDS).optional(),
    refundAccountIdAtEvent: identifiers_1.AccountIdSchema.optional(),
    incrementalRequirementId: identifiers_1.IncrementalRequirementIdSchema.optional(),
    actor: exports.MonetaryEventActorSchema,
    reasonCode: zod_1.z.string().trim().min(1).max(64).optional(),
    commandId: identifiers_1.CommandIdSchema,
    correlationId: identifiers_1.CorrelationIdSchema,
    causationId: identifiers_1.CausationIdSchema.optional(),
    correctsEventId: identifiers_1.MonetaryEventIdSchema.optional(),
    paymentEventRevision: PersistedEventRevisionSchema.optional(),
    walletEventRevision: PersistedEventRevisionSchema.optional(),
    occurredAt: primitives_1.CanonicalTimestampSchema,
    recordedAt: primitives_1.CanonicalTimestampSchema,
})
    .strict()
    .superRefine((event, context) => {
    if ((0, primitives_1.compareCanonicalTimestamps)(event.recordedAt, event.occurredAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['recordedAt'],
            message: 'recordedAt must not precede occurredAt',
        });
    }
    if (event.paymentEffect !== undefined && !event.paymentId) {
        context.addIssue({
            code: 'custom',
            path: ['paymentEffect'],
            message: 'paymentEffect requires paymentId',
        });
    }
    if (event.paymentId && (!event.subjectType || !event.subjectId)) {
        context.addIssue({
            code: 'custom',
            path: ['paymentId'],
            message: 'Payment-linked monetary events must include subjectType and subjectId',
        });
    }
    if (event.walletBalanceDelta !== undefined && !event.walletAccountId) {
        context.addIssue({
            code: 'custom',
            path: ['walletBalanceDelta'],
            message: 'Wallet balance deltas require walletAccountId',
        });
    }
    if (event.sourceKind === 'manual_external' &&
        !event.manualReference &&
        !event.payerAccountIdAtEvent) {
        context.addIssue({
            code: 'custom',
            path: ['manualReference'],
            message: 'manual_external events require manualReference or payerAccountIdAtEvent',
        });
    }
    if (event.sourceKind === 'provider' &&
        !event.providerTransactionRef &&
        !event.payerAccountIdAtEvent) {
        context.addIssue({
            code: 'custom',
            path: ['providerTransactionRef'],
            message: 'provider events require providerTransactionRef or payerAccountIdAtEvent',
        });
    }
    if ((event.paymentEffect !== undefined || event.paymentId !== undefined) &&
        event.walletBalanceDelta !== undefined &&
        event.paymentId === undefined &&
        event.walletAccountId === undefined) {
        context.addIssue({
            code: 'custom',
            path: ['paymentEffect'],
            message: 'Monetary events must affect at most one Payment and one Wallet',
        });
    }
});
exports.LEGACY_FINANCIAL_FIELD_NAMES = [
    'balanceUSD',
    'walletBalance',
    'totalPrice',
    'wallet_ledger',
    'schoolGuestWallet',
    'guestWallet',
    'ledgerEntryType',
    'starter_credit',
];
exports.LegacyFinancialShapeSchema = zod_1.z
    .object({
    balanceUSD: zod_1.z.unknown().optional(),
    walletBalance: zod_1.z.unknown().optional(),
    totalPrice: zod_1.z.unknown().optional(),
    wallet_ledger: zod_1.z.unknown().optional(),
    schoolGuestWallet: zod_1.z.unknown().optional(),
    guestWallet: zod_1.z.unknown().optional(),
    ledgerEntryType: zod_1.z.unknown().optional(),
    starter_credit: zod_1.z.unknown().optional(),
})
    .strict()
    .superRefine((value, context) => {
    for (const field of exports.LEGACY_FINANCIAL_FIELD_NAMES) {
        if (value[field] !== undefined) {
            context.addIssue({
                code: 'custom',
                path: [field],
                message: 'Legacy financial field is not canonical',
            });
        }
    }
});
function containsLegacyFinancialFields(input) {
    if (!input || typeof input !== 'object')
        return false;
    const record = input;
    return exports.LEGACY_FINANCIAL_FIELD_NAMES.some((field) => record[field] !== undefined);
}
function paymentIdMatchesSubject(payment, subject) {
    return payment.subjectType === subject.subjectType && payment.subjectId === subject.subjectId;
}
function writeOffDoesNotAuthorizeService(fields) {
    if (fields.writtenOffAmount === 0)
        return true;
    return !isPaymentFullyFundedForService(fields);
}
function monetaryEventRecordsProvenanceAtEvent(event, currentPayerAccountId) {
    if (event.payerAccountIdAtEvent !== undefined)
        return true;
    if (event.sourceKind === 'manual_external' && event.manualReference)
        return true;
    if (event.sourceKind === 'provider' && event.providerTransactionRef)
        return true;
    return currentPayerAccountId === undefined;
}
