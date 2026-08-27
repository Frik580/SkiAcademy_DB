import { useCallback, useEffect } from 'react';
import { BookingIdSchema } from '@ski-academy/shared-domain';
import { queryLessonBookingReadModels } from '../../lib/canonical/canonicalReadModelClient';
import { useLessonBookingStore } from './lessonBookingStore';
import { mergeLessonBookingRecords } from './lessonBookingViewModel';
import { readGuestBookingCredential } from './guestCredentialStorage';

const DEFAULT_TIMEZONE = 'Asia/Almaty';

export function useLessonBookingReadSync(enabled: boolean, accountId: string | undefined) {
  const historyRequestNonce = useLessonBookingStore((state) => state.historyRequestNonce);

  const loadHot = useCallback(async () => {
    if (!enabled || !accountId) return;
    useLessonBookingStore.getState().setHotLoading(true);
    useLessonBookingStore.getState().setError(undefined);
    try {
      const result = await queryLessonBookingReadModels({ scope: 'account_hot' });
      const merged = mergeLessonBookingRecords(
        useLessonBookingStore.getState().items,
        result.items
      );
      useLessonBookingStore.getState().mergeItems(merged);
      useLessonBookingStore.getState().setLoaded(true);
    } catch (error) {
      useLessonBookingStore
        .getState()
        .setError(error instanceof Error ? error.message : 'Failed to load bookings.');
    } finally {
      useLessonBookingStore.getState().setHotLoading(false);
    }
  }, [accountId, enabled]);

  const loadHistoryPage = useCallback(async () => {
    if (!enabled || !accountId) return;
    const state = useLessonBookingStore.getState();
    if (state.historyLoading || !state.historyHasMore) return;
    useLessonBookingStore.getState().setHistoryLoading(true);
    try {
      const result = await queryLessonBookingReadModels({
        scope: 'account_history',
        cursor: state.historyCursor,
      });
      const merged = mergeLessonBookingRecords(state.items, result.items);
      useLessonBookingStore.getState().mergeItems(merged);
      useLessonBookingStore.getState().setHistoryCursor(result.nextCursor);
      useLessonBookingStore.getState().setHistoryHasMore(result.hasMore);
    } catch (error) {
      useLessonBookingStore
        .getState()
        .setError(error instanceof Error ? error.message : 'Failed to load booking history.');
    } finally {
      useLessonBookingStore.getState().setHistoryLoading(false);
    }
  }, [accountId, enabled]);

  useEffect(() => {
    if (!enabled || !accountId) {
      useLessonBookingStore.getState().reset();
      return;
    }
    useLessonBookingStore.getState().reset();
    void loadHot().then(() => loadHistoryPage());
  }, [accountId, enabled, loadHot, loadHistoryPage]);

  useEffect(() => {
    if (!enabled || !accountId) return;
    void loadHistoryPage();
  }, [historyRequestNonce, enabled, accountId, loadHistoryPage]);

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
