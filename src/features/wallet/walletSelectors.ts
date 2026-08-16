import { useProfileStore } from '../profile/profileStore';
import { useWalletStore } from './walletStore';

/**
 * Selects the effective balance (real balance + optimistic delta).
 * Used for immediate UI feedback during transactions.
 *
 * Usage: useWalletStore(selectEffectiveBalance)
 * But you also need useProfileStore for userProfile, so better to compose it in component:
 * const userProfile = useProfileStore((s) => s.userProfile);
 * const optimisticDelta = useWalletStore((s) => s.optimisticBalanceDelta);
 * const effectiveBalance = (userProfile?.balanceUSD ?? 0) + optimisticDelta;
 */
export const selectEffectiveBalance = (state: ReturnType<typeof useWalletStore.getState>) => {
  const userProfile = useProfileStore.getState().userProfile;
  return (userProfile?.balanceUSD ?? 0) + state.optimisticBalanceDelta;
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
 * Helper hook for getting effective balance.
 * Combines wallet and profile store selectors for convenience.
 */
export const useEffectiveBalance = () => {
  const userProfile = useProfileStore((s) => s.userProfile);
  const optimisticDelta = useWalletStore((s) => s.optimisticBalanceDelta);
  return (userProfile?.balanceUSD ?? 0) + optimisticDelta;
};
