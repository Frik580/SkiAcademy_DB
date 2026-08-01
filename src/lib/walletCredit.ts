import { doc, runTransaction, updateDoc, type Firestore } from 'firebase/firestore';

/** Max single credit applied through the pendingWalletCredit flow (top-ups and refunds). */
export const MAX_WALLET_CREDIT_USD = 10_000;

/** Max amount selectable in the simulated payment gateway UI. */
export const MAX_WALLET_TOPUP_USD = 5_000;

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

    const newBalance = (userSnap.data().balanceUSD ?? 0) + pending;
    transaction.update(userRef, {
      balanceUSD: newBalance,
      pendingWalletCredit: 0,
    });
    return newBalance;
  });
}

export async function grantAndApplyWalletCredit(
  firestore: Firestore,
  userId: string,
  amount: number
): Promise<number> {
  if (amount <= 0) {
    return applyPendingWalletCredit(firestore, userId);
  }
  if (amount > MAX_WALLET_CREDIT_USD) {
    throw new Error(`Credit amount exceeds the $${MAX_WALLET_CREDIT_USD} limit.`);
  }

  const userRef = doc(firestore, 'users', userId);
  await updateDoc(userRef, { pendingWalletCredit: amount });
  return applyPendingWalletCredit(firestore, userId);
}
