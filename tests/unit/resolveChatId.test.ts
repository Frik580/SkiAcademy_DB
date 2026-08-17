import { describe, expect, it } from 'vitest';
import { getCourseChatThreadIds, resolveChatId } from '../../src/domain/chat/resolveChatId';
import { Booking } from '../../src/types';

const courseBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking_course_user-1_course-abc',
  userId: 'user-1',
  instructorId: 'course_course-abc',
  instructorName: 'Group Course',
  instructorAvatar: '',
  date: '2026-12-01',
  time: '09:00',
  durationHours: 4,
  totalPrice: 100,
  status: 'confirmed',
  difficulty: 'intermediate',
  notes: '',
  ...overrides,
});

describe('resolveChatId', () => {
  it('uses courseId for course enrollments', () => {
    expect(resolveChatId(courseBooking())).toBe('course-abc');
  });

  it('uses booking id for individual lessons', () => {
    const lesson = courseBooking({
      id: 'booking-lesson-1',
      instructorId: 'instructor-1',
    });
    expect(resolveChatId(lesson)).toBe('booking-lesson-1');
  });
});

describe('getCourseChatThreadIds', () => {
  it('includes shared thread and participant legacy paths for instructors', () => {
    const threads = getCourseChatThreadIds({
      ...courseBooking(),
      chatId: 'course-abc',
      participantBookingIds: [
        'booking_course_user-1_course-abc',
        'booking_course_user-2_course-abc',
      ],
    });

    expect(threads).toEqual([
      'course-abc',
      'booking_course_user-1_course-abc',
      'booking_course_user-2_course-abc',
    ]);
  });

  it('returns only primary thread for lessons', () => {
    expect(
      getCourseChatThreadIds(
        courseBooking({
          id: 'booking-lesson-1',
          instructorId: 'instructor-1',
        })
      )
    ).toEqual(['booking-lesson-1']);
  });

  it('supports instructor grouped course cards without enrollment instructorId', () => {
    const threads = getCourseChatThreadIds({
      id: 'course-abc',
      chatId: 'course-abc',
      isCourse: true,
      participantBookingIds: ['booking_course_user-1_course-abc'],
      userId: 'user-1',
      instructorName: 'Group',
      instructorAvatar: '',
      date: '2026-12-01',
      time: '09:00',
      durationHours: 4,
      totalPrice: 100,
      status: 'confirmed',
      difficulty: 'intermediate',
    });

    expect(threads).toEqual(['course-abc', 'booking_course_user-1_course-abc']);
  });
});
