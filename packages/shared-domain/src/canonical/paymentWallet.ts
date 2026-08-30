import { z } from 'zod';
import {
  AccountIdSchema,
  BookingIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseEnrollmentIdSchema,
  CausationIdSchema,
  GuestSubjectIdSchema,
  IncrementalRequirementIdSchema,
  MonetaryEventIdSchema,
  ParticipantIdSchema,
  PaymentIdSchema,
  ProviderIdSchema,
  SystemActorIdSchema,
  type AccountId,
} from './identifiers';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  KztMinorUnitsSchema,
  compareCanonicalTimestamps,
  type KztMinorUnits,
} from './primitives';

const PersistedAggregateRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 1,
  'Persisted aggregate revision must be at least one'
);

const PersistedEventRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 0,
  'Event revision must be non-negative'
);

export const PAYMENT_SUBJECT_TYPES = ['booking', 'course_enrollment'] as const;
export type PaymentSubjectType = (typeof PAYMENT_SUBJECT_TYPES)[number];

export const PAYMENT_STATUSES = [
  'unpaid',
  'partially_paid',
  'paid',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PaymentSubjectTypeSchema = z.enum(PAYMENT_SUBJECT_TYPES);
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const PaymentSubjectRefSchema = z.discriminatedUnion('subjectType', [
  z.object({ subjectType: z.literal('booking'), subjectId: BookingIdSchema }).strict(),
  z
    .object({ subjectType: z.literal('course_enrollment'), subjectId: CourseEnrollmentIdSchema })
    .strict(),
]);

export type PaymentSubjectRef = z.output<typeof PaymentSubjectRefSchema>;

export const IncrementalRequirementStateSchema = z.enum(['active', 'fully_funded', 'rolled_back']);

export const IncrementalRequirementSchema = z
  .object({
    incrementalRequirementId: IncrementalRequirementIdSchema,
    participantId: ParticipantIdSchema,
    createdAt: CanonicalTimestampSchema,
    createdByCommandId: CommandIdSchema,
    requiredPriceDelta: KztMinorUnitsSchema,
    allocatedSettledAmount: KztMinorUnitsSchema,
    allocatedRetainedAmount: KztMinorUnitsSchema,
    state: IncrementalRequirementStateSchema,
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

export type IncrementalRequirement = z.output<typeof IncrementalRequirementSchema>;

export interface PaymentAccountingFields {
  readonly originalPrice: KztMinorUnits;
  readonly price: KztMinorUnits;
  readonly paidAmount: KztMinorUnits;
  readonly refundedAmount: KztMinorUnits;
  readonly retainedAmount: KztMinorUnits;
  readonly settledAmount: KztMinorUnits;
  readonly writtenOffAmount: KztMinorUnits;
  readonly outstandingAmount: KztMinorUnits;
}

export function deriveRetainedAmount(
  paidAmount: KztMinorUnits,
  refundedAmount: KztMinorUnits
): KztMinorUnits {
  return KztMinorUnitsSchema.parse(paidAmount - refundedAmount);
}

export function derivePaymentStatus(fields: PaymentAccountingFields): PaymentStatus {
  if (fields.refundedAmount > 0) {
    return fields.retainedAmount === 0 ? 'refunded' : 'partially_refunded';
  }
  if (fields.price === 0) return 'paid';
  if (fields.settledAmount === 0) return 'unpaid';
  if (
    fields.settledAmount === fields.price &&
    fields.writtenOffAmount === 0 &&
    fields.outstandingAmount === 0
  ) {
    return 'paid';
  }
  return 'partially_paid';
}

export function isPaymentFullyFundedForService(fields: PaymentAccountingFields): boolean {
  return (
    fields.retainedAmount === fields.price &&
    fields.settledAmount === fields.price &&
    fields.writtenOffAmount === 0 &&
    fields.outstandingAmount === 0
  );
}

export function validatePaymentAccounting(
  fields: PaymentAccountingFields,
  context: z.RefinementCtx,
  basePath: (string | number)[] = []
): void {
  const add = (path: string, message: string) => {
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

export const PaymentSchema = z
  .object({
    paymentId: PaymentIdSchema,
    subjectType: PaymentSubjectTypeSchema,
    subjectId: z.union([BookingIdSchema, CourseEnrollmentIdSchema]),
    currency: z.literal('KZT'),
    originalPrice: KztMinorUnitsSchema,
    price: KztMinorUnitsSchema,
    paidAmount: KztMinorUnitsSchema,
    refundedAmount: KztMinorUnitsSchema,
    retainedAmount: KztMinorUnitsSchema,
    settledAmount: KztMinorUnitsSchema,
    writtenOffAmount: KztMinorUnitsSchema,
    outstandingAmount: KztMinorUnitsSchema,
    paymentStatus: PaymentStatusSchema,
    payerAccountId: AccountIdSchema.optional(),
    incrementalRequirements: z.array(IncrementalRequirementSchema).max(7),
    revision: PersistedAggregateRevisionSchema,
    eventRevision: PersistedEventRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict()
  .superRefine((payment, context) => {
    if (compareCanonicalTimestamps(payment.updatedAt, payment.createdAt) < 0) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'updatedAt must not precede createdAt',
      });
    }

    const subjectRef = PaymentSubjectRefSchema.safeParse({
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

export type Payment = Readonly<z.output<typeof PaymentSchema>>;

export const WalletSchema = z
  .object({
    accountId: AccountIdSchema,
    currency: z.literal('KZT'),
    balance: KztMinorUnitsSchema,
    revision: PersistedAggregateRevisionSchema,
    eventRevision: PersistedEventRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict()
  .superRefine((wallet, context) => {
    if (compareCanonicalTimestamps(wallet.updatedAt, wallet.createdAt) < 0) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'updatedAt must not precede createdAt',
      });
    }
  });

export type Wallet = Readonly<z.output<typeof WalletSchema>>;

export const MONETARY_EVENT_KINDS = [
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
] as const;
export type MonetaryEventKind = (typeof MONETARY_EVENT_KINDS)[number];

export const MONETARY_SOURCE_KINDS = [
  'wallet',
  'provider',
  'cash',
  'bank_transfer',
  'manual_external',
  'admin_adjustment',
  'system',
] as const;
export type MonetarySourceKind = (typeof MONETARY_SOURCE_KINDS)[number];
export const MonetarySourceKindSchema = z.enum(MONETARY_SOURCE_KINDS);

export const REFUND_DESTINATION_KINDS = ['wallet', 'manual_external'] as const;
export type RefundDestinationKind = (typeof REFUND_DESTINATION_KINDS)[number];

export const MonetaryPaymentEffectSchema = z
  .object({
    priceDelta: z.number().finite().int().optional(),
    paidAmountDelta: z.number().finite().int().optional(),
    refundedAmountDelta: z.number().finite().int().optional(),
    settledAmountDelta: z.number().finite().int().optional(),
    writtenOffAmountDelta: z.number().finite().int().optional(),
    outstandingAmountDelta: z.number().finite().int().optional(),
  })
  .strict()
  .refine(
    (effect) => Object.values(effect).some((value) => value !== undefined),
    'paymentEffect must contain at least one signed delta'
  );

export const MonetaryEventActorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('account'), accountId: AccountIdSchema }).strict(),
  z.object({ kind: z.literal('guest'), guestSubjectId: GuestSubjectIdSchema }).strict(),
  z.object({ kind: z.literal('system'), systemActorId: SystemActorIdSchema }).strict(),
  z.object({ kind: z.literal('provider'), providerId: ProviderIdSchema }).strict(),
]);

export const MonetaryEventSchema = z
  .object({
    eventId: MonetaryEventIdSchema,
    eventKind: z.enum(MONETARY_EVENT_KINDS),
    currency: z.literal('KZT'),
    paymentId: PaymentIdSchema.optional(),
    subjectType: PaymentSubjectTypeSchema.optional(),
    subjectId: z.union([BookingIdSchema, CourseEnrollmentIdSchema]).optional(),
    walletAccountId: AccountIdSchema.optional(),
    paymentEffect: MonetaryPaymentEffectSchema.optional(),
    walletBalanceDelta: z.number().finite().int().optional(),
    sourceKind: MonetarySourceKindSchema,
    payerAccountIdAtEvent: AccountIdSchema.optional(),
    providerKind: z.string().trim().min(1).max(64).optional(),
    providerEventId: z.string().trim().min(1).max(128).optional(),
    providerTransactionRef: z.string().trim().min(1).max(128).optional(),
    manualReference: z.string().trim().min(1).max(128).optional(),
    refundDestinationKind: z.enum(REFUND_DESTINATION_KINDS).optional(),
    refundAccountIdAtEvent: AccountIdSchema.optional(),
    incrementalRequirementId: IncrementalRequirementIdSchema.optional(),
    actor: MonetaryEventActorSchema,
    reasonCode: z.string().trim().min(1).max(64).optional(),
    commandId: CommandIdSchema,
    correlationId: CorrelationIdSchema,
    causationId: CausationIdSchema.optional(),
    correctsEventId: MonetaryEventIdSchema.optional(),
    paymentEventRevision: PersistedEventRevisionSchema.optional(),
    walletEventRevision: PersistedEventRevisionSchema.optional(),
    occurredAt: CanonicalTimestampSchema,
    recordedAt: CanonicalTimestampSchema,
  })
  .strict()
  .superRefine((event, context) => {
    if (compareCanonicalTimestamps(event.recordedAt, event.occurredAt) < 0) {
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

    if (
      event.sourceKind === 'manual_external' &&
      !event.manualReference &&
      !event.payerAccountIdAtEvent
    ) {
      context.addIssue({
        code: 'custom',
        path: ['manualReference'],
        message: 'manual_external events require manualReference or payerAccountIdAtEvent',
      });
    }

    if (
      event.sourceKind === 'provider' &&
      !event.providerTransactionRef &&
      !event.payerAccountIdAtEvent
    ) {
      context.addIssue({
        code: 'custom',
        path: ['providerTransactionRef'],
        message: 'provider events require providerTransactionRef or payerAccountIdAtEvent',
      });
    }

    if (
      (event.paymentEffect !== undefined || event.paymentId !== undefined) &&
      event.walletBalanceDelta !== undefined &&
      event.paymentId === undefined &&
      event.walletAccountId === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['paymentEffect'],
        message: 'Monetary events must affect at most one Payment and one Wallet',
      });
    }
  });

export type MonetaryEvent = Readonly<z.output<typeof MonetaryEventSchema>>;

export const LEGACY_FINANCIAL_FIELD_NAMES = [
  'balanceUSD',
  'walletBalance',
  'totalPrice',
  'wallet_ledger',
  'schoolGuestWallet',
  'guestWallet',
  'ledgerEntryType',
  'starter_credit',
] as const;

export const LegacyFinancialShapeSchema = z
  .object({
    balanceUSD: z.unknown().optional(),
    walletBalance: z.unknown().optional(),
    totalPrice: z.unknown().optional(),
    wallet_ledger: z.unknown().optional(),
    schoolGuestWallet: z.unknown().optional(),
    guestWallet: z.unknown().optional(),
    ledgerEntryType: z.unknown().optional(),
    starter_credit: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const field of LEGACY_FINANCIAL_FIELD_NAMES) {
      if (value[field] !== undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Legacy financial field is not canonical',
        });
      }
    }
  });

export function containsLegacyFinancialFields(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const record = input as Record<string, unknown>;
  return LEGACY_FINANCIAL_FIELD_NAMES.some((field) => record[field] !== undefined);
}

export function paymentIdMatchesSubject(
  payment: Pick<Payment, 'paymentId' | 'subjectType' | 'subjectId'>,
  subject: PaymentSubjectRef
): boolean {
  return payment.subjectType === subject.subjectType && payment.subjectId === subject.subjectId;
}

export function writeOffDoesNotAuthorizeService(fields: PaymentAccountingFields): boolean {
  if (fields.writtenOffAmount === 0) return true;
  return !isPaymentFullyFundedForService(fields);
}

export function monetaryEventRecordsProvenanceAtEvent(
  event: Pick<
    MonetaryEvent,
    'payerAccountIdAtEvent' | 'sourceKind' | 'providerTransactionRef' | 'manualReference'
  >,
  currentPayerAccountId?: AccountId
): boolean {
  if (event.payerAccountIdAtEvent !== undefined) return true;
  if (event.sourceKind === 'manual_external' && event.manualReference) return true;
  if (event.sourceKind === 'provider' && event.providerTransactionRef) return true;
  return currentPayerAccountId === undefined;
}
