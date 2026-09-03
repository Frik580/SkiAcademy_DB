import { describe, expect, it } from 'vitest';
import { AdminPlannerOccupancyItemSchema } from '@ski-academy/shared-domain';
import { sanitizePublicInstructorOccupancy } from './instructorOccupancyReadSupport';

describe('sanitizePublicInstructorOccupancy', () => {
  const interval = {
    startsAt: { seconds: 1_736_918_400, nanoseconds: 0 },
    endsAt: { seconds: 1_736_920_800, nanoseconds: 0 },
  };

  it('strips participant identity from lesson bookings', () => {
    const lesson = AdminPlannerOccupancyItemSchema.parse({
      occupancyKind: 'lesson_booking',
      occupancyId: 'booking_lesson_01',
      instructorId: 'instructor_01',
      interval,
      timeZone: 'Asia/Almaty',
      localDate: '2026-01-15',
      localTime: '10:00',
      durationMinutes: 40,
      displayTitle: 'Anna Smith',
      bookingId: 'booking_lesson_01',
      participantId: 'participant_01',
      payerAccountId: 'account_01',
      isGuest: true,
      difficulty: 'intermediate',
      notes: 'private note',
    });

    const [sanitized] = sanitizePublicInstructorOccupancy([lesson]);
    expect(sanitized.displayTitle).toBe('Booked');
    expect(sanitized.participantId).toBeUndefined();
    expect(sanitized.payerAccountId).toBeUndefined();
    expect(sanitized.isGuest).toBeUndefined();
    expect(sanitized.difficulty).toBeUndefined();
    expect(sanitized.notes).toBeUndefined();
    expect(sanitized.bookingId).toBe('booking_lesson_01');
  });

  it('keeps block and course titles for scheduling', () => {
    const block = AdminPlannerOccupancyItemSchema.parse({
      occupancyKind: 'availability_block',
      occupancyId: 'block_01',
      instructorId: 'instructor_01',
      interval,
      timeZone: 'Asia/Almaty',
      localDate: '2026-01-15',
      localTime: '12:00',
      durationMinutes: 60,
      displayTitle: 'Break',
      blockId: 'block_01',
      blockKind: 'break',
      notes: 'admin only',
    });
    const courseDay = AdminPlannerOccupancyItemSchema.parse({
      occupancyKind: 'course_day',
      occupancyId: 'course_day_01',
      instructorId: 'instructor_01',
      interval,
      timeZone: 'Asia/Almaty',
      localDate: '2026-01-15',
      localTime: '14:00',
      durationMinutes: 120,
      displayTitle: 'Freeride Camp',
      courseId: 'course_01',
      courseDayId: 'course_day_01',
    });

    const sanitized = sanitizePublicInstructorOccupancy([block, courseDay]);
    expect(sanitized[0].displayTitle).toBe('Break');
    expect(sanitized[0].notes).toBeUndefined();
    expect(sanitized[1].displayTitle).toBe('Freeride Camp');
  });
});
