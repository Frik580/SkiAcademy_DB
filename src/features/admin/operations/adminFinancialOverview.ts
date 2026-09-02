import type { Booking } from '../../../types';
import { isCourseBooking } from '../../../domain/availability';

export interface AdminOperationalOverviewMetrics {
  readonly activeBookings: number;
  readonly completedBookings: number;
  readonly instructorsCount: number;
  readonly lessonCount: number;
  readonly courseEnrollmentCount: number;
}

export function computeAdminOperationalOverview(input: {
  readonly bookings: readonly Booking[];
  readonly instructorsCount: number;
}): AdminOperationalOverviewMetrics {
  let activeBookings = 0;
  let completedBookings = 0;
  let lessonCount = 0;
  let courseEnrollmentCount = 0;
  for (const booking of input.bookings) {
    if (booking.userId?.startsWith('system_block_')) continue;
    if (isCourseBooking(booking)) courseEnrollmentCount += 1;
    else lessonCount += 1;
    if (booking.status === 'confirmed' || booking.status === 'pending_cancellation') {
      activeBookings += 1;
    }
    if (booking.status === 'completed') completedBookings += 1;
  }
  return {
    activeBookings,
    completedBookings,
    instructorsCount: input.instructorsCount,
    lessonCount,
    courseEnrollmentCount,
  };
}

export function isUsdToKztDisplayRateAvailable(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0;
}

export function formatCanonicalKztForDisplay(
  amountKzt: number,
  currency: 'USD' | 'KZT',
  usdToKztRate: number
): string {
  if (currency === 'KZT' || !isUsdToKztDisplayRateAvailable(usdToKztRate)) {
    return `${amountKzt.toLocaleString('ru-RU')} ₸`;
  }
  const usd = Math.round(amountKzt / usdToKztRate);
  return `$${usd.toLocaleString('en-US')}`;
}
