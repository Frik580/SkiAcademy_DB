import { doc, runTransaction, type Firestore, type Transaction } from 'firebase/firestore';
import type { UserProfile, WalletCurrency } from '../../types';
import { recordWalletLedgerEntryInTransaction, walletLedgerEntryId } from './walletLedger';

/** Max single credit applied through the wallet credit flow (top-ups and refunds). */
export const MAX_WALLET_CREDIT_USD = 10_000;

/** Max amount selectable in the simulated payment gateway UI. */
export const MAX_WALLET_TOPUP_USD = 5_000;
export const MAX_WALLET_TOPUP_KZT = 10_000_000;

function assertValidCreditAmount(amount: number, maxAmount = MAX_WALLET_CREDIT_USD): void {
  if (amount <= 0) {
    throw new Error('Credit amount must be positive.');
  }
  if (amount > maxAmount) {
    throw new Error(`Credit amount exceeds the ${maxAmount} limit.`);
  }
}

export function flushPendingWalletCreditInTransaction(
  transaction: Transaction,
  firestore: Firestore,
  userRef: ReturnType<typeof doc>,
  userId: string,
  userData: { balanceUSD?: number; pendingWalletCredit?: number }
): number {
  const pending = userData.pendingWalletCredit ?? 0;
  if (pending <= 0) return userData.balanceUSD ?? 0;

  const newBalance = (userData.balanceUSD ?? 0) + pending;
  transaction.update(userRef, {
    balanceUSD: newBalance,
    pendingWalletCredit: 0,
  });
  recordWalletLedgerEntryInTransaction(transaction, firestore, {
    userId,
    amount: pending,
    balanceAfter: newBalance,
    type: 'top_up',
    entryId: walletLedgerEntryId('top_up', `pending_${Date.now()}`),
  });

  return newBalance;
}

export function applyWalletCreditInTransaction(
  transaction: Transaction,
  firestore: Firestore,
  userRef: ReturnType<typeof doc>,
  userId: string,
  userData: { balanceUSD?: number; pendingWalletCredit?: number },
  creditAmount: number,
  ledgerType: 'top_up' | 'refund' | 'starter_credit' | 'admin_adjustment' = 'top_up',
  subjectName?: string,
  bookingId?: string,
  ledgerEntryId?: string
): number {
  assertValidCreditAmount(creditAmount);

  const currentBalance = userData.balanceUSD ?? 0;
  const existingPending = userData.pendingWalletCredit ?? 0;
  const newBalance = currentBalance + existingPending + creditAmount;

  const userUpdate: {
    balanceUSD: number;
    pendingWalletCredit: number;
    lastRefundBookingId?: string;
  } = {
    balanceUSD: newBalance,
    pendingWalletCredit: 0,
  };
  if (ledgerType === 'refund' && bookingId) {
    userUpdate.lastRefundBookingId = bookingId;
  }

  transaction.update(userRef, userUpdate);
  recordWalletLedgerEntryInTransaction(transaction, firestore, {
    userId,
    amount: creditAmount,
    balanceAfter: newBalance,
    type: ledgerType,
    subjectName,
    bookingId,
    entryId:
      ledgerEntryId ??
      walletLedgerEntryId(ledgerType, bookingId ?? `credit_${Date.now()}_${creditAmount}`),
  });

  return newBalance;
}

export function adminBalanceAdjustmentDelta(
  previousBalance: number,
  newBalance: number
): number | null {
  if (previousBalance === newBalance) return null;
  return newBalance - previousBalance;
}

export function recordAdminBalanceAdjustmentInTransaction(
  transaction: Transaction,
  firestore: Firestore,
  userId: string,
  previousBalance: number,
  newBalance: number
): void {
  const delta = adminBalanceAdjustmentDelta(previousBalance, newBalance);
  if (delta == null) return;

  recordWalletLedgerEntryInTransaction(transaction, firestore, {
    userId,
    amount: delta,
    balanceAfter: newBalance,
    type: 'admin_adjustment',
    entryId: walletLedgerEntryId('admin_adjustment', `${userId}_${Date.now()}_${delta}`),
  });
}

export async function updateUserWithAdminBalanceLedger(
  firestore: Firestore,
  updatedUser: UserProfile
): Promise<void> {
  const userRef = doc(firestore, 'users', updatedUser.uid);

  await runTransaction(firestore, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error('User profile does not exist.');

    const previousBalance = userSnap.data()?.balanceUSD ?? 0;
    const newBalance = updatedUser.balanceUSD ?? 0;

    transaction.update(userRef, { ...updatedUser });
    recordAdminBalanceAdjustmentInTransaction(
      transaction,
      firestore,
      updatedUser.uid,
      previousBalance,
      newBalance
    );
  });
}

export async function applyPendingWalletCredit(
  firestore: Firestore,
  userId: string
): Promise<number> {
  const userRef = doc(firestore, 'users', userId);

  return runTransaction(firestore, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error('User profile does not exist.');

    const pending = userSnap.data().pendingWalletCredit ?? 0;
    if (pending <= 0) return userSnap.data().balanceUSD ?? 0;

    return flushPendingWalletCreditInTransaction(
      transaction,
      firestore,
      userRef,
      userId,
      userSnap.data()
    );
  });
}

export async function grantAndApplyWalletCredit(
  firestore: Firestore,
  userId: string,
  amount: number,
  currency: WalletCurrency = 'USD'
): Promise<number> {
  const userRef = doc(firestore, 'users', userId);

  return runTransaction(firestore, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error('User profile does not exist.');

    if (currency === 'USD') {
      return applyWalletCreditInTransaction(
        transaction,
        firestore,
        userRef,
        userId,
        userSnap.data(),
        amount
      );
    }

    assertValidCreditAmount(amount, MAX_WALLET_TOPUP_KZT);
    const walletBalances = userSnap.data().walletBalances ?? {};
    const currentBalance = walletBalances[currency] ?? 0;
    const newBalance = currentBalance + amount;
    transaction.update(userRef, {
      walletBalances: { ...walletBalances, [currency]: newBalance },
    });
    recordWalletLedgerEntryInTransaction(transaction, firestore, {
      userId,
      amount,
      balanceAfter: newBalance,
      currency,
      type: 'top_up',
      entryId: walletLedgerEntryId('top_up', `${currency}_${Date.now()}_${amount}`),
    });
    return newBalance;
  });
}
