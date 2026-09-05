import { useWalletStore } from './walletStore';

/**
 * Selects the effective spendable balance from the canonical Account Wallet
 * (`/users/{accountId}/wallet/state`), plus any in-flight optimistic delta (KZT).
 *
 * Does not read legacy profile monetary fields.
 */
export const selectEffectiveBalance = (state: ReturnType<typeof useWalletStore.getState>) => {
  const realBalance = state.canonicalBalanceKzt ?? 0;
  return realBalance + state.optimisticBalanceDelta;
};

/**
 * Selects the wallet ledger entries (transaction history).
 */
export const selectWalletLedger = (state: ReturnType<typeof useWalletStore.getState>) =>
  state.walletLedgerEntries;

/**
 * Selects the current optimistic balance delta.
 */
export const selectOptimisticBalanceDelta = (state: ReturnType<typeof useWalletStore.getState>) =>
  state.optimisticBalanceDelta;

/**
 * Selects if there's a pending optimistic update.
 */
export const selectHasPendingBalance = (state: ReturnType<typeof useWalletStore.getState>) =>
  state.optimisticBalanceDelta !== 0;

/**
 * Helper hook for Header / cabinet wallet display.
 * Source of truth: canonical wallet balance in KZT minor units.
 */
export const useEffectiveBalance = () => {
  const canonicalBalanceKzt = useWalletStore((s) => s.canonicalBalanceKzt);
  const optimisticDelta = useWalletStore((s) => s.optimisticBalanceDelta);
  return (canonicalBalanceKzt ?? 0) + optimisticDelta;
};

export const useCanonicalWalletLoaded = () => useWalletStore((s) => s.canonicalWalletLoaded);

export const useCanonicalWalletExists = () => useWalletStore((s) => s.canonicalWalletExists);
