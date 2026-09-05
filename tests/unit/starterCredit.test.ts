import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STARTER_CREDIT_USD,
  isResettableWalletUser,
  normalizeStarterCreditUsd,
  resolveStarterCreditAmountKzt,
  STARTER_CREDIT_USD,
  starterOnlyWalletFields,
} from '../../src/domain/wallet/starterCredit';

describe('starter credit helpers', () => {
  it('defaults to a 250 registration gift', () => {
    expect(DEFAULT_STARTER_CREDIT_USD).toBe(250);
    expect(STARTER_CREDIT_USD).toBe(250);
  });

  it('normalizes configured amounts', () => {
    expect(normalizeStarterCreditUsd(100)).toBe(100);
    expect(normalizeStarterCreditUsd(-5)).toBe(0);
    expect(normalizeStarterCreditUsd(50_000)).toBe(10_000);
    expect(normalizeStarterCreditUsd('175.4')).toBe(175);
    expect(normalizeStarterCreditUsd('nope')).toBe(250);
  });

  it('prefers amountKzt over legacy amountUsd', () => {
    expect(resolveStarterCreditAmountKzt({ amountKzt: 500, amountUsd: 250 })).toBe(500);
    expect(resolveStarterCreditAmountKzt({ amountUsd: 175 })).toBe(175);
    expect(resolveStarterCreditAmountKzt({})).toBe(250);
    expect(resolveStarterCreditAmountKzt(null)).toBe(250);
  });

  it('skips admin and global stats docs', () => {
    expect(isResettableWalletUser('school_global_stats', { role: 'user' })).toBe(false);
    expect(isResettableWalletUser('admin-1', { role: 'admin' })).toBe(false);
    expect(isResettableWalletUser('user-1', { role: 'user' })).toBe(true);
    expect(isResettableWalletUser('user-2', undefined)).toBe(false);
  });

  it('builds starter-only wallet fields', () => {
    expect(starterOnlyWalletFields(100)).toEqual({
      balanceUSD: 100,
      walletBalances: { KZT: 100, USD: 0 },
      pendingWalletCredit: 0,
    });
  });
});
