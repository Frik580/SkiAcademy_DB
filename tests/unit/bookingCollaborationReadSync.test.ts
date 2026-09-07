import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith({ scope: 'instructor_history' });
  });
});
