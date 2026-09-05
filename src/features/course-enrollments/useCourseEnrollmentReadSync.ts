import { useCallback, useEffect } from 'react';
import { CourseEnrollmentIdSchema } from '@ski-academy/shared-domain';
import {
  queryCourseCatalogReadModels,
  queryCourseEnrollmentReadModels,
} from '../../lib/canonical/canonicalReadModelClient';
import { useCourseEnrollmentStore } from './courseEnrollmentStore';
import { mergeCatalogRecords, mergeCourseEnrollmentRecords } from './courseEnrollmentViewModel';
import { readGuestCourseEnrollmentCredential } from './guestCourseEnrollmentCredentialStorage';

async function loadPublicCourseCatalog(): Promise<void> {
  useCourseEnrollmentStore.getState().setCatalogLoading(true);
  try {
    const result = await queryCourseCatalogReadModels({ scope: 'public' });
    const merged = mergeCatalogRecords(
      useCourseEnrollmentStore.getState().catalogByCourseId,
      result.items
    );
    useCourseEnrollmentStore.getState().mergeCatalog(merged);
  } catch (error) {
    useCourseEnrollmentStore
      .getState()
      .setError(error instanceof Error ? error.message : 'Failed to load course catalog.');
  } finally {
    useCourseEnrollmentStore.getState().setCatalogLoading(false);
  }
}

/**
 * Account course enrollment sync. Public catalog ownership lives in
 * `useCourseCatalogReadSync` so cabinet mount issues one catalog callable.
 */
export function useCourseEnrollmentReadSync(enabled: boolean, accountId: string | undefined) {
  const historyRequestNonce = useCourseEnrollmentStore((state) => state.historyRequestNonce);

  const loadHot = useCallback(async () => {
    if (!enabled || !accountId) return;
    useCourseEnrollmentStore.getState().setHotLoading(true);
    useCourseEnrollmentStore.getState().setError(undefined);
    try {
      const result = await queryCourseEnrollmentReadModels({ scope: 'account_hot' });
      const merged = mergeCourseEnrollmentRecords(
        useCourseEnrollmentStore.getState().items,
        result
      );
      useCourseEnrollmentStore.getState().mergeItems(merged);
      useCourseEnrollmentStore.getState().setLoaded(true);
    } catch (error) {
      useCourseEnrollmentStore
        .getState()
        .setError(error instanceof Error ? error.message : 'Failed to load course enrollments.');
    } finally {
      useCourseEnrollmentStore.getState().setHotLoading(false);
    }
  }, [accountId, enabled]);

  const loadHistoryPage = useCallback(async () => {
    if (!enabled || !accountId) return;
    const state = useCourseEnrollmentStore.getState();
    if (state.historyLoading || !state.historyHasMore) return;
    useCourseEnrollmentStore.getState().setHistoryLoading(true);
    try {
      const result = await queryCourseEnrollmentReadModels({
        scope: 'account_history',
        ...(state.historyCursor ? { cursor: state.historyCursor } : {}),
      });
      const merged = mergeCourseEnrollmentRecords(state.items, result);
      useCourseEnrollmentStore.getState().mergeItems(merged);
      useCourseEnrollmentStore.getState().setHistoryCursor(result.nextCursor);
      useCourseEnrollmentStore.getState().setHistoryHasMore(result.hasMore);
    } catch (error) {
      useCourseEnrollmentStore
        .getState()
        .setError(
          error instanceof Error ? error.message : 'Failed to load course enrollment history.'
        );
    } finally {
      useCourseEnrollmentStore.getState().setHistoryLoading(false);
    }
  }, [accountId, enabled]);

  useEffect(() => {
    if (!enabled || !accountId) {
      useCourseEnrollmentStore.getState().reset();
      return;
    }
    useCourseEnrollmentStore.getState().reset();
    void loadHot().then(() => loadHistoryPage());
  }, [accountId, enabled, loadHot, loadHistoryPage]);

  useEffect(() => {
    // Initial history page is chained after hot load; nonce 0 would duplicate that request.
    if (!enabled || !accountId || historyRequestNonce === 0) return;
    void loadHistoryPage();
  }, [historyRequestNonce, enabled, accountId, loadHistoryPage]);

  return { reloadHot: loadHot, reloadCatalog: loadPublicCourseCatalog };
}

export async function loadGuestSingleCourseEnrollment(enrollmentId: string) {
  const stored = readGuestCourseEnrollmentCredential(enrollmentId);
  if (!stored.credential) {
    throw new Error(stored.error ?? 'missing');
  }
  const result = await queryCourseEnrollmentReadModels({
    scope: 'guest_single',
    enrollmentId: CourseEnrollmentIdSchema.parse(enrollmentId),
    guestActionNonce: stored.credential.nonce,
    guestActionSignature: stored.credential.signature,
  });
  if (result.items.length === 0) {
    throw new Error('Guest course enrollment read model was not found.');
  }
  const merged = mergeCourseEnrollmentRecords(new Map(), result);
  useCourseEnrollmentStore.getState().mergeItems(merged);
  return result.items[0];
}

/** Sole mount-time owner of the public course catalog read for `/` and `/cabinet*`. */
export function useCourseCatalogReadSync(enabled: boolean) {
  const loadCatalog = useCallback(async () => {
    if (!enabled) return;
    await loadPublicCourseCatalog();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void loadCatalog();
  }, [enabled, loadCatalog]);

  return { reloadCatalog: loadCatalog };
}
