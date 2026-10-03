import { useWalletStore } from './walletStore';

/**
 * Applies optimistic balance update while performing an async operation.
 * If the operation fails, reverts the optimistic balance.
 */
export async function withOptimisticBalance<T>(
  delta: number,
  operation: () => Promise<T>
): Promise<T> {
  if (delta === 0) {
    return operation();
  }

  const { adjustOptimisticBalance } = useWalletStore.getState();
  adjustOptimisticBalance(delta);
  try {
    return await operation();
  } catch (error) {
    adjustOptimisticBalance(-delta);
    throw error;
  }
}
