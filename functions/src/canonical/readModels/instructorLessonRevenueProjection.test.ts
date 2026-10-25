import { describe, expect, it } from 'vitest';
import {
  revenueAt,
  revenueBooking,
  revenuePayment,
} from '../../../../tests/helpers/instructorRevenueFixtures';
import { completedLessonRevenueContribution } from './instructorLessonRevenueProjection';

const contribution = (payment: Record<string, unknown> | undefined) =>
  completedLessonRevenueContribution('revenue_booking', revenueBooking(), payment);

describe('completed lesson canonical retained revenue', () => {
  it('excludes pending guest reservations even when Payment retains money', () => {
    const pending = revenueBooking('revenue_booking', {
      attribution: {
        bookingOrigin: 'guest',
        bookedBy: { kind: 'guest', guestSubjectId: 'guest_revenue' },
      },
      lifecycle: { status: 'pending', reservationExpiresAt: revenueAt },
    });
    expect(
      completedLessonRevenueContribution('revenue_booking', pending, revenuePayment())
    ).toMatchObject({
      retainedAmount: 0,
      unavailableCount: 0,
    });
  });
  it.each([
    ['fully paid', {}, 10000],
    [
      'partially paid',
      { paidAmount: 4000, retainedAmount: 4000, settledAmount: 4000, outstandingAmount: 6000 },
      4000,
    ],
    ['partial refund', { refundedAmount: 2500, retainedAmount: 7500 }, 7500],
    ['full refund', { refundedAmount: 10000, retainedAmount: 0 }, 0],
    ['free', { originalPrice: 0, price: 0, paidAmount: 0, retainedAmount: 0, settledAmount: 0 }, 0],
    ['unpaid', { paidAmount: 0, retainedAmount: 0, settledAmount: 0, outstandingAmount: 10000 }, 0],
  ])('%s uses cash retained, never current tariff or settled amount', (_, patch, amount) => {
    expect(contribution(revenuePayment('revenue_booking', patch as object))).toMatchObject({
      retainedAmount: amount,
      unavailableCount: 0,
    });
  });

  it.each([
    undefined,
    { retainedAmount: 10000 },
    { ...revenuePayment(), retainedAmount: 9999 },
    { ...revenuePayment(), subjectId: 'other_booking' },
    { ...revenuePayment(), paymentId: 'other_payment' },
    { ...revenuePayment(), subjectType: 'course_enrollment' },
    { ...revenuePayment(), dataScope: 'test', testSessionId: 'another_session' },
  ])('withholds the total for missing/invalid/unrelated/cross-scope Payment %#', (payment) => {
    expect(contribution(payment)).toMatchObject({ retainedAmount: 0, unavailableCount: 1 });
  });

  it.each([
    { status: 'confirmed' },
    { status: 'pending_cancellation', requestedAt: revenueAt },
    { status: 'cancelled', cancelledAt: revenueAt, reasonCode: 'administrator_cancelled' },
    { status: 'no_show', noShowAt: revenueAt },
  ])('excludes $status even with retained money', (lifecycle) => {
    expect(
      completedLessonRevenueContribution(
        'revenue_booking',
        revenueBooking('revenue_booking', {
          lifecycle,
        }),
        revenuePayment()
      )
    ).toMatchObject({ retainedAmount: 0, unavailableCount: 0 });
  });

  it('counts a family lesson once for all service participants', () => {
    const base = revenueBooking();
    const participants = ['revenue_participant', 'revenue_child'];
    expect(
      completedLessonRevenueContribution(
        base.bookingId,
        revenueBooking(base.bookingId, {
          party: { kind: 'family_group', participantIds: participants },
          occurrence: {
            ...base.occurrence,
            serviceParty: { participantIds: participants, frozenAt: revenueAt },
          },
        }),
        revenuePayment()
      )
    ).toMatchObject({ retainedAmount: 10000, unavailableCount: 0 });
  });

  it('preserves Booking and Payment revisions and partitions each test session', () => {
    const fields = { dataScope: 'test', testSessionId: 'test_revenue' };
    expect(
      completedLessonRevenueContribution(
        'revenue_booking',
        revenueBooking('revenue_booking', {
          ...fields,
          revision: 8,
        }),
        revenuePayment('revenue_booking', { ...fields, revision: 12 })
      )
    ).toMatchObject({
      summaryPath: 'instructor_lesson_revenue/test_test_revenue/instructors/revenue_instructor',
      bookingRevision: 8,
      paymentRevision: 12,
      retainedAmount: 10000,
    });
  });
});
