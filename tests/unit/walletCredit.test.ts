import { describe, expect, it } from 'vitest';
import { MAX_WALLET_CREDIT_USD, MAX_WALLET_TOPUP_USD } from '../../src/lib/walletCredit';

describe('walletCredit constants', () => {
  it('caps demo top-ups below the Firestore credit limit', () => {
    expect(MAX_WALLET_TOPUP_USD).toBeLessThanOrEqual(MAX_WALLET_CREDIT_USD);
  });
});
