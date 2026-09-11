import type { BookingStatus } from '@ski-academy/shared-domain';

/**
 * Booking-level outcome classification for Student Cabinet and related metrics.
 *
 * Training/student-progress metrics count only attended lessons (`completed`).
 * Business/school metrics may count `no_show` as a consumed slot.
 * Revenue/paid status is never inferred from lifecycle — use canonical Payment.
 */
export type LessonOutcomeKind = 'attended' | 'no_show' | 'cancelled' | 'open' | 'other';

export interface LessonOutcomeCounts {
  /** Any non-deleted reservation, including cancelled and no_show. */
  readonly booked: number;
  /** Canonical `completed` — student attended / training delivered. */
  readonly completed: number;
  /** Same as completed at booking level (no participant-progress projection here). */
  readonly attended: number;
  readonly noShow: number;
  readonly cancelled: number;
  /** Duration of attended lessons only. */
  readonly trainingHours: number;
  /** Duration of consumed instructor slots: completed + no_show. */
  readonly occupiedHours: number;
}

export type PaidLessonClassification = 'paid' | 'not_paid' | 'unknown';

export interface LessonPaymentSlice {
  readonly kind: 'visible' | 'withheld';
  readonly paymentStatus?: string;
}

const isDeleted = (booking: { readonly isDeleted?: boolean }) => Boolean(booking.isDeleted);

export function isAttendedLessonStatus(status: BookingStatus): boolean {
  return status === 'completed';
}

export function isNoShowLessonStatus(status: BookingStatus): boolean {
  return status === 'no_show';
}

export function isCancelledLessonStatus(status: BookingStatus): boolean {
  return status === 'cancelled';
}

/** Completed, no-show, or cancelled — not upcoming/current by lifecycle. */
export function isTerminalPastLessonStatus(status: BookingStatus): boolean {
  return status === 'completed' || status === 'no_show' || status === 'cancelled';
}

/** Instructor slot was consumed: lesson delivered or student did not attend. */
export function isConsumedInstructorSlotStatus(status: BookingStatus): boolean {
  return status === 'completed' || status === 'no_show';
}

export function isReviewEligibleLessonStatus(status: BookingStatus): boolean {
  return status === 'completed';
}

export function classifyLessonOutcome(status: BookingStatus): LessonOutcomeKind {
  if (status === 'completed') return 'attended';
  if (status === 'no_show') return 'no_show';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'pending' || status === 'confirmed' || status === 'pending_cancellation') {
    return 'open';
  }
  return 'other';
}

/**
 * Paid/revenue truth comes from canonical Payment presentation, never from
 * `no_show` or other lifecycle statuses.
 */
export function classifyPaidLessonFromPayment(
  payment: LessonPaymentSlice | undefined
): PaidLessonClassification {
  if (!payment || payment.kind !== 'visible' || payment.paymentStatus === undefined) {
    return 'unknown';
  }
  if (payment.paymentStatus === 'paid') return 'paid';
  return 'not_paid';
}

export function summarizeLessonOutcomes(
  bookings: readonly {
    readonly status: BookingStatus;
    readonly durationHours: number;
    readonly isDeleted?: boolean;
  }[]
): LessonOutcomeCounts {
  let booked = 0;
  let completed = 0;
  let noShow = 0;
  let cancelled = 0;
  let trainingHours = 0;
  let occupiedHours = 0;

  for (const booking of bookings) {
    if (isDeleted(booking)) continue;
    booked += 1;
    if (booking.status === 'completed') {
      completed += 1;
      trainingHours += booking.durationHours;
      occupiedHours += booking.durationHours;
    } else if (booking.status === 'no_show') {
      noShow += 1;
      occupiedHours += booking.durationHours;
    } else if (booking.status === 'cancelled') {
      cancelled += 1;
    }
  }

  return {
    booked,
    completed,
    attended: completed,
    noShow,
    cancelled,
    trainingHours,
    occupiedHours,
  };
}
