import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ParticipantLessonFeedbackReadModel } from '@ski-academy/shared-domain';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { translations } from '../../src/lib/i18n/translations';
import { StudentLatestRecommendationSection } from '../../src/features/student-cabinet/components/student/StudentHomeBottomSections';
import { StudentCoachPanel } from '../../src/features/student-cabinet/components/student/StudentCoachPanel';
import { LessonDetailsModal } from '../../src/features/student-cabinet/components/LessonDetailsModal';
import { resolveLessonDetailsBookingForModal } from '../../src/features/student-cabinet/resolveLessonDetailsBooking';
import { useParticipantLessonFeedbackStore } from '../../src/features/participant-lesson-feedback/participantLessonFeedbackStore';
import type { LessonFeedbackView } from '../../src/features/student-cabinet/studentLessonFeedbackPresentation';

const t = (key: keyof (typeof translations)['en']) => translations.en[key];

const PARTICIPANT = 'participant_self_01';
const LESSON_A = 'booking_feedback_a';
const LESSON_B = 'booking_feedback_b';
const ACCOUNT = 'account_cabinet_01';

function feedback(input: {
  participantId: string;
  lessonBookingId: string;
  text: string;
  instructorId?: string;
  lessonDate?: string;
}): ParticipantLessonFeedbackReadModel {
  return {
    feedbackId: `feedback_${input.lessonBookingId}`,
    participantId: input.participantId as never,
    lessonBookingId: input.lessonBookingId as never,
    instructorId: (input.instructorId ?? 'instructor_01') as never,
    items: [{ itemId: 'item_1', text: input.text, completed: false }],
    revision: 1,
    lessonDate: input.lessonDate ?? '2026-09-01',
  };
}

const presentedFeedbackMock = vi.fn();

vi.mock('../../src/features/student-cabinet/usePresentedParticipantLessonFeedback', () => ({
  usePresentedParticipantLessonFeedback: () => presentedFeedbackMock(),
  lessonFeedbackContextFromBookings: () => new Map(),
}));

vi.mock('../../src/features/student-cabinet/useSelectedParticipantLessonStats', () => ({
  useSelectedParticipantLessonStats: () => ({ evidence: [] }),
  instructorLessonCountFromEvidence: () => 0,
  latestAttendedLessonForInstructor: () => null,
}));

vi.mock('../../src/features/student-cabinet/components/student/useInstructorBookingMessages', () => ({
  useInstructorBookingMessages: () => ({ messages: [], loading: false }),
}));

vi.mock('../../src/features/profile', () => ({
  InstructorCard: () => null,
}));

vi.mock('../../src/features/booking-collaboration', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/features/booking-collaboration')>();
  return {
    ...actual,
    CoachParticipantAccessPanel: () => null,
  };
});

