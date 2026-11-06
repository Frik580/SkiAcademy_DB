import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { translations } from '../../src/lib/i18n/translations';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import { InstructorLessonContextDialog } from '../../src/features/instructor-workspace/components/InstructorLessonContextDialog';
import { InstructorBookingCard } from '../../src/features/instructor-workspace/components/InstructorBookingCard';
import type { DisplayBooking } from '../../src/features/instructor-workspace/components/useInstructorWorkspace';
import type { InstructorLessonContextInput } from '../../src/features/instructor-workspace/instructorLessonContextContracts';
import { emptyParticipantProgressView } from '../../src/features/participant-progress/applyParticipantProgressToProfile';
import { useParticipantProgressStore } from '../../src/features/participant-progress/participantProgressStore';
import { useAuthStore } from '../../src/features/auth/authStore';

const mocks = vi.hoisted(() => ({ progress: vi.fn(), feedback: vi.fn(), command: vi.fn() }));
vi.mock('../../src/features/participant-progress/participantProgressService', async (original) => ({
  ...(await original<object>()),
  refreshInstructorParticipantProgress: mocks.progress,
}));
vi.mock(
  '../../src/features/participant-lesson-feedback/participantLessonFeedbackService',
  async (original) => ({
    ...(await original<object>()),
    queryInstructorLessonParticipantFeedback: mocks.feedback,
  })
);
vi.mock('../../src/lib/canonical/canonicalCommandClient', async (original) => ({
  ...(await original<object>()),
  executeAuthenticatedCanonicalCommand: mocks.command,
}));
vi.mock('../../src/features/booking-collaboration', () => ({
  InstructorCollaborationPanel: () => null,
}));

const context: InstructorLessonContextInput = {
  participantId: 'participant_context_a',
  bookingId: 'booking_context_a',
  studentName: 'Alice',
  discipline: 'ski',
  date: '2026-11-07',
  time: '11:00',
  status: 'confirmed',
  canAssess: false,
  canReadFeedback: false,
};
const config = {
  ...DEFAULT_SKILL_CONFIG,
  items: DEFAULT_SKILL_CONFIG.items.slice(0, 3).map((item) => ({ ...item, maxPoints: 5 })),
};
const first = config.items[0]!;
const second = config.items[1]!;
const third = config.items[2]!;
const t = (key: keyof typeof translations.en) => translations.en[key];
function progress(id = context.participantId) {
  return {
    ...emptyParticipantProgressView(id),
    revision: 2,
    level: 2,
    skillScores: { [first.id]: 0, [second.id]: 3 },
    skillComments: {
      [first.id]: 'Keep the stance',
      [second.id]: 'Use the edge',
      retired_skill: 'Old skill comment',
    },
    skillCommentAttribution: {
      [first.id]: {
        instructorId: 'instructor_author',
        accountId: 'account_author',
        updatedAt: { seconds: 1794000000, nanoseconds: 0 },
        revision: 2,
      },
    } as never,
  };
}
function dialog(
  value = context,
  callbacks = { onClose: vi.fn(), onOpenProgress: vi.fn(), onOpenFeedback: vi.fn() }
) {
  return (
    <LanguageProvider>
      <InstructorLessonContextDialog
        context={value}
        skillConfig={config}
        authors={[{ id: 'instructor_author', name: 'Confirmed Coach' }]}
        {...callbacks}
      />
    </LanguageProvider>
  );
}
async function ready() {
  await screen.findByRole('region', { name: t('lessonContextSkills') });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('alpine_glide_lang', 'en');
  useParticipantProgressStore.getState().clear();
  mocks.progress.mockImplementation(async ([id]: string[]) => {
    const item = progress(id);
    useParticipantProgressStore.getState().setItems([item]);
    return [item];
  });
  mocks.feedback.mockImplementation(async ({ participantId, lessonBookingId }) => ({
    participantId,
    lessonBookingId,
    items: [],
    revision: 0,
  }));
});
afterEach(cleanup);

