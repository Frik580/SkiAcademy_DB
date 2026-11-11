import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Booking, Instructor, UserProfile } from '../../src/types';
import { translations } from '../../src/lib/i18n/translations';
import { StudentCoachPanel } from '../../src/features/student-cabinet/components/student/StudentCoachPanel';
import { StudentHomeworkDashboardSection } from '../../src/features/student-cabinet/components/student/StudentHomeworkDashboardSection';
import { getStudentHomeworkSources } from '../../src/features/student-cabinet/components/student/studentHomeworkSources';
import type { CabinetSessionItem } from '../../src/features/course-enrollments';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';

const fixture = vi.hoisted(() => ({
  language: 'en' as 'en' | 'ru',
  history: {
    messages: [] as unknown[],
    loading: false,
    error: false,
    hasMore: true,
    loadMore: vi.fn(),
  },
  chat: vi.fn((_ids: string[]) => ({ messages: [], loading: false })),
  dashboardHistory: {
    items: [] as unknown[],
    loading: false,
    error: false,
    hasMore: false,
    signedIn: true,
    loadMore: vi.fn(),
  },
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    language: fixture.language,
    t: (key: keyof typeof translations.en) => translations[fixture.language][key],
  }),
  translateInstructor: (instructor: Instructor) => instructor,
}));
vi.mock(
  '../../src/features/instructor-workspace/useLessonHomeworkHistory',
  () => ({ useLessonHomeworkHistory: () => fixture.dashboardHistory })
);
vi.mock(
  '../../src/features/student-cabinet/components/student/useInstructorHomeworkHistory',
  () => ({ useInstructorHomeworkHistory: () => fixture.history })
);
vi.mock(
  '../../src/features/student-cabinet/components/student/useInstructorBookingMessages',
  () => ({ useInstructorBookingMessages: (ids: string[]) => fixture.chat(ids) })
);
vi.mock('../../src/features/student-cabinet/useSelectedParticipantLessonStats', () => ({
  useSelectedParticipantLessonStats: () => ({ evidence: [] }),
  instructorLessonCountFromEvidence: () => 0,
  latestAttendedLessonForInstructor: () => null,
}));
vi.mock('../../src/features/student-cabinet/usePresentedParticipantLessonFeedback', () => ({
  usePresentedParticipantLessonFeedback: () => ({ instructorFeedback: () => [] }),
}));
vi.mock('../../src/features/profile', () => ({ InstructorCard: () => null }));
vi.mock('../../src/features/booking-collaboration', () => ({
  CoachParticipantAccessPanel: () => null,
}));

function show() {
  return render(
    <StudentCoachPanel
      navigation={{ view: 'homework', selectedInstructorId: 'coach' }}
      bookings={[
        { id: 'lesson', userId: 'account', instructorId: 'coach', status: 'completed' } as Booking,
      ]}
      courses={[]}
      instructors={[{ id: 'coach', name: 'Coach' } as Instructor]}
      userProfile={{ uid: 'account' } as UserProfile}
      selectedParticipantId="child"
      onGoToTab={vi.fn()}
      onChat={vi.fn()}
      onOpenLesson={vi.fn()}
      onBookInstructor={vi.fn()}
      onViewInstructorReviews={vi.fn()}
    />
  );
}
afterEach(() => {
  cleanup();
  fixture.history.messages = [];
  fixture.history.loading = false;
  fixture.history.error = false;
  fixture.history.hasMore = true;
  fixture.history.loadMore.mockClear();
  fixture.dashboardHistory.items = [];
  fixture.dashboardHistory.hasMore = false;
  fixture.dashboardHistory.loading = false;
  fixture.dashboardHistory.error = false;
  fixture.dashboardHistory.signedIn = true;
  fixture.dashboardHistory.loadMore.mockClear();
});

