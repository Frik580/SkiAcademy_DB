import { create } from 'zustand';
import type { StateCreator } from 'zustand';
import { WalletLedgerEntry } from './types';
import { QUERY_LIMITS } from '../../shared/queryLimits';

export interface BalanceOptimisticState {
  optimisticBalanceDelta: number;
  adjustOptimisticBalance: (delta: number) => void;
  resetOptimisticBalance: () => void;
}

interface WalletState extends BalanceOptimisticState {
  walletLedgerEntries: WalletLedgerEntry[];
  walletLedgerPageSize: number;
  walletLedgerHasMore: boolean;
  setWalletLedgerEntries: (entries: WalletLedgerEntry[]) => void;
  setWalletLedgerHasMore: (hasMore: boolean) => void;
  loadMoreWalletLedger: () => void;
  resetWalletLedgerPagination: () => void;
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

export const useWalletStore = create<WalletState>()(
  balanceOptimisticMiddleware((set) => ({
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
