import {
  AccountSchema,
  BookingSchema,
  PaymentSchema,
  derivePaymentStatus,
  timestampFromDate,
} from '@ski-academy/shared-domain';

export const revenueAt = timestampFromDate(new Date('2026-01-15T10:00:00Z'));
export const revenueAudit = {
  createdByCommandId: 'seed_revenue',
  lastChangedByCommandId: 'seed_revenue',
  correlationId: 'revenue_test',
};

export function revenueAccount(accountId = 'revenue_coach', instructorId = 'revenue_instructor') {
  return {
    ...AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: revenueAt,
      updatedAt: revenueAt,
      audit: revenueAudit,
    }),
    instructorId,
    isInstructor: true,
  };
}

export function revenueBooking(id = 'revenue_booking', overrides: Record<string, unknown> = {}) {
  return BookingSchema.parse({
    bookingId: id,
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId: 'revenue_admin' },
    },
    party: { kind: 'individual', participantIds: ['revenue_participant'] },
    occurrence: {
      occurrenceId: `occ_${id}`,
      instructorId: 'revenue_instructor',
      interval: {
        startsAt: timestampFromDate(new Date('2026-01-15T09:00:00Z')),
        endsAt: revenueAt,
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: ['revenue_participant'], frozenAt: revenueAt },
    },
    lifecycle: { status: 'completed', completedAt: revenueAt },
    paymentId: `payment_${id}`,
    revision: 1,
    createdAt: revenueAt,
    updatedAt: revenueAt,
    audit: revenueAudit,
    ...overrides,
  });
}

export function revenuePayment(id = 'revenue_booking', overrides: Record<string, unknown> = {}) {
  const fields = {
    paymentId: `payment_${id}`,
    subjectType: 'booking',
    subjectId: id,
    currency: 'KZT',
    originalPrice: 10000,
    price: 10000,
    paidAmount: 10000,
    refundedAmount: 0,
    retainedAmount: 10000,
    settledAmount: 10000,
    writtenOffAmount: 0,
    outstandingAmount: 0,
    incrementalRequirements: [],
    revision: 1,
    eventRevision: 1,
    createdAt: revenueAt,
    updatedAt: revenueAt,
    ...overrides,
  };
  return PaymentSchema.parse({ ...fields, paymentStatus: derivePaymentStatus(fields as never) });
}
