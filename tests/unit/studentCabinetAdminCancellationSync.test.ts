import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import {
  selectLessonBookingItems,
  useLessonBookingStore,
} from '../../src/features/lesson-bookings/lessonBookingStore';
import {
  applyAccountLessonBookingReadResults,
  findStaleHotLessonBookingIds,
  isAccountLessonBookingBackgroundSyncAllowed,
  resetAccountLessonBookingSyncStateForTests,
  syncAccountHotLessonBookingsFromServer,
  syncAccountLessonBookingsFromServer,
} from '../../src/features/lesson-bookings/syncAccountLessonBookings';
import { mapLessonBookingReadModelToCabinetItem } from '../../src/features/lesson-bookings/lessonBookingViewModel';
import { useLessonBookingReadSync } from '../../src/features/lesson-bookings/useLessonBookingReadSync';
import {
  filterSessionsByScope,
  isActiveSessionItem,
} from '../../src/features/course-enrollments/sessionScheduleHelpers';
import { buildMixedCabinetSessionItems } from '../../src/features/course-enrollments/cabinetSessionItems';

const queryLessonBookingReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonBookingReadModelsMock(...args),
}));

function buildReadModel(input: {
  readonly bookingId: string;
  readonly revision: number;
  readonly status: 'confirmed' | 'pending_cancellation' | 'cancelled';
  readonly participantNames?: readonly string[];
}): LessonBookingReadModel {
  const participantId = ParticipantIdSchema.parse('participant_fixture_01');
  const startsAt = timestampFromDate(new Date('2027-06-15T04:00:00.000Z'));
  const endsAt = timestampFromDate(new Date('2027-06-15T06:00:00.000Z'));
  const lifecycle =
    input.status === 'cancelled'
      ? {
          status: 'cancelled' as const,
          cancelledAt: timestampFromDate(new Date('2026-09-10T00:00:00.000Z')),
        }
      : input.status === 'pending_cancellation'
        ? {
            status: 'pending_cancellation' as const,
            requestedAt: timestampFromDate(new Date('2026-09-09T00:00:00.000Z')),
          }
        : { status: 'confirmed' as const };

  return {
    bookingId: BookingIdSchema.parse(input.bookingId),
    revision: input.revision,
    partyKind: 'individual',
    participantIds: [participantId],
    participants: (input.participantNames ?? ['Student']).map((displayName, index) => ({
      participantId: ParticipantIdSchema.parse(`participant_fixture_${index + 1}`),
      displayName,
    })),
    instructor: {
      instructorId: InstructorIdSchema.parse('instructor_fixture_01'),
      displayName: 'Coach',
    },
    occurrence: {
      startsAt,
      endsAt,
      timeZone: 'Asia/Almaty',
      durationMinutes: 120,
    },
    lifecycle,
    bookingOrigin: 'account',
    authorizedActions: {
      canRequestCancellation: input.status === 'confirmed',
      canWithdrawCancellation: input.status === 'pending_cancellation',
      canReschedule: input.status === 'confirmed',
      canCreateChangeRequest: false,
    },
    paymentPresentation: { kind: 'visible', paymentStatus: 'paid', price: 100 },
    updatedAt: timestampFromDate(new Date('2026-09-10T00:00:00.000Z')),
  };
}

