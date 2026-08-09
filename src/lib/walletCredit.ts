import {
  doc,
  runTransaction,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase/firestore';

/** Max single credit applied through the wallet credit flow (top-ups and refunds). */
export const MAX_WALLET_CREDIT_USD = 10_000;

/** Max amount selectable in the simulated payment gateway UI. */
export const MAX_WALLET_TOPUP_USD = 5_000;

function assertValidCreditAmount(amount: number): void {
  if (amount <= 0) {
    throw new Error('Credit amount must be positive.');
  }
  if (amount > MAX_WALLET_CREDIT_USD) {
    throw new Error(`Credit amount exceeds the $${MAX_WALLET_CREDIT_USD} limit.`);
  }
}

export function flushPendingWalletCreditInTransaction(
  transaction: Transaction,
  userRef: DocumentReference,
  userData: { balanceUSD?: number; pendingWalletCredit?: number }
): number {
  const pending = userData.pendingWalletCredit ?? 0;
  if (pending <= 0) return userData.balanceUSD ?? 0;

  const newBalance = (userData.balanceUSD ?? 0) + pending;
  transaction.update(userRef, {
    balanceUSD: newBalance,
    pendingWalletCredit: 0,
  });

  return newBalance;
}

export function applyWalletCreditInTransaction(
  transaction: Transaction,
  userRef: DocumentReference,
  userData: { balanceUSD?: number; pendingWalletCredit?: number },
  creditAmount: number
): number {
  assertValidCreditAmount(creditAmount);

  const currentBalance = userData.balanceUSD ?? 0;
  const existingPending = userData.pendingWalletCredit ?? 0;
  const newBalance = currentBalance + existingPending + creditAmount;

  transaction.update(userRef, {
    balanceUSD: newBalance,
    pendingWalletCredit: 0,
  });

  return newBalance;
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

    return flushPendingWalletCreditInTransaction(transaction, userRef, userSnap.data());
  });
}

export async function grantAndApplyWalletCredit(
  firestore: Firestore,
  userId: string,
  amount: number
): Promise<number> {
  const userRef = doc(firestore, 'users', userId);

  return runTransaction(firestore, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error('User profile does not exist.');

    return applyWalletCreditInTransaction(transaction, userRef, userSnap.data(), amount);
  });
}
