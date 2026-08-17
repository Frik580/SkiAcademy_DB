import { describe, expect, it } from 'vitest';
import {
  MAX_WALLET_CREDIT_USD,
  MAX_WALLET_TOPUP_USD,
  adminBalanceAdjustmentDelta,
} from '../../src/domain/wallet/walletCredit';

describe('walletCredit constants', () => {
  it('caps demo top-ups below the Firestore credit limit', () => {
    expect(MAX_WALLET_TOPUP_USD).toBeLessThanOrEqual(MAX_WALLET_CREDIT_USD);
  });
});

describe('adminBalanceAdjustmentDelta', () => {
  it('returns null when balance is unchanged', () => {
    expect(adminBalanceAdjustmentDelta(100, 100)).toBeNull();
  });

  it('returns signed delta for admin balance edits', () => {
    expect(adminBalanceAdjustmentDelta(100, 250)).toBe(150);
    expect(adminBalanceAdjustmentDelta(250, 100)).toBe(-150);
  });
});