describe('Student Cabinet admin cancellation sync (T32.9A.9A)', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
    resetAccountLessonBookingSyncStateForTests();
    queryLessonBookingReadModelsMock.mockReset();
  });

  it('1. pending_cancellation becomes cancelled after admin approval sync without reload', async () => {
    const bookingId = 'booking_admin_cancel_01';
    const pending = buildReadModel({
      bookingId,
      revision: 4,
      status: 'pending_cancellation',
    });
    useLessonBookingStore
      .getState()
      .mergeItems(new Map([[bookingId, mapLessonBookingReadModelToCabinetItem(pending)]]));

    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({ scope: 'account_hot', items: [], hasMore: false })
      .mockResolvedValueOnce({
        scope: 'account_history',
        items: [buildReadModel({ bookingId, revision: 5, status: 'cancelled' })],
        hasMore: false,
      });

    await syncAccountLessonBookingsFromServer();

    const item = useLessonBookingStore.getState().items.get(bookingId);
    expect(item?.status).toBe('cancelled');
    expect(item?.revision).toBe(5);

    const sessions = buildMixedCabinetSessionItems({
      lessonBookings: selectLessonBookingItems(useLessonBookingStore.getState()),
      courseEnrollments: [],
    });
    expect(
      sessions.some((session) => session.kind === 'lesson' && isActiveSessionItem(session))
    ).toBe(false);
  });

  it('2. hard refresh path loads cancelled booking from account_history', async () => {
    const bookingId = 'booking_admin_cancel_refresh';
    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({ scope: 'account_hot', items: [], hasMore: false })
      .mockResolvedValueOnce({
        scope: 'account_history',
        items: [buildReadModel({ bookingId, revision: 5, status: 'cancelled' })],
        hasMore: false,
      });

    renderHook(() => useLessonBookingReadSync(true, 'account_fixture_01', true));

    await waitFor(() => {
      expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
    });

    const item = useLessonBookingStore.getState().items.get(bookingId);
    expect(item?.status).toBe('cancelled');
    expect(item?.revision).toBe(5);
  });

  it('3. admin reject/no_change keeps pending_cancellation from account_hot', async () => {
    const bookingId = 'booking_admin_reject_01';
    useLessonBookingStore
      .getState()
      .mergeItems(
        new Map([
          [
            bookingId,
            mapLessonBookingReadModelToCabinetItem(
              buildReadModel({ bookingId, revision: 4, status: 'pending_cancellation' })
            ),
          ],
        ])
      );

    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: [buildReadModel({ bookingId, revision: 4, status: 'pending_cancellation' })],
        hasMore: false,
      })
      .mockResolvedValueOnce({ scope: 'account_history', items: [], hasMore: false });

    await syncAccountLessonBookingsFromServer();

    expect(useLessonBookingStore.getState().items.get(bookingId)?.status).toBe(
      'pending_cancellation'
    );
  });

  it('4. multi-participant booking sync updates only the cancelled booking', async () => {
    const cancelledId = 'booking_family_cancelled';
    const activeId = 'booking_family_active';
    useLessonBookingStore.getState().mergeItems(
      new Map([
        [
          cancelledId,
          mapLessonBookingReadModelToCabinetItem(
            buildReadModel({
              bookingId: cancelledId,
              revision: 3,
              status: 'pending_cancellation',
              participantNames: ['Child A', 'Child B'],
            })
          ),
        ],
        [
          activeId,
          mapLessonBookingReadModelToCabinetItem(
            buildReadModel({
              bookingId: activeId,
              revision: 2,
              status: 'confirmed',
              participantNames: ['Child C'],
            })
          ),
        ],
      ])
    );

    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: [buildReadModel({ bookingId: activeId, revision: 2, status: 'confirmed' })],
        hasMore: false,
      })
      .mockResolvedValueOnce({
        scope: 'account_history',
        items: [buildReadModel({ bookingId: cancelledId, revision: 4, status: 'cancelled' })],
        hasMore: false,
      });

    await syncAccountLessonBookingsFromServer();

    expect(useLessonBookingStore.getState().items.get(cancelledId)?.status).toBe('cancelled');
    expect(useLessonBookingStore.getState().items.get(activeId)?.status).toBe('confirmed');
  });

  it('5. unrelated bookings in the store are not removed', async () => {
    const targetId = 'booking_target_cancel';
    const unrelatedId = 'booking_unrelated_confirmed';
    useLessonBookingStore.getState().mergeItems(
      new Map([
        [
          targetId,
          mapLessonBookingReadModelToCabinetItem(
            buildReadModel({ bookingId: targetId, revision: 2, status: 'pending_cancellation' })
          ),
        ],
        [
          unrelatedId,
          mapLessonBookingReadModelToCabinetItem(
            buildReadModel({ bookingId: unrelatedId, revision: 1, status: 'confirmed' })
          ),
        ],
      ])
    );

    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: [buildReadModel({ bookingId: unrelatedId, revision: 1, status: 'confirmed' })],
        hasMore: false,
      })
      .mockResolvedValueOnce({
        scope: 'account_history',
        items: [buildReadModel({ bookingId: targetId, revision: 3, status: 'cancelled' })],
        hasMore: false,
      });

    await syncAccountLessonBookingsFromServer();

    expect(useLessonBookingStore.getState().items.has(unrelatedId)).toBe(true);
    expect(useLessonBookingStore.getState().items.get(targetId)?.status).toBe('cancelled');
  });

  it('6. terminal hot booking missing from account_hot is pruned from the active collection', () => {
    const bookingId = 'booking_stale_hot';
    const pending = mapLessonBookingReadModelToCabinetItem(
      buildReadModel({ bookingId, revision: 2, status: 'pending_cancellation' })
    );
    useLessonBookingStore.getState().mergeItems(new Map([[bookingId, pending]]));
    const items = useLessonBookingStore.getState().items;

    expect(findStaleHotLessonBookingIds(items, [])).toEqual([bookingId]);

    applyAccountLessonBookingReadResults({
      hotItems: [],
      historyItems: [],
      reconcileHot: { hasMore: false },
    });

    expect(useLessonBookingStore.getState().items.has(bookingId)).toBe(false);
  });

  it('does not prune non-hot history bookings missing from account_history page 1', () => {
    const bookingId = 'booking_history_page_2';
    useLessonBookingStore
      .getState()
      .mergeItems(
        new Map([
          [
            bookingId,
            mapLessonBookingReadModelToCabinetItem(
              buildReadModel({ bookingId, revision: 1, status: 'cancelled' })
            ),
          ],
        ])
      );

    applyAccountLessonBookingReadResults({
      hotItems: [],
      historyItems: [],
      reconcileHot: { hasMore: false },
    });

    expect(useLessonBookingStore.getState().items.has(bookingId)).toBe(true);
    expect(findStaleHotLessonBookingIds(useLessonBookingStore.getState().items, [])).toEqual([]);
  });

  it('dedupes overlapping background sync requests while one is in flight', async () => {
    let resolveHot: ((value: unknown) => void) | undefined;
    queryLessonBookingReadModelsMock.mockImplementation(
      (input: { scope: 'account_hot' | 'account_history' }) =>
        new Promise((resolve) => {
          if (input.scope === 'account_hot') {
            resolveHot = resolve;
            return;
          }
          resolve({ scope: input.scope, items: [], hasMore: false });
        })
    );

    const first = syncAccountLessonBookingsFromServer();
    const second = syncAccountLessonBookingsFromServer();

    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);

    resolveHot?.({ scope: 'account_hot', items: [], hasMore: false });
    await Promise.all([first, second]);

    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
  });

  it('does not apply a stale lower-revision hot response after a newer merge', () => {
    const bookingId = 'booking_revision_guard';
    useLessonBookingStore
      .getState()
      .mergeItems(
        new Map([
          [
            bookingId,
            mapLessonBookingReadModelToCabinetItem(
              buildReadModel({ bookingId, revision: 5, status: 'cancelled' })
            ),
          ],
        ])
      );

    applyAccountLessonBookingReadResults({
      hotItems: [buildReadModel({ bookingId, revision: 3, status: 'pending_cancellation' })],
      historyItems: [],
      reconcileHot: { hasMore: false },
    });

    expect(useLessonBookingStore.getState().items.get(bookingId)?.status).toBe('cancelled');
    expect(useLessonBookingStore.getState().items.get(bookingId)?.revision).toBe(5);
  });

  it('keeps background sync failures from mutating the store or setting error state', async () => {
    const bookingId = 'booking_sync_failure';
    useLessonBookingStore
      .getState()
      .mergeItems(
        new Map([
          [
            bookingId,
            mapLessonBookingReadModelToCabinetItem(
              buildReadModel({ bookingId, revision: 2, status: 'pending_cancellation' })
            ),
          ],
        ])
      );
    queryLessonBookingReadModelsMock.mockRejectedValueOnce(new Error('network down'));

    await expect(syncAccountLessonBookingsFromServer()).rejects.toThrow('network down');

    expect(useLessonBookingStore.getState().items.has(bookingId)).toBe(true);
    expect(useLessonBookingStore.getState().error).toBeUndefined();
  });

  it('keeps cancelled bookings out of the upcoming session scope after sync', async () => {
    const bookingId = 'booking_upcoming_scope';
    useLessonBookingStore
      .getState()
      .mergeItems(
        new Map([
          [
            bookingId,
            mapLessonBookingReadModelToCabinetItem(
              buildReadModel({ bookingId, revision: 4, status: 'pending_cancellation' })
            ),
          ],
        ])
      );

    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({ scope: 'account_hot', items: [], hasMore: false })
      .mockResolvedValueOnce({
        scope: 'account_history',
        items: [buildReadModel({ bookingId, revision: 5, status: 'cancelled' })],
        hasMore: false,
      });

    await syncAccountLessonBookingsFromServer();

    const sessions = buildMixedCabinetSessionItems({
      lessonBookings: selectLessonBookingItems(useLessonBookingStore.getState()),
      courseEnrollments: [],
    });
    const now = new Date('2026-09-07T00:00:00.000Z');
    expect(filterSessionsByScope(sessions, 'upcoming', now)).toHaveLength(0);
  });
});

