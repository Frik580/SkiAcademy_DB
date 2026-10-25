import type { WalletOperationView } from '../../../../domain/wallet';

export interface StudentWalletHistoryInput {
  operations: readonly WalletOperationView[];
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}
