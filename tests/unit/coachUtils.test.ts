import { describe, expect, it } from 'vitest';
import {
  getInstructorSkillComments,
  isMessageFromInstructor,
  resolveMessageCourseTitle,
} from '../../src/features/profile/components/personal_cabinet/student/coachUtils';
import {
  ActivityLog,
  Booking,
  ChatMessage,
  Course,
  Instructor,
  UserProfile,
} from '../../src/types';

const instructor: Instructor = {
  id: 'instructor-1',
  name: 'Alex Coach',
  specialty: 'ski',
  rating: 5,
  reviewsCount: 1,
  pricePerHour: 100,
  isAvailable: true,
  bio: '',
  avatarUrl: '',
};

const baseMsg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  bookingId: 'course-abc',
  senderId: 'instructor-user-1',
  senderName: 'Display Name',
  senderAvatar: '',
  text: 'Homework',
  timestamp: '2026-08-08T10:00:00.000Z',
  isHomework: true,
  ...overrides,
});

describe('isMessageFromInstructor', () => {
  it('recognizes instructor panel messages via senderInstructorId', () => {
    const msg = baseMsg({
      senderRole: 'instructor',
      senderInstructorId: 'instructor-1',
    });
    expect(isMessageFromInstructor(msg, instructor)).toBe(true);
  });

  it('recognizes instructor via usersList uid when available', () => {
    const msg = baseMsg({ senderId: 'instructor-user-1' });
    expect(isMessageFromInstructor(msg, instructor, 'instructor-user-1')).toBe(true);
  });

  it('does not treat other instructors as sender', () => {
    const msg = baseMsg({
      senderRole: 'instructor',
      senderInstructorId: 'instructor-2',
    });
    expect(isMessageFromInstructor(msg, instructor)).toBe(false);
  });
});

describe('resolveMessageCourseTitle', () => {
  const courses: Course[] = [
    {
      id: 'course-abc',
      title: 'Winter Camp',
      duration: '5 days',
      description: '',
      dates: '',
      totalSeats: 10,
      availableSeats: 5,
      price: 500,
      bgImageUrl: '',
    },
  ];

  const enrollment: Booking = {
    id: 'booking_course_user-1_course-abc',
    userId: 'student-1',
    instructorId: 'course_course-abc',
    instructorName: 'Winter Camp (Group Course)',
    instructorAvatar: '',
    date: '2026-12-01',
    time: '09:00',
    durationHours: 4,
    totalPrice: 500,
    status: 'confirmed',
    difficulty: 'intermediate',
  };

  it('returns translated course title for course enrollment homework', () => {
    expect(resolveMessageCourseTitle('course-abc', [enrollment], courses, 'en', 'student-1')).toBe(
      'Winter Camp'
    );
  });

  it('returns null for individual lesson homework', () => {
    const lesson: Booking = { ...enrollment, id: 'lesson-1', instructorId: 'instructor-1' };
    expect(resolveMessageCourseTitle('lesson-1', [lesson], courses, 'en', 'student-1')).toBeNull();
  });
});

describe('getInstructorSkillComments', () => {
  const student: UserProfile = {
    uid: 'student-1',
    name: 'Student',
    email: 's@test.com',
    role: 'student',
    level: 2,
    skillScores: { carving: 8 },
    skillComments: { carving: 'Keep knees bent' },
  };

  const skillConfig = {
    items: [
      {
        id: 'carving',
        titleEn: 'Carving',
        titleRu: 'Карвинг',
        maxPoints: 20,
      },
    ],
  };

  const baseLog = (overrides: Partial<ActivityLog> = {}): ActivityLog => ({
    id: 'log-1',
    userId: 'student-1',
    actorId: 'instructor-user-1',
    type: 'skill_scores_updated',
    timestamp: '2026-08-08T10:00:00.000Z',
    metadata: {
      instructorId: 'instructor-1',
      skillDeltas: [{ itemId: 'carving', delta: 3, oldScore: 5, newScore: 8 }],
      commentedSkillIds: ['carving'],
    },
    ...overrides,
  });

  it('shows comments when evaluation log has metadata.instructorId', () => {
    const rows = getInstructorSkillComments(
      student,
      skillConfig,
      'en',
      'instructor-1',
      [],
      [baseLog()]
    );
    expect(rows).toEqual([
      {
        skillId: 'carving',
        title: 'Carving',
        comment: 'Keep knees bent',
        score: 8,
        maxPoints: 20,
      },
    ]);
  });

  it('shows comments for comment-only updates via commentedSkillIds', () => {
    const rows = getInstructorSkillComments(
      student,
      skillConfig,
      'en',
      'instructor-1',
      [],
      [
        baseLog({
          metadata: {
            instructorId: 'instructor-1',
            skillDeltas: [],
            commentedSkillIds: ['carving'],
          },
        }),
      ]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].comment).toBe('Keep knees bent');
  });

  it('recognizes level_up logs from the instructor', () => {
    const rows = getInstructorSkillComments(
      student,
      skillConfig,
      'en',
      'instructor-1',
      [],
      [
        baseLog({
          type: 'level_up',
          metadata: {
            instructorId: 'instructor-1',
            oldLevel: 1,
            newLevel: 2,
            skillDeltas: [{ itemId: 'carving', delta: 3, oldScore: 5, newScore: 8 }],
            commentedSkillIds: ['carving'],
          },
        }),
      ]
    );
    expect(rows).toHaveLength(1);
  });
});
