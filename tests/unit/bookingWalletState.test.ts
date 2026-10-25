import { describe, expect, it } from 'vitest';
import { resolveBookingWalletState } from '../../src/features/bookings/components/booking_modal/bookingWalletState';
import type { CanonicalWalletSnapshot } from '../../src/features/wallet/walletStore';

const wallet: CanonicalWalletSnapshot = {
  canonicalWalletAccountId: 'account_a',
  canonicalWalletLoaded: true,
  canonicalWalletExists: true,
  canonicalWalletTrusted: true,
  canonicalBalanceKzt: 20000,
  canonicalWalletEventRevision: 1,
};

describe('booking canonical wallet eligibility', () => {
  it.each([
    [0, false],
    [19999, false],
    [20000, true],
    [20001, true],
  ] as const)('compares KZT directly at balance %s', (balance, canPay) => {
    const state = resolveBookingWalletState(
      { ...wallet, canonicalBalanceKzt: balance },
      'account_a',
      'account_a',
      20000
    );
    expect(state.canPay).toBe(canPay);
    expect(state.insufficient).toBe(!canPay);
    expect(state.balance).toBe(balance);
  });

  it.each([
    { canonicalWalletLoaded: false },
    { canonicalWalletExists: false },
    { canonicalWalletTrusted: false },
    { canonicalBalanceKzt: null },
    { canonicalBalanceKzt: NaN },
    { canonicalWalletAccountId: 'previous_account' },
  ])('blocks uncertain wallet without false insufficient feedback: %o', (override) => {
    const state = resolveBookingWalletState(
      { ...wallet, ...override },
      'account_a',
      'account_a',
      20000
    );
    expect(state.canPay).toBe(false);
    expect(state.insufficient).toBe(false);
    expect(state.balance).toBeNull();
  });

  it('blocks an old profile immediately after principal changes', () => {
    expect(resolveBookingWalletState(wallet, 'account_a', 'account_b', 20000).canPay).toBe(false);
    expect(resolveBookingWalletState(wallet, 'account_a', undefined, 20000).canPay).toBe(false);
  });
});
