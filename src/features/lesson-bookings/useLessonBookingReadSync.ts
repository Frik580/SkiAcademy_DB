import { useCallback, useEffect, useRef } from 'react';
import { BookingIdSchema } from '@ski-academy/shared-domain/canonical/identifiers';
import { queryLessonBookingReadModels } from '../../lib/canonical/canonicalReadModelClient';
import { useLessonBookingStore } from './lessonBookingStore';
import { useAuthStore } from '../auth/authStore';
import { mergeLessonBookingRecords } from './lessonBookingViewModel';
import { readGuestBookingCredential } from './guestCredentialStorage';
import {
  ACCOUNT_LESSON_BOOKING_FRESH_MS,
  isAccountLessonBookingBackgroundSyncAllowed,
  isAccountLessonHotFresh,
  syncAccountHotLessonBookingsFromServer,
} from './syncAccountLessonBookings';

export async function reloadAccountHotLessonBookings(): Promise<void> {
  const { syncGeneration, hotLoading } = useLessonBookingStore.getState();
  if (hotLoading) return;
  useLessonBookingStore.setState({ hotLoading: true, error: undefined });
  try {
    await syncAccountHotLessonBookingsFromServer();
  } catch (error) {
    if (useLessonBookingStore.getState().syncGeneration === syncGeneration) {
      useLessonBookingStore
        .getState()
        .setError(error instanceof Error ? error.message : 'Failed to load bookings.');
    }
  } finally {
    if (useLessonBookingStore.getState().syncGeneration === syncGeneration) {
      useLessonBookingStore.getState().setHotLoading(false);
    }
  }
}

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
  const historyEntry = useRef<{ accountId?: string; enabled: boolean; attempted: boolean }>();
  const lastHistoryRequest = useRef(historyRequestNonce);

  const ensureHot = useCallback(async () => {
    if (!hotEnabled || !accountId) return;
    const state = useLessonBookingStore.getState();
    if (isAccountLessonHotFresh(state)) return;
    await reloadAccountHotLessonBookings();
  }, [accountId, hotEnabled]);

  const loadHistoryPage = useCallback(
    async (refresh = false) => {
      if (!enabled || !accountId) return;
      const state = useLessonBookingStore.getState();
      if (state.historyLoading || (!refresh && !state.historyHasMore)) return;
      const syncGeneration = state.syncGeneration;
      const cursor = refresh ? undefined : state.historyCursor;
      const isFirstPage = cursor === undefined;
      useLessonBookingStore.setState({ historyLoading: true, historyError: undefined });
      try {
        const result = await queryLessonBookingReadModels({
          scope: 'account_history',
          ...(cursor ? { cursor } : {}),
        });
        if (useLessonBookingStore.getState().syncGeneration !== syncGeneration) return;
        const merged = mergeLessonBookingRecords(new Map(), result.items);
        useLessonBookingStore.getState().mergeItems(merged);
        useLessonBookingStore.getState().setHistoryCursor(result.nextCursor);
        useLessonBookingStore.getState().setHistoryHasMore(result.hasMore);
        useLessonBookingStore.getState().setHistoryInitialized(true);
        if (isFirstPage) {
          useLessonBookingStore.getState().setHistoryLoadedAtMs(Date.now());
        }
      } catch (error) {
        if (useLessonBookingStore.getState().syncGeneration !== syncGeneration) return;
        useLessonBookingStore.getState().setHistoryError({
          firstPage: isFirstPage,
          message: error instanceof Error ? error.message : 'Failed to load booking history.',
        });
      } finally {
        if (useLessonBookingStore.getState().syncGeneration === syncGeneration) {
          useLessonBookingStore.getState().setHistoryLoading(false);
        }
      }
    },
    [accountId, enabled]
  );

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
    const active = enabled && historyEnabled;
    if (historyEntry.current?.accountId !== accountId || historyEntry.current?.enabled !== active) {
      historyEntry.current = { accountId, enabled: active, attempted: false };
    }
    if (!active || !accountId) return;
    const state = useLessonBookingStore.getState();
    if (state.historyLoading || historyEntry.current?.attempted) return;
    historyEntry.current = { accountId, enabled: active, attempted: true };
    const historyIsFresh =
      state.historyInitialized &&
      state.historyLoadedAtMs !== undefined &&
      Date.now() - state.historyLoadedAtMs < ACCOUNT_LESSON_BOOKING_FRESH_MS;
    if (historyIsFresh) return;
    void loadHistoryPage(true);
  }, [accountId, enabled, historyEnabled, historyLoading, loadHistoryPage]);

  useEffect(() => {
    if (lastHistoryRequest.current === historyRequestNonce) return;
    lastHistoryRequest.current = historyRequestNonce;
    if (!enabled || !accountId || !historyEnabled || historyRequestNonce === 0) return;
    void loadHistoryPage(useLessonBookingStore.getState().historyError?.firstPage);
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
      void reloadAccountHotLessonBookings();
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

  return { reloadHot: () => (accountId ? reloadAccountHotLessonBookings() : Promise.resolve()) };
}

export async function loadGuestSingleLessonBooking(bookingId: string) {
  const { authGeneration } = useAuthStore.getState();
  const stored = readGuestBookingCredential(bookingId);
  if (!stored.credential) {
    throw new Error(stored.error ?? 'missing');
  }
  const result = await queryLessonBookingReadModels({
    scope: 'guest_single',
    bookingId: BookingIdSchema.parse(bookingId),
    guestActionNonce: stored.credential.nonce,
    guestActionSignature: stored.credential.signature,
    ...(stored.credential.statusCredential
      ? {
          guestStatusNonce: stored.credential.statusCredential.nonce,
          guestStatusSignature: stored.credential.statusCredential.signature,
          guestStatusExpiresAt: stored.credential.statusCredential.expiresAt,
        }
      : {}),
  });
  if (useAuthStore.getState().authGeneration !== authGeneration) {
    throw new Error('Session changed while loading the guest booking.');
  }
  if (result.items.length === 0) {
    throw new Error('Guest booking read model was not found.');
  }
  const merged = mergeLessonBookingRecords(new Map(), result.items);
  useLessonBookingStore.getState().mergeItems(merged);
  return result.items[0];
}

export { requireSchoolTimeZone as resolveLessonBookingTimezone } from '../settings/schoolTimeZone';
