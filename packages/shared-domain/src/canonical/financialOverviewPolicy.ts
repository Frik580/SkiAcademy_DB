import { localCalendarInputToUtcDate } from './bookingCreation';
import {
  compareCanonicalTimestamps,
  IanaTimeZoneSchema,
  TimeIntervalSchema,
  timestampFromDate,
  type CanonicalTimestamp,
  type TimeInterval,
} from './primitives';

export const ADMIN_FINANCIAL_OVERVIEW_PERIODS = ['day', 'week', 'month'] as const;
export type AdminFinancialOverviewPeriod = (typeof ADMIN_FINANCIAL_OVERVIEW_PERIODS)[number];

export interface FinancialOverviewPaymentEffectInput {
  readonly settledAmountDelta?: number;
  readonly refundedAmountDelta?: number;
  readonly writtenOffAmountDelta?: number;
  readonly priceDelta?: number;
  readonly paidAmountDelta?: number;
  readonly outstandingAmountDelta?: number;
}

export interface FinancialOverviewEventInput {
  readonly occurredAt: CanonicalTimestamp;
  readonly paymentEffect?: FinancialOverviewPaymentEffectInput;
}

export interface FinancialOverviewTotals {
  readonly settledRevenueKzt: number;
  readonly refundedKzt: number;
  readonly netSettledKzt: number;
}

export function adminFinancialOverviewWindow(
  localDate: string,
  period: AdminFinancialOverviewPeriod,
  timeZone: string
): TimeInterval {
  const zone = IanaTimeZoneSchema.parse(timeZone);
  if (period === 'month') {
    const [year, month] = localDate.split('-').map(Number);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    const start = localCalendarInputToUtcDate(
      { localDate: startDate, localTime: '00:00', durationMinutes: 60 },
      zone
    );
    const end = localCalendarInputToUtcDate(
      { localDate: endDate, localTime: '00:00', durationMinutes: 60 },
      zone
    );
    return TimeIntervalSchema.parse({
      startsAt: timestampFromDate(start),
      endsAt: timestampFromDate(end),
    });
  }
  const days = period === 'week' ? 7 : 1;
  const start = localCalendarInputToUtcDate(
    { localDate, localTime: '00:00', durationMinutes: 60 },
    zone
  );
  return TimeIntervalSchema.parse({
    startsAt: timestampFromDate(start),
    endsAt: timestampFromDate(new Date(start.getTime() + days * 24 * 60 * 60 * 1000)),
  });
}

export function eventOccurredInFinancialOverviewWindow(
  occurredAt: CanonicalTimestamp,
  window: TimeInterval
): boolean {
  if (compareCanonicalTimestamps(occurredAt, window.startsAt) < 0) return false;
  if (compareCanonicalTimestamps(occurredAt, window.endsAt) >= 0) return false;
  return true;
}

function netSettledContributionKzt(effect: FinancialOverviewPaymentEffectInput | undefined): number {
  const settled = effect?.settledAmountDelta ?? 0;
  const refunded = effect?.refundedAmountDelta ?? 0;
  // Refunds do not change settledAmount (ADR-0003). Count them only when this
  // event has no settlement delta, so a price-decrease event that already
  // encodes negative settledAmountDelta is not double-subtracted.
  if (settled !== 0) return settled;
  return -refunded;
}

export function financialOverviewTotalsFromMonetaryEffects(
  events: readonly FinancialOverviewEventInput[],
  window: TimeInterval
): FinancialOverviewTotals {
  let settledRevenueKzt = 0;
  let refundedKzt = 0;
  let netSettledKzt = 0;
  for (const event of events) {
    if (!eventOccurredInFinancialOverviewWindow(event.occurredAt, window)) continue;
    const settled = event.paymentEffect?.settledAmountDelta ?? 0;
    const refunded = event.paymentEffect?.refundedAmountDelta ?? 0;
    settledRevenueKzt += settled;
    refundedKzt += refunded;
    netSettledKzt += netSettledContributionKzt(event.paymentEffect);
  }
  return { settledRevenueKzt, refundedKzt, netSettledKzt };
}

export function settledRevenueKztFromMonetaryEffects(
  events: readonly FinancialOverviewEventInput[],
  window: TimeInterval
): number {
  return financialOverviewTotalsFromMonetaryEffects(events, window).settledRevenueKzt;
}
