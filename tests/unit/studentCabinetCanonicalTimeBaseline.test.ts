import { describe, expect, it } from 'vitest';
import {
  BookingIdSchema,
  InstructorIdSchema,
  LessonBookingReadModelSchema,
  ParticipantIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { mapLessonBookingReadModelToCabinetItem } from '../../src/features/lesson-bookings/lessonBookingViewModel';
import {
  getCurrentSessionItems,
  getTodaySessionCountdownFromSessions,
  resolveSessionEndDateTime,
  resolveSessionStartDateTime,
} from '../../src/features/course-enrollments/sessionScheduleHelpers';
import type {
  CabinetSessionItem,
  CourseDaySessionItem,
} from '../../src/features/course-enrollments/courseEnrollmentContracts';

// Run in both TZ=Asia/Almaty and TZ=UTC. A browser's timezone must not move
// an existing canonical lesson or course to a different instant.
const startsAt = new Date('2026-06-15T04:00:00.000Z');
const endsAt = new Date('2026-06-15T06:00:00.000Z');
const participantId = ParticipantIdSchema.parse('participant_time_baseline');

function lesson(): CabinetSessionItem {
  const readModel = LessonBookingReadModelSchema.parse({
    bookingId: BookingIdSchema.parse('booking_time_baseline'),
    revision: 1,
    partyKind: 'individual',
    participantIds: [participantId],
    participants: [{ participantId, displayName: 'Baseline Student' }],
    instructor: {
      instructorId: InstructorIdSchema.parse('instructor_time_baseline'),
      displayName: 'Baseline Coach',
    },
    occurrence: {
      startsAt: timestampFromDate(startsAt),
      endsAt: timestampFromDate(endsAt),
      durationMinutes: 120,
      timeZone: 'Asia/Almaty',
    },
    lifecycle: { status: 'confirmed' },
    bookingOrigin: 'account',
    authorizedActions: {
      canRequestCancellation: false,
      canWithdrawCancellation: false,
      canReschedule: false,
      canCreateChangeRequest: false,
    },
    updatedAt: timestampFromDate(startsAt),
  });
  return { kind: 'lesson', session: mapLessonBookingReadModelToCabinetItem(readModel) };
}

function course(overrides: Partial<CourseDaySessionItem> = {}): CourseDaySessionItem {
  return {
    kind: 'course_day',
    enrollmentId: 'enrollment_time_baseline',
    courseDayId: 'day_time_baseline',
    courseId: 'course_time_baseline',
    participantId,
    participantName: 'Baseline Student',
    courseTitle: 'Baseline Course',
    date: '2026-06-15',
    time: '09:00',
    endTime: '11:00',
    timeZone: 'Asia/Almaty',
    dayOrder: 1,
    lifecycleStatus: 'confirmed',
    revision: 1,
    authorizedActions: { canWithdraw: false, canRequestCancellation: false },
    ...overrides,
  };
}

describe('canonical Student Cabinet time baseline across browser timezones', () => {
  it('renders the lesson date and clock time in its occurrence timezone', () => {
    const item = lesson();
    expect(item.kind === 'lesson' && item.session.date).toBe('2026-06-15');
    expect(item.kind === 'lesson' && item.session.time).toBe('09:00');
  });

  it('preserves the canonical lesson start instant through the cabinet adapter', () => {
    expect(resolveSessionStartDateTime(lesson())?.toISOString()).toBe(startsAt.toISOString());
  });

  it('preserves the canonical lesson end instant through the cabinet adapter', () => {
    expect(resolveSessionEndDateTime(lesson())?.toISOString()).toBe(endsAt.toISOString());
  });

  it('shows a lesson as current while the canonical occurrence is in progress', () => {
    expect(getCurrentSessionItems([lesson()], new Date('2026-06-15T04:30:00.000Z'))).toHaveLength(
      1
    );
  });

  it('counts down to the canonical lesson instant, thirty minutes before start', () => {
    const now = new Date('2026-06-15T03:30:00.000Z');
    const countdown = getTodaySessionCountdownFromSessions([lesson()], now);
    expect(countdown?.startsAt.toISOString()).toBe(startsAt.toISOString());
    expect(countdown && countdown.startsAt.getTime() - now.getTime()).toBe(30 * 60 * 1000);
  });

  it('does not show a completed time window as an upcoming lesson', () => {
    expect(getTodaySessionCountdownFromSessions([lesson()], endsAt)).toBeNull();
    expect(getCurrentSessionItems([lesson()], endsAt)).toEqual([]);
  });

  it('preserves explicit course timezone instants and current state', () => {
    const item = course();
    expect(resolveSessionStartDateTime(item)?.toISOString()).toBe(startsAt.toISOString());
    expect(resolveSessionEndDateTime(item)?.toISOString()).toBe(endsAt.toISOString());
    expect(getCurrentSessionItems([item], new Date('2026-06-15T04:30:00.000Z'))).toHaveLength(1);
  });

  it('includes an upcoming course on the Almaty day across the UTC midnight boundary', () => {
    const item = course({ time: '00:30', endTime: '01:30' });
    const now = new Date('2026-06-14T19:00:00.000Z'); // June 15, 00:00 in Almaty.
    expect(getTodaySessionCountdownFromSessions([item], now)?.startsAt.toISOString()).toBe(
      '2026-06-14T19:30:00.000Z'
    );
  });
});
