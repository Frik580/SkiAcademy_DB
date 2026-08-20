import { describe, expect, it } from 'vitest';
import {
  GUEST_WALLET_SETTINGS_COLLECTION,
  GUEST_WALLET_SETTINGS_DOC_ID,
  guestWalletSettingsPath,
  isGuestCashSubject,
  normalizeGuestWalletBalance,
  resolveGuestWalletAdjustment,
  SCHOOL_GUEST_WALLET_USER_ID,
} from '../../src/domain/wallet/schoolGuestWallet';

describe('school guest wallet helpers', () => {
  it('exposes the settings path and synthetic user id', () => {
    expect(SCHOOL_GUEST_WALLET_USER_ID).toBe('school_guest');
    expect(guestWalletSettingsPath()).toEqual({
      collection: GUEST_WALLET_SETTINGS_COLLECTION,
      docId: GUEST_WALLET_SETTINGS_DOC_ID,
    });
    expect(GUEST_WALLET_SETTINGS_COLLECTION).toBe('settings');
    expect(GUEST_WALLET_SETTINGS_DOC_ID).toBe('guest_wallet');
  });

  it('normalizes guest wallet balances', () => {
    expect(normalizeGuestWalletBalance(12.5)).toBe(12.5);
    expect(normalizeGuestWalletBalance(-3)).toBe(0);
    expect(normalizeGuestWalletBalance('nope')).toBe(0);
    expect(normalizeGuestWalletBalance(Number.NaN)).toBe(0);
  });

  it('detects guest cash subjects', () => {
    expect(isGuestCashSubject({ userId: 'guest_1', isGuest: true })).toBe(true);
    expect(isGuestCashSubject({ userId: 'guest_1', isGuest: false })).toBe(true);
    expect(isGuestCashSubject({ userId: 'user_1', isGuest: false })).toBe(false);
    expect(isGuestCashSubject({ userId: 'system_block_x' })).toBe(false);
  });

  it('resolves top-up and withdraw adjustments', () => {
    expect(resolveGuestWalletAdjustment(10, 25, 'top_up')).toEqual({
      delta: 25,
      balanceAfter: 35,
    });
    expect(resolveGuestWalletAdjustment(40, 15, 'withdraw')).toEqual({
      delta: -15,
      balanceAfter: 25,
    });
  });

  it('rejects invalid or overdrawn guest wallet adjustments', () => {
    expect(() => resolveGuestWalletAdjustment(10, 0, 'top_up')).toThrow(/positive/i);
    expect(() => resolveGuestWalletAdjustment(10, -5, 'withdraw')).toThrow(/positive/i);
    expect(() => resolveGuestWalletAdjustment(10, 11, 'withdraw')).toThrow(/Insufficient/i);
  });
});
