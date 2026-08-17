import { describe, expect, it } from 'vitest';
import {
  buildWalletOperationHistory,
  walletLedgerBookingEntryId,
} from '../../src/domain/wallet/walletLedger';
import type { Booking, Course, WalletLedgerEntry } from '../../src/types';

const course: Course = {
  id: 'course-1',
  title: 'Freeride Camp',
  titleRu: 'Фрирайд кэмп',
  description: 'Desc',
  descriptionRu: 'Описание',
  level: 'intermediate',
  duration: '5 days',
  dates: 'Dec 1-5',
  price: 200,
  totalSeats: 10,
  availableSeats: 5,
  instructorIds: [],
  bgImageUrl: '',
};

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
  it('builds synthetic lesson payment from bookings when ledger is empty', () => {
    const history = buildWalletOperationHistory('user-1', [lessonBooking()], [], [], 'en');

    expect(history).toHaveLength(1);
    expect(history[0].amount).toBe(-100);
    expect(history[0].labelKey).toBe('walletOpLessonPayment');
    expect(history[0].subjectName).toBe('Coach A');
    expect(history[0].sessionDateLabel).toBe('December 2');
    expect(history[0].durationLabel).toBe('2 hours');
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

  it('adds refund synthetic entry for cancelled bookings with prior payment', () => {
    const history = buildWalletOperationHistory(
      'user-1',
      [lessonBooking({ status: 'cancelled' })],
      [],
      [],
      'en'
    );

    expect(history).toHaveLength(2);
    expect(history.some((item) => item.amount < 0)).toBe(true);
    expect(history.some((item) => item.amount > 0 && item.labelKey === 'walletOpRefund')).toBe(
      true
    );
  });

  it('labels course payments with translated course title', () => {
    const history = buildWalletOperationHistory(
      'user-1',
      [
        lessonBooking({
          id: 'booking-course-1',
          instructorId: 'course_course-1',
          courseId: 'course-1',
          instructorName: 'Group course',
          totalPrice: 200,
        }),
      ],
      [course],
      [],
      'ru'
    );

    expect(history[0].labelKey).toBe('walletOpCoursePayment');
    expect(history[0].subjectName).toBe('Фрирайд кэмп');
    expect(history[0].durationLabel).toBe('5 days');
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
