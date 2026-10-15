import { create } from 'zustand';
import type { StateCreator } from 'zustand';
import { WalletLedgerEntry } from './types';

export interface BalanceOptimisticState {
  optimisticBalanceDelta: number;
  adjustOptimisticBalance: (delta: number) => void;
  resetOptimisticBalance: () => void;
}

export interface CanonicalWalletSnapshot {
  /** Authoritative spendable balance from `/users/{accountId}/wallet/state` (KZT minor units). */
  canonicalBalanceKzt: number | null;
  /** Refresh history on committed monetary changes, even if the net balance is unchanged. */
  canonicalWalletEventRevision: number | null;
  /** False when the signed-in account has no wallet document yet. */
  canonicalWalletExists: boolean;
  /** True after the first wallet snapshot for the current auth session (or clear on logout). */
  canonicalWalletLoaded: boolean;
}

interface WalletState extends BalanceOptimisticState, CanonicalWalletSnapshot {
  walletLedgerEntries: WalletLedgerEntry[];
  setWalletLedgerEntries: (entries: WalletLedgerEntry[]) => void;
  syncCanonicalWalletFromSnapshot: (input: {
    exists: boolean;
    balanceKzt: number | null;
    eventRevision?: number;
  }) => void;
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
  canonicalWalletEventRevision: null,
  canonicalWalletExists: false,
  canonicalWalletLoaded: false,
};

export const useWalletStore = create<WalletState>()(
  balanceOptimisticMiddleware((set) => ({
    ...EMPTY_CANONICAL_WALLET,
    walletLedgerEntries: [],
    optimisticBalanceDelta: 0,

    setWalletLedgerEntries: (entries) => set({ walletLedgerEntries: entries }),
    syncCanonicalWalletFromSnapshot: ({ exists, balanceKzt, eventRevision }) =>
      set({
        canonicalWalletExists: exists,
        canonicalBalanceKzt: exists ? (balanceKzt ?? 0) : 0,
        canonicalWalletEventRevision: exists ? (eventRevision ?? null) : null,
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