describe('instructor lesson learning context', () => {
  it('reads exact Participant, shows official level, zero versus missing scores, and performs no writes', async () => {
    render(dialog());
    await ready();
    expect(mocks.progress).toHaveBeenCalledWith([context.participantId]);
    expect(screen.getByRole('heading', { name: /Carve/ })).toBeInTheDocument();
    expect(screen.getByText('0 / 5 · 0%')).toBeInTheDocument();
    expect(screen.getByText('3 / 5 · 60%')).toBeInTheDocument();
    expect(screen.getByText('Not evaluated / 5')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /Maintain basic stance/ })).toHaveValue(0);
    expect(
      screen.queryByRole('progressbar', { name: /Controlled snowplow/ })
    ).not.toBeInTheDocument();
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.feedback).not.toHaveBeenCalled();
  });
  it('shows confirmed authors and date, unknown authors and retired skill text without inference', async () => {
    render(dialog());
    await ready();
    const author = screen.getByText(/Confirmed Coach/);
    expect(author).toHaveAttribute('data-instructor-id', 'instructor_author');
    expect(author.textContent).toMatch(/ · /);
    expect(screen.getAllByText('Author unknown')).toHaveLength(2);
    expect(screen.getByText('Old skill comment')).toBeInTheDocument();
  });
  it('retains confirmed instructor ID when author name cannot be resolved', async () => {
    render(
      <LanguageProvider>
        <InstructorLessonContextDialog
          context={context}
          skillConfig={config}
          authors={[]}
          onClose={vi.fn()}
          onOpenProgress={vi.fn()}
          onOpenFeedback={vi.fn()}
        />
      </LanguageProvider>
    );
    await ready();
    const unknown = screen.getAllByText(/Author unknown/).find((el) => el.dataset.instructorId);
    expect(unknown).toHaveAttribute('data-instructor-id', 'instructor_author');
  });
  it('keeps future lessons read only and exposes the existing view action', async () => {
    const callbacks = { onClose: vi.fn(), onOpenProgress: vi.fn(), onOpenFeedback: vi.fn() };
    render(dialog(context, callbacks));
    await ready();
    expect(screen.queryByRole('button', { name: t('instructorAssess') })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('instructorViewProgress') }));
    expect(callbacks.onOpenProgress).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: t('instructorRecommendations') })).toBeDisabled();
  });
  it('loads exact eligible lesson recommendations and exposes existing actions', async () => {
    mocks.feedback.mockResolvedValue({
      participantId: context.participantId,
      lessonBookingId: context.bookingId,
      items: [{ itemId: 'item_1', text: 'Repeat the turns' }],
      revision: 1,
    });
    const callbacks = { onClose: vi.fn(), onOpenProgress: vi.fn(), onOpenFeedback: vi.fn() };
    render(dialog({ ...context, canAssess: true, canReadFeedback: true }, callbacks));
    await screen.findByText('Repeat the turns');
    expect(mocks.feedback).toHaveBeenCalledWith({
      participantId: context.participantId,
      lessonBookingId: context.bookingId,
    });
    fireEvent.click(screen.getByRole('button', { name: t('instructorRecommendations') }));
    expect(callbacks.onOpenFeedback).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: t('instructorAssess') })).toBeEnabled();
  });
  it('distinguishes empty recommendations from unavailable reading', async () => {
    render(dialog({ ...context, canAssess: true, canReadFeedback: true }));
    await screen.findByText(t('lessonContextNoFeedback'));
    expect(screen.queryByText(t('lessonContextFeedbackUnavailable'))).not.toBeInTheDocument();
  });
  it('shows loading instead of empty progress before the response', async () => {
    mocks.progress.mockReturnValue(new Promise(() => {}));
    render(dialog());
    expect(screen.getAllByText(t('loading')).length).toBeGreaterThan(0);
    expect(screen.queryByText(t('lessonContextEmptyProgress'))).not.toBeInTheDocument();
  });
  it('supports an accountless guest with canonical empty progress and no comments', async () => {
    mocks.progress.mockResolvedValue([emptyParticipantProgressView(context.participantId)]);
    render(dialog());
    await ready();
    expect(screen.getByText(t('lessonContextEmptyProgress'))).toBeInTheDocument();
    expect(screen.getByText(t('lessonContextNoComments'))).toBeInTheDocument();
    expect(screen.getByText(t('lessonContextNoGoal'))).toBeInTheDocument();
  });
  it.each(['forbidden', 'unauthorized', 'functions/permission-denied'])(
    'does not show cached data to a denied/blocked instructor (%s)',
    async (code) => {
      useParticipantProgressStore.getState().setItems([progress()]);
      mocks.progress.mockRejectedValue({ code });
      render(dialog());
      await screen.findByText(t('lessonContextDenied'));
      expect(screen.queryByText('Keep the stance')).not.toBeInTheDocument();
      expect(mocks.feedback).not.toHaveBeenCalled();
    }
  );
  it('treats an omitted authorized row as denied, not empty progress', async () => {
    mocks.progress.mockResolvedValue([]);
    render(dialog());
    await screen.findByText(t('lessonContextDenied'));
    expect(screen.queryByText(t('lessonContextEmptyProgress'))).not.toBeInTheDocument();
  });
  it('distinguishes unavailable Participant from empty progress', async () => {
    mocks.progress.mockRejectedValue({ code: 'functions/not-found' });
    render(dialog());
    await screen.findByText(t('lessonContextUnavailable'));
  });
  it('retries a transport failure', async () => {
    mocks.progress.mockRejectedValueOnce(new Error('network'));
    render(dialog());
    await screen.findByText(t('requestFailed'));
    fireEvent.click(screen.getByRole('button', { name: t('retry') }));
    await ready();
    expect(mocks.progress).toHaveBeenCalledTimes(2);
  });
  it('discards late progress responses on Participant switch', async () => {
    const pending = deferred<ReturnType<typeof progress>[]>();
    mocks.progress.mockReturnValueOnce(pending.promise);
    const view = render(dialog());
    view.rerender(
      dialog({ ...context, participantId: 'participant_context_b', studentName: 'Bob' })
    );
    await ready();
    await act(async () =>
      pending.resolve([{ ...progress(), skillComments: { secret: 'Alice secret' } }])
    );
    expect(screen.queryByText('Alice secret')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/Bob/);
  });
  it('discards late recommendations on Booking switch', async () => {
    const pending = deferred<object>();
    mocks.feedback.mockReturnValueOnce(pending.promise);
    const view = render(dialog({ ...context, canReadFeedback: true }));
    await waitFor(() => expect(mocks.feedback).toHaveBeenCalledTimes(1));
    view.rerender(dialog({ ...context, bookingId: 'booking_context_b', canReadFeedback: true }));
    await screen.findByText(t('lessonContextNoFeedback'));
    await act(async () =>
      pending.resolve({
        participantId: context.participantId,
        lessonBookingId: context.bookingId,
        items: [{ itemId: 'old', text: 'Old booking secret' }],
        revision: 1,
      })
    );
    expect(screen.queryByText('Old booking secret')).not.toBeInTheDocument();
  });
  it('rejects mismatched feedback identity', async () => {
    mocks.feedback.mockResolvedValue({
      participantId: 'participant_other',
      lessonBookingId: context.bookingId,
      items: [{ text: 'Other participant secret' }],
    });
    render(dialog({ ...context, canReadFeedback: true }));
    await screen.findByText(t('requestFailed'));
    expect(screen.queryByText('Other participant secret')).not.toBeInTheDocument();
  });
  it('invalidates displayed data when the auth generation changes', async () => {
    render(dialog());
    await ready();
    mocks.progress.mockRejectedValue({ code: 'forbidden' });
    act(() =>
      useAuthStore.setState({ authGeneration: useAuthStore.getState().authGeneration + 1 })
    );
    await screen.findByText(t('lessonContextDenied'));
    expect(screen.queryByText('Keep the stance')).not.toBeInTheDocument();
  });
  it('cancelled lesson is no access basis but another server-authorized basis remains usable', async () => {
    render(dialog({ ...context, status: 'cancelled' }));
    await ready();
    expect(screen.getByRole('button', { name: t('instructorViewProgress') })).toBeEnabled();
    expect(mocks.feedback).not.toHaveBeenCalled();
  });
  it.each(['en', 'ru'] as const)(
    'renders localized content in %s and theme-compatible shell',
    async (language) => {
      localStorage.setItem('alpine_glide_lang', language);
      render(dialog());
      await screen.findByRole('region', { name: translations[language].lessonContextSkills });
      expect(screen.getByRole('dialog')).toHaveAccessibleName(
        `${translations[language].lessonContextTitle}: Alice`
      );
      expect(screen.getByRole('dialog')).toHaveClass('admin-modal');
      expect(
        screen.getByText(language === 'ru' ? 'Нет оценки / 5' : 'Not evaluated / 5')
      ).toBeInTheDocument();
    }
  );
});

