import { beforeEach, describe, expect, it } from 'vitest';
import { create } from 'zustand';
import {
  balanceOptimisticMiddleware,
  type BalanceOptimisticState,
  useWalletStore,
} from '../../src/features/wallet/walletStore';
import {
  selectEffectiveBalance,
  useEffectiveBalance,
} from '../../src/features/wallet/walletSelectors';
import { withOptimisticBalance } from '../../src/features/wallet/walletService';
import { useProfileStore } from '../../src/features/profile/profileStore';
import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface TestState extends BalanceOptimisticState {
  canonicalBalanceKzt: number | null;
  syncCanonicalWalletFromSnapshot: (input: { exists: boolean; balanceKzt: number | null }) => void;
}

const createTestStore = () =>
  create<TestState>()(
    balanceOptimisticMiddleware((set) => ({
      canonicalBalanceKzt: 100_000,
      syncCanonicalWalletFromSnapshot: ({ exists, balanceKzt }) =>
        set({
          canonicalBalanceKzt: exists ? (balanceKzt ?? 0) : 0,
          optimisticBalanceDelta: 0,
        }),
    }))
  );

describe('canonical Header balance', () => {
  beforeEach(() => {
    useWalletStore.setState({
      optimisticBalanceDelta: 0,
      walletLedgerEntries: [],
      canonicalBalanceKzt: null,
      canonicalWalletExists: false,
      canonicalWalletLoaded: false,
    });
    useProfileStore.setState({
      userProfile: {
        uid: 'account_header_balance',
        email: 'client@example.com',
        displayName: 'Client',
        role: 'user',
        avatarUrl: '',
        balanceUSD: 999,
        walletBalances: { USD: 999, KZT: 500_000 },
      },
    });
  });

  it('Navbar and wallet selector use canonical wallet balance, not legacy profile fields', () => {
    const navbarSource = readFileSync(join(process.cwd(), 'src/app/components/Navbar.tsx'), 'utf8');
    const selectorsSource = readFileSync(
      join(process.cwd(), 'src/features/wallet/walletSelectors.ts'),
      'utf8'
    );
    const syncSource = readFileSync(
      join(process.cwd(), 'src/features/wallet/sync/useWalletSync.ts'),
      'utf8'
    );

    expect(navbarSource).toContain('useEffectiveBalance');
    expect(navbarSource).toContain('formattedBalance');
    expect(navbarSource).not.toContain('userProfile.balanceUSD');
    expect(navbarSource).not.toContain('walletBalances');

    expect(selectorsSource).toContain('canonicalBalanceKzt');
    expect(selectorsSource).not.toContain('balanceUSD');
    expect(selectorsSource).not.toContain('useProfileStore');

    expect(syncSource).toContain("doc(db, 'users', firebaseUser.uid, 'wallet', 'state')");
    expect(syncSource).toContain('WalletSchema');
    expect(syncSource).toContain('syncCanonicalWalletFromSnapshot');
  });

  it('useEffectiveBalance prefers canonical wallet over differing legacy profile balances', () => {
    useWalletStore.setState({
      canonicalBalanceKzt: 50_000,
      canonicalWalletExists: true,
      canonicalWalletLoaded: true,
      optimisticBalanceDelta: 0,
    });

    const { result } = renderHook(() => useEffectiveBalance());

    expect(result.current).toBe(50_000);
    expect(useProfileStore.getState().userProfile?.balanceUSD).toBe(999);
    expect(useProfileStore.getState().userProfile?.walletBalances?.KZT).toBe(500_000);
  });

  it('updates when canonical wallet snapshot changes without re-auth', () => {
    useWalletStore.setState({
      canonicalBalanceKzt: 50_000,
      canonicalWalletExists: true,
      canonicalWalletLoaded: true,
      optimisticBalanceDelta: 0,
    });

    const { result } = renderHook(() => useEffectiveBalance());
    expect(result.current).toBe(50_000);

    act(() => {
      useWalletStore.getState().syncCanonicalWalletFromSnapshot({
        exists: true,
        balanceKzt: 38_000,
      });
    });

    expect(result.current).toBe(38_000);
    expect(useWalletStore.getState().optimisticBalanceDelta).toBe(0);
  });

  it('treats missing wallet as zero spendable balance', () => {
    useWalletStore.getState().syncCanonicalWalletFromSnapshot({
      exists: false,
      balanceKzt: null,
    });

    const { result } = renderHook(() => useEffectiveBalance());
    expect(result.current).toBe(0);
    expect(useWalletStore.getState().canonicalWalletExists).toBe(false);
    expect(useWalletStore.getState().canonicalWalletLoaded).toBe(true);
  });
});

describe('balanceOptimisticMiddleware', () => {
  beforeEach(() => {
    useWalletStore.setState({
      optimisticBalanceDelta: 0,
      walletLedgerEntries: [],
      canonicalBalanceKzt: 100_000,
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

  it('computes effective balance from canonical wallet and optimistic delta', () => {
    const store = createTestStore();
    store.getState().adjustOptimisticBalance(-25_000);

    expect(selectEffectiveBalance(store.getState() as never)).toBe(75_000);
  });

  it('resets optimistic delta when canonical wallet snapshot syncs', () => {
    const store = createTestStore();
    store.getState().adjustOptimisticBalance(50_000);
    store.getState().syncCanonicalWalletFromSnapshot({ exists: true, balanceKzt: 150_000 });

    expect(store.getState().optimisticBalanceDelta).toBe(0);
    expect(selectEffectiveBalance(store.getState() as never)).toBe(150_000);
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
