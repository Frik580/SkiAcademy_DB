import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBookingCollaborationStore } from '../../src/features/booking-collaboration/bookingCollaborationStore';
import { useBookingCollaborationReadSync } from '../../src/features/booking-collaboration/useBookingCollaborationReadSync';

const queryLessonBookingReadModelsMock = vi.fn();
const queryBookingProposalReadModelsMock = vi.fn();
const queryBookingChangeRequestReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonBookingReadModelsMock(...args),
  queryBookingProposalReadModels: (...args: unknown[]) => queryBookingProposalReadModelsMock(...args),
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

  it('loads instructor collaboration reads with instructor_hot lesson booking scope', async () => {
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
    expect(queryBookingProposalReadModelsMock).toHaveBeenCalledWith({ scope: 'instructor_open' });
    expect(queryBookingChangeRequestReadModelsMock).toHaveBeenCalledWith({
      scope: 'instructor_open',
    });
  });
});
