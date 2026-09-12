import { act, renderHook, waitFor } from '@testing-library/react';
import { BookingIdSchema, type LessonBookingReadModel } from '@ski-academy/shared-domain';
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

  it('returns a typed refresh failure when the production fetch fails', async () => {
    queryMock
      .mockResolvedValueOnce({ scope: 'admin_hot', items: [], hasMore: false })
      .mockRejectedValueOnce(new Error('read temporarily unavailable'));
    const { result } = renderHook(() =>
      useAdminLessonBookingReadModels({ enabled: true, view: 'hot' })
    );
    await waitFor(() => expect(result.current.list.loading).toBe(false));

    let refreshResult: Awaited<ReturnType<typeof result.current.refreshBooking>> | undefined;
    await act(async () => {
      refreshResult = await result.current.refreshBooking(
        BookingIdSchema.parse('booking_admin_refresh_01')
      );
    });
    expect(refreshResult).toEqual({ status: 'failure' });
    expect(result.current.list.error).toBe('read-failed');
  });

  it('drainAll follows every history page so lifetime KPIs cannot stop at the first page', async () => {
    queryMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as { scope?: string; cursor?: string } | undefined;
      if (input?.scope !== 'admin_history') {
        return { scope: input?.scope ?? 'admin_hot', items: [], hasMore: false };
      }
      if (!input.cursor) {
        return {
          scope: 'admin_history',
          items: [booking('booking_history_01', 1)],
          hasMore: true,
          nextCursor: 'history:2',
        };
      }
      return {
        scope: 'admin_history',
        items: [booking('booking_history_02', 1)],
        hasMore: false,
      };
    });
    const { result } = renderHook(() =>
      useAdminLessonBookingReadModels({ enabled: true, view: 'history', drainAll: true })
    );
    await waitFor(() => expect(result.current.list.loading).toBe(false));
    expect(result.current.list.items.map((item) => item.bookingId).sort()).toEqual([
      'booking_history_01',
      'booking_history_02',
    ]);
    expect(result.current.list.hasMore).toBe(false);
    expect(queryMock.mock.calls.some((call) => call[0]?.scope === 'admin_history' && !call[0]?.cursor)).toBe(
      true
    );
    expect(
      queryMock.mock.calls.some(
        (call) => call[0]?.scope === 'admin_history' && call[0]?.cursor === 'history:2'
      )
    ).toBe(true);
  });
});
