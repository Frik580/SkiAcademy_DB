import { describe, expect, it } from 'vitest';
import { CommandIntentSchemaByKind } from '@ski-academy/shared-domain';
import {
  createAdminFinanceAttemptId,
  parseKztAmountToCanonicalUnits,
} from '../../src/features/admin/components/finance/financeContracts';
import { readRepoFile } from '../helpers/readRepoFile';

describe('T32.3 Admin finance contracts', () => {
  it('keeps whole-KZT input on the same exact scale as canonical producers', () => {
    expect(parseKztAmountToCanonicalUnits('25_000')).toBeUndefined();
    expect(parseKztAmountToCanonicalUnits('25000')).toBe(25_000);
    expect(parseKztAmountToCanonicalUnits('125.45')).toBeUndefined();
    expect(parseKztAmountToCanonicalUnits('0')).toBeUndefined();
    expect(parseKztAmountToCanonicalUnits('-1')).toBeUndefined();
  });

  it('rejects zero and negative manual funding at the canonical intent boundary', () => {
    const schema = CommandIntentSchemaByKind.record_manual_wallet_funding;
    expect(
      schema.safeParse({ accountId: 'account_test_01', amount: 0, reasonExplanation: 'No-op' })
        .success
    ).toBe(false);
    expect(
      schema.safeParse({ accountId: 'account_test_01', amount: -100, reasonExplanation: 'Invalid' })
        .success
    ).toBe(false);
  });

  it('creates a fresh identity for each later user action', () => {
    expect(createAdminFinanceAttemptId('funding')).not.toBe(createAdminFinanceAttemptId('funding'));
  });

  it('does not expose a generic balance setter or direct monetary Firestore writer', () => {
    const panel = readRepoFile('src/features/admin/components/finance/CanonicalFinancePanel.tsx');
    const activeAdmin = readRepoFile('src/features/admin/components/AdminPanel.tsx');

    expect(panel).toContain("kind: 'record_manual_wallet_funding'");
    expect(panel).toContain("kind: 'record_financial_correction'");
    expect(panel).not.toMatch(/setBalance|balanceUSD|wallet_ledger|updateDoc|setDoc|deleteDoc/);
    expect(activeAdmin).not.toContain('<CashFlowPanel');
    expect(activeAdmin).not.toContain('<GuestWalletPanel');
  });
});
