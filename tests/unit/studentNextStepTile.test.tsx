import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ParticipantLessonFeedbackReadModel } from '@ski-academy/shared-domain';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { StudentNextStepCard } from '../../src/features/student-cabinet/components/student/StudentNextStepCard';
import { StudentCabinetHome } from '../../src/features/student-cabinet/components/student/StudentCabinetHome';
import type { StudentCabinetHomeContext } from '../../src/features/student-cabinet/components/student/studentCabinetContracts';
import { useParticipantLessonFeedbackStore } from '../../src/features/participant-lesson-feedback/participantLessonFeedbackStore';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import { getNextStepAction } from '../../src/features/student-cabinet/components/student/studentSkillProgress';

vi.mock('../../src/features/journey', () => ({ YourJourneySection: () => null }));
vi.mock('../../src/features/student-cabinet/components/student/LazySkillRadarChart', () => ({
  LazySkillRadarChart: () => null,
}));
vi.mock(
  '../../src/features/student-cabinet/components/student/useStudentTodayAchievements',
  () => ({
    useStudentTodayAchievements: () => [],
    hasStudentTodayProgress: () => false,
  })
);

beforeEach(() => {
  localStorage.setItem('alpine_glide_lang', 'en');
  useParticipantLessonFeedbackStore.getState().clear();
});
afterEach(cleanup);

const exercise = {
  kind: 'exercise' as const,
  exerciseId: 'l1_1',
  exerciseTitle: 'Real exercise title',
  pointsGain: 6,
  levelProgressDelta: 4,
  targetLevel: 2,
  pinned: false,
};
const callbacks = () => ({
  onStartExercise: vi.fn(),
  onOpenRecommendation: vi.fn(),
  onContinueDevelopment: vi.fn(),
});

it('renders real exercise context, labelled estimate and keyboard development navigation', async () => {
  const p = callbacks();
  const user = userEvent.setup();
  render(
    <LanguageProvider>
      <StudentNextStepCard action={exercise} contextLabel="Balance" {...p} />
    </LanguageProvider>
  );
  expect(screen.getByRole('heading')).toHaveTextContent(exercise.exerciseTitle);
  expect(screen.getByText(/Potential gain/)).toHaveTextContent('+4%');
  expect(screen.getByText('Balance')).toBeVisible();
  expect(screen.getByText(/Potential gain/)).toHaveTextContent('+6 XP');
  expect(screen.queryByText(/video|15 min/i)).not.toBeInTheDocument();
  screen.getByRole('button', { name: 'Add to tasks' }).focus();
  await user.keyboard('{Enter}');
  expect(p.onStartExercise).toHaveBeenCalledTimes(1);
  expect(p.onStartExercise).toHaveBeenCalledWith('l1_1');
  await user.tab();
  await user.keyboard('{Enter}');
  expect(p.onContinueDevelopment).toHaveBeenCalledOnce();
});

