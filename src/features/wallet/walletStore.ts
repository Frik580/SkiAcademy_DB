import { create } from 'zustand';
import type { StateCreator } from 'zustand';
import { WalletLedgerEntry } from './types';

export interface BalanceOptimisticState {
  optimisticBalanceDelta: number;
  adjustOptimisticBalance: (delta: number) => void;
  resetOptimisticBalance: () => void;
}

interface WalletState extends BalanceOptimisticState {
  walletLedgerEntries: WalletLedgerEntry[];
  setWalletLedgerEntries: (entries: WalletLedgerEntry[]) => void;
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
    optimisticBalanceDelta: 0,

    setWalletLedgerEntries: (entries) => set({ walletLedgerEntries: entries }),
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
