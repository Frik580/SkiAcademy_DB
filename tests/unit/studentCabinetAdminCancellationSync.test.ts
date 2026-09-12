import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
      reconcileHot: true,
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
      reconcileHot: true,
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
      reconcileHot: true,
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

  it('clears polling interval and visibility listener on unmount', async () => {
    queryLessonBookingReadModelsMock.mockResolvedValue({
      scope: 'account_hot',
      items: [],
      hasMore: false,
    });
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

    const { unmount } = renderHook(() => useLessonBookingReadSync(true, 'account_fixture_01'));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(clearIntervalSpy).toHaveBeenCalled();

    addSpy.mockRestore();
    removeSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