it('locks duplicate pins during persistence even when optimistic state advances to a new exercise', async () => {
  let finish!: () => void;
  const pin = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const p = callbacks();
  const view = render(
    <LanguageProvider>
      <StudentNextStepCard action={exercise} {...p} onStartExercise={pin} />
    </LanguageProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add to tasks' }));
  view.rerender(
    <LanguageProvider>
      <StudentNextStepCard
        action={{ ...exercise, exerciseId: 'l1_2' }}
        {...p}
        onStartExercise={pin}
      />
    </LanguageProvider>
  );
  const saving = screen.getByRole('button', { name: 'Saving...' });
  expect(saving).toBeDisabled();
  fireEvent.click(saving);
  expect(pin).toHaveBeenCalledTimes(1);
  expect(pin).toHaveBeenCalledWith('l1_1');
  await act(async () => finish());
  expect(screen.getByRole('button', { name: 'Add to tasks' })).toBeEnabled();
});

it('shows failed pin feedback and allows retry; already pinned exercises cannot be pinned again', async () => {
  const p = callbacks();
  p.onStartExercise.mockRejectedValueOnce(new Error('write failed')).mockResolvedValue(undefined);
  const view = render(
    <LanguageProvider>
      <StudentNextStepCard action={exercise} {...p} />
    </LanguageProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Add to tasks' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Add to tasks' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  view.rerender(
    <LanguageProvider>
      <StudentNextStepCard action={{ ...exercise, pinned: true }} {...p} />
    </LanguageProvider>
  );
  const added = screen.getByRole('button', { name: 'Added to tasks' });
  expect(added).toBeDisabled();
  fireEvent.click(added);
  expect(p.onStartExercise).toHaveBeenCalledTimes(2);
});

it('preserves recommendation details and omits unavailable pin/details controls', async () => {
  const p = callbacks();
  const action = {
    kind: 'recommendation' as const,
    label: 'Actual coach advice',
    bookingId: 'lesson-a',
  };
  const view = render(
    <LanguageProvider>
      <StudentNextStepCard action={action} {...p} />
    </LanguageProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Open lesson' }));
  expect(p.onOpenRecommendation).toHaveBeenCalledTimes(1);
  expect(p.onOpenRecommendation).toHaveBeenCalledWith('lesson-a');
  expect(screen.queryByRole('button', { name: 'Add to tasks' })).not.toBeInTheDocument();
  view.rerender(
    <LanguageProvider>
      <StudentNextStepCard action={action} {...p} recommendationAvailable={false} />
    </LanguageProvider>
  );
  expect(screen.queryByRole('button', { name: 'Open lesson' })).not.toBeInTheDocument();
  view.rerender(
    <LanguageProvider>
      <StudentNextStepCard action={exercise} {...p} onStartExercise={undefined} />
    </LanguageProvider>
  );
  expect(screen.queryByRole('button', { name: 'Add to tasks' })).not.toBeInTheDocument();
});

it('renders loading/error without stale recommendations and preserves complete/development fallback', () => {
  const p = callbacks();
  const view = render(
    <LanguageProvider>
      <StudentNextStepCard action={exercise} {...p} loading />
    </LanguageProvider>
  );
  expect(screen.getByRole('status')).toBeVisible();
  expect(screen.queryByText(exercise.exerciseTitle)).not.toBeInTheDocument();
  view.rerender(
    <LanguageProvider>
      <StudentNextStepCard action={exercise} {...p} loadError />
    </LanguageProvider>
  );
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Add to tasks' })).not.toBeInTheDocument();
  view.rerender(
    <LanguageProvider>
      <StudentNextStepCard action={{ kind: 'complete' }} {...p} />
    </LanguageProvider>
  );
  expect(screen.getByText(/No new exercises/)).toBeVisible();
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

const homeProps = (participantId: string): StudentCabinetHomeContext => ({
  userProfile: {
    uid: 'account-a',
    email: 'test@example.com',
    displayName: 'Owner',
    role: 'user',
    avatarUrl: '',
    balanceUSD: 0,
    level: 1,
    skillScores: {},
    todaySkillItemIds: participantId === 'b' ? ['l1_1'] : [],
  },
  selectedParticipantId: participantId,
  participantProfiles: [
    { participantId: 'a', displayName: 'Alice' },
    { participantId: 'b', displayName: 'Bob' },
  ],
  bookings: [],
  sessionItems: [],
  courses: [],
  instructors: [],
  reviews: [],
  skillConfig: DEFAULT_SKILL_CONFIG,
  hasAnyParticipantSessionToday: false,
  onOpenSession: vi.fn(),
  onOpenLesson: vi.fn(),
  onWriteReview: vi.fn(),
  onGoToTab: vi.fn(),
  onOpenDevelopmentSection: vi.fn(),
  onContinueDevelopment: vi.fn(),
  onRequireCourseAuth: vi.fn(),
  onBookInstructor: vi.fn(),
  onViewInstructorReviews: vi.fn(),
  onToggleSkillToday: vi.fn(),
});

it('uses exact participant feedback on A → B → A, guards mismatched presentation and uses supported booking-ID navigation', async () => {
  const store = useParticipantLessonFeedbackStore.getState();
  for (const participantId of ['a', 'b']) {
    store.replaceParticipantItems(participantId, [
      {
        feedbackId: `feedback_${participantId}`,
        participantId,
        lessonBookingId: `lesson_${participantId}`,
        instructorId: 'coach',
        revision: 1,
        lessonDate: new Date().toISOString().slice(0, 10),
        items: [{ itemId: 'item1', text: `${participantId} actual advice`, completed: false }],
      } as ParticipantLessonFeedbackReadModel,
    ]);
  }
  store.setPresentationParticipantId('a');
  const a = homeProps('a');
  a.onOpenLessonByBookingId = vi.fn();
  const draw = (p: StudentCabinetHomeContext) => (
    <MemoryRouter>
      <LanguageProvider>
        <StudentCabinetHome {...p} />
      </LanguageProvider>
    </MemoryRouter>
  );
  const view = render(draw(a));
  const tile = () =>
    within(view.container.querySelector('[data-dashboard-tile="nextStep"]') as HTMLElement);
  expect(tile().getByRole('heading', { level: 3 })).toHaveTextContent('a actual advice');
  await userEvent.click(tile().getByRole('button', { name: 'Open lesson' }));
  expect(a.onOpenLessonByBookingId).toHaveBeenCalledTimes(1);
  expect(a.onOpenLessonByBookingId).toHaveBeenCalledWith('lesson_a');
  view.rerender(draw(homeProps('b')));
  expect(tile().getByRole('status')).toBeVisible();
  expect(tile().queryByText('a actual advice')).not.toBeInTheDocument();
  act(() => store.setPresentationParticipantId('b'));
  expect(tile().getByRole('heading', { level: 3 })).toHaveTextContent('b actual advice');
  act(() => store.setPresentationParticipantId('a'));
  view.rerender(draw(a));
  expect(tile().getByRole('heading', { level: 3 })).toHaveTextContent('a actual advice');
});

it('keeps real priority selection, Today synchronization and profile scores unchanged by pinning', async () => {
  const store = useParticipantLessonFeedbackStore.getState();
  store.replaceParticipantItems('a', []);
  store.setPresentationParticipantId('a');
  const p = homeProps('a');
  const scores = { ...p.userProfile.skillScores };
  const view = render(
    <MemoryRouter>
      <LanguageProvider>
        <StudentCabinetHome {...p} />
      </LanguageProvider>
    </MemoryRouter>
  );
  const tile = within(
    view.container.querySelector('[data-dashboard-tile="nextStep"]') as HTMLElement
  );
  const initial = getNextStepAction(p.userProfile, undefined, DEFAULT_SKILL_CONFIG, 'en');
  expect(initial?.kind).toBe('exercise');
  await userEvent.click(tile.getByRole('button', { name: 'Add to tasks' }));
  expect(p.onToggleSkillToday).toHaveBeenCalledTimes(1);
  expect(p.onToggleSkillToday).toHaveBeenCalledWith('l1_1', true);
  const updated = { ...p, userProfile: { ...p.userProfile, todaySkillItemIds: ['l1_1'] } };
  view.rerender(
    <MemoryRouter>
      <LanguageProvider>
        <StudentCabinetHome {...updated} />
      </LanguageProvider>
    </MemoryRouter>
  );
  expect(tile.getByRole('heading', { level: 3 })).not.toHaveTextContent(
    initial?.kind === 'exercise' ? initial.exerciseTitle : ''
  );
  const today = view.container.querySelector('[data-dashboard-tile="todayTasks"]');
  expect(today).toHaveTextContent(initial?.kind === 'exercise' ? initial.exerciseTitle : '');
  expect(p.userProfile.skillScores).toEqual(scores);
  expect(getNextStepAction({ ...p.userProfile, hideProgressTracking: true }, undefined)).toBeNull();
  expect(
    getNextStepAction(p.userProfile, undefined, { ...DEFAULT_SKILL_CONFIG, items: [] })
  ).toEqual({ kind: 'complete' });
});
