import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { ADMIN_FINANCIAL_OVERVIEW_PERIODS } from '../financialOverviewPolicy';
import {
  AdminIssueKindSchema,
  AdminIssueLifecycleStatusSchema,
} from '../courseEnrollmentAttendanceAdminIssue';
import {
  AccountIdSchema,
  AdminIssueIdSchema,
  CausationIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  MonetaryEventIdSchema,
  PaymentIdSchema,
} from '../identifiers';
import {
  MonetaryPaymentEffectSchema,
  MonetarySourceKindSchema,
  PaymentStatusSchema,
  PaymentSubjectTypeSchema,
} from '../paymentWallet';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  IanaTimeZoneSchema,
  KztMinorUnitsSchema,
  TimeIntervalSchema,
} from '../primitives';

export const ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_DEFAULT = 20;
export const ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_MAX = 50;

export const AdminFinanceAccountIdentitySchema = z
  .object({
    accountId: AccountIdSchema,
    displayName: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320).optional(),
  })
  .strict();

export type AdminFinanceAccountIdentity = z.output<typeof AdminFinanceAccountIdentitySchema>;

export const AdminMonetaryEventPresentationSchema = z
  .object({
    eventId: MonetaryEventIdSchema,
    eventKind: z.string().trim().min(1).max(64),
    currency: z.literal('KZT'),
    amount: KztMinorUnitsSchema,
    direction: z.enum(['in', 'out', 'neutral']),
    sourceKind: MonetarySourceKindSchema,
    paymentId: PaymentIdSchema.optional(),
    subjectType: PaymentSubjectTypeSchema.optional(),
    subjectId: z.string().trim().min(1).max(128).optional(),
    walletAccountId: AccountIdSchema.optional(),
    walletBalanceDelta: z.number().finite().int().optional(),
    paymentEffect: MonetaryPaymentEffectSchema.optional(),
    reasonCode: z.string().trim().min(1).max(64).optional(),
    providerKind: z.string().trim().min(1).max(64).optional(),
    providerTransactionRef: z.string().trim().min(1).max(128).optional(),
    manualReference: z.string().trim().min(1).max(128).optional(),
    commandId: CommandIdSchema,
    correlationId: CorrelationIdSchema,
    causationId: CausationIdSchema.optional(),
    correctsEventId: MonetaryEventIdSchema.optional(),
    occurredAt: CanonicalTimestampSchema,
    recordedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminMonetaryEventPresentation = z.output<typeof AdminMonetaryEventPresentationSchema>;

export const AdminFinanceRelatedIssueSchema = z
  .object({
    issueId: AdminIssueIdSchema,
    kind: AdminIssueKindSchema,
    lifecycleStatus: AdminIssueLifecycleStatusSchema,
    revision: AggregateRevisionSchema,
    financeActionAvailable: z.boolean(),
  })
  .strict();

export const AdminWalletActionSchema = z
  .object({
    kind: z.literal('record_manual_wallet_funding'),
    expectedWalletRevision: AggregateRevisionSchema.optional(),
  })
  .strict();

export const AdminPaymentActionSchema = z
  .object({
    kind: z.enum(['admin_refund', 'write_off', 'reverse_write_off', 'rebuild_payment_projection']),
    adminIssueId: AdminIssueIdSchema,
    expectedAdminIssueRevision: AggregateRevisionSchema,
    expectedPaymentRevision: AggregateRevisionSchema,
    maximumAmount: KztMinorUnitsSchema.optional(),
    walletAccountId: AccountIdSchema.optional(),
    expectedWalletRevision: AggregateRevisionSchema.optional(),
    requiresReason: z.literal(true),
  })
  .strict();

export type AdminPaymentAction = z.output<typeof AdminPaymentActionSchema>;

const AdminFinanceEventPageSchema = z
  .object({
    events: z.array(AdminMonetaryEventPresentationSchema),
    nextCursor: z.string().trim().min(1).max(768).optional(),
    hasMore: z.boolean(),
  })
  .strict();

export const AdminWalletReadModelSchema = AdminFinanceEventPageSchema.extend({
  accountId: AccountIdSchema,
  accountIdentity: AdminFinanceAccountIdentitySchema,
  accountStatus: z.enum(['active', 'unavailable']),
  exists: z.boolean(),
  balance: KztMinorUnitsSchema,
  currency: z.literal('KZT'),
  revision: AggregateRevisionSchema,
  eventRevision: AggregateRevisionSchema,
  updatedAt: CanonicalTimestampSchema.optional(),
  allowedActions: z.array(AdminWalletActionSchema).max(1),
}).strict();

export type AdminWalletReadModel = z.output<typeof AdminWalletReadModelSchema>;

export const AdminPaymentProviderStateSchema = z
  .object({
    providerKind: z.string().trim().min(1).max(64).optional(),
    providerTransactionRef: z.string().trim().min(1).max(128).optional(),
    latestEventId: MonetaryEventIdSchema,
    recordedAt: CanonicalTimestampSchema,
  })
  .strict();

export const AdminPaymentDetailReadModelSchema = AdminFinanceEventPageSchema.extend({
  paymentId: PaymentIdSchema,
  subjectType: PaymentSubjectTypeSchema,
  subjectId: z.string().trim().min(1).max(128),
  payer: AdminFinanceAccountIdentitySchema.optional(),
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
  revision: AggregateRevisionSchema,
  eventRevision: AggregateRevisionSchema,
  providerState: AdminPaymentProviderStateSchema.optional(),
  relatedIssues: z.array(AdminFinanceRelatedIssueSchema).max(50),
  allowedActions: z.array(AdminPaymentActionSchema).max(16),
  createdAt: CanonicalTimestampSchema,
  updatedAt: CanonicalTimestampSchema,
}).strict();

export type AdminPaymentDetailReadModel = z.output<typeof AdminPaymentDetailReadModelSchema>;

const AdminWalletReadInputSchema = z
  .object({
    scope: z.literal('admin_wallet'),
    accountId: AccountIdSchema,
    pageSize: z.number().int().positive().max(ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_MAX).optional(),
    cursor: z.string().trim().min(1).max(768).optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

const AdminPaymentDetailReadInputSchema = z
  .object({
    scope: z.literal('admin_payment_detail'),
    paymentId: PaymentIdSchema,
    pageSize: z.number().int().positive().max(ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_MAX).optional(),
    cursor: z.string().trim().min(1).max(768).optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

const AdminSchoolMovementReadInputSchema = z
  .object({
    scope: z.literal('admin_school_movement'),
    pageSize: z.number().int().positive().max(ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_MAX).optional(),
    cursor: z.string().trim().min(1).max(768).optional(),
    period: z.enum(ADMIN_FINANCIAL_OVERVIEW_PERIODS).optional(),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    timeZone: IanaTimeZoneSchema.optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export const AdminSchoolMovementReadModelSchema = AdminFinanceEventPageSchema.extend({
  currency: z.literal('KZT'),
}).strict();

export type AdminSchoolMovementReadModel = z.output<typeof AdminSchoolMovementReadModelSchema>;

const AdminFinancialOverviewReadInputSchema = z
  .object({
    scope: z.literal('admin_financial_overview'),
    period: z.enum(ADMIN_FINANCIAL_OVERVIEW_PERIODS),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: IanaTimeZoneSchema,
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export const AdminFinancialOverviewReadModelSchema = z
  .object({
    currency: z.literal('KZT'),
    period: z.enum(ADMIN_FINANCIAL_OVERVIEW_PERIODS),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: IanaTimeZoneSchema,
    window: TimeIntervalSchema,
    settledRevenueKzt: z.number().finite().int(),
    refundedKzt: z.number().finite().int(),
    netSettledKzt: z.number().finite().int(),
    truncated: z.boolean(),
  })
  .strict();

export type AdminFinancialOverviewReadModel = z.output<typeof AdminFinancialOverviewReadModelSchema>;

export const ADMIN_GUEST_FUNDS_DISCOVERY_FILTERS = [
  'all',
  'unlinked',
  'linked',
  'outstanding',
  'unpaid',
  'partially_paid',
  'paid',
  'refunded',
  'partially_refunded',
] as const;

export const AdminGuestFundsDiscoveryFilterSchema = z.enum(ADMIN_GUEST_FUNDS_DISCOVERY_FILTERS);
export type AdminGuestFundsDiscoveryFilter = z.output<typeof AdminGuestFundsDiscoveryFilterSchema>;

export const AdminGuestFundsLinkStateSchema = z.enum(['linked', 'unlinked']);
export type AdminGuestFundsLinkState = z.output<typeof AdminGuestFundsLinkStateSchema>;

export const AdminGuestFundsLessonServiceSummarySchema = z
  .object({
    subjectKind: z.literal('booking'),
    bookingId: z.string().trim().min(1).max(128),
    startsAt: CanonicalTimestampSchema,
    timeZone: IanaTimeZoneSchema,
  })
  .strict();

export const AdminGuestFundsEnrollmentServiceSummarySchema = z
  .object({
    subjectKind: z.literal('course_enrollment'),
    enrollmentId: z.string().trim().min(1).max(128),
    courseId: z.string().trim().min(1).max(128),
    courseTitle: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const AdminGuestFundsServiceSummarySchema = z.discriminatedUnion('subjectKind', [
  AdminGuestFundsLessonServiceSummarySchema,
  AdminGuestFundsEnrollmentServiceSummarySchema,
]);

export type AdminGuestFundsServiceSummary = z.output<typeof AdminGuestFundsServiceSummarySchema>;

export const AdminGuestFundsDiscoveryRowSchema = z
  .object({
    rowId: z.string().trim().min(1).max(160),
    origin: z.literal('guest'),
    linkState: AdminGuestFundsLinkStateSchema,
    guestDisplayName: z.string().trim().min(1).max(200).optional(),
    payer: AdminFinanceAccountIdentitySchema.optional(),
    paymentId: PaymentIdSchema.optional(),
    paymentStatus: PaymentStatusSchema.optional(),
    currency: z.literal('KZT').optional(),
    price: KztMinorUnitsSchema.optional(),
    paidAmount: KztMinorUnitsSchema.optional(),
    outstandingAmount: KztMinorUnitsSchema.optional(),
    refundedAmount: KztMinorUnitsSchema.optional(),
    retainedAmount: KztMinorUnitsSchema.optional(),
    writtenOffAmount: KztMinorUnitsSchema.optional(),
    service: AdminGuestFundsServiceSummarySchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminGuestFundsDiscoveryRow = z.output<typeof AdminGuestFundsDiscoveryRowSchema>;

export const AdminGuestFundsReadModelSchema = z
  .object({
    filter: AdminGuestFundsDiscoveryFilterSchema,
    items: z.array(AdminGuestFundsDiscoveryRowSchema).max(ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_MAX),
    nextCursor: z.string().trim().min(1).max(768).optional(),
    hasMore: z.boolean(),
  })
  .strict();

export type AdminGuestFundsReadModel = z.output<typeof AdminGuestFundsReadModelSchema>;

const AdminGuestFundsReadInputSchema = z
  .object({
    scope: z.literal('admin_guest_funds'),
    filter: AdminGuestFundsDiscoveryFilterSchema.optional(),
    pageSize: z.number().int().positive().max(ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_MAX).optional(),
    cursor: z.string().trim().min(1).max(768).optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export const QueryAdminFinanceReadModelsInputSchema = z.discriminatedUnion('scope', [
  AdminWalletReadInputSchema,
  AdminPaymentDetailReadInputSchema,
  AdminSchoolMovementReadInputSchema,
  AdminFinancialOverviewReadInputSchema,
  AdminGuestFundsReadInputSchema,
]);

export type QueryAdminFinanceReadModelsInput = z.output<
  typeof QueryAdminFinanceReadModelsInputSchema
>;

export const QueryAdminFinanceReadModelsResultSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('admin_wallet'), item: AdminWalletReadModelSchema }).strict(),
  z
    .object({
      scope: z.literal('admin_payment_detail'),
      item: AdminPaymentDetailReadModelSchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_school_movement'),
      item: AdminSchoolMovementReadModelSchema,
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_financial_overview'),
      item: AdminFinancialOverviewReadModelSchema,
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_guest_funds'),
      item: AdminGuestFundsReadModelSchema,
    })
    .strict(),
]);

export type QueryAdminFinanceReadModelsResult = z.output<
  typeof QueryAdminFinanceReadModelsResultSchema
>;
