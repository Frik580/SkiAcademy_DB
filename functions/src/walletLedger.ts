import { Firestore, Transaction } from 'firebase-admin/firestore';

export const WALLET_LEDGER_COLLECTION = 'wallet_ledger';

export type WalletLedgerType =
  | 'top_up'
  | 'starter_credit'
  | 'lesson_payment'
  | 'course_payment'
  | 'refund'
  | 'admin_adjustment';

export interface WalletLedgerEntry {
  id: string;
  userId: string;
  amount: number;
  balanceAfter: number;
  type: WalletLedgerType;
  subjectName?: string;
  bookingId?: string;
  courseId?: string;
  createdAt: string;
}

export function walletLedgerEntryId(type: WalletLedgerType, referenceId: string): string {
  return `wl_${type}_${referenceId}`;
}

export function recordWalletLedgerEntryInTransaction(
  transaction: Transaction,
  db: Firestore,
  input: {
    userId: string;
    amount: number;
    balanceAfter: number;
    type: WalletLedgerType;
    subjectName?: string;
    bookingId?: string;
    courseId?: string;
    createdAt?: string;
    entryId?: string;
  }
): void {
  const entryId =
    input.entryId ?? walletLedgerEntryId(input.type, input.bookingId ?? `${Date.now()}`);
  const entry: WalletLedgerEntry = {
    id: entryId,
    userId: input.userId,
    amount: input.amount,
    balanceAfter: input.balanceAfter,
    type: input.type,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.subjectName ? { subjectName: input.subjectName } : {}),
    ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    ...(input.courseId ? { courseId: input.courseId } : {}),
  };

  transaction.set(db.collection(WALLET_LEDGER_COLLECTION).doc(entryId), entry);
}
