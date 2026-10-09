import { cabinetLessonTiming } from '../fixtures/cabinetLessonTiming';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  CabinetSessionItem,
  CourseEnrollmentCabinetItem,
} from '../../src/features/course-enrollments/courseEnrollmentContracts';
import { expandEnrollmentsToCourseDaySessions } from '../../src/features/course-enrollments/courseEnrollmentViewModel';
import {
  buildNextSessionCards,
  buildSessionParticipants,
} from '../../src/features/student-cabinet/components/student/studentSessionParticipants';
import { StudentTodaySection } from '../../src/features/student-cabinet/components/student/StudentTodaySection';
import { NextSessionBlock } from '../../src/features/student-cabinet/components/student/StudentTodaySessionBlocks';
import type {
  NextSessionBlockInput,
  SessionParticipantInput,
  StudentTodaySectionInput,
} from '../../src/features/student-cabinet/components/student/studentCabinetContracts';
import { toCabinetParticipantAvatarItems } from '../../src/features/student-cabinet/cabinetParticipantAvatarSwitcherContract';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));
vi.mock(
  '../../src/features/student-cabinet/components/student/useStudentCabinetTranslations',
  () => ({
    useStudentCabinetTranslations: () => ({ lang: 'en', t: (key: string) => key }),
  })
);
vi.mock('../../src/features/student-cabinet/components/LessonFeedbackIndicator', () => ({
  LessonFeedbackIndicator: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/BookingCallCoachButton', () => ({
  BookingCallCoachButton: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentTodayProgressBlock', () => ({
  TodayProgressBlock: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/StudentTodayTasksBlock', () => ({
  TodayTasksBlock: () => null,
}));

const profiles: SessionParticipantInput[] = [
  { participantId: 'alice', displayName: 'Alice Student', avatarUrl: '/alice.png' },
  { participantId: 'bob', displayName: 'Bob Student', avatarUrl: '/bob.png' },
  { participantId: 'other', displayName: 'Other Student', avatarUrl: '/other.png' },
];
function lesson(ids: string[]): CabinetSessionItem {
  return {
    kind: 'lesson',
    session: {
      id: 'lesson_1',
      bookingId: 'lesson_1',
      revision: 1,
      status: 'confirmed',
      date: '2099-01-02',
      time: '10:00',
      durationHours: 1,
      ...cabinetLessonTiming('2099-01-02', '10:00', 1),
      instructorId: 'coach',
      instructorName: 'Coach',
      instructorAvatar: '',
      participantIds: ids,
      participantDisplayNames: { alice: 'Alice Snapshot', bob: 'Bob Snapshot' },
      participantNames: ['Alice Snapshot', 'Bob Snapshot'],
      partyKind: ids.length > 1 ? 'family_group' : 'individual',
      payment: { kind: 'withheld' },
      bookingOrigin: 'account',
      isLessonBooking: true,
    },
  };
}
function course(enrollmentId: string, participantId: string): CabinetSessionItem {
  return {
    kind: 'course_day',
    enrollmentId,
    participantId,
    participantName: participantId + ' Snapshot',
    courseId: 'same_course',
    courseDayId: 'same_day',
    courseTitle: 'Course',
    date: '2099-01-02',
    time: '11:00',
    endTime: '12:00',
    timeZone: 'Asia/Almaty',
    dayOrder: 1,
    lifecycleStatus: 'confirmed',
    revision: 1,
    authorizedActions: {
      canRequestCancellation: false,
      canWithdraw: false,
    },
  };
}
function props(sessions: CabinetSessionItem[], participants = profiles): NextSessionBlockInput {
  return {
    nextSessions: sessions.map((session) => ({ session, dateStr: '2099-01-02' })),
    participantsBySessionKey: buildSessionParticipants(sessions, participants),
    miniDays: [],
    courses: [],
    instructors: [],
    usersList: [],
    onGoToTab: vi.fn(),
    onOpenLesson: vi.fn(),
    onOpenSession: vi.fn(),
  };
}
function participantLists() {
  return screen.getAllByRole('list', { name: 'bookingParticipantsLabel' });
}