describe('canonical participant lesson feedback detail wiring', () => {
  beforeEach(() => {
    presentedFeedbackMock.mockReset();
    useParticipantLessonFeedbackStore.getState().clear();
  });

  it('lesson details modal hides difficulty row when fallback booking has no canonical difficulty', () => {
    const store = useParticipantLessonFeedbackStore.getState();
    store.setPresentationParticipantId(PARTICIPANT);
    store.replaceParticipantItems(PARTICIPANT, [
      feedback({
        participantId: PARTICIPANT,
        lessonBookingId: LESSON_A,
        text: 'Edge control',
        lessonDate: '2026-09-10',
      }),
    ]);

    const booking = resolveLessonDetailsBookingForModal({
      lessonBookingId: LESSON_A,
      accountUserId: ACCOUNT,
      cabinetBookings: [],
      instructors: [{ id: 'instructor_01', name: 'Coach One', avatar: '', isAvailable: true } as never],
    });
    expect(booking).not.toBeNull();

    presentedFeedbackMock.mockReturnValue({
      participantId: PARTICIPANT,
      isLoadingPlaceholder: false,
      feedbackForLesson: (lessonBookingId: string) =>
        lessonBookingId === LESSON_A
          ? {
              items: [{ itemId: 'item_1', text: 'Edge control', completed: false }],
            }
          : undefined,
    });

    render(
      <LanguageProvider>
        <LessonDetailsModal booking={booking} courses={[]} onClose={vi.fn()} />
      </LanguageProvider>
    );

    expect(screen.queryByText(t('difficultyUnspecified'))).toBeNull();
    expect(screen.getByText('Coach One')).toBeInTheDocument();
    expect(screen.getByText('Edge control')).toBeInTheDocument();
  });

  it('resolves lesson details booking from presented canonical feedback when cabinet list is empty', () => {
    const store = useParticipantLessonFeedbackStore.getState();
    store.setPresentationParticipantId(PARTICIPANT);
    store.replaceParticipantItems(PARTICIPANT, [
      feedback({
        participantId: PARTICIPANT,
        lessonBookingId: LESSON_A,
        text: 'Edge control',
        lessonDate: '2026-09-10',
      }),
    ]);

    const resolved = resolveLessonDetailsBookingForModal({
      lessonBookingId: LESSON_A,
      accountUserId: ACCOUNT,
      cabinetBookings: [],
      instructors: [{ id: 'instructor_01', name: 'Coach One', avatar: '', isAvailable: true } as never],
    });

    expect(resolved?.id).toBe(LESSON_A);
    expect(resolved?.instructorName).toBe('Coach One');
    expect(resolved?.date).toBe('2026-09-10');
  });

  it('does not resolve sibling participant feedback for the same lesson id', () => {
    const store = useParticipantLessonFeedbackStore.getState();
    store.setPresentationParticipantId('participant_child_b');
    store.replaceParticipantItems('participant_child_a', [
      feedback({
        participantId: 'participant_child_a',
        lessonBookingId: LESSON_A,
        text: 'A only',
      }),
    ]);
    store.replaceParticipantItems('participant_child_b', [
      feedback({
        participantId: 'participant_child_b',
        lessonBookingId: LESSON_B,
        text: 'B only',
      }),
    ]);

    expect(
      resolveLessonDetailsBookingForModal({
        lessonBookingId: LESSON_A,
        accountUserId: ACCOUNT,
        cabinetBookings: [],
      })
    ).toBeNull();
  });

  it('home latest recommendation opens detail by lessonBookingId', () => {
    const onOpenLesson = vi.fn();
    const latest: LessonFeedbackView = {
      participantId: PARTICIPANT as never,
      lessonBookingId: LESSON_A as never,
      items: [{ itemId: 'item_1', text: 'Pole plant', completed: false }],
      revision: 1,
      lessonDate: '2026-09-10',
      instructorId: 'instructor_01',
      instructorName: 'Coach One',
      hasPending: true,
    };

    render(
      <LanguageProvider>
        <StudentLatestRecommendationSection
          latest={latest}
          highlightPending={true}
          highlightText="Pole plant"
          onOpenLesson={onOpenLesson}
        />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: t('scMoreDetails') }));
    expect(onOpenLesson).toHaveBeenCalledWith(LESSON_A);
  });

  it('coach recommendations open detail by lessonBookingId', () => {
    const onOpenLessonByBookingId = vi.fn();
    presentedFeedbackMock.mockReturnValue({
      participantId: PARTICIPANT,
      isLoadingPlaceholder: false,
      instructorFeedback: (instructorId: string) =>
        instructorId === 'instructor_01'
          ? [
              {
                lessonBookingId: LESSON_A,
                lessonDate: '2026-09-10',
                instructorName: 'Coach One',
                items: [{ itemId: 'item_1', text: 'Short turns', completed: false }],
              },
            ]
          : [],
      formatDate: () => '10 Sep',
    });

    render(
      <LanguageProvider>
        <StudentCoachPanel
          bookings={[
            {
              id: 'booking_old',
              userId: ACCOUNT,
              instructorId: 'instructor_01',
              instructorName: 'Coach One',
              instructorAvatar: '',
              date: '2026-09-01',
              time: '10:00',
              durationHours: 1,
              totalPrice: 0,
              status: 'completed',
            },
          ]}
          courses={[]}
          instructors={[
            {
              id: 'instructor_01',
              name: 'Coach One',
              bio: '',
              avatar: '',
              isAvailable: true,
              reviewsCount: 0,
            } as never,
          ]}
          userProfile={{ uid: ACCOUNT, displayName: 'Self', role: 'user' } as never}
          onGoToTab={vi.fn()}
          onChat={vi.fn()}
          onOpenLesson={vi.fn()}
          onOpenLessonByBookingId={onOpenLessonByBookingId}
          onBookInstructor={vi.fn()}
          selectedParticipantId={PARTICIPANT}
        />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('scRecommendations')) }));
    fireEvent.click(screen.getByRole('button', { name: t('scMoreDetails') }));

    expect(onOpenLessonByBookingId).toHaveBeenCalledWith(LESSON_A);
  });
});
