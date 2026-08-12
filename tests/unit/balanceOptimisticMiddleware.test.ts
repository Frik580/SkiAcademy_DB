import { beforeEach, describe, expect, it } from 'vitest';
import { create } from 'zustand';
import {
  balanceOptimisticMiddleware,
  selectEffectiveBalance,
  type BalanceOptimisticState,
} from '../../src/store/balanceOptimisticMiddleware';
import { useAuthStore } from '../../src/store/authStore';
import { withOptimisticBalance } from '../../src/store/withOptimisticBalance';

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
    useAuthStore.setState({
      userProfile: {
        uid: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
        role: 'user',
        avatarUrl: '',
        balanceUSD: 200,
      },
      optimisticBalanceDelta: 0,
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

    expect(useAuthStore.getState().optimisticBalanceDelta).toBe(0);
    expect(selectEffectiveBalance(useAuthStore.getState())).toBe(200);
  });

  it('keeps optimistic delta until snapshot sync', async () => {
    await withOptimisticBalance(40, async () => undefined);

    expect(useAuthStore.getState().optimisticBalanceDelta).toBe(40);
    expect(selectEffectiveBalance(useAuthStore.getState())).toBe(240);

    useAuthStore.getState().syncUserProfileFromSnapshot({
      uid: 'user-1',
      email: 'user@example.com',
      displayName: 'User',
      role: 'user',
      avatarUrl: '',
      balanceUSD: 240,
    });

    expect(useAuthStore.getState().optimisticBalanceDelta).toBe(0);
    expect(selectEffectiveBalance(useAuthStore.getState())).toBe(240);
  });
});
