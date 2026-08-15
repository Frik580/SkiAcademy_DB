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

/**
 * Applies wallet credit to user account.
 * This is a placeholder for future wallet credit logic.
 */
export async function applyWalletCredit(
  userId: string,
  amount: number,
  type: 'top_up' | 'refund'
): Promise<void> {
  // TODO: реализовать применение кредита в Firestore
  // будет выноситься из bookingStore и courseStore позже
  console.warn(
    `Wallet credit not yet implemented: userId=${userId}, amount=${amount}, type=${type}`
  );
}
