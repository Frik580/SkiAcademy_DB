import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBookingCollaborationStore } from '../../src/features/booking-collaboration/bookingCollaborationStore';
import { useBookingCollaborationReadSync } from '../../src/features/booking-collaboration/useBookingCollaborationReadSync';

const queryLessonBookingReadModelsMock = vi.fn();
const queryBookingProposalReadModelsMock = vi.fn();
const queryBookingChangeRequestReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonBookingReadModelsMock(...args),
  queryBookingProposalReadModels: (...args: unknown[]) =>
    queryBookingProposalReadModelsMock(...args),
  queryBookingChangeRequestReadModels: (...args: unknown[]) =>
    queryBookingChangeRequestReadModelsMock(...args),
}));

describe('useBookingCollaborationReadSync instructor panel', () => {
  beforeEach(() => {
    useBookingCollaborationStore.getState().reset();
    queryLessonBookingReadModelsMock.mockReset();
    queryBookingProposalReadModelsMock.mockReset();
    queryBookingChangeRequestReadModelsMock.mockReset();
    queryLessonBookingReadModelsMock.mockResolvedValue({
      scope: 'instructor_hot',
      items: [],
      hasMore: false,
    });
    queryBookingProposalReadModelsMock.mockResolvedValue({
      scope: 'instructor_open',
      items: [],
    });
    queryBookingChangeRequestReadModelsMock.mockResolvedValue({
      scope: 'instructor_open',
      items: [],
    });
  });

  it('loads canonical hot and history lesson booking scopes for the instructor workspace', async () => {
    renderHook(() =>
      useBookingCollaborationReadSync({
        customerEnabled: false,
        instructorEnabled: true,
        instructorId: 'instructor_fixture_01',
      })
    );

    await waitFor(() => {
      expect(useBookingCollaborationStore.getState().loaded).toBe(true);
    });

    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith({ scope: 'instructor_hot' });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith({ scope: 'instructor_history' });
    expect(queryBookingProposalReadModelsMock).toHaveBeenCalledWith({ scope: 'instructor_open' });
    expect(queryBookingChangeRequestReadModelsMock).toHaveBeenCalledWith({
      scope: 'instructor_open',
    });
  });

  it('follows every current/upcoming instructor cursor before replacing the workspace snapshot', async () => {
    queryLessonBookingReadModelsMock.mockImplementation(
      async (input: { scope: 'instructor_hot' | 'instructor_history'; cursor?: string }) => {
        if (input.scope === 'instructor_hot' && !input.cursor) {
          return { scope: input.scope, items: [], hasMore: true, nextCursor: `${input.scope}:2` };
        }
        return { scope: input.scope, items: [], hasMore: false };
      }
    );

    renderHook(() =>
      useBookingCollaborationReadSync({
        customerEnabled: false,
        instructorEnabled: true,
        instructorId: 'instructor_fixture_01',
      })
    );

    await waitFor(() => {
      expect(useBookingCollaborationStore.getState().loaded).toBe(true);
    });

    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith({
      scope: 'instructor_hot',
      cursor: 'instructor_hot:2',
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith({
      scope: 'instructor_history',
    });
  });

  it('follows every instructor history cursor so records beyond the first page stay reachable', async () => {
    queryLessonBookingReadModelsMock.mockImplementation(
      async (input: { scope: 'instructor_hot' | 'instructor_history'; cursor?: string }) => {
        if (input.scope === 'instructor_history' && !input.cursor) {
          return {
            scope: input.scope,
            items: [],
            hasMore: true,
            nextCursor: 'instructor_history:2',
          };
        }
        return { scope: input.scope, items: [], hasMore: false };
      }
    );

    renderHook(() =>
      useBookingCollaborationReadSync({
        customerEnabled: false,
        instructorEnabled: true,
        instructorId: 'instructor_fixture_01',
      })
    );

    await waitFor(() => {
      expect(useBookingCollaborationStore.getState().loaded).toBe(true);
    });

    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith({
      scope: 'instructor_history',
      cursor: 'instructor_history:2',
    });
  });

  it('disabling customer collaboration sync preserves participant access query cache', async () => {
    queryBookingProposalReadModelsMock.mockResolvedValue({
      scope: 'account_open',
      items: [],
    });
    queryBookingChangeRequestReadModelsMock.mockResolvedValue({
      scope: 'account_open',
      items: [],
    });
    useBookingCollaborationStore.getState().setParticipantAccessQuery('access:coach', {
      status: 'loaded',
    });

    const { rerender } = renderHook(
      ({ customerEnabled }: { customerEnabled: boolean }) =>
        useBookingCollaborationReadSync({
          customerEnabled,
          instructorEnabled: false,
          accountId: 'account_fixture_01',
        }),
      { initialProps: { customerEnabled: true } }
    );

    await waitFor(() => {
      expect(useBookingCollaborationStore.getState().loaded).toBe(true);
    });

    rerender({ customerEnabled: false });
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      useBookingCollaborationStore.getState().participantAccessQueries.get('access:coach')
    ).toEqual({ status: 'loaded' });

    rerender({ customerEnabled: true });
    await waitFor(() => {
      expect(useBookingCollaborationStore.getState().loaded).toBe(true);
    });
    expect(
      useBookingCollaborationStore.getState().participantAccessQueries.get('access:coach')
    ).toEqual({ status: 'loaded' });
  });
});
