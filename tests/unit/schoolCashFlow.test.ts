import { describe, expect, it } from 'vitest';
import {
  buildSchoolCashFlowRows,
  classifySchoolCashFlow,
  summarizeSchoolCashFlow,
} from '../../src/domain/wallet/schoolCashFlow';
import { isGuestCashSubject } from '../../src/domain/wallet/schoolGuestWallet';
import type { WalletLedgerEntry } from '../../src/types';

const entry = (
  overrides: Partial<WalletLedgerEntry> & Pick<WalletLedgerEntry, 'id' | 'type' | 'amount'>
): WalletLedgerEntry => ({
  userId: 'user-1',
  balanceAfter: 0,
  createdAt: '2026-08-01T10:00:00.000Z',
  ...overrides,
});

describe('school cash flow', () => {
  it('puts top-ups and admin credits on the cash track', () => {
    expect(classifySchoolCashFlow('top_up', 50)).toEqual({ track: 'cash', direction: 'in' });
    expect(classifySchoolCashFlow('admin_adjustment', 30)).toEqual({
      track: 'cash',
      direction: 'in',
    });
    expect(classifySchoolCashFlow('admin_adjustment', -15)).toEqual({
      track: 'cash',
      direction: 'out',
    });
  });

  it('keeps starter credit out of cash and revenue totals', () => {
    expect(classifySchoolCashFlow('starter_credit', 250)).toEqual({
      track: 'none',
      direction: null,
    });

    const summary = summarizeSchoolCashFlow(
      buildSchoolCashFlowRows([entry({ id: 's1', type: 'starter_credit', amount: 250 })])
    );

    expect(summary.cashIn.USD).toBe(0);
    expect(summary.cashOut.USD).toBe(0);
    expect(summary.revenueIn.USD).toBe(0);
    expect(summary.revenueOut.USD).toBe(0);
    expect(summary.byKind[0]?.kind).toBe('starter_credit');
  });

  it('models guest confirm as top-up then lesson charge', () => {
    const summary = summarizeSchoolCashFlow(
      buildSchoolCashFlowRows([
        entry({
          id: 't1',
          userId: 'school_guest',
          type: 'top_up',
          amount: 90,
          balanceAfter: 90,
          bookingId: 'guest-1',
        }),
        entry({
          id: 'p1',
          userId: 'school_guest',
          type: 'lesson_payment',
          amount: -90,
          balanceAfter: 0,
          bookingId: 'guest-1',
        }),
      ]),
      [],
      0
    );

    expect(summary.cashIn.USD).toBe(90);
    expect(summary.revenueIn.USD).toBe(90);
    expect(summary.guestWalletBalanceUsd).toBe(0);
  });

  it('models guest cancel as refund back onto the guest wallet', () => {
    const summary = summarizeSchoolCashFlow(
      buildSchoolCashFlowRows([
        entry({
          id: 't1',
          userId: 'school_guest',
          type: 'top_up',
          amount: 90,
          bookingId: 'guest-1',
        }),
        entry({
          id: 'p1',
          userId: 'school_guest',
          type: 'lesson_payment',
          amount: -90,
          bookingId: 'guest-1',
        }),
        entry({
          id: 'r1',
          userId: 'school_guest',
          type: 'refund',
          amount: 90,
          bookingId: 'guest-1',
        }),
      ]),
      [],
      90
    );

    expect(summary.cashIn.USD).toBe(90);
    expect(summary.revenueIn.USD).toBe(90);
    expect(summary.revenueOut.USD).toBe(90);
    expect(summary.revenueNet.USD).toBe(0);
    expect(summary.guestWalletBalanceUsd).toBe(90);
  });

  it('does not double-count a wallet top-up and the later lesson payment', () => {
    const summary = summarizeSchoolCashFlow(
      buildSchoolCashFlowRows([
        entry({ id: '1', type: 'top_up', amount: 100, currency: 'USD' }),
        entry({ id: '2', type: 'lesson_payment', amount: -80, currency: 'USD' }),
        entry({ id: '3', type: 'refund', amount: 20, currency: 'USD' }),
      ])
    );

    expect(summary.cashIn.USD).toBe(100);
    expect(summary.cashOut.USD).toBe(0);
    expect(summary.cashNet.USD).toBe(100);
    expect(summary.revenueIn.USD).toBe(80);
    expect(summary.revenueOut.USD).toBe(20);
    expect(summary.revenueNet.USD).toBe(60);
  });

  it('summarizes remaining client wallet balances as liabilities', () => {
    const summary = summarizeSchoolCashFlow(
      [],
      [
        { balanceUSD: 40, walletBalances: { USD: 40, KZT: 1000 } },
        { balanceUSD: 10, walletBalances: { USD: 5 } },
      ]
    );
    expect(summary.liabilities.USD).toBe(45);
    expect(summary.liabilities.KZT).toBe(1000);
  });
});

describe('guest cash subject', () => {
  it('detects guest bookings for cash wallet settlement', () => {
    expect(isGuestCashSubject({ userId: 'guest_1', isGuest: true })).toBe(true);
    expect(isGuestCashSubject({ userId: 'guest_1', isGuest: false })).toBe(true);
    expect(isGuestCashSubject({ userId: 'user_1', isGuest: false })).toBe(false);
    expect(isGuestCashSubject({ userId: 'system_block_x' })).toBe(false);
  });
});
