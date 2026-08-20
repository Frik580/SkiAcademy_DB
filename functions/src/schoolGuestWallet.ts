import { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  recordWalletLedgerEntryInTransaction,
  WALLET_LEDGER_COLLECTION,
  walletLedgerEntryId,
} from './walletLedger';

export const SCHOOL_GUEST_WALLET_USER_ID = 'school_guest';
export const GUEST_WALLET_SETTINGS_COLLECTION = 'settings';
export const GUEST_WALLET_SETTINGS_DOC_ID = 'guest_wallet';

function normalizeGuestWalletBalance(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isGuestCashSubject(booking: {
  userId?: string;
  isGuest?: boolean;
}): boolean {
  if (!booking.userId || booking.userId.startsWith('system_block_')) return false;
  return booking.isGuest === true || booking.userId.startsWith('guest_');
}

export function guestWalletSettingsRef(db: Firestore) {
  return db.collection(GUEST_WALLET_SETTINGS_COLLECTION).doc(GUEST_WALLET_SETTINGS_DOC_ID);
}

export function guestTopUpLedgerRef(db: Firestore, bookingId: string) {
  return db.collection(WALLET_LEDGER_COLLECTION).doc(walletLedgerEntryId('top_up', `guest_${bookingId}`));
}

export function guestLessonPaymentLedgerRef(db: Firestore, bookingId: string) {
  return db
    .collection(WALLET_LEDGER_COLLECTION)
    .doc(walletLedgerEntryId('lesson_payment', bookingId));
}

export function guestCoursePaymentLedgerRef(db: Firestore, bookingId: string) {
  return db
    .collection(WALLET_LEDGER_COLLECTION)
    .doc(walletLedgerEntryId('course_payment', bookingId));
}

export function guestRefundLedgerRef(db: Firestore, bookingId: string) {
  return db.collection(WALLET_LEDGER_COLLECTION).doc(walletLedgerEntryId('refund', bookingId));
}

/** Legacy single-entry model from the first guest-wallet iteration. */
export function legacyGuestPaymentLedgerRef(db: Firestore, bookingId: string) {
  return db
    .collection(WALLET_LEDGER_COLLECTION)
    .doc(walletLedgerEntryId('guest_payment', bookingId));
}

type GuestBookingLike = {
  id: string;
  totalPrice?: number;
  instructorName?: string;
  guestName?: string;
  courseId?: string;
  instructorId?: string;
  userId?: string;
  isGuest?: boolean;
};

function paymentLedgerType(booking: GuestBookingLike): 'lesson_payment' | 'course_payment' {
  if (booking.courseId) return 'course_payment';
  if (booking.instructorId?.startsWith('course_')) return 'course_payment';
  return 'lesson_payment';
}

function paymentLedgerRef(db: Firestore, booking: GuestBookingLike) {
  return paymentLedgerType(booking) === 'course_payment'
    ? guestCoursePaymentLedgerRef(db, booking.id)
    : guestLessonPaymentLedgerRef(db, booking.id);
}

/**
 * Guest confirm settlement:
 * 1) top up guest wallet (cash received)
 * 2) immediately charge lesson/course price from the same wallet
 * Net wallet change is 0; ledger shows cash in + revenue in.
 * Idempotent via the payment ledger doc.
 */
export async function settleSchoolGuestBookingInTransaction(
  transaction: Transaction,
  db: Firestore,
  booking: GuestBookingLike
): Promise<{ settled: boolean; balanceAfter: number }> {
  if (!isGuestCashSubject(booking)) {
    return { settled: false, balanceAfter: 0 };
  }

  const amount = typeof booking.totalPrice === 'number' ? booking.totalPrice : 0;
  if (amount <= 0) {
    return { settled: false, balanceAfter: 0 };
  }

  const topUpRef = guestTopUpLedgerRef(db, booking.id);
  const paymentRef = paymentLedgerRef(db, booking);
  const legacyRef = legacyGuestPaymentLedgerRef(db, booking.id);
  const walletRef = guestWalletSettingsRef(db);

  const [topUpSnap, paymentSnap, legacySnap, walletSnap] = await Promise.all([
    transaction.get(topUpRef),
    transaction.get(paymentRef),
    transaction.get(legacyRef),
    transaction.get(walletRef),
  ]);

  const currentBalance = normalizeGuestWalletBalance(walletSnap.data()?.balanceUSD);

  // Already settled under the new model (or charged via shared payment id).
  if (paymentSnap.exists) {
    const payerId = paymentSnap.data()?.userId;
    if (payerId === SCHOOL_GUEST_WALLET_USER_ID || topUpSnap.exists) {
      return { settled: false, balanceAfter: currentBalance };
    }
    // Payment belongs to a linked client wallet — do not settle as guest cash.
    return { settled: false, balanceAfter: currentBalance };
  }

  // Legacy single guest_payment credit — leave as-is; do not double-settle.
  if (legacySnap.exists) {
    return { settled: false, balanceAfter: currentBalance };
  }

  const subjectName = booking.guestName || booking.instructorName;
  const afterTopUp = currentBalance + amount;
  const afterCharge = afterTopUp - amount;
  const ledgerType = paymentLedgerType(booking);

  transaction.set(walletRef, { balanceUSD: afterCharge }, { merge: true });

  recordWalletLedgerEntryInTransaction(transaction, db, {
    userId: SCHOOL_GUEST_WALLET_USER_ID,
    amount,
    balanceAfter: afterTopUp,
    type: 'top_up',
    subjectName,
    bookingId: booking.id,
    courseId: booking.courseId,
    entryId: walletLedgerEntryId('top_up', `guest_${booking.id}`),
  });

  recordWalletLedgerEntryInTransaction(transaction, db, {
    userId: SCHOOL_GUEST_WALLET_USER_ID,
    amount: -amount,
    balanceAfter: afterCharge,
    type: ledgerType,
    subjectName,
    bookingId: booking.id,
    courseId: booking.courseId,
    entryId: walletLedgerEntryId(ledgerType, booking.id),
  });

  return { settled: true, balanceAfter: afterCharge };
}

/**
 * Cancel of a settled guest booking: refund the charged amount back onto the guest wallet.
 * Idempotent via the refund ledger doc. Also cleans up the legacy single-entry model.
 */
export async function refundSchoolGuestBookingInTransaction(
  transaction: Transaction,
  db: Firestore,
  input: {
    bookingId: string;
    refundAmount: number;
    instructorName?: string;
    courseId?: string;
  }
): Promise<{ refunded: boolean; balanceAfter: number }> {
  const refundAmount =
    typeof input.refundAmount === 'number' && Number.isFinite(input.refundAmount)
      ? Math.max(0, input.refundAmount)
      : 0;

  const walletRef = guestWalletSettingsRef(db);
  const refundRef = guestRefundLedgerRef(db, input.bookingId);
  const lessonRef = guestLessonPaymentLedgerRef(db, input.bookingId);
  const courseRef = guestCoursePaymentLedgerRef(db, input.bookingId);
  const legacyRef = legacyGuestPaymentLedgerRef(db, input.bookingId);
  const topUpRef = guestTopUpLedgerRef(db, input.bookingId);

  const [walletSnap, refundSnap, lessonSnap, courseSnap, legacySnap, topUpSnap] = await Promise.all([
    transaction.get(walletRef),
    transaction.get(refundRef),
    transaction.get(lessonRef),
    transaction.get(courseRef),
    transaction.get(legacyRef),
    transaction.get(topUpRef),
  ]);

  const currentBalance = normalizeGuestWalletBalance(walletSnap.data()?.balanceUSD);

  if (refundAmount <= 0) {
    return { refunded: false, balanceAfter: currentBalance };
  }

  if (refundSnap.exists) {
    return { refunded: false, balanceAfter: currentBalance };
  }

  const paymentSnap = lessonSnap.exists ? lessonSnap : courseSnap.exists ? courseSnap : null;
  const isSchoolGuestPayment =
    paymentSnap?.exists === true && paymentSnap.data()?.userId === SCHOOL_GUEST_WALLET_USER_ID;

  // New model: top-up + charge → refund credit back to guest wallet.
  if (isSchoolGuestPayment || topUpSnap.exists) {
    const balanceAfter = currentBalance + refundAmount;
    transaction.set(walletRef, { balanceUSD: balanceAfter }, { merge: true });
    recordWalletLedgerEntryInTransaction(transaction, db, {
      userId: SCHOOL_GUEST_WALLET_USER_ID,
      amount: refundAmount,
      balanceAfter,
      type: 'refund',
      subjectName: input.instructorName,
      bookingId: input.bookingId,
      courseId: input.courseId,
      entryId: walletLedgerEntryId('refund', input.bookingId),
    });
    return { refunded: true, balanceAfter };
  }

  // Legacy model: single guest_payment credit — undo the credit (no separate charge existed).
  if (legacySnap.exists) {
    const amount = normalizeGuestWalletBalance(legacySnap.data()?.amount);
    const balanceAfter = Math.max(0, currentBalance - amount);
    transaction.set(walletRef, { balanceUSD: balanceAfter }, { merge: true });
    transaction.delete(legacyRef);
    return { refunded: true, balanceAfter };
  }

  return { refunded: false, balanceAfter: currentBalance };
}
