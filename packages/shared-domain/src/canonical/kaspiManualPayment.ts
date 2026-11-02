import { z } from 'zod';
import {
  AccountIdSchema,
  GuestSubjectIdSchema,
  PaymentIdSchema,
  MonetaryEventIdSchema,
} from './identifiers';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  KztMinorUnitsSchema,
  compareCanonicalTimestamps,
} from './primitives';
import { DataScopeSchema } from './canonicalScope';

export const KASPI_CONFIGURATION_PATH = 'payment_configuration/kaspi_manual';
export const KaspiRequestIdSchema = z.string().uuid();
export const KaspiPositiveAmountSchema = KztMinorUnitsSchema.refine((amount) => amount > 0);
export const KaspiRequestStatusSchema = z.enum([
  'awaiting_payment',
  'payment_claimed',
  'requires_clarification',
  'confirmed',
  'expired',
  'cancelled',
  'rejected',
  'refund_required',
  'refunded',
]);
export const KaspiConfigurationSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.literal('kaspi_manual'),
    merchantKey: z.string().trim().min(1).max(128),
    qrImageUrl: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === 'https:'),
    merchantName: z.string().trim().min(1).max(200),
    // Retained as compatibility data; activation is the Administrator decision.
    legalApprovalReference: z.unknown().optional(),
    revision: AggregateRevisionSchema.optional(),
    updatedBy: AccountIdSchema.optional(),
    updatedAt: CanonicalTimestampSchema.optional(),
    qrVerifiedBy: AccountIdSchema,
    qrVerifiedAt: CanonicalTimestampSchema,
    walletRequestTtlSeconds: z.number().int().positive().max(2_592_000),
  })
  .strict();
export type KaspiConfiguration = z.output<typeof KaspiConfigurationSchema>;

/** Fail closed; this configuration is server-only and has no enabled default. */
export function readEnabledKaspiConfiguration(value: unknown): KaspiConfiguration | undefined {
  const parsed = KaspiConfigurationSchema.safeParse(value);
  return parsed.success && parsed.data.enabled ? parsed.data : undefined;
}

export const KaspiReceiptEvidenceSchema = z
  .object({
    amount: KaspiPositiveAmountSchema,
    receivedAt: CanonicalTimestampSchema,
    bankReference: z.string().trim().min(1).max(128),
    matchingBasis: z.string().trim().min(1).max(1000),
    comment: z.string().trim().max(1000).optional(),
  })
  .strict();

