import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  CorrelationIdSchema,
  commandSuccessResult,
  timestampFromDate,
  type ParticipantAchievementsReadModel,
} from '@ski-academy/shared-domain';
import {
  DEFAULT_ACHIEVEMENTS_CONFIG,
  type AchievementEvaluationContext,
} from '../../src/domain/achievements';
import { useSelectedParticipantAchievementsRecorder } from '../../src/features/participant-achievements/useSelectedParticipantAchievementsRecorder';
import { useParticipantAchievementsStore } from '../../src/features/participant-achievements/participantAchievementsStore';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';
import { executeAuthenticatedCanonicalCommand } from '../../src/lib/canonical/canonicalCommandClient';
import { queryManagedParticipantAchievementsReadModels } from '../../src/lib/canonical/canonicalReadModelClient';
import { logger } from '../../src/shared';

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: vi.fn(),
}));
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryManagedParticipantAchievementsReadModels: vi.fn(),
}));
vi.mock('../../src/shared', () => ({ logger: { warn: vi.fn() } }));

const self = ParticipantIdSchema.parse('participant_recorder_self');
const child = ParticipantIdSchema.parse('participant_recorder_child');
const date = '2026-01-10T12:00:00.000Z';
const earnedAt = timestampFromDate(new Date(date));
const participants = [self, child].map((participantId) => ({
  participantId,
  participantManagementId: `management_${participantId}`,
  displayName: 'Test',
  discipline: 'ski' as const,
  skillLevel: 'beginner' as const,
  age: { kind: 'age_years' as const, years: 10 },
  authority: participantId === self ? ('self' as const) : ('parent_guardian' as const),
  revision: 1,
}));
const config = {
  ...DEFAULT_ACHIEVEMENTS_CONFIG,
  items: DEFAULT_ACHIEVEMENTS_CONFIG.items.filter((item) => item.id === 'first_lesson'),
};
function evaluation(participantId = self, startsAt = date): AchievementEvaluationContext {
  return {
    participantId,
    progress: { participantId, level: 1, skillScores: {} },
    lessonFeedback: [],
    accountReviews: [],
    lessonEvidence: [
      {
        participantId,
        bookingId: BookingIdSchema.parse('booking_recorder_01'),
        instructorId: InstructorIdSchema.parse('instructor_recorder_01'),
        startsAt: timestampFromDate(new Date(startsAt)),
        timeZone: 'Asia/Almaty',
        durationHours: 1,
        attendanceStatus: 'present',
        lifecycleStatus: 'completed',
        servicePartyParticipantIds: [participantId],
      },
    ],
  };
}
function props(participantId = self) {
  return {
    accountId: 'account_recorder_01',
    selectedParticipantId: participantId,
    participants,
    evaluation: evaluation(participantId),
    achievementsConfig: config,
  };
}
function stored(participantId = self): ParticipantAchievementsReadModel {
  return {
    participantId,
    revision: 1,
    earned: { first_lesson: { earnedAt, source: 'participant_attendance' } },
  };
}
const submit = vi.mocked(executeAuthenticatedCanonicalCommand);
const read = vi.mocked(queryManagedParticipantAchievementsReadModels);
const success = (participantId = self) =>
  commandSuccessResult(
    'record_participant_achievements',
    CorrelationIdSchema.parse('correlation_recorder_01'),
    { participantId, revision: 1, newlyEarnedAchievementIds: ['first_lesson'] }
  );
const fail = (code: 'idempotency_conflict' | 'forbidden' | 'internal', retryable = false) =>
  new CanonicalCommandClientError(code, { correlationId: 'correlation_recorder_01', retryable });

beforeEach(() => {
  vi.clearAllMocks();
  useParticipantAchievementsStore.getState().clear();
  useParticipantAchievementsStore
    .getState()
    .setItems([self, child].map((participantId) => ({ participantId, earned: {}, revision: 0 })));
  submit.mockResolvedValue(success());
  read.mockResolvedValue({ scope: 'managed', items: [stored()] });
});

