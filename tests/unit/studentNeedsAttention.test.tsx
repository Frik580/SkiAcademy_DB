import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParticipantLessonFeedbackReadModel } from '@ski-academy/shared-domain';
import type { Booking, Review } from '../../src/types';
import { translations, type TranslationKey } from '../../src/lib/i18n/translations';
import { StudentNeedsAttention } from '../../src/features/student-cabinet/components/student/StudentNeedsAttention';
import { usePresentedParticipantLessonFeedback } from '../../src/features/student-cabinet/usePresentedParticipantLessonFeedback';
import { useParticipantLessonFeedbackStore } from '../../src/features/participant-lesson-feedback/participantLessonFeedbackStore';

let language: 'ru' | 'en' = 'en';
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language, t: (key: TranslationKey) => translations[language][key] }),
}));

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'lesson-a',
  userId: 'account',
  instructorId: 'coach',
  instructorName: 'Александр Константинович Мухамеджанов',
  instructorAvatar: '',
  date: '2026-10-03',
  time: '10:00',
  durationHours: 1,
  totalPrice: 10000,
  status: 'completed',
  difficulty: 'intermediate',
  ...overrides,
});
const feedback = (
  participantId: string,
  lessonBookingId: string,
  completed = false
): ParticipantLessonFeedbackReadModel => ({
  feedbackId: `feedback_${participantId}_${lessonBookingId}` as never,
  participantId: participantId as never,
  lessonBookingId: lessonBookingId as never,
  instructorId: 'coach' as never,
  lessonDate: '2026-10-03',
  revision: 1,
  items: [{ itemId: 'item', text: `Practice ${participantId}`, completed }],
});
const actions = () => ({
  onOpenLesson: vi.fn(),
  onOpenFeedbackLesson: vi.fn(),
  onWriteReview: vi.fn(),
  onDismissReview: vi.fn(),
});
const base = () => ({
  bookings: [booking()],
  reviews: [] as Review[],
  userId: 'account',
  pendingFeedback: [],
  ...actions(),
});
const row = (id: string) =>
  document.querySelector(`[data-attention-lesson="${id}"]`) as HTMLElement;

// Exercise the real upstream projection/store, including loading and exact scope filtering.
function PresentedTile(props: ReturnType<typeof base>) {
  const presented = usePresentedParticipantLessonFeedback(props.bookings);
  const pendingFeedback = presented.incomplete
    .map((item) => presented.feedbackForLesson(item.lessonBookingId)!)
    .filter(Boolean);
  return <StudentNeedsAttention {...props} pendingFeedback={pendingFeedback} />;
}

beforeEach(() => {
  language = 'en';
  useParticipantLessonFeedbackStore.getState().clear();
});
afterEach(() => useParticipantLessonFeedbackStore.getState().clear());

