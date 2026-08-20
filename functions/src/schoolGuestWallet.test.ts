import { describe, expect, it } from 'vitest';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  guestCoursePaymentLedgerRef,
  guestLessonPaymentLedgerRef,
  guestRefundLedgerRef,
  guestTopUpLedgerRef,
  guestWalletSettingsRef,
  isGuestCashSubject,
  legacyGuestPaymentLedgerRef,
  refundSchoolGuestBookingInTransaction,
  settleSchoolGuestBookingInTransaction,
  SCHOOL_GUEST_WALLET_USER_ID,
} from './schoolGuestWallet';

type DocData = Record<string, unknown>;

function createMemoryDb(initial: Record<string, DocData> = {}) {
  const docs = new Map<string, DocData>(Object.entries(initial));

  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}`, id }),
    }),
  } as unknown as Firestore;

  const run = async <T>(
    fn: (transaction: Transaction) => Promise<T>
  ): Promise<{ result: T; docs: Map<string, DocData> }> => {
    const pending = new Map<string, DocData | null>();
    const transaction = {
      get: async (ref: { path: string }) => {
        const data = pending.has(ref.path) ? pending.get(ref.path) : docs.get(ref.path);
        return {
          exists: data != null,
          data: () => data,
        };
      },
      set: (ref: { path: string }, data: DocData, options?: { merge?: boolean }) => {
        const existing = pending.has(ref.path)
          ? pending.get(ref.path)
          : docs.get(ref.path);
        pending.set(
          ref.path,
          options?.merge && existing ? { ...existing, ...data } : { ...data }
        );
      },
      delete: (ref: { path: string }) => {
        pending.set(ref.path, null);
      },
    } as unknown as Transaction;

    const result = await fn(transaction);
    for (const [path, value] of pending) {
      if (value == null) docs.delete(path);
      else docs.set(path, value);
    }
    return { result, docs };
  };

  return { db, docs, run };
}

const guestLesson = (id = 'booking-guest-1') => ({
  id,
  userId: 'guest_abc',
  isGuest: true,
  guestName: 'Guest Skier',
  instructorName: 'Coach A',
  totalPrice: 100,
});

const guestCourse = (id = 'booking-guest-course-1') => ({
  id,
  userId: 'guest_abc',
  isGuest: true,
  guestName: 'Guest Skier',
  instructorName: 'Group course',
  courseId: 'course-1',
  instructorId: 'course_course-1',
  totalPrice: 200,
});

describe('isGuestCashSubject', () => {
  it('accepts guest uid or isGuest flag', () => {
    expect(isGuestCashSubject({ userId: 'guest_1' })).toBe(true);
    expect(isGuestCashSubject({ userId: 'user_1', isGuest: true })).toBe(true);
    expect(isGuestCashSubject({ userId: 'user_1' })).toBe(false);
    expect(isGuestCashSubject({ userId: 'system_block_x' })).toBe(false);
  });
});

describe('settleSchoolGuestBookingInTransaction', () => {
  it('tops up then charges a lesson, leaving guest wallet net 0', async () => {
    const { db, run } = createMemoryDb();
    const booking = guestLesson();

    const { result, docs } = await run((tx) =>
      settleSchoolGuestBookingInTransaction(tx, db, booking)
    );

    expect(result).toEqual({ settled: true, balanceAfter: 0 });
    expect(docs.get(guestWalletSettingsRef(db).path)?.balanceUSD).toBe(0);

    const topUp = docs.get(guestTopUpLedgerRef(db, booking.id).path);
    expect(topUp).toMatchObject({
      userId: SCHOOL_GUEST_WALLET_USER_ID,
      type: 'top_up',
      amount: 100,
      balanceAfter: 100,
      bookingId: booking.id,
    });

    const payment = docs.get(guestLessonPaymentLedgerRef(db, booking.id).path);
    expect(payment).toMatchObject({
      userId: SCHOOL_GUEST_WALLET_USER_ID,
      type: 'lesson_payment',
      amount: -100,
      balanceAfter: 0,
      bookingId: booking.id,
    });
  });

  it('records course_payment for course bookings', async () => {
    const { db, run } = createMemoryDb();
    const booking = guestCourse();

    const { result, docs } = await run((tx) =>
      settleSchoolGuestBookingInTransaction(tx, db, booking)
    );

    expect(result.settled).toBe(true);
    expect(docs.get(guestCoursePaymentLedgerRef(db, booking.id).path)).toMatchObject({
      userId: SCHOOL_GUEST_WALLET_USER_ID,
      type: 'course_payment',
      amount: -200,
      courseId: 'course-1',
    });
    expect(docs.has(guestLessonPaymentLedgerRef(db, booking.id).path)).toBe(false);
  });

  it('is idempotent on a second settle', async () => {
    const store = createMemoryDb();
    const booking = guestLesson();

    await store.run((tx) => settleSchoolGuestBookingInTransaction(tx, store.db, booking));
    const second = await store.run((tx) =>
      settleSchoolGuestBookingInTransaction(tx, store.db, booking)
    );

    expect(second.result).toEqual({ settled: false, balanceAfter: 0 });
    expect(
      [...second.docs.values()].filter((entry) => entry.type === 'top_up')
    ).toHaveLength(1);
    expect(
      [...second.docs.values()].filter((entry) => entry.type === 'lesson_payment')
    ).toHaveLength(1);
  });

  it('does not settle when a client already owns the payment ledger', async () => {
    const booking = guestLesson();
    const store = createMemoryDb({
      [`wallet_ledger/wl_lesson_payment_${booking.id}`]: {
        userId: 'client-1',
        type: 'lesson_payment',
        amount: -100,
      },
      'settings/guest_wallet': { balanceUSD: 40 },
    });

    const { result, docs } = await store.run((tx) =>
      settleSchoolGuestBookingInTransaction(tx, store.db, booking)
    );

    expect(result).toEqual({ settled: false, balanceAfter: 40 });
    expect(docs.get('settings/guest_wallet')?.balanceUSD).toBe(40);
    expect(docs.has(`wallet_ledger/wl_top_up_guest_${booking.id}`)).toBe(false);
  });

  it('skips settle when a legacy guest_payment entry already exists', async () => {
    const booking = guestLesson();
    const store = createMemoryDb({
      [`wallet_ledger/wl_guest_payment_${booking.id}`]: {
        userId: SCHOOL_GUEST_WALLET_USER_ID,
        type: 'guest_payment',
        amount: 100,
      },
      'settings/guest_wallet': { balanceUSD: 100 },
    });

    const { result, docs } = await store.run((tx) =>
      settleSchoolGuestBookingInTransaction(tx, store.db, booking)
    );

    expect(result).toEqual({ settled: false, balanceAfter: 100 });
    expect(docs.has(`wallet_ledger/wl_top_up_guest_${booking.id}`)).toBe(false);
    expect(docs.has(`wallet_ledger/wl_lesson_payment_${booking.id}`)).toBe(false);
  });

  it('does not settle non-guest bookings', async () => {
    const { db, run } = createMemoryDb({ 'settings/guest_wallet': { balanceUSD: 10 } });
    const { result, docs } = await run((tx) =>
      settleSchoolGuestBookingInTransaction(tx, db, {
        id: 'booking-client',
        userId: 'client-1',
        totalPrice: 100,
      })
    );

    expect(result).toEqual({ settled: false, balanceAfter: 0 });
    expect(docs.get('settings/guest_wallet')?.balanceUSD).toBe(10);
  });
});

describe('refundSchoolGuestBookingInTransaction', () => {
  it('credits the guest wallet after a settled lesson charge', async () => {
    const store = createMemoryDb();
    const booking = guestLesson();

    await store.run((tx) => settleSchoolGuestBookingInTransaction(tx, store.db, booking));
    const { result, docs } = await store.run((tx) =>
      refundSchoolGuestBookingInTransaction(tx, store.db, {
        bookingId: booking.id,
        refundAmount: 100,
        instructorName: booking.instructorName,
      })
    );

    expect(result).toEqual({ refunded: true, balanceAfter: 100 });
    expect(docs.get(guestWalletSettingsRef(store.db).path)?.balanceUSD).toBe(100);
    expect(docs.get(guestRefundLedgerRef(store.db, booking.id).path)).toMatchObject({
      userId: SCHOOL_GUEST_WALLET_USER_ID,
      type: 'refund',
      amount: 100,
      balanceAfter: 100,
    });
  });

  it('is idempotent on a second refund', async () => {
    const store = createMemoryDb();
    const booking = guestLesson();

    await store.run((tx) => settleSchoolGuestBookingInTransaction(tx, store.db, booking));
    await store.run((tx) =>
      refundSchoolGuestBookingInTransaction(tx, store.db, {
        bookingId: booking.id,
        refundAmount: 100,
      })
    );
    const second = await store.run((tx) =>
      refundSchoolGuestBookingInTransaction(tx, store.db, {
        bookingId: booking.id,
        refundAmount: 100,
      })
    );

    expect(second.result).toEqual({ refunded: false, balanceAfter: 100 });
    expect(second.docs.get('settings/guest_wallet')?.balanceUSD).toBe(100);
  });

  it('reverses the legacy single guest_payment credit', async () => {
    const bookingId = 'booking-legacy';
    const store = createMemoryDb({
      [`wallet_ledger/wl_guest_payment_${bookingId}`]: {
        userId: SCHOOL_GUEST_WALLET_USER_ID,
        type: 'guest_payment',
        amount: 90,
      },
      'settings/guest_wallet': { balanceUSD: 90 },
    });

    const { result, docs } = await store.run((tx) =>
      refundSchoolGuestBookingInTransaction(tx, store.db, {
        bookingId,
        refundAmount: 90,
      })
    );

    expect(result).toEqual({ refunded: true, balanceAfter: 0 });
    expect(docs.get('settings/guest_wallet')?.balanceUSD).toBe(0);
    expect(docs.has(legacyGuestPaymentLedgerRef(store.db, bookingId).path)).toBe(false);
    expect(docs.has(guestRefundLedgerRef(store.db, bookingId).path)).toBe(false);
  });

  it('does nothing when there is no guest settlement to reverse', async () => {
    const store = createMemoryDb({ 'settings/guest_wallet': { balanceUSD: 25 } });
    const { result, docs } = await store.run((tx) =>
      refundSchoolGuestBookingInTransaction(tx, store.db, {
        bookingId: 'booking-missing',
        refundAmount: 100,
      })
    );

    expect(result).toEqual({ refunded: false, balanceAfter: 25 });
    expect(docs.get('settings/guest_wallet')?.balanceUSD).toBe(25);
  });
});
