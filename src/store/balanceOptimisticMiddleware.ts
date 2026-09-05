import type { StateCreator } from 'zustand';

export interface BalanceOptimisticState {
  optimisticBalanceDelta: number;
  adjustOptimisticBalance: (delta: number) => void;
  resetOptimisticBalance: () => void;
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

export const selectEffectiveBalance = (
  state: BalanceOptimisticState & { canonicalBalanceKzt: number | null }
) => (state.canonicalBalanceKzt ?? 0) + state.optimisticBalanceDelta;
