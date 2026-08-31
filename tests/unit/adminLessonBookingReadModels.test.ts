import { act, renderHook, waitFor } from '@testing-library/react';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryMock(...args),
}));

import { useAdminLessonBookingReadModels } from '../../src/features/admin/lesson-bookings';

function booking(id: string, revision: number): LessonBookingReadModel {
  return {
    bookingId: id,
    revision,
    updatedAt: { seconds: revision, nanoseconds: 0 },
  } as unknown as LessonBookingReadModel;
}

describe('useAdminLessonBookingReadModels', () => {
  beforeEach(() => queryMock.mockReset());

  it('paginates with the server cursor and keeps the newest revision', async () => {
    queryMock
      .mockResolvedValueOnce({
        scope: 'admin_hot',
        items: [booking('booking_admin_read_01', 1)],
        nextCursor: 'server-cursor',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        scope: 'admin_hot',
        items: [booking('booking_admin_read_01', 2), booking('booking_admin_read_02', 1)],
        hasMore: false,
      });

    const { result } = renderHook(() =>
      useAdminLessonBookingReadModels({ enabled: true, view: 'hot' })
    );
    await waitFor(() => expect(result.current.list.items).toHaveLength(1));
    await act(async () => {
      await result.current.loadMore();
    });

    expect(queryMock).toHaveBeenLastCalledWith({
      scope: 'admin_hot',
      cursor: 'server-cursor',
    });
    expect(result.current.list.items.map((item) => [item.bookingId, item.revision])).toEqual([
      ['booking_admin_read_01', 2],
      ['booking_admin_read_02', 1],
    ]);
  });

  it('ignores an obsolete list response after the view changes', async () => {
    let resolveHot!: (value: unknown) => void;
    queryMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveHot = resolve;
          })
      )
      .mockResolvedValueOnce({
        scope: 'admin_history',
        items: [booking('booking_admin_history_new', 3)],
        hasMore: false,
      });

    const { result, rerender } = renderHook(
      ({ view }: { view: 'hot' | 'history' }) =>
        useAdminLessonBookingReadModels({ enabled: true, view }),
      { initialProps: { view: 'hot' as const } }
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    rerender({ view: 'history' });
    await waitFor(() =>
      expect(result.current.list.items[0]?.bookingId).toBe('booking_admin_history_new')
    );

    await act(async () => {
      resolveHot({
        scope: 'admin_hot',
        items: [booking('booking_admin_obsolete', 1)],
        hasMore: false,
      });
      await Promise.resolve();
    });
    expect(result.current.list.items[0]?.bookingId).toBe('booking_admin_history_new');
  });

  it('reports permission denial and supports retry', async () => {
    queryMock
      .mockRejectedValueOnce({ code: 'functions/permission-denied' })
      .mockResolvedValueOnce({ scope: 'admin_hot', items: [], hasMore: false });
    const { result } = renderHook(() =>
      useAdminLessonBookingReadModels({ enabled: true, view: 'hot' })
    );
    await waitFor(() => expect(result.current.list.error).toBe('permission-denied'));
    await act(async () => {
      await result.current.retryList();
    });
    expect(result.current.list).toMatchObject({
      items: [],
      loading: false,
      hasMore: false,
    });
  });
});
