import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useWalletStore } from '../../src/features/wallet/walletStore';
import { useWalletSync } from '../../src/features/wallet/sync/useWalletSync';

const listeners = vi.hoisted(
  () =>
    [] as Array<{
      next: (snapshot: unknown) => void;
      error: (error: Error) => void;
      unsubscribe: ReturnType<typeof vi.fn>;
    }>
);
vi.mock('../../src/infrastructure/firebase', () => ({
  db: {},
  doc: vi.fn(),
  onSnapshot: (
    _ref: unknown,
    _options: unknown,
    next: (snapshot: unknown) => void,
    error: (error: Error) => void
  ) => {
    const unsubscribe = vi.fn();
    listeners.push({ next, error, unsubscribe });
    return unsubscribe;
  },
}));

const user = (uid: string) =>
  ({ uid }) as NonNullable<ReturnType<typeof useAuthStore.getState>['firebaseUser']>;
function snapshot(accountId = 'account_wallet_a', fromCache = false, hasPendingWrites = false) {
  return {
    exists: () => true,
    metadata: { fromCache, hasPendingWrites },
    data: () => ({
      accountId,
      currency: 'KZT',
      balance: 20000,
      revision: 1,
      eventRevision: 1,
      createdAt: { seconds: 1, nanoseconds: 0 },
      updatedAt: { seconds: 1, nanoseconds: 0 },
    }),
  };
}

describe('canonical Wallet synchronization', () => {
  beforeEach(() => {
    listeners.length = 0;
    useWalletStore.getState().resetCanonicalWallet();
    useAuthStore.setState({ firebaseUser: user('account_wallet_a'), authGeneration: 1 });
  });

  it('trusts only server snapshots without pending writes and refreshes the same bounded listener', () => {
    const view = renderHook(() => useWalletSync());
    act(() => listeners[0].next(snapshot('account_wallet_a', true)));
    expect(useWalletStore.getState().canonicalWalletTrusted).toBe(false);
    act(() => listeners[0].next(snapshot('account_wallet_a', false, true)));
    expect(useWalletStore.getState().canonicalWalletTrusted).toBe(false);
    act(() => listeners[0].next(snapshot()));
    expect(useWalletStore.getState().canonicalBalanceKzt).toBe(20000);
    expect(useWalletStore.getState().canonicalWalletTrusted).toBe(true);
    act(() => useWalletStore.getState().refreshCanonicalWallet());
    expect(listeners[0].unsubscribe).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(2);
    expect(useWalletStore.getState().canonicalWalletLoaded).toBe(false);
    view.unmount();
  });

  it.each(['missing', 'invalid', 'mismatch', 'error'])('marks %s Wallet unavailable', (kind) => {
    renderHook(() => useWalletSync());
    act(() => {
      if (kind === 'error') listeners[0].error(new Error('permission denied'));
      else
        listeners[0].next(
          kind === 'missing'
            ? { exists: () => false }
            : kind === 'invalid'
              ? { exists: () => true, data: () => ({}) }
              : snapshot('account_wallet_b')
        );
    });
    expect(useWalletStore.getState().canonicalWalletAccountId).toBe('account_wallet_a');
    expect(useWalletStore.getState().canonicalWalletLoaded).toBe(true);
    expect(useWalletStore.getState().canonicalWalletTrusted).toBe(false);
  });

  it('discards previous session callbacks and clears balance on switch and logout', () => {
    renderHook(() => useWalletSync());
    act(() => listeners[0].next(snapshot()));
    act(() => useAuthStore.setState({ firebaseUser: user('account_wallet_b'), authGeneration: 2 }));
    expect(useWalletStore.getState().canonicalBalanceKzt).toBeNull();
    act(() => listeners[0].next(snapshot()));
    expect(useWalletStore.getState().canonicalBalanceKzt).toBeNull();
    act(() => listeners[1].next(snapshot('account_wallet_b')));
    expect(useWalletStore.getState().canonicalWalletAccountId).toBe('account_wallet_b');
    act(() => useAuthStore.setState({ firebaseUser: null, authGeneration: 3 }));
    expect(useWalletStore.getState().canonicalBalanceKzt).toBeNull();
  });
});
