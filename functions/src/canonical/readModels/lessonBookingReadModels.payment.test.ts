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
    ).not.toEqual({ kind: 'visible', paymentStatus: 'unpaid', paymentRevision: 1, price: 10000 });
  });

  it('projects canonical payment price for payer-visible presentation', () => {
    const record = booking(accountId);
    const paymentRecord = payment(accountId);
    expect(buildPaymentPresentation(accountId, record as never, paymentRecord as never)).toEqual({
      kind: 'visible',
      paymentStatus: 'paid',
      paymentRevision: 1,
      price: 10000,
    });
  });

  it('projects production-like paid KZT payment fields without legacy aliases', () => {
    const productionBookingId = BookingIdSchema.parse('booking_b30f2dfe00f04cdb85d5092902bf99d4');
    const payerAccountId = AccountIdSchema.parse('F5mwFT8KvAOkYHxlElpagT1yftr1');
    const productionPaymentId = paymentIdFromBookingId(productionBookingId);
    const productionBooking = {
      ...booking(payerAccountId),
      bookingId: productionBookingId,
      paymentId: productionPaymentId,
    };
    const productionPayment = {
      ...payment(payerAccountId),
      paymentId: productionPaymentId,
      subjectId: productionBookingId,
      currency: 'KZT' as const,
      originalPrice: 50000,
      price: 50000,
      paidAmount: 50000,
      retainedAmount: 50000,
      settledAmount: 50000,
      outstandingAmount: 0,
      paymentStatus: 'paid' as const,
    };

    expect(
      buildPaymentPresentation(payerAccountId, productionBooking as never, productionPayment as never)
    ).toEqual({
      kind: 'visible',
      paymentStatus: 'paid',
      paymentRevision: 1,
      price: 50000,
    });
  });

  it('omits payment projection when payment record is missing', () => {
    const record = booking(accountId);
    expect(buildPaymentPresentation(accountId, record as never, undefined)).toBeUndefined();
    expect(canAccountViewLessonBookingFinancial(accountId, record as never, undefined)).toBe(true);
  });
});
