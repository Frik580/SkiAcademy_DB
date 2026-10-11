import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParticipantLessonFeedbackReadModel } from '@ski-academy/shared-domain';
import { translations, type TranslationKey } from '../../src/lib/i18n/translations';
import { StudentLatestRecommendationSection } from '../../src/features/student-cabinet/components/student/StudentHomeBottomSections';
import { usePresentedParticipantLessonFeedback } from '../../src/features/student-cabinet/usePresentedParticipantLessonFeedback';
import { useParticipantLessonFeedbackStore } from '../../src/features/participant-lesson-feedback/participantLessonFeedbackStore';
import {
  selectLatestFeedbackHighlight,
  toLessonFeedbackView,
} from '../../src/features/student-cabinet/studentLessonFeedbackPresentation';

let language: 'ru' | 'en' = 'en';
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language, t: (key: TranslationKey) => translations[language][key] }),
}));

const record = (
  overrides: Partial<ParticipantLessonFeedbackReadModel> = {}
): ParticipantLessonFeedbackReadModel => ({
  feedbackId: 'feedback_a' as never,
  participantId: 'a' as never,
  lessonBookingId: 'lesson_a' as never,
  instructorId: 'coach' as never,
  lessonDate: '2026-10-03',
  revision: 1,
  items: [{ itemId: 'one', text: 'Keep your torso steady', completed: false }],
  ...overrides,
});
const participant = (id: string) => ({
  participantId: id,
  displayName: `Student ${id}`,
  avatarUrl: `/${id}.png`,
});
function props(feedback = record()) {
  const highlight = selectLatestFeedbackHighlight(feedback);
  return {
    latest: toLessonFeedbackView(feedback, {
      lessonBookingId: feedback.lessonBookingId,
      instructorName: 'Coach A',
    }),
    highlightText: highlight?.item.text ?? null,
    highlightPending: highlight?.isPending ?? false,
    onOpenLesson: vi.fn(),
  };
}
function PresentedTile({
  onOpenLesson,
  scoped = true,
}: {
  onOpenLesson: (id: string) => void;
  scoped?: boolean;
}) {
  const feedback = usePresentedParticipantLessonFeedback([]);
  return (
    <StudentLatestRecommendationSection
      latest={feedback.latestView}
      highlightText={feedback.latestHighlight?.item.text ?? null}
      highlightPending={feedback.latestHighlight?.isPending ?? false}
      loading={feedback.isLoadingPlaceholder}
      scopeParticipant={
        scoped && feedback.participantId ? participant(feedback.participantId) : undefined
      }
      onOpenLesson={onOpenLesson}
    />
  );
}
beforeEach(() => {
  language = 'en';
  useParticipantLessonFeedbackStore.getState().clear();
});