function booking(): DisplayBooking {
  return {
    id: context.bookingId,
    revision: 1,
    instructorId: 'instructor_context',
    instructorName: 'Coach',
    date: context.date,
    time: context.time,
    startsAtEpochMs: 100,
    endsAtEpochMs: 200,
    durationHours: 1,
    status: 'confirmed',
    notes: '',
    participantId: context.participantId,
    participantIds: [context.participantId, 'participant_context_b'],
    participants: [
      {
        participantId: context.participantId,
        clientName: 'Alice',
        canRecordPresent: true,
        canRecordAbsent: true,
        attendanceStatus: 'present',
      },
      {
        participantId: 'participant_context_b',
        clientName: 'Bob',
        canRecordPresent: true,
        canRecordAbsent: true,
      },
    ],
    clientName: 'Alice',
    isGuest: false,
    attendanceFollowUp: 'none',
    attendanceOverdue: false,
    missingAttendanceCount: 0,
    authorizedActions: {
      canRequestCancellation: false,
      canWithdrawCancellation: false,
      canReschedule: false,
      canCreateChangeRequest: false,
    },
  };
}
function card(value = booking(), nowMs = 0, onOpenEval = vi.fn(), record = vi.fn()) {
  return (
    <LanguageProvider>
      <InstructorBookingCard
        booking={value}
        nowMs={nowMs}
        usersList={[]}
        theme="light"
        language="en"
        t={t}
        onOpenChat={vi.fn()}
        onUpdateStudentLevel={vi.fn()}
        onOpenEval={onOpenEval}
        collaboration={
          { proposals: [], changeRequests: [], handleRecordLessonAttendance: record } as never
        }
        canCreateProposal={false}
        onCreateProposal={vi.fn()}
        skillConfig={config}
      />
    </LanguageProvider>
  );
}
describe('schedule entry and modal accessibility integration', () => {
  it('opens individual lesson by keyboard, traps focus, makes background inert, closes with Escape and restores focus', async () => {
    const user = userEvent.setup();
    const b = booking();
    b.participants = [b.participants[0]!];
    b.participantIds = [context.participantId];
    const { container } = render(card(b));
    expect(mocks.progress).not.toHaveBeenCalled();
    const trigger = screen.getByRole('button', { name: `Alice: ${t('lessonContextTitle')}` });
    trigger.focus();
    await user.keyboard('{Enter}');
    await ready();
    expect(container).toHaveAttribute('inert');
    const modal = screen.getByRole('dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
    const buttons = within(modal)
      .getAllByRole('button')
      .filter((el) => !(el as HTMLButtonElement).disabled);
    buttons.at(-1)!.focus();
    await user.tab();
    expect(buttons[0]).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(container).not.toHaveAttribute('inert');
  });
  it('opens each group Participant with no lingering comments and closes by button', async () => {
    const user = userEvent.setup();
    render(card());
    await user.click(screen.getByRole('button', { name: `Alice: ${t('lessonContextTitle')}` }));
    await ready();
    await user.click(screen.getByRole('button', { name: t('closeBtn') }));
    mocks.progress.mockResolvedValue([emptyParticipantProgressView('participant_context_b')]);
    await user.click(screen.getByRole('button', { name: `Bob: ${t('lessonContextTitle')}` }));
    await ready();
    expect(mocks.progress).toHaveBeenLastCalledWith(['participant_context_b']);
    expect(screen.queryByText('Keep the stance')).not.toBeInTheDocument();
  });
  it('closes context before invoking existing evaluation with canonical scores and retains Attendance', async () => {
    const open = vi.fn(),
      record = vi.fn();
    const user = userEvent.setup();
    render(card(booking(), 150, open, record));
    await user.click(
      screen.getByRole('button', { name: `Alice: ${t('instructorAttendancePresent')}` })
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: context.bookingId,
        participantId: context.participantId,
        attendanceStatus: 'present',
      })
    );
    await user.click(screen.getByRole('button', { name: `Alice: ${t('lessonContextTitle')}` }));
    await ready();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('instructorAssess') })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveBeenCalledWith(
      context.participantId,
      'Alice',
      2,
      progress().skillScores,
      progress().skillComments,
      false
    );
  });
  it('hands off to the existing exact lesson feedback editor without stacked dialogs', async () => {
    const user = userEvent.setup();
    render(card(booking(), 150));
    await user.click(screen.getByRole('button', { name: `Alice: ${t('lessonContextTitle')}` }));
    await screen.findByText(t('lessonContextNoFeedback'));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: t('instructorRecommendations'),
      })
    );
    expect(screen.queryByTestId('instructor-lesson-context')).not.toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(mocks.feedback).toHaveBeenLastCalledWith({
      participantId: context.participantId,
      lessonBookingId: context.bookingId,
    });
  });
  it('closes selected context when the booking identity changes', async () => {
    const user = userEvent.setup();
    const view = render(card());
    await user.click(screen.getByRole('button', { name: `Alice: ${t('lessonContextTitle')}` }));
    await ready();
    view.rerender(card({ ...booking(), id: 'booking_context_b' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
