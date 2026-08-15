export type WalletCurrency = 'USD' | 'KZT';

export type WalletLedgerType =
  'top_up' | 'starter_credit' | 'lesson_payment' | 'course_payment' | 'refund' | 'admin_adjustment';

export interface WalletLedgerEntry {
  id: string;
  userId: string;
  /** Positive for credits, negative for debits. */
  amount: number;
  balanceAfter: number;
  /** Currency of amount and balanceAfter. Legacy entries are USD. */
  currency?: WalletCurrency;
  type: WalletLedgerType;
  subjectName?: string;
  bookingId?: string;
  courseId?: string;
  createdAt: string;
}

export interface WalletState {
  walletLedgerEntries: WalletLedgerEntry[];
  optimisticBalanceDelta: number;

  // Actions
  setWalletLedgerEntries: (entries: WalletLedgerEntry[]) => void;
  adjustOptimisticBalance: (delta: number) => void;
  resetOptimisticBalance: () => void;
}
