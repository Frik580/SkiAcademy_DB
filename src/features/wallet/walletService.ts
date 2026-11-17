import { useWalletStore } from './walletStore';

/**
 * Applies optimistic balance update while performing an async operation.
 * If the operation fails, reverts the optimistic balance.
 */
export async function withOptimisticBalance<T>(
  delta: number,
  operation: () => Promise<T>,
  options: { readonly settleOnSuccess?: boolean } = {}
): Promise<T> {
  if (delta === 0) {
    return operation();
  }

  const { adjustOptimisticBalance, optimisticBalanceGeneration } = useWalletStore.getState();
  const rollback = () => {
    // A canonical snapshot/reset may have already consumed this overlay.
    if (useWalletStore.getState().optimisticBalanceGeneration === optimisticBalanceGeneration) {
      adjustOptimisticBalance(-delta);
    }
  };
  adjustOptimisticBalance(delta);
  try {
    const result = await operation();
    // Course command replays can return stored "created" without a new debit or
    // wallet snapshot. Keep the overlay only while the command is in flight.
    if (options.settleOnSuccess) rollback();
    return result;
  } catch (error) {
    rollback();
    throw error;
  }
}
