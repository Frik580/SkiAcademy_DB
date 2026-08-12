import { useAuthStore } from './authStore';

export async function withOptimisticBalance<T>(
  delta: number,
  operation: () => Promise<T>
): Promise<T> {
  if (delta === 0) {
    return operation();
  }

  const { adjustOptimisticBalance } = useAuthStore.getState();
  adjustOptimisticBalance(delta);
  try {
    return await operation();
  } catch (error) {
    adjustOptimisticBalance(-delta);
    throw error;
  }
}
