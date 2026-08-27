import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  BookingIdSchema,
  paymentIdFromBookingId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  canAccountViewLessonBookingFinancial,
  buildPaymentPresentation,
} from './lessonBookingReadModels';

const accountId = AccountIdSchema.parse('account_payment_withheld_01');
const otherAccountId = AccountIdSchema.parse('account_payment_withheld_02');
const bookingId = BookingIdSchema.parse('booking_payment_withheld_01');
const paymentId = paymentIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));

function booking(payerAccountId?: typeof accountId) {
  return {
    bookingId,
    attribution: {
      bookingOrigin: 'account' as const,
      bookedBy: { kind: 'account' as const, accountId },
    },
    party: { kind: 'individual' as const, participantIds: ['participant_payment_withheld_01'] },
    occurrence: {
      occurrenceId: 'occurrence_payment_withheld_01',
      instructorId: 'instructor_payment_withheld_01',
      interval: {
        startsAt: timestampFromDate(new Date('2026-06-15T09:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-06-15T10:00:00.000Z')),
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: ['participant_payment_withheld_01'] },
    },
    lifecycle: { status: 'confirmed' as const },
    paymentId,
    ...(payerAccountId ? { payerAccountId } : {}),
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId: 'correlation_payment_withheld_01',
    },
  };
}

function payment(payerAccountId: typeof accountId) {
  return {
    paymentId,
    subjectType: 'booking' as const,
    subjectId: bookingId,
    currency: 'KZT' as const,
    originalPrice: 10000,
    price: 10000,
    paidAmount: 10000,
    refundedAmount: 0,
    retainedAmount: 10000,
    settledAmount: 10000,
    writtenOffAmount: 0,
    outstandingAmount: 0,
    paymentStatus: 'paid' as const,
    payerAccountId,
    incrementalRequirements: [],
    eventRevision: 1,
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  };
}

describe('payment presentation without fake unpaid fallback', () => {
  it('withholds financial projection instead of inventing unpaid status', () => {
    const record = booking(accountId);
    const paymentRecord = payment(accountId);
    expect(
      buildPaymentPresentation(otherAccountId, record as never, paymentRecord as never)
    ).toEqual({ kind: 'withheld' });
    expect(
      buildPaymentPresentation(otherAccountId, record as never, paymentRecord as never)
    ).not.toEqual({ kind: 'visible', paymentStatus: 'unpaid', paymentRevision: 1 });
  });

  it('omits payment projection when payment record is missing', () => {
    const record = booking(accountId);
    expect(buildPaymentPresentation(accountId, record as never, undefined)).toBeUndefined();
    expect(canAccountViewLessonBookingFinancial(accountId, record as never, undefined)).toBe(true);
  });
});
