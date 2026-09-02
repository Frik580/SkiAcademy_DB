import { describe, expect, it } from 'vitest';
import {
  adminFinancialOverviewWindow,
  financialOverviewTotalsFromMonetaryEffects,
  settledRevenueKztFromMonetaryEffects,
} from './financialOverviewPolicy';

const month = adminFinancialOverviewWindow('2026-01-15', 'month', 'UTC');
const day = adminFinancialOverviewWindow('2026-01-15', 'day', 'UTC');
const week = adminFinancialOverviewWindow('2026-01-15', 'week', 'UTC');

function at(iso: string) {
  const ms = Date.parse(iso);
  return { seconds: Math.floor(ms / 1000), nanoseconds: 0 };
}

describe('financialOverviewTotalsFromMonetaryEffects', () => {
  it('increases net revenue for positive settlement and ignores Payment.price / write-off / outstanding', () => {
    const totals = financialOverviewTotalsFromMonetaryEffects(
      [
        {
          occurredAt: at('2026-01-10T12:00:00.000Z'),
          paymentEffect: { settledAmountDelta: 80_000, paidAmountDelta: 80_000, priceDelta: 120_000 },
        },
        {
          occurredAt: at('2026-01-11T12:00:00.000Z'),
          paymentEffect: { writtenOffAmountDelta: 20_000, outstandingAmountDelta: -20_000 },
        },
        {
          occurredAt: at('2026-01-12T12:00:00.000Z'),
          paymentEffect: { priceDelta: 50_000, outstandingAmountDelta: 50_000 },
        },
      ],
      month
    );
    expect(totals.settledRevenueKzt).toBe(80_000);
    expect(totals.refundedKzt).toBe(0);
    expect(totals.netSettledKzt).toBe(80_000);
  });

  it('reduces net revenue for a pure refund without double-counting settledAmountDelta', () => {
    const totals = financialOverviewTotalsFromMonetaryEffects(
      [
        {
          occurredAt: at('2026-01-10T12:00:00.000Z'),
          paymentEffect: { settledAmountDelta: 100_000, paidAmountDelta: 100_000 },
        },
        {
          occurredAt: at('2026-01-18T12:00:00.000Z'),
          paymentEffect: { refundedAmountDelta: 20_000 },
        },
      ],
      month
    );
    expect(totals.settledRevenueKzt).toBe(100_000);
    expect(totals.refundedKzt).toBe(20_000);
    expect(totals.netSettledKzt).toBe(80_000);
  });

  it('does not double-subtract a refund already encoded as negative settledAmountDelta', () => {
    const totals = financialOverviewTotalsFromMonetaryEffects(
      [
        {
          occurredAt: at('2026-01-10T12:00:00.000Z'),
          paymentEffect: { settledAmountDelta: 100_000 },
        },
        {
          occurredAt: at('2026-01-20T12:00:00.000Z'),
          paymentEffect: { settledAmountDelta: -20_000, refundedAmountDelta: 20_000 },
        },
      ],
      month
    );
    expect(totals.settledRevenueKzt).toBe(80_000);
    expect(totals.refundedKzt).toBe(20_000);
    expect(totals.netSettledKzt).toBe(80_000);
  });

  it('accounts for a partial refund of previously settled money', () => {
    const totals = financialOverviewTotalsFromMonetaryEffects(
      [
        {
          occurredAt: at('2026-01-08T12:00:00.000Z'),
          paymentEffect: { settledAmountDelta: 100_000 },
        },
        {
          occurredAt: at('2026-01-22T12:00:00.000Z'),
          paymentEffect: { refundedAmountDelta: 30_000 },
        },
      ],
      month
    );
    expect(totals.netSettledKzt).toBe(70_000);
    expect(totals.refundedKzt).toBe(30_000);
  });

  it('excludes events outside the selected period and changes result when the period changes', () => {
    const events = [
      {
        occurredAt: at('2026-01-15T12:00:00.000Z'),
        paymentEffect: { settledAmountDelta: 40_000 },
      },
      {
        occurredAt: at('2026-01-25T12:00:00.000Z'),
        paymentEffect: { settledAmountDelta: 25_000 },
      },
      {
        occurredAt: at('2025-12-31T23:00:00.000Z'),
        paymentEffect: { settledAmountDelta: 999_000 },
      },
    ];
    expect(financialOverviewTotalsFromMonetaryEffects(events, day).netSettledKzt).toBe(40_000);
    expect(financialOverviewTotalsFromMonetaryEffects(events, week).netSettledKzt).toBe(40_000);
    expect(financialOverviewTotalsFromMonetaryEffects(events, month).netSettledKzt).toBe(65_000);
    expect(settledRevenueKztFromMonetaryEffects(events, month)).toBe(65_000);
  });

  it('returns true zero when the window contains no financial events', () => {
    expect(financialOverviewTotalsFromMonetaryEffects([], month)).toEqual({
      settledRevenueKzt: 0,
      refundedKzt: 0,
      netSettledKzt: 0,
    });
  });
});
