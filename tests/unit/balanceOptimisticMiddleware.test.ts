import { beforeEach, describe, expect, it } from 'vitest';
import { create } from 'zustand';
import {
  balanceOptimisticMiddleware,
  type BalanceOptimisticState,
} from '../../src/features/wallet/walletStore';
import { withOptimisticBalance } from '../../src/features/wallet/walletService';
import { useWalletStore } from '../../src/features/wallet/walletStore';

/**
 * Helper to compute effective balance (real + optimistic delta)
 * Local copy for testing purposes
 */
const selectEffectiveBalance = (
  state: BalanceOptimisticState & { userProfile?: { balanceUSD: number } | null }
) => {
  const realBalance = state.userProfile?.balanceUSD ?? 200; // default for tests
  return realBalance + state.optimisticBalanceDelta;
};

interface TestState extends BalanceOptimisticState {
  userProfile: { balanceUSD: number } | null;
  syncUserProfileFromSnapshot: (profile: { balanceUSD: number } | null) => void;
}

const createTestStore = () =>
  create<TestState>()(
    balanceOptimisticMiddleware((set) => ({
      userProfile: { balanceUSD: 100 },
      syncUserProfileFromSnapshot: (profile) =>
        set({ userProfile: profile, optimisticBalanceDelta: 0 }),
    }))
  );

describe('balanceOptimisticMiddleware', () => {
  beforeEach(() => {
    useWalletStore.setState({
      optimisticBalanceDelta: 0,
      walletLedgerEntries: [],
      adjustOptimisticBalance: (delta) => {
        if (delta === 0) return;
        useWalletStore.setState((current) => ({
          optimisticBalanceDelta: current.optimisticBalanceDelta + delta,
        }));
      },
      resetOptimisticBalance: () => {
        useWalletStore.setState({ optimisticBalanceDelta: 0 });
      },
      setWalletLedgerEntries: () => {},
    });
  });

  it('computes effective balance from snapshot balance and optimistic delta', () => {
    const store = createTestStore();
    store.getState().adjustOptimisticBalance(-25);

    expect(selectEffectiveBalance(store.getState())).toBe(75);
  });

  it('resets optimistic delta when profile snapshot syncs', () => {
    const store = createTestStore();
    store.getState().adjustOptimisticBalance(50);
    store.getState().syncUserProfileFromSnapshot({ balanceUSD: 150 });

    expect(store.getState().optimisticBalanceDelta).toBe(0);
    expect(selectEffectiveBalance(store.getState())).toBe(150);
  });

  it('rolls back optimistic delta on failed operation', async () => {
    await expect(
      withOptimisticBalance(-30, async () => {
        throw new Error('payment failed');
      })
    ).rejects.toThrow('payment failed');

    expect(useWalletStore.getState().optimisticBalanceDelta).toBe(0);
  });

  it('keeps optimistic delta until snapshot sync', async () => {
    await withOptimisticBalance(40, async () => undefined);

    expect(useWalletStore.getState().optimisticBalanceDelta).toBe(40);
  });
});
