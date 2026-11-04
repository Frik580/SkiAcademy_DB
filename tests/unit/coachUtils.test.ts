import { describe, expect, it } from 'vitest';
import {
  getInstructorSkillComments,
  getUnattributedSkillComments,
  isMessageFromInstructor,
  resolveMessageCourseTitle,
} from '../../src/features/student-cabinet/components/student/coachUtils';
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
        title: 'Карвинг',
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

  it('does not attribute instructor B current text to instructor A from evaluation evidence', () => {
    const current = { ...student, skillComments: { carving: 'Instructor B comment' } };
    const logs = [
      baseLog(),
      baseLog({
        id: 'log-2',
        actorId: 'instructor-user-2',
        timestamp: '2026-08-09T10:00:00.000Z',
        metadata: { instructorId: 'instructor-2', commentedSkillIds: ['carving'] },
      }),
    ];
    expect(
      getInstructorSkillComments(current, skillConfig, 'en', 'instructor-1', [], logs)
    ).toEqual([]);
    expect(
      getInstructorSkillComments(current, skillConfig, 'en', 'instructor-2', [], logs)
    ).toEqual([]);
  });

  it('does not infer authorship from metadata.instructorId', () => {
    const rows = getInstructorSkillComments(
      student,
      skillConfig,
      'en',
      'instructor-1',
      [],
      [baseLog()]
    );
    expect(rows).toEqual([]);
    expect(getUnattributedSkillComments(student, skillConfig, 'en')).toEqual([
      {
        skillId: 'carving',
        title: 'Carving',
        comment: 'Keep knees bent',
        score: 8,
        hasScore: true,
        maxPoints: 20,
      },
    ]);
  });

  it('does not infer authorship of comment-only updates via commentedSkillIds', () => {
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
    expect(rows).toEqual([]);
  });

  it('does not infer comment authorship from level_up logs', () => {
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
    expect(rows).toEqual([]);
  });

  it.each([
    ['repeated evaluation', [baseLog(), baseLog({ id: 'log-2' })]],
    ['administrative correction', [baseLog(), baseLog({ actorId: 'admin', metadata: {} })]],
    ['missing historical metadata', [baseLog({ metadata: undefined })]],
    ['missing history', []],
    ['another student history', [baseLog({ userId: 'another-student' })]],
  ])('keeps current text unattributed with %s', (_scenario, logs) => {
    const current = { ...student, skillComments: { carving: 'Current corrected comment' } };
    const original = structuredClone(current);
    expect(
      getInstructorSkillComments(current, skillConfig, 'en', 'instructor-1', [], logs)
    ).toEqual([]);
    expect(getUnattributedSkillComments(current, skillConfig, 'en')).toMatchObject([
      { comment: 'Current corrected comment', score: 8 },
    ]);
    expect(current).toEqual(original);
  });

  it('returns no rows for missing, removed or blank comments', () => {
    for (const skillComments of [undefined, {}, { carving: '  ' }]) {
      expect(
        getUnattributedSkillComments({ ...student, skillComments }, skillConfig, 'en')
      ).toEqual([]);
    }
  });

  it('reads only the currently supplied Participant and localizes skill names', () => {
    const dependent = {
      ...student,
      skillScores: { carving: 4 },
      skillComments: { carving: 'Dependent comment' },
    };
    expect(getUnattributedSkillComments(student, skillConfig, 'en')).toMatchObject([
      { title: 'Carving', comment: 'Keep knees bent', score: 8 },
    ]);
    expect(getUnattributedSkillComments(dependent, skillConfig, 'ru')).toMatchObject([
      { title: 'Карвинг', comment: 'Dependent comment', score: 4 },
    ]);
    expect(getUnattributedSkillComments(student, skillConfig, 'ru')).toHaveLength(1);
  });
});