describe('student homework history UI', () => {
  it.each(['ru', 'en'] as const)(
    'uses localized pagination and a truthful intermediate empty state (%s)',
    (language) => {
      fixture.language = language;
      show();
      expect(screen.queryByText(translations[language].scCoachNoHomework)).toBeNull();
      expect(screen.getByText(translations[language].scCoachHomeworkContinue)).toBeTruthy();
      fireEvent.click(
        screen.getByRole('button', { name: translations[language].scCoachEarlierHomework })
      );
      expect(fixture.history.loadMore).toHaveBeenCalledTimes(1);
      expect(fixture.chat).toHaveBeenLastCalledWith([]);
    }
  );
  it('shows the final empty state and hides the button at end of history', () => {
    fixture.history.hasMore = false;
    show();
    expect(screen.getByText(translations[fixture.language].scCoachNoHomework)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: translations[fixture.language].scCoachEarlierHomework })
    ).toBeNull();
  });
  it('shows loading and disables further requests', () => {
    fixture.history.loading = true;
    show();
    const buttons = screen.getAllByRole('button');
    expect(buttons.some((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(screen.queryByText(translations[fixture.language].scCoachNoHomework)).toBeNull();
  });
  it('shows a safe error with retry', () => {
    fixture.history.error = true;
    show();
    expect(screen.getByRole('alert').textContent).toContain(
      translations[fixture.language].requestFailed
    );
    fireEvent.click(screen.getByRole('button', { name: translations[fixture.language].retry }));
    expect(fixture.history.loadMore).toHaveBeenCalledOnce();
  });
  it('preserves text, attachments, timestamps and newest-first order', () => {
    fixture.history.hasMore = false;
    fixture.history.messages = [
      {
        id: 'new',
        threadId: 'lesson',
        bookingId: 'lesson',
        senderInstructorId: 'coach',
        senderName: 'Coach',
        timestamp: '2026-01-02T00:00:00.000Z',
        text: 'New homework',
        isHomework: true,
        attachmentType: 'link',
        attachmentUrl: 'https://example.com/material',
        attachmentName: 'Material',
      },
      {
        id: 'old',
        threadId: 'lesson',
        bookingId: 'lesson',
        senderInstructorId: 'coach',
        senderName: 'Coach',
        timestamp: '2026-01-01T00:00:00.000Z',
        text: 'Old homework',
        isHomework: true,
      },
    ];
    show();
    expect(screen.getByRole('link', { name: 'Material' }).getAttribute('href')).toBe(
      'https://example.com/material'
    );
    expect(
      screen.getByText('New homework').compareDocumentPosition(screen.getByText('Old homework')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe('student homework dashboard tile', () => {
  const item = (id: number) => ({
    id: String(id),
    threadId: 'lesson',
    bookingId: 'lesson',
    senderId: 'coach-user',
    senderName: 'Coach',
    senderAvatar: '',
    text: `Assignment ${id}`,
    timestamp: `2026-11-07T${String(id).padStart(2, '0')}:00:00.000Z`,
    isHomework: true,
  });
  const source = [{ threadId: 'lesson', participantIds: ['child'], label: 'Training' }];
  const tile = (participantId = 'child') => (
    <StudentHomeworkDashboardSection
      key={participantId}
      accountId="account"
      participantId={participantId}
      sources={participantId === 'child' ? source : []}
    />
  );

  it('does not expose paging controls when empty or up to five assignments', () => {
    const view = render(tile());
    expect(screen.getByText(translations.en.scCoachNoHomework)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    fixture.dashboardHistory.items = Array.from({ length: 5 }, (_, i) => item(i));
    view.rerender(tile());
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByText(/^Page \\d+$/)).toBeNull();
  });

  it('navigates five at a time without page labels and preserves sender and source', () => {
    fixture.dashboardHistory.items = Array.from({ length: 11 }, (_, i) => item(10 - i));
    render(tile());
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('Assignment 10')).toBeVisible();
    expect(screen.getAllByText('Training')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Assignment 5')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Assignment 0')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Assignment 5')).toBeVisible();
    expect(screen.queryByText(/^Page \\d+$/)).toBeNull();
  });

  it('shows the source label but not a second sender name below homework text', () => {
    fixture.dashboardHistory.items = [{ ...item(1), senderName: 'Coach' }];
    render(tile());
    expect(screen.getByText('Training')).toBeVisible();
    expect(screen.getByText('Assignment 1')).toBeVisible();
    expect(screen.queryByText('Coach')).toBeNull();
  });

  it('resets pagination when switching participants and does not leak old assignments', () => {
    fixture.dashboardHistory.items = Array.from({ length: 11 }, (_, i) => item(10 - i));
    const view = render(tile());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fixture.dashboardHistory.items = [];
    view.rerender(tile('other-child'));
    expect(screen.queryByText('Assignment 5')).toBeNull();
    expect(screen.getByText(translations.en.scCoachNoHomework)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('renders safe links and preserves homework text with an attachment', () => {
    fixture.dashboardHistory.items = [
      { ...item(1), attachmentType: 'link', attachmentUrl: 'https://example.com/homework', attachmentName: 'Worksheet' },
      { ...item(0), attachmentType: 'link', attachmentUrl: 'javascript:alert(1)' },
    ];
    render(tile());
    expect(screen.getByRole('link', { name: 'Worksheet' }).getAttribute('href')).toBe(
      'https://example.com/homework'
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('uses only canonical membership to discover lesson and course sources', () => {
    const sessions = [
      { kind: 'lesson', session: { id: 'lesson', instructorName: 'Coach', participantIds: ['child'], status: 'completed' } },
      { kind: 'lesson', session: { id: 'foreign', instructorName: 'Coach', participantIds: ['other'], status: 'completed' } },
      { kind: 'course_day', courseId: 'course', enrollmentId: 'enrollment', courseTitle: 'Carving', participantId: 'child', lifecycleStatus: 'active' },
      { kind: 'course_day', courseId: 'course', enrollmentId: 'enrollment', courseTitle: 'Carving', participantId: 'child', lifecycleStatus: 'active' },
    ] as unknown as CabinetSessionItem[];
    expect(getStudentHomeworkSources(sessions, 'child').map((source) => source.threadId)).toEqual([
      'lesson', 'course', 'enrollment',
    ]);
    expect(getStudentHomeworkSources(sessions, 'other').map((source) => source.threadId)).toEqual(['foreign']);
    expect(getStudentHomeworkSources(sessions, undefined)).toEqual([]);
  });

  it('discovers completed homework from canonical account history even without upcoming sessions', () => {
    const history = [
      {
        id: 'completed-alice',
        bookingId: 'completed-alice',
        status: 'completed',
        instructorId: 'coach',
        instructorName: 'Coach',
        participantIds: ['child'],
      },
      {
        id: 'completed-family',
        bookingId: 'completed-family',
        status: 'completed',
        instructorId: 'coach',
        instructorName: 'Coach',
        participantIds: ['child', 'sibling'],
      },
      {
        id: 'other-child',
        bookingId: 'other-child',
        status: 'completed',
        instructorId: 'coach',
        instructorName: 'Coach',
        participantIds: ['sibling'],
      },
      {
        id: 'cancelled-child',
        bookingId: 'cancelled-child',
        status: 'cancelled',
        instructorId: 'coach',
        instructorName: 'Coach',
        participantIds: ['child'],
      },
    ] as LessonBookingCabinetItem[];
    const upcoming = [
      { kind: 'lesson', session: history[1] },
    ] as CabinetSessionItem[];
    const sourceIds = getStudentHomeworkSources(upcoming, 'child', history).map(
      (source) => source.threadId
    );
    expect(sourceIds).toEqual(['completed-family', 'completed-alice']);
    expect(getStudentHomeworkSources([], 'child', history).map((source) => source.threadId)).toEqual([
      'completed-alice',
      'completed-family',
    ]);
    expect(getStudentHomeworkSources([], 'sibling', history).map((source) => source.threadId)).toEqual([
      'completed-family',
      'other-child',
    ]);
    expect(getStudentHomeworkSources([], undefined, history)).toEqual([]);
  });
});
