import { create } from 'zustand';
import type { StateCreator } from 'zustand';
import { WalletLedgerEntry } from './types';

export interface BalanceOptimisticState {
  /** Invalidates pending rollbacks when a snapshot/reset replaces the overlay. */
  optimisticBalanceGeneration: number;
  optimisticBalanceDelta: number;
  adjustOptimisticBalance: (delta: number) => void;
  resetOptimisticBalance: () => void;
}

export interface CanonicalWalletSnapshot {
  canonicalWalletError?: boolean;
  canonicalWalletAccountId: string | null;
  canonicalWalletTrusted: boolean;
  /** Authoritative spendable balance from `/users/{accountId}/wallet/state` (KZT minor units). */
  canonicalBalanceKzt: number | null;
  /** Refresh history on committed monetary changes, even if the net balance is unchanged. */
  canonicalWalletEventRevision: number | null;
  /** False when the signed-in account has no wallet document yet. */
  canonicalWalletExists: boolean;
  /** True after the first server-confirmed wallet snapshot for the current auth session. */
  canonicalWalletLoaded: boolean;
}

interface WalletState extends BalanceOptimisticState, CanonicalWalletSnapshot {
  canonicalWalletError: boolean;
  canonicalWalletRefreshNonce: number;
  refreshCanonicalWallet: () => void;
  walletLedgerEntries: WalletLedgerEntry[];
  setWalletLedgerEntries: (entries: WalletLedgerEntry[]) => void;
  syncCanonicalWalletFromSnapshot: (input: {
    exists: boolean;
    balanceKzt: number | null;
    eventRevision?: number;
    accountId?: string;
    trusted?: boolean;
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
      optimisticBalanceGeneration: 0,
      optimisticBalanceDelta: 0,
      adjustOptimisticBalance: (delta) => {
        if (delta === 0) return;
        set((current) => ({
          ...current,
          optimisticBalanceDelta: current.optimisticBalanceDelta + delta,
        }));
      },
      resetOptimisticBalance: () => {
        set((current) => ({
          ...current,
          optimisticBalanceDelta: 0,
          optimisticBalanceGeneration: current.optimisticBalanceGeneration + 1,
        }));
      },
    };
  };

const EMPTY_CANONICAL_WALLET: CanonicalWalletSnapshot = {
  canonicalWalletAccountId: null,
  canonicalWalletTrusted: false,
  canonicalBalanceKzt: null,
  canonicalWalletEventRevision: null,
  canonicalWalletExists: false,
  canonicalWalletLoaded: false,
};

export const useWalletStore = create<WalletState>()(
  balanceOptimisticMiddleware((set) => ({
    ...EMPTY_CANONICAL_WALLET,
    canonicalWalletError: false,
    optimisticBalanceGeneration: 0,
    canonicalWalletRefreshNonce: 0,
    refreshCanonicalWallet: () =>
      set((state) => ({
        canonicalWalletTrusted: false,
        canonicalWalletError: false,
        canonicalWalletRefreshNonce: state.canonicalWalletRefreshNonce + 1,
      })),
    walletLedgerEntries: [],
    optimisticBalanceDelta: 0,

    setWalletLedgerEntries: (entries) => set({ walletLedgerEntries: entries }),
    syncCanonicalWalletFromSnapshot: ({ exists, balanceKzt, eventRevision, accountId, trusted }) =>
      set((state) => ({
        optimisticBalanceGeneration: state.optimisticBalanceGeneration + 1,
        canonicalWalletAccountId: accountId ?? null,
        canonicalWalletTrusted: trusted === true,
        canonicalWalletExists: exists,
        canonicalBalanceKzt: exists ? (balanceKzt ?? 0) : 0,
        canonicalWalletEventRevision: exists ? (eventRevision ?? null) : null,
        canonicalWalletLoaded: true,
        canonicalWalletError: false,
        optimisticBalanceDelta: 0,
      })),
    resetCanonicalWallet: () =>
      set((state) => ({
        ...EMPTY_CANONICAL_WALLET,
        canonicalWalletError: false,
        optimisticBalanceDelta: 0,
        optimisticBalanceGeneration: state.optimisticBalanceGeneration + 1,
      })),
    adjustOptimisticBalance: (delta) => {
      if (delta === 0) return;
      set((current) => ({
        optimisticBalanceDelta: current.optimisticBalanceDelta + delta,
      }));
    },
    resetOptimisticBalance: () => {
      set((state) => ({
        optimisticBalanceDelta: 0,
        optimisticBalanceGeneration: state.optimisticBalanceGeneration + 1,
      }));
    },
  }))
);
