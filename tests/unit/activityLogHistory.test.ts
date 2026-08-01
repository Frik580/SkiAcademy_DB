import { describe, expect, it } from 'vitest';
import {
  buildStudentHistory,
  filterHistoryEvents,
  getHistoryEvents,
  groupHistoryByMonth,
} from '../../src/components/personal_cabinet/student/studentCabinetUtils';
import { ActivityLog, Booking, Course, UserProfile } from '../../src/types';

const t = (key: string) => {
  if (key === 'scHistoryLessonWith') return 'Lesson with {name}';
  if (key === 'scHistoryNewLevel') return 'New level';
  if (key === 'scHistoryLevelReached') return 'Level {n} reached';
  if (key === 'hoursShort') return 'hrs';
  if (key === 'writeReviewBtn') return 'Write Review';
  if (key === 'scHistoryPendingRecommendations') return '{n} tasks not completed';
  return key;
};

const userProfile: UserProfile = {
  uid: 'user-1',
  email: 'user@example.com',
  displayName: 'Test User',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
  level: 2,
};

const courses: Course[] = [];

const bookings: Booking[] = [
  {
    id: 'booking-1',
    userId: 'user-1',
    instructorId: 'instructor-1',
    instructorName: 'Maria',
    instructorAvatar: '',
    date: '2026-07-20',
    time: '10:00',
    durationHours: 2,
    totalPrice: 100,
    status: 'completed',
    difficulty: 'intermediate',
  },
];

describe('student history', () => {
  it('maps activity logs into history events', () => {
    const activityLogs: ActivityLog[] = [
      {
        id: 'act-1',
        userId: 'user-1',
        actorId: 'instructor-user',
        type: 'booking_completed',
        timestamp: '2026-07-28T12:00:00.000Z',
        metadata: {
          bookingId: 'booking-1',
          instructorId: 'instructor-1',
          instructorName: 'Maria',
          durationHours: 2,
          difficulty: 'intermediate',
        },
      },
      {
        id: 'act-2',
        userId: 'user-1',
        actorId: 'instructor-user',
        type: 'level_up',
        timestamp: '2026-07-25T12:00:00.000Z',
        metadata: { oldLevel: 1, newLevel: 2 },
      },
    ];

    const history = getHistoryEvents(userProfile, bookings, courses, 'en', t, activityLogs);

    expect(history).toHaveLength(2);
    expect(history[0].kind).toBe('training');
    expect(history[0].title).toContain('Maria');
    expect(history[0].bookingId).toBe('booking-1');
    expect(history[1].kind).toBe('level');
  });

  it('falls back to legacy booking history when activity logs are empty', () => {
    const history = getHistoryEvents(userProfile, bookings, courses, 'en', t, []);

    expect(history.some((event) => event.bookingId === 'booking-1')).toBe(true);
    expect(history.some((event) => event.kind === 'level')).toBe(true);
  });

  it('backfills completed bookings missing from activity logs', () => {
    const history = getHistoryEvents(userProfile, bookings, courses, 'en', t, [
      {
        id: 'act-review',
        userId: 'user-1',
        actorId: 'user-1',
        type: 'review_created',
        timestamp: '2026-07-29T12:00:00.000Z',
        metadata: { bookingId: 'booking-1', rating: 5 },
      },
    ]);

    expect(history.some((event) => event.kind === 'review')).toBe(true);
    expect(
      history.some((event) => event.bookingId === 'booking-1' && event.kind === 'training')
    ).toBe(true);
  });

  it('adds review CTA for unreviewed completed lessons', () => {
    const history = buildStudentHistory(userProfile, bookings, courses, [], 'en', t, [], []);

    const training = history.find((event) => event.kind === 'training');
    expect(training?.cta?.action.type).toBe('write_review');
  });

  it('filters and groups history events', () => {
    const events = getHistoryEvents(userProfile, bookings, courses, 'en', t, [
      {
        id: 'act-1',
        userId: 'user-1',
        actorId: 'x',
        type: 'booking_completed',
        timestamp: '2026-07-28T12:00:00.000Z',
        metadata: { bookingId: 'booking-1', instructorName: 'Maria' },
      },
      {
        id: 'act-2',
        userId: 'user-1',
        actorId: 'x',
        type: 'level_up',
        timestamp: '2026-06-15T12:00:00.000Z',
        metadata: { newLevel: 2 },
      },
    ]);

    expect(filterHistoryEvents(events, 'training')).toHaveLength(1);
    expect(filterHistoryEvents(events, 'progress')).toHaveLength(1);
    expect(groupHistoryByMonth(events, 'en').length).toBeGreaterThan(0);
  });
});
