import { useCallback, useEffect } from 'react';
import { BookingIdSchema } from '@ski-academy/shared-domain';
import { queryLessonBookingReadModels } from '../../lib/canonical/canonicalReadModelClient';
import { useLessonBookingStore } from './lessonBookingStore';
import { mergeLessonBookingRecords } from './lessonBookingViewModel';
import { readGuestBookingCredential } from './guestCredentialStorage';
import {
  ACCOUNT_LESSON_BOOKING_FRESH_MS,
  isAccountLessonBookingBackgroundSyncAllowed,
  isAccountLessonHotFresh,
  syncAccountHotLessonBookingsFromServer,
} from './syncAccountLessonBookings';

const DEFAULT_TIMEZONE = 'Asia/Almaty';

/**
 * Account lesson read sync.
 *
 * - `hotEnabled`: surface that renders current/upcoming lessons — ensure + visibility refresh.
 * - `historyEnabled`: history-owning surface (`/cabinet/history`, `/cabinet/profile_journey`)
 *   — account_history pagination only.
 * - No 30s polling. Mutations invalidate via deliberate refetch.
 */
export function useLessonBookingReadSync(
  enabled: boolean,
  accountId: string | undefined,
  historyEnabled = false,
  hotEnabled = enabled
) {
  const historyRequestNonce = useLessonBookingStore((state) => state.historyRequestNonce);
  const historyLoading = useLessonBookingStore((state) => state.historyLoading);

  const loadHot = useCallback(async () => {
    if (!accountId) return;
    useLessonBookingStore.getState().setHotLoading(true);
    useLessonBookingStore.getState().setError(undefined);
    try {
      await syncAccountHotLessonBookingsFromServer();
    } catch (error) {
      useLessonBookingStore
        .getState()
        .setError(error instanceof Error ? error.message : 'Failed to load bookings.');
    } finally {
      useLessonBookingStore.getState().setHotLoading(false);
    }
  }, [accountId]);

  const ensureHot = useCallback(async () => {
    if (!hotEnabled || !accountId) return;
    const state = useLessonBookingStore.getState();
    if (state.hotLoading) return;
    if (isAccountLessonHotFresh(state)) return;
    await loadHot();
  }, [accountId, hotEnabled, loadHot]);

  const loadHistoryPage = useCallback(async () => {
    if (!enabled || !accountId) return;
    const state = useLessonBookingStore.getState();
    if (state.historyLoading || !state.historyHasMore) return;
    const syncGeneration = state.syncGeneration;
    const isFirstPage = state.historyCursor === undefined;
    useLessonBookingStore.getState().setHistoryLoading(true);
    try {
      const result = await queryLessonBookingReadModels({
        scope: 'account_history',
        ...(state.historyCursor ? { cursor: state.historyCursor } : {}),
      });
      if (useLessonBookingStore.getState().syncGeneration !== syncGeneration) return;
      const merged = mergeLessonBookingRecords(state.items, result.items);
      useLessonBookingStore.getState().mergeItems(merged);
      useLessonBookingStore.getState().setHistoryCursor(result.nextCursor);
      useLessonBookingStore.getState().setHistoryHasMore(result.hasMore);
      useLessonBookingStore.getState().setHistoryInitialized(true);
      if (isFirstPage) {
        useLessonBookingStore.getState().setHistoryLoadedAtMs(Date.now());
      }
    } catch (error) {
      if (useLessonBookingStore.getState().syncGeneration !== syncGeneration) return;
      useLessonBookingStore
        .getState()
        .setError(error instanceof Error ? error.message : 'Failed to load booking history.');
    } finally {
      if (useLessonBookingStore.getState().syncGeneration === syncGeneration) {
        useLessonBookingStore.getState().setHistoryLoading(false);
      }
    }
  }, [accountId, enabled]);

  // Reset only on account change / sign-out — never when leaving a hot surface.
  useEffect(() => {
    if (!accountId) {
      useLessonBookingStore.getState().reset();
    }
  }, [accountId]);

  useEffect(() => {
    void ensureHot();
  }, [ensureHot]);

  useEffect(() => {
    if (!enabled || !accountId || !historyEnabled) return;
    const state = useLessonBookingStore.getState();
    if (state.historyLoading) return;
    const historyIsFresh =
      state.historyInitialized &&
      state.historyLoadedAtMs !== undefined &&
      Date.now() - state.historyLoadedAtMs < ACCOUNT_LESSON_BOOKING_FRESH_MS;
    if (historyIsFresh) return;
    if (state.historyInitialized) {
      state.resetHistoryPagination();
    }
    void loadHistoryPage();
  }, [accountId, enabled, historyEnabled, historyLoading, loadHistoryPage]);

  useEffect(() => {
    if (!enabled || !accountId || !historyEnabled || historyRequestNonce === 0) return;
    void loadHistoryPage();
  }, [historyRequestNonce, enabled, accountId, historyEnabled, loadHistoryPage]);

  useEffect(() => {
    if (!hotEnabled || !accountId) return;

    const refreshIfStale = () => {
      if (!isAccountLessonBookingBackgroundSyncAllowed()) {
        return;
      }
      if (isAccountLessonHotFresh(useLessonBookingStore.getState())) {
        return;
      }
      void syncAccountHotLessonBookingsFromServer().catch(() => undefined);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshIfStale();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [accountId, hotEnabled]);

  return { reloadHot: loadHot };
}

export async function loadGuestSingleLessonBooking(bookingId: string) {
  const stored = readGuestBookingCredential(bookingId);
  if (!stored.credential) {
    throw new Error(stored.error ?? 'missing');
  }
  const result = await queryLessonBookingReadModels({
    scope: 'guest_single',
    bookingId: BookingIdSchema.parse(bookingId),
    guestActionNonce: stored.credential.nonce,
    guestActionSignature: stored.credential.signature,
  });
  if (result.items.length === 0) {
    throw new Error('Guest booking read model was not found.');
  }
  const merged = mergeLessonBookingRecords(new Map(), result.items);
  useLessonBookingStore.getState().mergeItems(merged);
  return result.items[0];
}

export function resolveLessonBookingTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}