describe('Latest Coach Recommendation presentation', () => {
  it.each(['ru', 'en'] as const)(
    'renders real text, localized date, metadata and exact ID via keyboard in %s',
    async (lang) => {
      language = lang;
      const input = props();
      render(<StudentLatestRecommendationSection {...input} />);
      expect(
        screen.getByRole('heading', { name: translations[lang].scLatestCoachRecommendation })
      ).toBeInTheDocument();
      expect(screen.getByText('Keep your torso steady')).toBeInTheDocument();
      expect(screen.getByText('Coach A')).toBeInTheDocument();
      expect(screen.getByText(lang === 'ru' ? '3 октября' : 'October 3')).toBeInTheDocument();
      expect(
        screen.getByLabelText(translations[lang].scPendingRecommendations)
      ).toBeInTheDocument();
      const user = userEvent.setup();
      await user.tab();
      expect(screen.getByRole('button', { name: translations[lang].scMoreDetails })).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(input.onOpenLesson).toHaveBeenCalledTimes(1);
      expect(input.onOpenLesson).toHaveBeenCalledWith('lesson_a');
    }
  );

  it.each([null, ''] as const)(
    'shows localized empty content with no action for highlight %s',
    (highlightText) => {
      render(<StudentLatestRecommendationSection {...props()} highlightText={highlightText} />);
      expect(screen.getByText(translations.en.scNoLatestRecommendation)).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    }
  );

  it('loading suppresses stale content and action, then transitions to empty', () => {
    const view = render(<StudentLatestRecommendationSection {...props()} loading />);
    expect(screen.getByRole('status')).toHaveTextContent(translations.en.loading);
    expect(screen.queryByText('Keep your torso steady')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(
      <StudentLatestRecommendationSection {...props()} latest={null} loading={false} />
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(translations.en.scNoLatestRecommendation)).toBeInTheDocument();
  });

  it('keeps completed text and details without a false pending indicator', () => {
    const input = props(
      record({ items: [{ itemId: 'done', text: 'Completed drill', completed: true }] })
    );
    render(<StudentLatestRecommendationSection {...input} />);
    expect(screen.getByText('Completed drill')).toBeInTheDocument();
    expect(screen.queryByLabelText(translations.en.scPendingRecommendations)).toBeNull();
    expect(screen.getByRole('button', { name: translations.en.scMoreDetails })).toBeInTheDocument();
  });

  it.each([
    { instructorName: undefined, lessonDate: '2026-10-03' },
    { instructorName: 'Coach A', lessonDate: undefined },
    { instructorName: undefined, lessonDate: undefined },
  ])('omits missing metadata without empty separators: %j', (metadata) => {
    const input = props();
    render(
      <StudentLatestRecommendationSection {...input} latest={{ ...input.latest, ...metadata }} />
    );
    expect(document.querySelector('.sc-latest-recommendation-name')?.textContent ?? '').toBe(
      metadata.instructorName ?? ''
    );
    expect(document.querySelector('.sc-latest-recommendation-date')?.textContent ?? '').toBe(
      metadata.lessonDate ? 'October 3' : ''
    );
    expect(document.querySelector('section')).not.toHaveTextContent('·');
  });

  it('preserves full long names, multiline text and selected participant identity', () => {
    const input = props();
    const instructorName = 'ОченьДлинноеИмяТренера'.repeat(8);
    const text = 'Длинная рекомендация без обрезания. '.repeat(40) + '\nСледующий абзац.';
    render(
      <StudentLatestRecommendationSection
        {...input}
        latest={{ ...input.latest, instructorName }}
        highlightText={text}
        scopeParticipant={participant('b')}
      />
    );
    expect(document.querySelector('blockquote')?.textContent).toBe(text);
    expect(screen.getByText(instructorName)).toBeInTheDocument();
    expect(document.querySelector('[data-participant-scope]')).toHaveAttribute(
      'data-participant-scope',
      'b'
    );
    expect(document.querySelector('[data-participant-scope] img')).toHaveAttribute('src', '/b.png');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('has no redundant badge when the parent supplies no scope participant', () => {
    render(<StudentLatestRecommendationSection {...props()} />);
    expect(document.querySelector('[data-participant-scope]')).toBeNull();
  });

  it('selects first incomplete in latest record, then last completed; older pending never wins', () => {
    const store = useParticipantLessonFeedbackStore.getState();
    const older = record({ lessonBookingId: 'older' as never, lessonDate: '2026-10-01' });
    const newest = record({
      items: [
        { itemId: 'done', text: 'First done', completed: true },
        { itemId: 'pending', text: 'First pending', completed: false },
        { itemId: 'last', text: 'Last pending', completed: false },
      ],
    });
    store.setPresentationParticipantId('a');
    store.replaceParticipantItems('a', [
      older,
      newest,
      record({ participantId: 'b' as never, lessonDate: '2026-10-10' }),
    ]);
    render(<PresentedTile onOpenLesson={vi.fn()} />);
    expect(screen.getByText('First pending')).toBeInTheDocument();
    expect(screen.queryByText('Last pending')).toBeNull();
    act(() =>
      store.replaceParticipantItems('a', [
        older,
        { ...newest, items: newest.items.map((item) => ({ ...item, completed: true })) },
      ])
    );
    expect(screen.getByText('Last pending')).toBeInTheDocument();
    expect(screen.queryByLabelText(translations.en.scPendingRecommendations)).toBeNull();
  });

  it('uses canonical startsAt ahead of conflicting date and booking-ID ordering', () => {
    const store = useParticipantLessonFeedbackStore.getState();
    store.setPresentationParticipantId('a');
    store.replaceParticipantItems('a', [
      record({
        lessonBookingId: 'zzz' as never,
        lessonDate: '2026-10-10',
        lessonStartsAt: { seconds: 1, nanoseconds: 0 },
        items: [{ itemId: 'old', text: 'Older canonical instant', completed: false }],
      }),
      record({
        lessonStartsAt: { seconds: 2, nanoseconds: 0 },
        items: [{ itemId: 'new', text: 'New canonical instant', completed: true }],
      }),
    ]);
    render(<PresentedTile onOpenLesson={vi.fn()} />);
    expect(screen.getByText('New canonical instant')).toBeInTheDocument();
    expect(screen.queryByText('Older canonical instant')).toBeNull();
  });

  it('A → B loading → B → A retains exact scope and ID navigation without Booking context', async () => {
    const store = useParticipantLessonFeedbackStore.getState();
    store.setPresentationParticipantId('a');
    store.replaceParticipantItems('a', [record()]);
    const open = vi.fn();
    render(<PresentedTile onOpenLesson={open} />);
    act(() => {
      store.setPresentationParticipantId('b');
      store.beginLoad('b');
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Keep your torso steady')).toBeNull();
    act(() =>
      store.replaceParticipantItems('b', [
        record({
          participantId: 'b' as never,
          lessonBookingId: 'lesson_b' as never,
          items: [{ itemId: 'b', text: 'Only B drill', completed: true }],
        }),
      ])
    );
    expect(screen.getByText('Only B drill')).toBeInTheDocument();
    expect(document.querySelector('[data-participant-scope]')).toHaveTextContent('Student b');
    await userEvent.click(screen.getByRole('button', { name: translations.en.scMoreDetails }));
    expect(open).toHaveBeenLastCalledWith('lesson_b');
    act(() => store.setPresentationParticipantId('a'));
    expect(screen.getByText('Keep your torso steady')).toBeInTheDocument();
    expect(screen.queryByText('Only B drill')).toBeNull();
    expect(document.querySelector('[data-participant-scope]')).toHaveTextContent('Student a');
  });

  it('rejects a stale bucket belonging to A while B is the presentation participant', () => {
    const store = useParticipantLessonFeedbackStore.getState();
    store.replaceParticipantItems('a', [record()]);
    store.setPresentationParticipantId('b');
    useParticipantLessonFeedbackStore.setState((state) => ({
      byParticipantId: { ...state.byParticipantId, b: state.byParticipantId.a },
    }));
    render(<PresentedTile onOpenLesson={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(translations.en.loading);
    expect(screen.queryByText('Keep your torso steady')).toBeNull();
    expect(document.querySelector('[data-participant-scope]')).toHaveTextContent('Student b');
  });

  it('characterizes the existing error contract: empty placeholder, no successful content or action', () => {
    const store = useParticipantLessonFeedbackStore.getState();
    store.setPresentationParticipantId('a');
    const generation = store.beginLoad('a');
    store.applyLoadError('a', generation, 'Confirmed query failure');
    render(<PresentedTile onOpenLesson={vi.fn()} />);
    expect(useParticipantLessonFeedbackStore.getState().byParticipantId.a.loadState).toBe('error');
    expect(screen.getByText(translations.en.scNoLatestRecommendation)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
