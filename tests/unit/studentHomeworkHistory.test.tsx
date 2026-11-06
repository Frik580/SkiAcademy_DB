import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Booking, Instructor, UserProfile } from '../../src/types';
import { translations } from '../../src/lib/i18n/translations';
import { StudentCoachPanel } from '../../src/features/student-cabinet/components/student/StudentCoachPanel';

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
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    language: fixture.language,
    t: (key: keyof typeof translations.en) => translations[fixture.language][key],
  }),
  translateInstructor: (instructor: Instructor) => instructor,
}));
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
