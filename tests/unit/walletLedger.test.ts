import { describe, expect, it } from 'vitest';
import { buildWalletOperationHistory, walletLedgerBookingEntryId } from '../../src/domain/wallet';
import type { Booking, WalletLedgerEntry } from '../../src/types';

const lessonBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-lesson-1',
  userId: 'user-1',
  instructorId: 'instructor-1',
  instructorName: 'Coach A',
  instructorAvatar: '',
  date: '2026-12-02',
  time: '10:00',
  durationHours: 2,
  totalPrice: 100,
  status: 'confirmed',
  difficulty: 'beginner',
  createdAt: '2026-12-01T10:00:00.000Z',
  ...overrides,
});

describe('walletLedger history', () => {
  it('does not fabricate payments or refunds from booking status', () => {
    for (const status of ['confirmed', 'completed', 'cancelled'] as const) {
      expect(
        buildWalletOperationHistory('user-1', [lessonBooking({ status })], [], [], 'en')
      ).toEqual([]);
    }
  });

  it('prefers ledger entries over synthetic booking history', () => {
    const ledger: WalletLedgerEntry[] = [
      {
        id: 'wl_lesson_payment_booking-lesson-1',
        userId: 'user-1',
        amount: -100,
        balanceAfter: 150,
        type: 'lesson_payment',
        bookingId: 'booking-lesson-1',
        subjectName: 'Coach A',
        createdAt: '2026-12-01T10:00:00.000Z',
      },
    ];

    const history = buildWalletOperationHistory('user-1', [lessonBooking()], [], ledger, 'en');

    expect(history).toHaveLength(1);
    expect(history[0].source).toBe('ledger');
    expect(history[0].balanceAfter).toBe(150);
    expect(history[0].sessionDateLabel).toBe('December 2');
    expect(history[0].durationLabel).toBe('2 hours');
  });

  it('preserves historical USD rows with their original currency', () => {
    const ledger: WalletLedgerEntry[] = [
      {
        id: 'wl_legacy_usd',
        userId: 'user-1',
        amount: -60,
        balanceAfter: 120,
        currency: 'USD',
        type: 'lesson_payment',
        createdAt: '2026-12-01T10:00:00.000Z',
      },
      {
        id: 'wl_current_kzt',
        userId: 'user-1',
        amount: -30_000,
        balanceAfter: 90_000,
        currency: 'KZT',
        type: 'lesson_payment',
        createdAt: '2026-12-02T10:00:00.000Z',
      },
    ];

    const history = buildWalletOperationHistory('user-1', [], [], ledger, 'en');

    expect(history.map((entry) => entry.id)).toEqual(['wl_current_kzt', 'wl_legacy_usd']);
    expect(history[1].currency).toBe('USD');
    expect(history[0].amount).toBe(-30_000);
    expect(history[0].currency).toBe('KZT');
  });

  it('does not expose another account ledger', () => {
    expect(
      buildWalletOperationHistory(
        'other',
        [],
        [],
        [
          {
            id: 'old',
            userId: 'user-1',
            amount: 100,
            balanceAfter: 100,
            type: 'top_up',
            createdAt: '2026-12-01T10:00:00.000Z',
          },
        ],
        'en'
      )
    ).toEqual([]);
  });

  it('builds unique ledger ids per booking payment cycle', () => {
    const first = walletLedgerBookingEntryId('course_payment', {
      id: 'booking_course_user-1_course-1',
      createdAt: '2026-12-01T10:00:00.000Z',
    });
    const second = walletLedgerBookingEntryId('course_payment', {
      id: 'booking_course_user-1_course-1',
      createdAt: '2026-12-02T11:00:00.000Z',
    });

    expect(first).not.toBe(second);
  });
});
