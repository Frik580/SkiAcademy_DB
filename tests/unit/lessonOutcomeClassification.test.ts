import { describe, expect, it } from 'vitest';
import {
  classifyPaidLessonFromPayment,
  isAttendedLessonStatus,
  isReviewEligibleLessonStatus,
  summarizeLessonOutcomes,
} from '../../src/domain/booking';
import { getTrainingStreakWeeks } from '../../src/domain/achievements';
import { translations } from '../../src/lib/i18n/translations';
import type { ActivityLog, Booking, UserProfile } from '../../src/types';
import {
  buildStudentHistory,
  getNeedsAttentionBookings,
  getSeasonBookings,
  getStudentStats,
  isBookingPastBySchedule,
  isBookingUpcomingBySchedule,
} from '../../src/features/student-cabinet/components/student/studentCabinetUtils';
import { isSessionPastBySchedule } from '../../src/features/course-enrollments/sessionScheduleHelpers';
import type { CabinetSessionItem } from '../../src/features/course-enrollments';

const userProfile: UserProfile = {
  uid: 'user-1',
  email: 'user@example.com',
  displayName: 'Test User',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
  level: 1,
};

const booking = (
  id: string,
  status: Booking['status'],
  date: string,
  hours = 2
): Booking => ({
  id,
  userId: 'user-1',
  instructorId: 'ins-1',
  instructorName: 'Coach Ivan',
  instructorAvatar: '',
  date,
  time: '10:00',
  durationHours: hours,
  totalPrice: 50000,
  difficulty: 'beginner',
  status,
});

const t = (key: keyof typeof translations.en) => translations.ru[key] ?? translations.en[key];

describe('lesson outcome classification', () => {
  it('keeps completed, no_show, and cancelled as distinct outcomes', () => {
    expect(isAttendedLessonStatus('completed')).toBe(true);
    expect(isAttendedLessonStatus('no_show')).toBe(false);
    expect(isAttendedLessonStatus('cancelled')).toBe(false);
    expect(isReviewEligibleLessonStatus('completed')).toBe(true);
    expect(isReviewEligibleLessonStatus('no_show')).toBe(false);
  });

  it('counts no_show in booked and occupied hours, not in attended training metrics', () => {
    const summary = summarizeLessonOutcomes([
      booking('completed', 'completed', '2026-09-01', 2),
      booking('no-show', 'no_show', '2026-09-02', 3),
      booking('cancelled', 'cancelled', '2026-09-03', 1),
      booking('confirmed', 'confirmed', '2026-09-10', 2),
    ]);
    expect(summary.booked).toBe(4);
    expect(summary.completed).toBe(1);
    expect(summary.attended).toBe(1);
    expect(summary.noShow).toBe(1);
    expect(summary.cancelled).toBe(1);
    expect(summary.trainingHours).toBe(2);
    expect(summary.occupiedHours).toBe(5);
  });

  it('takes paid/revenue classification from canonical Payment, not from no_show lifecycle', () => {
    expect(classifyPaidLessonFromPayment(undefined)).toBe('unknown');
    expect(classifyPaidLessonFromPayment({ kind: 'withheld' })).toBe('unknown');
    expect(
      classifyPaidLessonFromPayment({ kind: 'visible', paymentStatus: 'unpaid' })
    ).toBe('not_paid');
    expect(classifyPaidLessonFromPayment({ kind: 'visible', paymentStatus: 'paid' })).toBe('paid');
  });
});

describe('student cabinet training metrics exclude no_show', () => {
  const mix = [
    booking('completed', 'completed', '2026-09-01', 2),
    booking('no-show', 'no_show', '2026-09-02', 3),
    booking('cancelled', 'cancelled', '2026-09-03', 1),
  ];

  it('excludes no_show from completed training count, attended count, and learning hours', () => {
    const stats = getStudentStats(userProfile, mix);
    expect(stats.lessons).toBe(1);
    expect(stats.hours).toBe(2);
    expect(getSeasonBookings(mix, 'user-1', new Date('2026-09-10')).map((item) => item.id)).toEqual(
      ['completed']
    );
  });

  it('excludes no_show from attendance streak, including stale booking_completed logs', () => {
    const thisWeek = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(thisWeek.getDate() - 7);
    const toYmd = (value: Date) => {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const thisWeekDate = toYmd(thisWeek);
    const lastWeekDate = toYmd(lastWeek);
    const logs: ActivityLog[] = [
      {
        id: 'log-noshow',
        userId: 'user-1',
        actorId: 'user-1',
        type: 'booking_completed',
        timestamp: `${lastWeekDate}T12:00:00.000Z`,
        metadata: { bookingId: 'no-show' },
      },
    ];
    expect(getTrainingStreakWeeks([booking('no-show', 'no_show', thisWeekDate, 2)], logs)).toBe(0);
    expect(
      getTrainingStreakWeeks(
        [
          booking('completed', 'completed', thisWeekDate, 2),
          booking('no-show', 'no_show', lastWeekDate, 2),
        ],
        logs
      )
    ).toBe(1);
  });

  it('does not unlock review CTA for no_show and keeps no_show visible in history', () => {
    const history = buildStudentHistory(
      userProfile,
      mix,
      [],
      [],
      'ru',
      t,
      [],
      []
    );
    const noShowEvent = history.find((event) => event.bookingId === 'no-show');
    const completedEvent = history.find((event) => event.bookingId === 'completed');
    expect(noShowEvent).toBeDefined();
    expect(noShowEvent?.kind).toBe('no_show');
    expect(noShowEvent?.subtitle).toContain('Неявка');
    expect(noShowEvent?.cta?.action.type).toBe('open_lesson');
    expect(completedEvent?.cta?.action.type).toBe('write_review');
    expect(
      getNeedsAttentionBookings(mix, [], [], 'user-1').map((item) => item.id)
    ).toEqual(['completed']);
  });

  it('treats no_show as a past session, not upcoming, without looking like completed', () => {
    const noShow = booking('no-show', 'no_show', '2026-12-01', 2);
    expect(isBookingPastBySchedule(noShow, [], new Date('2026-09-10T12:00:00'))).toBe(true);
    expect(isBookingUpcomingBySchedule(noShow, [], new Date('2026-09-10T12:00:00'))).toBe(false);
    const session: CabinetSessionItem = {
      kind: 'lesson',
      session: {
        id: noShow.id,
        bookingId: noShow.id,
        revision: 1,
        status: 'no_show',
        date: noShow.date,
        time: noShow.time,
        durationHours: noShow.durationHours,
        instructorId: noShow.instructorId,
        instructorName: noShow.instructorName,
        instructorAvatar: '',
        participantNames: [],
        partyKind: 'individual',
        payment: { kind: 'withheld' },
        bookingOrigin: 'account',
        isLessonBooking: true,
      },
    };
    expect(isSessionPastBySchedule(session, new Date('2026-09-10T12:00:00'))).toBe(true);
  });
});
