import { describe, expect, it } from 'vitest';
import {
  getLessonAgeDays,
  isBookingInTodayRecommendationWindow,
  RECOMMENDATION_TODAY_WINDOW_DAYS,
} from '../../src/components/personal_cabinet/student/studentCabinetUtils';
import { Booking } from '../../src/types';

const booking = (date: string): Booking => ({
  id: 'b1',
  userId: 'u1',
  instructorId: 'inst1',
  instructorName: 'Coach',
  date,
  time: '10:00',
  durationHours: 1,
  difficulty: 'green',
  status: 'completed',
  recommendations: [{ id: 'r1', text: 'Practice' }],
});

describe('today recommendation window', () => {
  it('includes lessons from the last N days', () => {
    const from = new Date('2026-07-31T12:00:00');
    const lesson = booking('2026-07-28');
    expect(getLessonAgeDays(lesson, [], from)).toBe(3);
    expect(
      isBookingInTodayRecommendationWindow(lesson, [], RECOMMENDATION_TODAY_WINDOW_DAYS, from)
    ).toBe(true);
  });

  it('excludes lessons older than the window', () => {
    const from = new Date('2026-08-20T12:00:00');
    const lesson = booking('2026-07-28');
    expect(
      isBookingInTodayRecommendationWindow(lesson, [], RECOMMENDATION_TODAY_WINDOW_DAYS, from)
    ).toBe(false);
  });

  it('excludes future lessons', () => {
    const from = new Date('2026-07-31T12:00:00');
    const lesson = booking('2026-08-05');
    expect(
      isBookingInTodayRecommendationWindow(lesson, [], RECOMMENDATION_TODAY_WINDOW_DAYS, from)
    ).toBe(false);
  });
});