export const KaspiPaymentRequestSchema = z
  .object({
    requestId: KaspiRequestIdSchema,
    type: z.enum(['wallet_topup', 'guest_booking_payment', 'guest_course_payment']),
    currency: z.literal('KZT'),
    amount: KaspiPositiveAmountSchema,
    status: KaspiRequestStatusSchema,
    accountId: AccountIdSchema.optional(),
    guestSubjectId: GuestSubjectIdSchema.optional(),
    paymentId: PaymentIdSchema.optional(),
    subjectId: z.string().min(1).max(128).optional(),
    payerDisplayName: z.string().trim().min(1).max(200).optional(),
    merchantKey: KaspiConfigurationSchema.shape.merchantKey,
    revision: AggregateRevisionSchema.refine((value) => value >= 1),
    createdAt: CanonicalTimestampSchema,
    expiresAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    claimedAt: CanonicalTimestampSchema.optional(),
    confirmedAt: CanonicalTimestampSchema.optional(),
    confirmedBy: AccountIdSchema.optional(),
    receipt: KaspiReceiptEvidenceSchema.optional(),
    receiptEventId: MonetaryEventIdSchema.optional(),
    serviceFunded: z.boolean(),
    refundAmount: KaspiPositiveAmountSchema.optional(),
    refundedAmount: KztMinorUnitsSchema.default(KztMinorUnitsSchema.parse(0)),
    refundReason: z.string().trim().min(1).max(1000).optional(),
    refundedAt: CanonicalTimestampSchema.optional(),
    refundedBy: AccountIdSchema.optional(),
    refundBankReference: z.string().trim().min(1).max(128).optional(),
    refundEventId: MonetaryEventIdSchema.optional(),
    walletCorrectionEventId: MonetaryEventIdSchema.optional(),
    walletCorrectedAmount: KaspiPositiveAmountSchema.optional(),
    dataScope: DataScopeSchema.optional(),
    testSessionId: z.string().optional(),
  })
  .strict()
  .superRefine((request, context) => {
    const invalid = (message: string) => context.addIssue({ code: 'custom', message });
    if (request.type === 'wallet_topup') {
      if (!request.accountId || request.paymentId || request.guestSubjectId || request.subjectId)
        invalid('Wallet requests require only an account');
    } else if (
      !request.paymentId ||
      !request.guestSubjectId ||
      !request.subjectId ||
      request.accountId
    )
      invalid('Guest requests require a subject and Payment');
    if (compareCanonicalTimestamps(request.expiresAt, request.createdAt) <= 0)
      invalid('Deadline must follow creation');
    if (compareCanonicalTimestamps(request.updatedAt, request.createdAt) < 0)
      invalid('Updated time must follow creation');
    if (
      request.receipt &&
      (!request.receiptEventId || !request.confirmedAt || !request.confirmedBy)
    )
      invalid('Receipt requires canonical event and confirmation attribution');
    if (request.status === 'confirmed' && !request.receipt)
      invalid('Confirmation requires receipt evidence');
    if (
      request.status === 'refund_required' &&
      (!request.receipt || !request.refundAmount || !request.refundReason)
    )
      invalid('Refund obligation requires received funds, amount and reason');
    if (request.refundAmount && (!request.receipt || request.refundAmount > request.receipt.amount))
      invalid('Refund cannot exceed received amount');
    if (request.refundedAmount > (request.receipt?.amount ?? 0))
      invalid('Completed refunds cannot exceed bank receipt');
    if (
      request.status === 'refund_required' &&
      (request.refundAmount ?? 0) + request.refundedAmount > (request.receipt?.amount ?? 0)
    )
      invalid('Pending refund exceeds remaining bank funds');
    if (
      request.status === 'refunded' &&
      (!request.refundEventId ||
        !request.refundedAt ||
        !request.refundedBy ||
        !request.refundBankReference ||
        !request.refundAmount)
    )
      invalid('Refund requires recorded bank fact');
  });
export type KaspiPaymentRequest = z.output<typeof KaspiPaymentRequestSchema>;

export function kaspiRequestExpired(
  request: Pick<KaspiPaymentRequest, 'expiresAt'>,
  now: z.output<typeof CanonicalTimestampSchema>
): boolean {
  return compareCanonicalTimestamps(now, request.expiresAt) >= 0;
}

export const KaspiCreateRequestIntentSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('wallet_topup'),
      requestId: KaspiRequestIdSchema,
      amount: KaspiPositiveAmountSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('guest_booking_payment'),
      requestId: KaspiRequestIdSchema,
      bookingId: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      type: z.literal('guest_course_payment'),
      requestId: KaspiRequestIdSchema,
      courseEnrollmentId: z.string().min(1).max(128),
    })
    .strict(),
]);
export const KaspiClaimRequestIntentSchema = z
  .object({
    requestId: KaspiRequestIdSchema,
    bookingId: z.string().min(1).max(128).optional(),
    courseEnrollmentId: z.string().min(1).max(128).optional(),
  })
  .strict();
export const KaspiReviewRequestIntentSchema = z
  .object({
    requestId: KaspiRequestIdSchema,
    action: z.enum(['confirm', 'reject', 'clarify', 'require_refund', 'record_refund']),
    reason: z.string().trim().min(1).max(1000),
    receipt: KaspiReceiptEvidenceSchema.optional(),
    refundAmount: KaspiPositiveAmountSchema.optional(),
    refundBankReference: z.string().trim().min(1).max(128).optional(),
    refundedAt: CanonicalTimestampSchema.optional(),
  })
  .strict();
