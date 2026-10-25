import { create } from 'zustand';
import type { StateCreator } from 'zustand';
import { WalletLedgerEntry } from './types';
import { QUERY_LIMITS } from '../../shared';

export interface BalanceOptimisticState {
  optimisticBalanceDelta: number;
  adjustOptimisticBalance: (delta: number) => void;
  resetOptimisticBalance: () => void;
}

export interface CanonicalWalletSnapshot {
  /** Authoritative spendable balance from `/users/{accountId}/wallet/state` (KZT minor units). */
  canonicalBalanceKzt: number | null;
  /** False when the signed-in account has no wallet document yet. */
  canonicalWalletExists: boolean;
  /** True after the first wallet snapshot for the current auth session (or clear on logout). */
  canonicalWalletLoaded: boolean;
}

interface WalletState extends BalanceOptimisticState, CanonicalWalletSnapshot {
  walletLedgerEntries: WalletLedgerEntry[];
  walletLedgerPageSize: number;
  walletLedgerHasMore: boolean;
  setWalletLedgerEntries: (entries: WalletLedgerEntry[]) => void;
  setWalletLedgerHasMore: (hasMore: boolean) => void;
  loadMoreWalletLedger: () => void;
  resetWalletLedgerPagination: () => void;
  syncCanonicalWalletFromSnapshot: (input: { exists: boolean; balanceKzt: number | null }) => void;
  resetCanonicalWallet: () => void;
}

type BalanceOptimisticImpl = <T extends BalanceOptimisticState>(
  storeInitializer: StateCreator<T, [], []>
) => StateCreator<T, [], []>;

export const balanceOptimisticMiddleware: BalanceOptimisticImpl =
  (initializer) => (set, get, api) => {
    const state = initializer(set, get, api);

    return {
      ...state,
      optimisticBalanceDelta: 0,
      adjustOptimisticBalance: (delta) => {
        if (delta === 0) return;
        set((current) => ({
          ...current,
          optimisticBalanceDelta: current.optimisticBalanceDelta + delta,
        }));
      },
      resetOptimisticBalance: () => {
        if (get().optimisticBalanceDelta === 0) return;
        set((current) => ({
          ...current,
          optimisticBalanceDelta: 0,
        }));
      },
    };
  };

const EMPTY_CANONICAL_WALLET: CanonicalWalletSnapshot = {
  canonicalBalanceKzt: null,
  canonicalWalletExists: false,
  canonicalWalletLoaded: false,
};

export const useWalletStore = create<WalletState>()(
  balanceOptimisticMiddleware((set) => ({
    ...EMPTY_CANONICAL_WALLET,
    walletLedgerEntries: [],
    walletLedgerPageSize: QUERY_LIMITS.walletLedger,
    walletLedgerHasMore: false,
    optimisticBalanceDelta: 0,

    setWalletLedgerEntries: (entries) => set({ walletLedgerEntries: entries }),
    setWalletLedgerHasMore: (walletLedgerHasMore) => set({ walletLedgerHasMore }),
    loadMoreWalletLedger: () =>
      set((state) => ({
        walletLedgerPageSize: state.walletLedgerPageSize + QUERY_LIMITS.walletLedger,
      })),
    resetWalletLedgerPagination: () =>
      set({ walletLedgerPageSize: QUERY_LIMITS.walletLedger, walletLedgerHasMore: false }),
    syncCanonicalWalletFromSnapshot: ({ exists, balanceKzt }) =>
      set({
        canonicalWalletExists: exists,
        canonicalBalanceKzt: exists ? (balanceKzt ?? 0) : 0,
        canonicalWalletLoaded: true,
        optimisticBalanceDelta: 0,
      }),
    resetCanonicalWallet: () => set({ ...EMPTY_CANONICAL_WALLET, optimisticBalanceDelta: 0 }),
    adjustOptimisticBalance: (delta) => {
      if (delta === 0) return;
      set((current) => ({
        optimisticBalanceDelta: current.optimisticBalanceDelta + delta,
      }));
    },
    resetOptimisticBalance: () => {
      set(() => ({
        optimisticBalanceDelta: 0,
      }));
    },
  }))
);
