import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useCoachParticipantProgress } from '../../src/features/student-cabinet/useCoachParticipantProgress';

const read = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/participant-progress/participantProgressService', () => ({
  refreshManagedParticipantProgress: read,
}));
beforeEach(() => {
  read.mockReset();
  read.mockResolvedValue([]);
});

it('loads exactly the open participant, refreshes A → B → A and ignores unrelated renders', async () => {
  const { result, rerender } = renderHook(
    ({ id, enabled }) => useCoachParticipantProgress(id, enabled),
    { initialProps: { id: 'a', enabled: false } }
  );
  expect(read).not.toHaveBeenCalled();
  rerender({ id: 'a', enabled: true });
  await waitFor(() => expect(result.current.loadState).toBe('loaded'));
  rerender({ id: 'a', enabled: true });
  expect(read).toHaveBeenCalledTimes(1);
  rerender({ id: 'b', enabled: true });
  expect(result.current.loadState).toBe('loading');
  await waitFor(() => expect(result.current.loadState).toBe('loaded'));
  rerender({ id: 'a', enabled: true });
  await waitFor(() => expect(result.current.loadState).toBe('loaded'));
  expect(read.mock.calls).toEqual([[['a']], [['b']], [['a']]]);
  rerender({ id: 'a', enabled: false });
  rerender({ id: 'a', enabled: true });
  await waitFor(() => expect(result.current.loadState).toBe('loaded'));
  expect(read).toHaveBeenCalledTimes(4);
});

it('retries errors and ignores a previous participant finishing late', async () => {
  let finish!: () => void;
  read
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    )
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce([]);
  const { result, rerender } = renderHook(({ id }) => useCoachParticipantProgress(id, true), {
    initialProps: { id: 'a' },
  });
  rerender({ id: 'b' });
  await waitFor(() => expect(result.current.loadState).toBe('error'));
  await act(async () => finish());
  expect(result.current.loadState).toBe('error');
  act(() => result.current.retry());
  expect(result.current.loadState).toBe('loading');
  await waitFor(() => expect(result.current.loadState).toBe('loaded'));
  expect(read.mock.calls).toEqual([[['a']], [['b']], [['b']]]);
});
