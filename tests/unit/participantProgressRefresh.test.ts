import { beforeEach, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCoachParticipantProgress } from '../../src/features/student-cabinet/useCoachParticipantProgress';
import { useParticipantProgressStore as store } from '../../src/features/participant-progress/participantProgressStore';
import {
  refreshManagedParticipantProgress,
  updateCanonicalParticipantProgress,
} from '../../src/features/participant-progress/participantProgressService';

const mocks = vi.hoisted(() => ({ managed: vi.fn(), instructor: vi.fn(), command: vi.fn() }));
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryManagedParticipantProgressReadModels: mocks.managed,
  queryInstructorParticipantProgressReadModels: mocks.instructor,
}));
vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: mocks.command,
}));

const row = (participantId = 'participant_a', revision = 1) => ({
  participantId,
  level: 1,
  revision,
  skillScores: { skill: 0 },
  skillComments: { skill: `${participantId} note` },
});

it('propagates a stale revision without silently refreshing or retrying the command', async () => {
  mocks.command.mockResolvedValue({
    status: 'error',
    kind: 'update_participant_progress',
    error: {
      code: 'stale_version',
      correlationId: 'progress_conflict',
      retryable: false,
      currentRevision: 2,
    },
  });
  await expect(
    updateCanonicalParticipantProgress({
      accountId: 'account_coach',
      participantId: 'participant_a',
      level: 1,
      expectedRevision: 1,
      skillScores: { skill: 5 },
      skillComments: {},
    })
  ).rejects.toMatchObject({ code: 'stale_version', currentRevision: 2 });
  expect(mocks.command).toHaveBeenCalledTimes(1);
  expect(mocks.instructor).not.toHaveBeenCalled();
  expect(mocks.managed).not.toHaveBeenCalled();
});

it('fetches comments saved by another session after the cabinet initially loaded', async () => {
  mocks.managed.mockResolvedValueOnce({ items: [{ ...row(), skillComments: {} }] });
  await refreshManagedParticipantProgress();
  expect(store.getState().byId.participant_a?.skillComments).toEqual({});
  mocks.managed.mockResolvedValue({ items: [row('participant_a', 2)] });
  const { result, rerender } = renderHook(
    ({ enabled }) => useCoachParticipantProgress('participant_a', enabled),
    { initialProps: { enabled: false } }
  );
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.loadState).toBe('loaded'));
  expect(store.getState().byId.participant_a?.skillComments).toEqual({
    skill: 'participant_a note',
  });
  expect(mocks.managed).toHaveBeenLastCalledWith(['participant_a']);
});
beforeEach(() => {
  vi.resetAllMocks();
  store.getState().clear();
});

it('exposes loading, failure, and successful retry instead of a false empty result', async () => {
  mocks.managed
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ items: [row()] });
  const pending = refreshManagedParticipantProgress();
  await expect(pending).rejects.toThrow('offline');
  expect(store.getState().byId).toEqual({});
  await refreshManagedParticipantProgress();
  expect(store.getState().byId.participant_a?.skillComments).toEqual({
    skill: 'participant_a note',
  });
});

it('ignores an older response and does not overwrite a newer canonical revision', async () => {
  let finish!: (value: unknown) => void;
  mocks.managed
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValueOnce({ items: [row('participant_a', 2)] });
  const old = refreshManagedParticipantProgress();
  await refreshManagedParticipantProgress();
  finish({ items: [row()] });
  await old;
  expect(store.getState().byId.participant_a?.revision).toBe(2);
  store.getState().setItems([row('participant_a', 1)]);
  expect(store.getState().byId.participant_a?.revision).toBe(2);
});

it('discards responses after account cleanup', async () => {
  let finish!: (value: unknown) => void;
  mocks.managed.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const old = refreshManagedParticipantProgress();
  store.getState().clear();
  finish({ items: [row()] });
  await old;
  expect(store.getState().byId).toEqual({});
});

it('passes saved comments through the canonical command, instructor read and managed read', async () => {
  const saved = row();
  mocks.command.mockResolvedValue({
    status: 'success',
    payload: { participantId: saved.participantId, revision: 1 },
  });
  mocks.instructor.mockResolvedValue({ items: [saved] });
  mocks.managed.mockResolvedValue({ items: [saved, row('participant_b')] });
  await updateCanonicalParticipantProgress({
    accountId: 'account_coach',
    participantId: saved.participantId,
    level: 1,
    expectedRevision: 0,
    skillScores: saved.skillScores,
    skillComments: saved.skillComments,
  });
  expect(mocks.command).toHaveBeenCalledWith(
    'account_coach',
    expect.objectContaining({
      intent: expect.objectContaining({
        participantId: saved.participantId,
        skillComments: saved.skillComments,
      }),
    })
  );
  store.getState().clear();
  await refreshManagedParticipantProgress();
  expect(store.getState().byId.participant_a?.skillComments).toEqual(saved.skillComments);
  expect(store.getState().byId.participant_b?.skillComments).toEqual({
    skill: 'participant_b note',
  });
});