describe('automatic Participant achievement recording', () => {
  it('does not invent historical earnedAt from a no-op result when the follow-up read fails', async () => {
    submit.mockResolvedValue(
      commandSuccessResult(
        'record_participant_achievements',
        CorrelationIdSchema.parse('correlation_recorder_noop'),
        { participantId: self, revision: 1, newlyEarnedAchievementIds: [] }
      )
    );
    read.mockRejectedValue(new Error('offline'));
    renderHook(() => useSelectedParticipantAchievementsRecorder(props()));
    await waitFor(() =>
      expect(useParticipantAchievementsStore.getState().recordingKeys).toEqual({})
    );
    expect(useParticipantAchievementsStore.getState().byId[self].earned).toEqual({});
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('settles a retryable failure even when recovery advances the revision', async () => {
    submit.mockRejectedValue(fail('internal', true));
    read.mockResolvedValue({
      scope: 'managed',
      items: [{ participantId: self, revision: 1, earned: {} }],
    });
    renderHook(() => useSelectedParticipantAchievementsRecorder(props()));
    await waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('does not resend a terminal conflict when recovery advances the revision without the achievement', async () => {
    submit.mockRejectedValue(fail('idempotency_conflict'));
    read.mockResolvedValue({
      scope: 'managed',
      items: [{ participantId: self, revision: 1, earned: {} }],
    });
    renderHook(() => useSelectedParticipantAchievementsRecorder(props()));
    await waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
    expect(useParticipantAchievementsStore.getState().byId[self].revision).toBe(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('loads a newly selected Participant once before permitting recording', async () => {
    useParticipantAchievementsStore.getState().clear();
    useParticipantAchievementsStore
      .getState()
      .setItems([{ participantId: self, revision: 0, earned: {} }]);
    read
      .mockResolvedValueOnce({
        scope: 'managed',
        items: [{ participantId: child, revision: 0, earned: {} }],
      })
      .mockResolvedValue({ scope: 'managed', items: [stored(child)] });
    submit.mockResolvedValue(success(child));
    renderHook(() => useSelectedParticipantAchievementsRecorder(props(child)));
    await waitFor(() =>
      expect(useParticipantAchievementsStore.getState().byId[child]?.revision).toBe(1)
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0]).toEqual([[child]]);
  });
  it('records once across Strict Mode, two hook instances and reopening', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const first = renderHook(
      () => {
        useSelectedParticipantAchievementsRecorder(props());
        useSelectedParticipantAchievementsRecorder(props());
      },
      { wrapper }
    );
    await waitFor(() =>
      expect(useParticipantAchievementsStore.getState().byId[self].revision).toBe(1)
    );
    first.unmount();
    renderHook(() => useSelectedParticipantAchievementsRecorder(props()), { wrapper });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('does not command before the initial Participant read', async () => {
    useParticipantAchievementsStore.getState().clear();
    renderHook(() => useSelectedParticipantAchievementsRecorder(props()));
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(useParticipantAchievementsStore.getState().byId[self]?.revision).toBe(1)
    );
  });

  it('refreshes a non-retryable conflict once and settles an already recorded achievement', async () => {
    submit.mockRejectedValue(fail('idempotency_conflict'));
    renderHook(() => useSelectedParticipantAchievementsRecorder(props()));
    await waitFor(() =>
      expect(useParticipantAchievementsStore.getState().byId[self].revision).toBe(1)
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('diagnoses an unresolved conflict without looping after changing evaluation or reopening', async () => {
    submit.mockRejectedValue(fail('idempotency_conflict'));
    read.mockResolvedValue({
      scope: 'managed',
      items: [{ participantId: self, revision: 0, earned: {} }],
    });
    const hook = renderHook((input) => useSelectedParticipantAchievementsRecorder(input), {
      initialProps: props(),
    });
    await waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
    hook.rerender({ ...props(), evaluation: evaluation(self, '2026-01-09T12:00:00.000Z') });
    hook.unmount();
    renderHook(() => useSelectedParticipantAchievementsRecorder(props()));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not retry forbidden, but permits a different achievement', async () => {
    submit.mockRejectedValueOnce(fail('forbidden'));
    const hook = renderHook((input) => useSelectedParticipantAchievementsRecorder(input), {
      initialProps: props(),
    });
    await waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
    submit.mockResolvedValue(
      commandSuccessResult(
        'record_participant_achievements',
        CorrelationIdSchema.parse('correlation_recorder_new'),
        { participantId: self, revision: 1, newlyEarnedAchievementIds: ['another_achievement'] }
      )
    );
    read.mockResolvedValue({
      scope: 'managed',
      items: [
        {
          participantId: self,
          revision: 1,
          earned: { another_achievement: { earnedAt, source: 'participant_attendance' } },
        },
      ],
    });
    const another = { ...config, items: [{ ...config.items[0], id: 'another_achievement' }] };
    hook.rerender({ ...props(), achievementsConfig: another });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        useParticipantAchievementsStore.getState().byId[self].earned.another_achievement
      ).toBeDefined()
    );
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('recovers a lost successful response with one read and no second award', async () => {
    submit.mockRejectedValue(fail('internal', true));
    renderHook(() => useSelectedParticipantAchievementsRecorder(props()));
    await waitFor(() =>
      expect(useParticipantAchievementsStore.getState().byId[self].revision).toBe(1)
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('keeps a committed result after unmount even when refreshing fails', async () => {
    let resolve!: (value: ReturnType<typeof success>) => void;
    submit.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }) as ReturnType<typeof executeAuthenticatedCanonicalCommand>
    );
    read.mockRejectedValue(new Error('offline'));
    const hook = renderHook(() => useSelectedParticipantAchievementsRecorder(props()));
    hook.unmount();
    await act(async () => {
      resolve(success());
    });
    expect(useParticipantAchievementsStore.getState().byId[self]).toMatchObject(stored());
    expect(useParticipantAchievementsStore.getState().recordingKeys).toEqual({});
    renderHook(() => useSelectedParticipantAchievementsRecorder(props()));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('settles both Participants independently when switching during pending commands', async () => {
    const pending: ((value: ReturnType<typeof success>) => void)[] = [];
    submit.mockImplementation(
      () =>
        new Promise((done) => {
          pending.push(done);
        }) as ReturnType<typeof executeAuthenticatedCanonicalCommand>
    );
    read.mockRejectedValue(new Error('offline'));
    const hook = renderHook((input) => useSelectedParticipantAchievementsRecorder(input), {
      initialProps: props(),
    });
    hook.rerender(props(child));
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][1].exercisedCapability).toBe('parent_guardian');
    await act(async () => {
      pending[1](success(child));
      pending[0](success());
    });
    expect(useParticipantAchievementsStore.getState().byId[self].revision).toBe(1);
    expect(useParticipantAchievementsStore.getState().byId[child].revision).toBe(1);
    expect(useParticipantAchievementsStore.getState().recordingKeys).toEqual({});
  });

  it('rejects a late read that would restore stale revision zero', () => {
    useParticipantAchievementsStore.getState().upsertItem(stored());
    useParticipantAchievementsStore
      .getState()
      .setItems([{ participantId: self, revision: 0, earned: {} }]);
    expect(useParticipantAchievementsStore.getState().byId[self]).toEqual(stored());
  });

  it('discards a successful response from a cleared auth session', async () => {
    let resolve!: (value: ReturnType<typeof success>) => void;
    submit.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }) as ReturnType<typeof executeAuthenticatedCanonicalCommand>
    );
    const hook = renderHook(() => useSelectedParticipantAchievementsRecorder(props()));
    hook.unmount();
    useParticipantAchievementsStore.getState().clear();
    await act(async () => {
      resolve(success());
    });
    expect(useParticipantAchievementsStore.getState().byId).toEqual({});
    expect(read).not.toHaveBeenCalled();
  });
});