describe('next session participants', () => {
  it('renders one booking participant with avatar and full displayName', () => {
    render(<NextSessionBlock {...props([lesson(['bob'])])} />);
    expect(within(participantLists()[0]).getByText('Bob Student')).toBeInTheDocument();
    expect(participantLists()[0].querySelector('img')).toHaveAttribute('src', '/bob.png');
    expect(screen.queryByText('Alice Student')).not.toBeInTheDocument();
  });

  it('renders every ID of a family booking, without unrelated profiles', () => {
    render(<NextSessionBlock {...props([lesson(['bob', 'alice'])])} />);
    expect(
      within(participantLists()[0])
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Bob Student', 'Alice Student']);
    expect(screen.queryByText('Other Student')).not.toBeInTheDocument();
  });

  it('keeps two enrollments of the same course isolated', () => {
    const a = course('enrollment_a', 'alice');
    const b = course('enrollment_b', 'bob');
    render(<NextSessionBlock {...props([a, b])} />);
    const lists = participantLists();
    expect(within(lists[0]).getByText('Alice Student')).toBeInTheDocument();
    expect(within(lists[0]).queryByText('Bob Student')).not.toBeInTheDocument();
    expect(within(lists[1]).getByText('Bob Student')).toBeInTheDocument();
    expect(within(lists[1]).queryByText('Alice Student')).not.toBeInTheDocument();
  });

  it('shows all participants of a course submission through their distinct canonical enrollments', () => {
    const enrollments = ['alice', 'bob'].map((participantId): CourseEnrollmentCabinetItem => ({
      enrollmentId: 'enrollment_' + participantId,
      courseId: 'same_course',
      participantId,
      participantName: participantId + ' Snapshot',
      revision: 1,
      lifecycleStatus: 'confirmed',
      courseTitle: 'Course',
      scheduleStartDate: '2099-01-02',
      scheduleEndDate: '2099-01-02',
      bookingOrigin: 'account',
      updatedAtSeconds: 1,
      authorizedActions: { canWithdraw: false, canRequestCancellation: false },
      courseSchedule: {
        courseId: 'same_course',
        courseScheduleRevision: 1,
        courseDayCount: 1,
        startAt: { seconds: 4070944800, nanoseconds: 0 },
        finalCourseDayEndsAt: { seconds: 4070948400, nanoseconds: 0 },
        courseDays: [
          {
            courseDayId: 'same_day',
            dayOrder: 1,
            revision: 1,
            timeZone: 'Asia/Almaty',
            interval: {
              startsAt: { seconds: 4070944800, nanoseconds: 0 },
              endsAt: { seconds: 4070948400, nanoseconds: 0 },
            },
          },
        ],
      },
    }));
    const sessions = expandEnrollmentsToCourseDaySessions(enrollments);
    render(<NextSessionBlock {...props(sessions)} />);
    expect(participantLists()).toHaveLength(2);
    expect(screen.getByText('Alice Student')).toBeInTheDocument();
    expect(screen.getByText('Bob Student')).toBeInTheDocument();
  });

  it('does not change card membership when the header selection changes', () => {
    const sessions = [lesson(['alice', 'bob']), course('enrollment_b', 'bob')];
    const input: StudentTodaySectionInput = {
      ...props(sessions),
      currentSessions: [],
      sessionItems: sessions,
      todayTasks: [],
      bookings: [],
      onContinueDevelopment: vi.fn(),
      selectedParticipantId: 'alice',
    };
    const view = render(<StudentTodaySection {...input} />);
    const before = participantLists().map((list) => list.textContent);
    view.rerender(<StudentTodaySection {...input} selectedParticipantId="other" />);
    expect(participantLists().map((list) => list.textContent)).toEqual(before);
    expect(screen.queryByText('Other Student')).not.toBeInTheDocument();
  });

  it('uses existing initials and projected name/ID fallbacks while profiles are missing, then updates', () => {
    const sessions = [lesson(['alice', 'unknown']), course('enrollment_b', 'bob')];
    const view = render(<NextSessionBlock {...props(sessions, [])} />);
    expect(screen.getByText('Alice Snapshot')).toBeInTheDocument();
    expect(screen.getByText('unknown')).toBeInTheDocument();
    expect(screen.getByText('bob Snapshot')).toBeInTheDocument();
    expect(
      participantLists()[0].querySelectorAll('[data-participant-avatar-face]')[0]
    ).toHaveTextContent('A');
    expect(participantLists()[0].querySelector('img')).toBeNull();
    view.rerender(<NextSessionBlock {...props(sessions)} />);
    expect(screen.getByText('Alice Student')).toBeInTheDocument();
    expect(participantLists()[0].querySelector('img')).toHaveAttribute('src', '/alice.png');
  });

  it('reuses the self avatar fallback without sharing it with a dependent', () => {
    const managed = ['alice', 'bob'].map((id): ManagedParticipantOption => ({
      participantId: id,
      participantManagementId: 'management_' + id,
      displayName: id,
      discipline: 'ski',
      skillLevel: 'beginner',
      age: { kind: 'age_years', years: 10 },
      authority: id === 'alice' ? 'self' : 'parent_guardian',
      revision: 1,
    }));
    const items = toCabinetParticipantAvatarItems(managed, '/self.png');
    render(<NextSessionBlock {...props([lesson(['alice', 'bob'])], items)} />);
    const people = within(participantLists()[0]).getAllByRole('listitem');
    expect(people[0].querySelector('img')).toHaveAttribute('src', '/self.png');
    expect(people[1].querySelector('img')).toBeNull();
    expect(people[1].querySelector('[data-participant-avatar-face]')).toHaveTextContent('B');
  });
});

describe('account-level next course aggregation', () => {
  const now = new Date('2099-01-01T12:00:00');
  it('collapses duplicate course-day enrollments and deduplicates participant IDs', () => {
    const sessions = [course('ea', 'alice'), course('eb', 'bob'), course('eb_duplicate', 'bob')];
    const cards = buildNextSessionCards(sessions, profiles, now);
    render(<NextSessionBlock {...props([])} {...cards} />);
    expect(participantLists()).toHaveLength(1);
    expect(
      within(participantLists()[0])
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Alice Student', 'Bob Student']);
  });

  it('excludes inactive enrollments and keeps distinct course days and courses', () => {
    const a = course('ea', 'alice');
    const b = course('eb', 'bob');
    if (a.kind !== 'course_day' || b.kind !== 'course_day') throw new Error('course fixture');
    const cards = buildNextSessionCards(
      [
        a,
        b,
        { ...a, courseDayId: 'second_day', date: '2099-01-03' },
        { ...b, enrollmentId: 'cancelled', participantId: 'other', lifecycleStatus: 'cancelled' },
        { ...b, enrollmentId: 'completed', participantId: 'other', lifecycleStatus: 'completed' },
        {
          ...b,
          enrollmentId: 'different_course',
          courseId: 'another_course',
          participantId: 'other',
        },
      ],
      profiles,
      now
    );
    render(<NextSessionBlock {...props([])} {...cards} />);
    const lists = participantLists();
    expect(lists).toHaveLength(3);
    expect(lists.filter((list) => list.textContent?.includes('Alice Student'))).toHaveLength(2);
    for (const list of lists.filter((list) => list.textContent?.includes('Alice Student'))) {
      expect(within(list).getByText('Bob Student')).toBeInTheDocument();
      expect(within(list).queryByText('Other Student')).not.toBeInTheDocument();
    }
    expect(lists.filter((list) => list.textContent === 'Other Student')).toHaveLength(1);
  });

  it('preserves lesson booking membership beside an aggregated course and missing profiles', () => {
    const cards = buildNextSessionCards(
      [lesson(['bob']), course('ea', 'alice'), course('eb', 'bob')],
      [],
      now
    );
    render(<NextSessionBlock {...props([])} {...cards} />);
    const lists = participantLists();
    expect(lists).toHaveLength(2);
    expect(lists[0]).toHaveTextContent('Bob Snapshot');
    expect(within(lists[0]).getAllByRole('listitem')).toHaveLength(1);
    expect(within(lists[1]).getAllByRole('listitem')).toHaveLength(2);
    expect(lists[1].querySelector('img')).toBeNull();
  });
});
