import { useCallback, useEffect } from 'react';
import { CourseEnrollmentIdSchema, ParticipantIdSchema } from '@ski-academy/shared-domain';
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

function finishScopedHotLoad(participantId: string, generation: number): boolean {
  const state = useCourseEnrollmentStore.getState();
  if (state.loadGeneration !== generation || state.scopedParticipantId !== participantId) {
    return false;
  }
  useCourseEnrollmentStore.getState().setHotLoading(false);
  return true;
}

function finishScopedHistoryLoad(participantId: string, generation: number): boolean {
  const state = useCourseEnrollmentStore.getState();
  if (state.loadGeneration !== generation || state.scopedParticipantId !== participantId) {
    return false;
  }
  useCourseEnrollmentStore.getState().setHistoryLoading(false);
  return true;
}

/**
 * Account course enrollment sync. Public catalog ownership lives in
 * `useCourseCatalogReadSync` so cabinet mount issues one catalog callable.
 * Student surfaces pass authorized `selectedParticipantId` so the store never
 * hydrates sibling enrollments.
 */
export function useCourseEnrollmentReadSync(
  enabled: boolean,
  accountId: string | undefined,
  selectedParticipantId?: string
) {
  const historyRequestNonce = useCourseEnrollmentStore((state) => state.historyRequestNonce);

  const loadHot = useCallback(async (participantId: string, generation: number) => {
    useCourseEnrollmentStore.getState().setError(undefined);
    try {
      const result = await queryCourseEnrollmentReadModels({
        scope: 'account_hot',
        selectedParticipantId: ParticipantIdSchema.parse(participantId),
      });
      const merged = mergeCourseEnrollmentRecords(new Map(), result);
      const applied = useCourseEnrollmentStore.getState().applyScopedItems({
        participantId,
        generation,
        incoming: merged,
        mode: 'replace',
      });
      if (applied) {
        useCourseEnrollmentStore.getState().setLoaded(true);
      }
      return applied;
    } catch (error) {
      const state = useCourseEnrollmentStore.getState();
      if (state.loadGeneration === generation && state.scopedParticipantId === participantId) {
        useCourseEnrollmentStore
          .getState()
          .setError(error instanceof Error ? error.message : 'Failed to load course enrollments.');
      }
      return false;
    } finally {
      finishScopedHotLoad(participantId, generation);
    }
  }, []);

  const loadHistoryPage = useCallback(async (participantId: string, generation: number) => {
    const state = useCourseEnrollmentStore.getState();
    if (
      state.scopedParticipantId !== participantId ||
      state.loadGeneration !== generation ||
      state.historyLoading ||
      !state.historyHasMore
    ) {
      return;
    }
    useCourseEnrollmentStore.getState().setHistoryLoading(true);
    try {
      const result = await queryCourseEnrollmentReadModels({
        scope: 'account_history',
        selectedParticipantId: ParticipantIdSchema.parse(participantId),
        ...(state.historyCursor ? { cursor: state.historyCursor } : {}),
      });
      const merged = mergeCourseEnrollmentRecords(state.items, result);
      const applied = useCourseEnrollmentStore.getState().applyScopedItems({
        participantId,
        generation,
        incoming: merged,
        mode: 'merge',
      });
      if (applied) {
        useCourseEnrollmentStore.getState().setHistoryCursor(result.nextCursor);
        useCourseEnrollmentStore.getState().setHistoryHasMore(result.hasMore);
      }
    } catch (error) {
      const current = useCourseEnrollmentStore.getState();
      if (current.loadGeneration === generation && current.scopedParticipantId === participantId) {
        useCourseEnrollmentStore.getState().setError(
          error instanceof Error ? error.message : 'Failed to load course enrollment history.'
        );
      }
    } finally {
      finishScopedHistoryLoad(participantId, generation);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !accountId) {
      useCourseEnrollmentStore.getState().reset();
      return;
    }
    if (!selectedParticipantId) {
      useCourseEnrollmentStore.getState().clearScopedEnrollments();
      return;
    }
    const generation = useCourseEnrollmentStore.getState().beginScopedLoad(selectedParticipantId);
    void loadHot(selectedParticipantId, generation).then((applied) => {
      if (applied) {
        void loadHistoryPage(selectedParticipantId, generation);
      }
    });
  }, [accountId, enabled, loadHistoryPage, loadHot, selectedParticipantId]);

  useEffect(() => {
    // Initial history page is chained after hot load; nonce 0 would duplicate that request.
    if (!enabled || !accountId || !selectedParticipantId || historyRequestNonce === 0) return;
    const state = useCourseEnrollmentStore.getState();
    if (state.scopedParticipantId !== selectedParticipantId) return;
    void loadHistoryPage(selectedParticipantId, state.loadGeneration);
  }, [historyRequestNonce, enabled, accountId, selectedParticipantId, loadHistoryPage]);

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
