import { describe, expect, it } from 'vitest';
import { resolveChatSenderRole, resolveProfileSenderRole } from '../../src/lib/chatSenderRole';
import { Booking, ChatMessage, Instructor, UserProfile } from '../../src/types';

const instructorProfile: UserProfile = {
  uid: 'instructor-user-1',
  email: 'coach@example.com',
  displayName: 'Coach Alex',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
  instructorId: 'instructor-1',
};

const studentProfile: UserProfile = {
  uid: 'student-1',
  email: 'student@example.com',
  displayName: 'Student Sam',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 100,
};

const instructors: Instructor[] = [
  {
    id: 'instructor-1',
    name: 'Alex Coach',
    specialty: 'ski',
    rating: 5,
    reviewsCount: 10,
    languages: ['en'],
    experienceYears: 5,
    bio: '',
    avatarUrl: '',
    pricePerHour: 50,
    isAvailable: true,
  },
];

const lessonBooking: Booking = {
  id: 'booking-lesson-1',
  userId: 'student-1',
  instructorId: 'instructor-1',
  instructorName: 'Alex Coach',
  instructorAvatar: '',
  date: '2026-12-01',
  time: '09:00',
  durationHours: 1,
  totalPrice: 50,
  status: 'confirmed',
  difficulty: 'intermediate',
};

const baseMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg-1',
  bookingId: lessonBooking.id,
  senderId: instructorProfile.uid,
  senderName: instructorProfile.displayName,
  senderAvatar: '',
  text: 'Hello',
  timestamp: '2026-12-01T09:00:00.000Z',
  ...overrides,
});

describe('resolveProfileSenderRole', () => {
  it('marks instructors correctly', () => {
    expect(resolveProfileSenderRole(instructorProfile)).toBe('instructor');
    expect(resolveProfileSenderRole(studentProfile)).toBe('client');
  });
});

describe('resolveChatSenderRole', () => {
  it('uses stored senderRole when present', () => {
    expect(
      resolveChatSenderRole(
        { ...baseMessage(), senderRole: 'instructor' },
        lessonBooking,
        [],
        instructors
      )
    ).toBe('instructor');
  });

  it('detects instructor messages for students without usersList access', () => {
    expect(resolveChatSenderRole(baseMessage(), lessonBooking, [], instructors, [], 'en')).toBe(
      'instructor'
    );
  });

  it('detects course instructors by course instructorIds', () => {
    const courseBooking: Booking = {
      ...lessonBooking,
      id: 'booking_course_student-1_course-abc',
      instructorId: 'course_course-abc',
      courseId: 'course-abc',
    };

    expect(
      resolveChatSenderRole(
        baseMessage(),
        courseBooking,
        [],
        instructors,
        [
          {
            id: 'course-abc',
            title: 'Course',
            duration: '',
            description: '',
            dates: '',
            totalSeats: 5,
            availableSeats: 4,
            price: 100,
            bgImageUrl: '',
            instructorIds: ['instructor-1'],
          },
        ],
        'en'
      )
    ).toBe('instructor');
  });

  it('detects instructor messages via senderInstructorId', () => {
    expect(
      resolveChatSenderRole(
        { ...baseMessage(), senderInstructorId: 'instructor-1' },
        lessonBooking,
        [],
        instructors
      )
    ).toBe('instructor');
  });
});
