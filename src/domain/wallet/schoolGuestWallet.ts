import { doc, runTransaction, type Firestore, type Transaction } from 'firebase/firestore';
import { MAX_WALLET_CREDIT_USD } from './walletCredit';
import { recordWalletLedgerEntryInTransaction, walletLedgerEntryId } from './walletLedger';

/** Synthetic ledger owner for school guest cash payments. */
export const SCHOOL_GUEST_WALLET_USER_ID = 'school_guest';

export const GUEST_WALLET_SETTINGS_COLLECTION = 'settings';
export const GUEST_WALLET_SETTINGS_DOC_ID = 'guest_wallet';

export type GuestWalletAdjustDirection = 'top_up' | 'withdraw';

export function guestWalletSettingsPath(): {
  collection: typeof GUEST_WALLET_SETTINGS_COLLECTION;
  docId: typeof GUEST_WALLET_SETTINGS_DOC_ID;
} {
  return {
    collection: GUEST_WALLET_SETTINGS_COLLECTION,
    docId: GUEST_WALLET_SETTINGS_DOC_ID,
  };
}

export function normalizeGuestWalletBalance(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isGuestCashSubject(booking: { userId?: string; isGuest?: boolean }): boolean {
  if (!booking.userId || booking.userId.startsWith('system_block_')) return false;
  return booking.isGuest === true || booking.userId.startsWith('guest_');
}

export function assertGuestWalletAdjustAmount(
  amount: number,
  maxAmount = MAX_WALLET_CREDIT_USD
): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Guest wallet amount must be positive.');
  }
  if (amount > maxAmount) {
    throw new Error(`Guest wallet amount exceeds the ${maxAmount} limit.`);
  }
}

/** Pure preview of a guest-wallet top-up / withdraw before writing. */
export function resolveGuestWalletAdjustment(
  currentBalance: number,
  amount: number,
  direction: GuestWalletAdjustDirection
): { delta: number; balanceAfter: number } {
  assertGuestWalletAdjustAmount(amount);
  const current = normalizeGuestWalletBalance(currentBalance);
  if (direction === 'top_up') {
    return { delta: amount, balanceAfter: current + amount };
  }
  if (amount > current) {
    throw new Error('Insufficient guest wallet balance.');
  }
  return { delta: -amount, balanceAfter: current - amount };
}

export function adjustSchoolGuestWalletInTransaction(
  transaction: Transaction,
  firestore: Firestore,
  currentBalance: number,
  amount: number,
  direction: GuestWalletAdjustDirection,
  options?: { note?: string; createdAt?: string }
): { delta: number; balanceAfter: number } {
  const { delta, balanceAfter } = resolveGuestWalletAdjustment(currentBalance, amount, direction);
  const path = guestWalletSettingsPath();
  const walletRef = doc(firestore, path.collection, path.docId);
  const note = options?.note?.trim();

  transaction.set(walletRef, { balanceUSD: balanceAfter }, { merge: true });
  recordWalletLedgerEntryInTransaction(transaction, firestore, {
    userId: SCHOOL_GUEST_WALLET_USER_ID,
    amount: delta,
    balanceAfter,
    type: 'admin_adjustment',
    subjectName: note || undefined,
    createdAt: options?.createdAt,
    entryId: walletLedgerEntryId('admin_adjustment', `guest_${direction}_${Date.now()}_${amount}`),
  });

  return { delta, balanceAfter };
}

/** Admin top-up / withdraw on the school guest cash wallet (ledger + settings balance). */
export async function adjustSchoolGuestWallet(
  firestore: Firestore,
  amount: number,
  direction: GuestWalletAdjustDirection,
  options?: { note?: string }
): Promise<{ balanceAfter: number; delta: number }> {
  const path = guestWalletSettingsPath();
  const walletRef = doc(firestore, path.collection, path.docId);

  return runTransaction(firestore, async (transaction) => {
    const walletSnap = await transaction.get(walletRef);
    const currentBalance = normalizeGuestWalletBalance(walletSnap.data()?.balanceUSD);
    return adjustSchoolGuestWalletInTransaction(
      transaction,
      firestore,
      currentBalance,
      amount,
      direction,
      options
    );
  });
}