describe('account hot pagination reconciliation (Issue 42)', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
    resetAccountLessonBookingSyncStateForTests();
    queryLessonBookingReadModelsMock.mockReset();
  });

  function hotBookings(count: number): LessonBookingReadModel[] {
    return Array.from({ length: count }, (_, index) =>
      buildReadModel({
        bookingId: `booking-${String(index + 1).padStart(2, '0')}`,
        revision: 2,
        status: 'confirmed',
      })
    );
  }

  function seed(items: readonly LessonBookingReadModel[]): void {
    useLessonBookingStore
      .getState()
      .mergeItems(
        new Map(
          items.map((item) => [
            String(item.bookingId),
            mapLessonBookingReadModelToCabinetItem(item),
          ])
        )
      );
  }

  it.each([
    ['hot refresh', syncAccountHotLessonBookingsFromServer],
    ['hot/history command refresh', syncAccountLessonBookingsFromServer],
  ] as const)('%s does not evict bookings 26–40 from a partial first page', async (_, sync) => {
    const items = hotBookings(40);
    seed(items);
    useLessonBookingStore.getState().setLoaded(true);
    queryLessonBookingReadModelsMock.mockImplementation((input: { scope: string }) =>
      Promise.resolve({
        scope: input.scope,
        items: input.scope === 'account_hot' ? items.slice(0, 25) : [],
        hasMore: input.scope === 'account_hot',
        ...(input.scope === 'account_hot' ? { nextCursor: 'page-2' } : {}),
      })
    );

    await sync();

    expect([...useLessonBookingStore.getState().items.keys()]).toEqual(
      items.map((item) => String(item.bookingId))
    );
    expect(useLessonBookingStore.getState().itemsList).toHaveLength(40);
    expect(
      queryLessonBookingReadModelsMock.mock.calls.filter(([input]) => input.scope === 'account_hot')
    ).toEqual([[{ scope: 'account_hot' }]]);
  });

  it.each([24, 25, 26, 40, 41])(
    'preserves valid bookings at the %i-booking boundary',
    async (count) => {
      const items = hotBookings(count);
      const stale = buildReadModel({
        bookingId: 'booking-stale',
        revision: 2,
        status: 'confirmed',
      });
      seed([...items, stale]);
      useLessonBookingStore.getState().setLoaded(true);
      queryLessonBookingReadModelsMock.mockResolvedValueOnce({
        scope: 'account_hot',
        items: items.slice(0, 25),
        hasMore: count > 25,
        ...(count > 25 ? { nextCursor: 'page-2' } : {}),
      });

      await syncAccountHotLessonBookingsFromServer();

      const state = useLessonBookingStore.getState();
      for (const item of items) expect(state.items.has(String(item.bookingId))).toBe(true);
      // Absence from a partial page cannot prove even a truly stale row is stale.
      expect(state.items.has('booking-stale')).toBe(count > 25);
      expect(state.loaded).toBe(true);
      expect(state.hotLoadedAtMs).toBeTypeOf('number');
    }
  );

  it('merges a partial page without pruning and applies newer revisions', () => {
    const items = hotBookings(40);
    seed(items);

    applyAccountLessonBookingReadResults({
      hotItems: items.slice(0, 25).map((item) => ({ ...item, revision: 3 })),
      historyItems: [],
      reconcileHot: { hasMore: true },
    });

    expect(useLessonBookingStore.getState().itemsList).toHaveLength(40);
    expect(useLessonBookingStore.getState().items.get('booking-01')?.revision).toBe(3);
    expect(useLessonBookingStore.getState().items.get('booking-40')?.revision).toBe(2);
  });

  it('removes C when the complete authoritative snapshot contains only A and B', () => {
    const items = ['A', 'B', 'C'].map((bookingId) =>
      buildReadModel({ bookingId, revision: 2, status: 'confirmed' })
    );
    seed(items);

    applyAccountLessonBookingReadResults({
      hotItems: items.slice(0, 2),
      historyItems: [],
      reconcileHot: { hasMore: false },
    });

    expect([...useLessonBookingStore.getState().items.keys()]).toEqual(['A', 'B']);
  });

  it('does not prune earlier pages from a terminal continuation page', () => {
    const items = hotBookings(40);
    seed(items);

    applyAccountLessonBookingReadResults({
      hotItems: items.slice(25),
      historyItems: [],
      reconcileHot: { hasMore: false, cursor: 'page-2' },
    });

    expect(useLessonBookingStore.getState().itemsList).toHaveLength(40);
  });

  it('keeps all 40 bookings and removes a truly stale row from a complete 25+15 snapshot', () => {
    const items = hotBookings(40);
    seed([
      ...items,
      buildReadModel({ bookingId: 'booking-stale', revision: 2, status: 'confirmed' }),
    ]);
    const page1 = { items: items.slice(0, 25), hasMore: true };
    const page2 = { items: items.slice(25), hasMore: false };

    // Only the assembled collection, read from the beginning through exhaustion,
    // may reconcile. Individual continuation pages never authorize cleanup.
    applyAccountLessonBookingReadResults({
      hotItems: [...page1.items, ...page2.items],
      historyItems: [],
      reconcileHot: { hasMore: page2.hasMore },
    });

    expect([...useLessonBookingStore.getState().items.keys()]).toEqual(
      items.map((item) => String(item.bookingId))
    );
    expect(useLessonBookingStore.getState().itemsList).toHaveLength(40);
  });

  it('preserves cached hot bookings when a filtered partial page is empty', () => {
    seed(hotBookings(40));
    applyAccountLessonBookingReadResults({
      hotItems: [],
      historyItems: [],
      reconcileHot: { hasMore: true },
    });
    expect(useLessonBookingStore.getState().itemsList).toHaveLength(40);
  });

  it('does not prune when completeness metadata is omitted', () => {
    seed(hotBookings(40));
    applyAccountLessonBookingReadResults({ hotItems: [], historyItems: [] });
    expect(useLessonBookingStore.getState().itemsList).toHaveLength(40);
  });

  it.each([24, 25, 26, 40, 41, 63, 100])(
    'fresh cabinet load merges all %i hot bookings through the terminal page',
    async (count) => {
      const items = hotBookings(count);
      queryLessonBookingReadModelsMock.mockImplementation((input: { cursor?: string }) => {
        const offset = Number(input.cursor ?? 0);
        return Promise.resolve({
          scope: 'account_hot',
          items: items.slice(offset, offset + 25),
          hasMore: offset + 25 < count,
          ...(offset + 25 < count ? { nextCursor: String(offset + 25) } : {}),
        });
      });

      const { unmount } = renderHook(() => useLessonBookingReadSync(true, 'account_fixture_01'));
      await waitFor(() => expect(useLessonBookingStore.getState().loaded).toBe(true));

      expect([...useLessonBookingStore.getState().items.keys()]).toEqual(
        items.map((item) => String(item.bookingId))
      );
      expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(Math.ceil(count / 25));
      expect(queryLessonBookingReadModelsMock).toHaveBeenNthCalledWith(1, { scope: 'account_hot' });
      for (let offset = 25; offset < count; offset += 25) {
        expect(queryLessonBookingReadModelsMock).toHaveBeenNthCalledWith(offset / 25 + 1, {
          scope: 'account_hot',
          cursor: String(offset),
        });
      }
      expect(useLessonBookingStore.getState().hotLoadedAtMs).toBeTypeOf('number');
      unmount();
    }
  );

  it('initial hot/history sync drains hot pages and preserves existing history', async () => {
    const items = hotBookings(40);
    const history = buildReadModel({ bookingId: 'history', revision: 3, status: 'cancelled' });
    const cachedHistory = buildReadModel({
      bookingId: 'cached-history',
      revision: 2,
      status: 'cancelled',
    });
    seed([cachedHistory]);
    queryLessonBookingReadModelsMock.mockImplementation(
      (input: { scope: string; cursor?: string }) =>
        Promise.resolve({
          scope: input.scope,
          items:
            input.scope === 'account_history'
              ? [history]
              : input.cursor
                ? items.slice(25)
                : items.slice(0, 25),
          hasMore: input.scope === 'account_hot' && !input.cursor,
          ...(input.scope === 'account_hot' && !input.cursor ? { nextCursor: 'page-2' } : {}),
        })
    );
    await syncAccountLessonBookingsFromServer();
    expect(useLessonBookingStore.getState().itemsList).toHaveLength(42);
    expect(useLessonBookingStore.getState().items.has('cached-history')).toBe(true);
    expect(useLessonBookingStore.getState().items.has('history')).toBe(true);
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(3);
  });

  it('continues an empty filtered page while keeping history and earlier hot entries', async () => {
    const history = buildReadModel({ bookingId: 'history', revision: 2, status: 'cancelled' });
    const cachedHot = buildReadModel({ bookingId: 'cached-hot', revision: 8, status: 'confirmed' });
    seed([history, cachedHot]);
    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: [],
        hasMore: true,
        nextCursor: 'page-2',
      })
      .mockResolvedValueOnce({ scope: 'account_hot', items: hotBookings(8), hasMore: false });
    await syncAccountHotLessonBookingsFromServer();
    expect(useLessonBookingStore.getState().itemsList).toHaveLength(10);
    expect(useLessonBookingStore.getState().items.has('cached-hot')).toBe(true);
    expect(useLessonBookingStore.getState().items.has('history')).toBe(true);
    expect(useLessonBookingStore.getState().loaded).toBe(true);
    expect(queryLessonBookingReadModelsMock).toHaveBeenNthCalledWith(2, {
      scope: 'account_hot',
      cursor: 'page-2',
    });
  });

  it('deduplicates pages and preserves a newer revision received during continuation', async () => {
    const first = hotBookings(25);
    let resolvePage!: (value: unknown) => void;
    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: first,
        hasMore: true,
        nextCursor: 'page-2',
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePage = resolve;
          })
      );
    const request = syncAccountHotLessonBookingsFromServer();
    await waitFor(() => expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2));
    expect(useLessonBookingStore.getState().itemsList).toHaveLength(25);
    expect(useLessonBookingStore.getState().loaded).toBe(false);
    expect(useLessonBookingStore.getState().hotLoadedAtMs).toBeUndefined();
    const newer = buildReadModel({
      bookingId: 'booking-delayed',
      revision: 8,
      status: 'confirmed',
    });
    applyAccountLessonBookingReadResults({ hotItems: [newer], historyItems: [] });
    resolvePage({
      scope: 'account_hot',
      items: [
        { ...first[0], revision: 3 },
        buildReadModel({ bookingId: 'booking-delayed', revision: 7, status: 'confirmed' }),
      ],
      hasMore: false,
    });
    await request;
    expect(useLessonBookingStore.getState().itemsList).toHaveLength(26);
    expect(useLessonBookingStore.getState().items.get(String(first[0].bookingId))?.revision).toBe(
      3
    );
    expect(useLessonBookingStore.getState().items.get('booking-delayed')?.revision).toBe(8);
  });

  it('preserves the cached presentation for equal revisions across pages', async () => {
    const first = hotBookings(1)[0];
    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: [first],
        hasMore: true,
        nextCursor: 'page-2',
      })
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: [{ ...first, notes: 'equal-revision incoming' }],
        hasMore: false,
      });
    await syncAccountHotLessonBookingsFromServer();
    expect(useLessonBookingStore.getState().itemsList).toHaveLength(1);
    expect(
      useLessonBookingStore.getState().items.get(String(first.bookingId))?.notes
    ).toBeUndefined();
  });

  it.each([
    ['account switch', false],
    ['account switch', true],
    ['logout/reset', false],
    ['logout/reset', true],
  ] as const)('ignores late continuation after %s (failure=%s)', async (scenario, failure) => {
    let resolvePage!: (value: unknown) => void;
    let rejectPage!: (error: Error) => void;
    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: hotBookings(25),
        hasMore: true,
        nextCursor: 'page-2',
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolvePage = resolve;
            rejectPage = reject;
          })
      )
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: [buildReadModel({ bookingId: 'new-account', revision: 2, status: 'confirmed' })],
        hasMore: false,
      });
    const { unmount } = renderHook(() => useLessonBookingReadSync(true, 'account_A'));
    await waitFor(() => expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2));
    useLessonBookingStore.getState().reset();
    if (scenario === 'account switch') {
      await syncAccountHotLessonBookingsFromServer();
      useLessonBookingStore.getState().setHotLoading(true);
    }
    const stateAfterReset = useLessonBookingStore.getState();
    await act(async () => {
      if (failure) {
        rejectPage(new Error('old account continuation failed'));
      } else {
        resolvePage({
          scope: 'account_hot',
          items: hotBookings(40).slice(25),
          hasMore: true,
          nextCursor: 'page-3',
        });
      }
    });
    expect(useLessonBookingStore.getState()).toBe(stateAfterReset);
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(
      scenario === 'account switch' ? 3 : 2
    );
    unmount();
  });

  it.each(['missing', 'repeated', 'cycle'])(
    'rejects %s continuation cursors without marking the partial load complete',
    async (kind) => {
      queryLessonBookingReadModelsMock.mockResolvedValueOnce({
        scope: 'account_hot',
        items: hotBookings(1),
        hasMore: true,
        ...(kind !== 'missing' ? { nextCursor: 'page-2' } : {}),
      });
      if (kind === 'repeated') {
        queryLessonBookingReadModelsMock.mockResolvedValueOnce({
          scope: 'account_hot',
          items: [],
          hasMore: true,
          nextCursor: 'page-2',
        });
      } else if (kind === 'cycle') {
        queryLessonBookingReadModelsMock
          .mockResolvedValueOnce({
            scope: 'account_hot',
            items: [],
            hasMore: true,
            nextCursor: 'page-3',
          })
          .mockResolvedValueOnce({
            scope: 'account_hot',
            items: [],
            hasMore: true,
            nextCursor: 'page-2',
          });
      }
      await expect(syncAccountHotLessonBookingsFromServer()).rejects.toThrow(
        'Invalid lesson Booking hot pagination cursor.'
      );
      expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(
        kind === 'missing' ? 1 : kind === 'repeated' ? 2 : 3
      );
      expect(useLessonBookingStore.getState().loaded).toBe(false);
      expect(useLessonBookingStore.getState().hotLoadedAtMs).toBeUndefined();
      expect(useLessonBookingStore.getState().itemsList).toHaveLength(1);
      queryLessonBookingReadModelsMock.mockResolvedValueOnce({
        scope: 'account_hot',
        items: hotBookings(1),
        hasMore: false,
      });
      await syncAccountHotLessonBookingsFromServer();
      expect(useLessonBookingStore.getState().loaded).toBe(true);
    }
  );

  it('retries a failed continuation from the beginning and shares the initial in-flight drain', async () => {
    let rejectPage!: (reason: Error) => void;
    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: hotBookings(25),
        hasMore: true,
        nextCursor: 'page-2',
      })
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectPage = reject;
          })
      );
    const first = syncAccountHotLessonBookingsFromServer();
    const second = syncAccountHotLessonBookingsFromServer();
    await waitFor(() => expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2));
    rejectPage(new Error('continuation failed'));
    await expect(first).rejects.toThrow('continuation failed');
    await expect(second).rejects.toThrow('continuation failed');
    expect(useLessonBookingStore.getState().loaded).toBe(false);
    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: hotBookings(40).slice(0, 25),
        hasMore: true,
        nextCursor: 'page-2',
      })
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: hotBookings(40).slice(25),
        hasMore: false,
      });
    await syncAccountHotLessonBookingsFromServer();
    expect(useLessonBookingStore.getState().itemsList).toHaveLength(40);
    expect(queryLessonBookingReadModelsMock).toHaveBeenNthCalledWith(3, { scope: 'account_hot' });
  });

  it('an invalidated hot surface preserves cached bookings beyond the first page', async () => {
    const items = hotBookings(40);
    seed(items);
    useLessonBookingStore.getState().setLoaded(true);
    useLessonBookingStore.getState().setHotLoadedAtMs(Date.now());
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    queryLessonBookingReadModelsMock.mockResolvedValueOnce({
      scope: 'account_hot',
      items: items.slice(0, 25),
      hasMore: true,
      nextCursor: 'page-2',
    });
    const { unmount } = renderHook(() => useLessonBookingReadSync(true, 'account_fixture_01'));
    expect(queryLessonBookingReadModelsMock).not.toHaveBeenCalled();

    useLessonBookingStore.getState().markHotStale();
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() =>
      expect(useLessonBookingStore.getState().hotLoadedAtMs).toBeTypeOf('number')
    );

    expect(useLessonBookingStore.getState().itemsList).toHaveLength(40);
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it.each([
    ['hot refresh', syncAccountHotLessonBookingsFromServer],
    ['hot/history command refresh', syncAccountLessonBookingsFromServer],
  ] as const)('%s ignores an old complete snapshot after account reset/logout', async (_, sync) => {
    let resolveHot!: (value: unknown) => void;
    queryLessonBookingReadModelsMock.mockImplementation((input: { scope: string }) =>
      input.scope === 'account_hot'
        ? new Promise((resolve) => {
            resolveHot = resolve;
          })
        : Promise.resolve({ scope: input.scope, items: [], hasMore: false })
    );
    const oldItems = hotBookings(2);
    seed(oldItems);
    const request = sync();
    useLessonBookingStore.getState().reset();
    const newItem = buildReadModel({
      bookingId: 'booking-new-account',
      revision: 2,
      status: 'confirmed',
    });
    seed([newItem]);

    resolveHot({ scope: 'account_hot', items: oldItems, hasMore: false });
    await request;

    expect([...useLessonBookingStore.getState().items.keys()]).toEqual(['booking-new-account']);
    expect(useLessonBookingStore.getState().loaded).toBe(false);
  });
});

describe('Student Cabinet background sync safety', () => {
  beforeEach(() => {
    resetAccountLessonBookingSyncStateForTests();
  });

  it('skips background sync while the document is hidden', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    expect(isAccountLessonBookingBackgroundSyncAllowed()).toBe(false);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    expect(isAccountLessonBookingBackgroundSyncAllowed()).toBe(true);
  });

  it('clears visibility listener on unmount and never registers a 30s poll', async () => {
    queryLessonBookingReadModelsMock.mockResolvedValue({
      scope: 'account_hot',
      items: [],
      hasMore: false,
    });
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const setIntervalSpy = vi.spyOn(window, 'setInterval');

    const { unmount } = renderHook(() => useLessonBookingReadSync(true, 'account_fixture_01'));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(setIntervalSpy.mock.calls.some((call) => call[1] === 30_000)).toBe(false);

    addSpy.mockRestore();
    removeSpy.mockRestore();
    setIntervalSpy.mockRestore();
  });
});