describe('Needs Attention presentation preserves existing actions', () => {
  it('opens the exact review booking and dismisses its ID using keyboard-accessible buttons', async () => {
    const props = base();
    const user = userEvent.setup();
    render(<StudentNeedsAttention {...props} dashboardSize="medium" />);
    expect(screen.getByRole('heading', { name: 'Needs attention', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(row('lesson-a')).toHaveTextContent(props.bookings[0].instructorName);
    expect(row('lesson-a')).toHaveTextContent('2026-10-03');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Write Review' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(props.onWriteReview).toHaveBeenCalledWith(props.bookings[0]);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveFocus();
    await user.keyboard(' ');
    expect(props.onDismissReview).toHaveBeenCalledWith('lesson-a');
    expect(props.onOpenLesson).not.toHaveBeenCalled();
  });

  it.each(['confirmed', 'pending', 'cancelled', 'no_show', 'pending_cancellation'] as const)(
    'hides %s bookings',
    (status) => {
      const { container } = render(
        <StudentNeedsAttention {...base()} bookings={[booking({ status })]} />
      );
      expect(container).toBeEmptyDOMElement();
    }
  );

  it.each([{ isDeleted: true }, { userId: 'other-account' }])(
    'excludes deleted/unrelated bookings: %j',
    (override) => {
      const { container } = render(
        <StudentNeedsAttention {...base()} bookings={[booking(override)]} />
      );
      expect(container).toBeEmptyDOMElement();
    }
  );

  it.each(['dismissed', 'reviewed'])(
    'hides a %s review but retains its pending recommendations',
    async (state) => {
      const props = base();
      const store = useParticipantLessonFeedbackStore.getState();
      store.setPresentationParticipantId('a');
      store.replaceParticipantItems('a', [feedback('a', 'lesson-a')]);
      if (state === 'dismissed') Object.assign(props, { dismissedReviewIds: ['lesson-a'] });
      else
        props.reviews = [
          {
            id: 'review',
            bookingId: 'lesson-a',
            userId: 'account',
            instructorId: 'coach',
            rating: 5,
            comment: '',
            date: '2026-10-04',
          },
        ];
      render(<PresentedTile {...props} />);
      expect(screen.queryByRole('button', { name: 'Write Review' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Open recommendations' }));
      expect(props.onOpenLesson).toHaveBeenCalledWith(props.bookings[0]);
    }
  );

  it('does not offer dismissal without its callback and hides an empty tile', () => {
    const { rerender, container } = render(
      <StudentNeedsAttention {...base()} onDismissReview={undefined} />
    );
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    rerender(<StudentNeedsAttention {...base()} bookings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('merges review + feedback once, retains both actions and excludes completed feedback', async () => {
    const props = base();
    const store = useParticipantLessonFeedbackStore.getState();
    store.setPresentationParticipantId('a');
    store.replaceParticipantItems('a', [
      feedback('a', 'lesson-a'),
      feedback('a', 'completed', true),
    ]);
    render(<PresentedTile {...props} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByLabelText(translations.en.scPendingRecommendations)).toBeInTheDocument();
    expect(within(row('lesson-a')).getAllByRole('button')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Open recommendations' }));
    expect(props.onOpenLesson).toHaveBeenCalledWith(props.bookings[0]);
    expect(props.onOpenFeedbackLesson).not.toHaveBeenCalled();
  });

  it('opens canonical feedback by lesson ID without a Booking or missing metadata', async () => {
    const props = base();
    props.bookings = [];
    const store = useParticipantLessonFeedbackStore.getState();
    store.setPresentationParticipantId('a');
    store.replaceParticipantItems('a', [
      { ...feedback('a', 'canonical-only'), lessonDate: undefined },
    ]);
    render(<PresentedTile {...props} />);
    expect(row('canonical-only')).not.toHaveTextContent('undefined');
    await userEvent.click(screen.getByRole('button', { name: 'Open recommendations' }));
    expect(props.onOpenFeedbackLesson).toHaveBeenCalledWith('canonical-only');
    expect(props.onOpenLesson).not.toHaveBeenCalled();
  });

  it('preserves established sorting, identity and the five-row bound for multiple lessons', () => {
    const props = base();
    props.bookings = Array.from({ length: 7 }, (_, i) =>
      booking({ id: `lesson-${i}`, date: `2026-10-0${i + 1}` })
    );
    const store = useParticipantLessonFeedbackStore.getState();
    store.setPresentationParticipantId('a');
    store.replaceParticipantItems('a', [feedback('a', 'lesson-6'), feedback('a', 'lesson-5')]);
    render(<PresentedTile {...props} />);
    expect(
      screen.getAllByRole('listitem').map((el) => el.getAttribute('data-attention-lesson'))
    ).toEqual(['lesson-6', 'lesson-5', 'lesson-4', 'lesson-3', 'lesson-2']);
    expect(screen.getAllByRole('button', { name: 'Open recommendations' })).toHaveLength(2);
  });

  it('keeps account reviews through A → B loading → B → A without stale feedback or duplicates', () => {
    const props = base();
    const store = useParticipantLessonFeedbackStore.getState();
    store.setPresentationParticipantId('a');
    store.replaceParticipantItems('a', [feedback('a', 'a-only'), feedback('b', 'foreign')]);
    render(<PresentedTile {...props} />);
    expect(row('a-only')).toBeInTheDocument();
    expect(row('foreign')).toBeNull();
    act(() => {
      store.setPresentationParticipantId('b');
      store.beginLoad('b');
    });
    expect(row('a-only')).toBeNull();
    expect(row('lesson-a')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open recommendations' })).not.toBeInTheDocument();
    act(() => store.replaceParticipantItems('b', [feedback('b', 'b-only')]));
    expect(row('b-only')).toBeInTheDocument();
    expect(row('a-only')).toBeNull();
    act(() => store.setPresentationParticipantId('a'));
    expect(row('a-only')).toBeInTheDocument();
    expect(row('b-only')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Write Review' })).toHaveLength(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it.each(['en', 'ru'] as const)('uses real %s translations for every supported action', (lang) => {
    language = lang;
    const props = base();
    const store = useParticipantLessonFeedbackStore.getState();
    store.setPresentationParticipantId('a');
    store.replaceParticipantItems('a', [feedback('a', 'lesson-a')]);
    render(<PresentedTile {...props} />);
    for (const key of [
      'writeReviewBtn',
      'scDismissReviewPrompt',
      'scHistoryOpenRecommendations',
    ] as const)
      expect(screen.getByRole('button', { name: translations[lang][key] })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: translations[lang].scNeedsAttention })
    ).toBeInTheDocument();
  });
});
