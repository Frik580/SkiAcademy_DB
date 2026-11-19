import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import {
  CourseEnrollmentIdSchema,
  ParticipantIdSchema,
} from '@ski-academy/shared-domain/canonical/identifiers';
import { isCourseEnrollmentHot } from '@ski-academy/shared-domain/canonical/readModels/courseEnrollmentReadModel';
import { timestampFromDate } from '@ski-academy/shared-domain/canonical/primitives';
import {
  type QueryCourseEnrollmentReadModelsInput,
  type QueryCourseEnrollmentReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  queryCourseCatalogReadModels,
  queryCourseEnrollmentReadModels,
} from '../../lib/canonical/canonicalReadModelClient';
import { useAuthStore } from '../auth/authStore';
import { useCourseEnrollmentStore } from './courseEnrollmentStore';
import { mergeCatalogRecords, mergeCourseEnrollmentRecords } from './courseEnrollmentViewModel';
import {
  listStoredGuestCourseEnrollmentCredentials,
  readGuestCourseEnrollmentCredential,
} from './guestCourseEnrollmentCredentialStorage';

let catalogRequest:
  | {
      generation: number;
      authGeneration: number;
      uid?: string;
      promise: Promise<void>;
    }
  | undefined;

/** One in-flight catalog read per principal; retries always call the canonical source. */
export function reloadCourseCatalog(): Promise<void> {
  const { firebaseUser, authGeneration } = useAuthStore.getState();
  const uid = firebaseUser?.uid;
  const state = useCourseEnrollmentStore.getState();
  if (
    catalogRequest &&
    catalogRequest.generation === state.catalogRequestGeneration &&
    catalogRequest.authGeneration === authGeneration &&
    catalogRequest.uid === uid
  ) {
    return catalogRequest.promise;
  }
  const generation = state.catalogRequestGeneration + 1;
  useCourseEnrollmentStore.setState({
    catalogRequestGeneration: generation,
    catalogLoading: true,
    catalogStatus: 'loading',
  });
  const isCurrent = () =>
    useCourseEnrollmentStore.getState().catalogRequestGeneration === generation &&
    useAuthStore.getState().authGeneration === authGeneration &&
    useAuthStore.getState().firebaseUser?.uid === uid;
  const promise = (async () => {
    try {
      const result = await queryCourseCatalogReadModels({ scope: uid ? 'product' : 'public' });
      if (!isCurrent()) return;
      useCourseEnrollmentStore.setState({
        catalogRecords: result.items,
        catalogByCourseId: mergeCatalogRecords(new Map(), result.items),
        catalogStatus: 'ready',
      });
    } catch {
      if (isCurrent()) useCourseEnrollmentStore.setState({ catalogStatus: 'error' });
    } finally {
      if (isCurrent()) useCourseEnrollmentStore.getState().setCatalogLoading(false);
      if (catalogRequest?.generation === generation) catalogRequest = undefined;
    }
  })();
  catalogRequest = { generation, authGeneration, uid, promise };
  return promise;
}

function finishScopedHistoryLoad(participantId: string, generation: number): boolean {
  const state = useCourseEnrollmentStore.getState();
  if (state.loadGeneration !== generation || state.scopedParticipantId !== participantId) {
    return false;
  }
  useCourseEnrollmentStore.getState().setHistoryLoading(false);
  return true;
}

/** Apply one hot page; only an exhausted first page can reconcile missing hot IDs. */
export function applyScopedHotCourseEnrollmentPage(input: {
  readonly participantId: string;
  readonly generation: number;
  readonly result: QueryCourseEnrollmentReadModelsResult;
  readonly cursor?: QueryCourseEnrollmentReadModelsInput['cursor'];
}): boolean {
  const state = useCourseEnrollmentStore.getState();
  if (
    input.result.scope !== 'account_hot' ||
    state.loadGeneration !== input.generation ||
    state.scopedParticipantId !== input.participantId
  ) {
    return false;
  }
  // Merge against the state at response time to preserve newer cached revisions.
  const merged = mergeCourseEnrollmentRecords(state.items, input.result);
  const complete = input.cursor === undefined && input.result.hasMore === false;
  if (complete) {
    const hotIds = new Set(input.result.items.map((item) => String(item.enrollmentId)));
    const now = timestampFromDate(new Date());
    for (const [id, item] of state.items) {
      // account_hot is authoritative for hot items only, never cached history.
      if (
        !hotIds.has(id) &&
        isCourseEnrollmentHot({
          lifecycleStatus: item.lifecycleStatus,
          finalCourseDayEndsAt: item.courseSchedule.finalCourseDayEndsAt,
          now,
        })
      ) {
        merged.delete(id);
      }
    }
  }
  return state.applyScopedItems({
    participantId: input.participantId,
    generation: input.generation,
    incoming: merged,
    mode: complete ? 'replace' : 'merge',
    refreshEqualRevisions: true,
  });
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
  const lastHistoryRequest = useRef(historyRequestNonce);
  const hotRequest = useRef(0);
  const activeScope = useRef<{ accountId: string; participantId: string }>();

  const loadHot = useCallback(async (participantId: string, generation: number, drain = false) => {
    const request = hotRequest.current + 1;
    const isCurrent = () => {
      const state = useCourseEnrollmentStore.getState();
      return (
        state.loadGeneration === generation &&
        state.scopedParticipantId === participantId &&
        hotRequest.current === request
      );
    };
    const state = useCourseEnrollmentStore.getState();
    if (state.loadGeneration !== generation || state.scopedParticipantId !== participantId) {
      return false;
    }
    hotRequest.current = request;
    useCourseEnrollmentStore.setState({ hotLoading: true, error: undefined });
    try {
      let cursor: QueryCourseEnrollmentReadModelsInput['cursor'];
      const seenCursors = new Set<string>();
      do {
        if (!isCurrent()) return false;
        const result = await queryCourseEnrollmentReadModels({
          scope: 'account_hot',
          selectedParticipantId: ParticipantIdSchema.parse(participantId),
          ...(cursor ? { cursor } : {}),
        });
        if (
          !isCurrent() ||
          !applyScopedHotCourseEnrollmentPage({ participantId, generation, result, cursor })
        ) {
          return false;
        }
        if (!drain || !result.hasMore) {
          useCourseEnrollmentStore.getState().setLoaded(true);
          return true;
        }
        // Filtering follows the scan: an empty page can still have a continuation.
        if (!result.nextCursor || seenCursors.has(result.nextCursor)) {
          throw new Error('Invalid CourseEnrollment hot pagination cursor.');
        }
        seenCursors.add(result.nextCursor);
        cursor = result.nextCursor;
      } while (cursor !== undefined);
      return false;
    } catch (error) {
      if (isCurrent()) {
        useCourseEnrollmentStore
          .getState()
          .setError(error instanceof Error ? error.message : 'Failed to load course enrollments.');
      }
      return false;
    } finally {
      if (isCurrent()) useCourseEnrollmentStore.getState().setHotLoading(false);
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
    useCourseEnrollmentStore.setState({ historyLoading: true, error: undefined });
    try {
      const result = await queryCourseEnrollmentReadModels({
        scope: 'account_history',
        selectedParticipantId: ParticipantIdSchema.parse(participantId),
        ...(state.historyCursor ? { cursor: state.historyCursor } : {}),
      });
      const merged = mergeCourseEnrollmentRecords(new Map(), result);
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
        useCourseEnrollmentStore
          .getState()
          .setError(
            error instanceof Error ? error.message : 'Failed to load course enrollment history.'
          );
      }
    } finally {
      finishScopedHistoryLoad(participantId, generation);
    }
  }, []);

  useLayoutEffect(() => {
    if (!enabled || !accountId) {
      activeScope.current = undefined;
      if (useCourseEnrollmentStore.getState().scopedParticipantId) {
        useCourseEnrollmentStore.getState().clearScopedEnrollments();
      }
      return;
    }
    if (!selectedParticipantId) {
      activeScope.current = undefined;
      useCourseEnrollmentStore.getState().clearScopedEnrollments();
      return;
    }
    const previous = activeScope.current;
    if (
      previous?.accountId === accountId &&
      previous.participantId === selectedParticipantId &&
      useCourseEnrollmentStore.getState().scopedParticipantId === selectedParticipantId
    )
      return;
    if (previous && previous.accountId !== accountId) {
      useCourseEnrollmentStore.getState().clearScopedEnrollments();
    }
    activeScope.current = { accountId, participantId: selectedParticipantId };
    const generation = useCourseEnrollmentStore.getState().beginScopedLoad(selectedParticipantId);
    void loadHot(selectedParticipantId, generation, true).then((applied) => {
      if (applied) {
        void loadHistoryPage(selectedParticipantId, generation);
      }
    });
  }, [accountId, enabled, loadHistoryPage, loadHot, selectedParticipantId]);

  useEffect(() => {
    // Initial history page is chained after hot load; nonce 0 would duplicate that request.
    if (lastHistoryRequest.current === historyRequestNonce) return;
    lastHistoryRequest.current = historyRequestNonce;
    if (!enabled || !accountId || !selectedParticipantId || historyRequestNonce === 0) return;
    const state = useCourseEnrollmentStore.getState();
    if (state.scopedParticipantId !== selectedParticipantId) return;
    void loadHistoryPage(selectedParticipantId, state.loadGeneration);
  }, [historyRequestNonce, enabled, accountId, selectedParticipantId, loadHistoryPage]);

  return { reloadHot: loadHot, reloadCatalog: reloadCourseCatalog };
}

export async function loadGuestSingleCourseEnrollment(enrollmentId: string) {
  const { authGeneration } = useAuthStore.getState();
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
  if (useAuthStore.getState().authGeneration !== authGeneration) {
    throw new Error('Session changed while loading the guest enrollment.');
  }
  if (result.items.length === 0) {
    throw new Error('Guest course enrollment read model was not found.');
  }
  const merged = mergeCourseEnrollmentRecords(useCourseEnrollmentStore.getState().items, result);
  useCourseEnrollmentStore.getState().mergeItems(merged);
  return result.items[0];
}

export async function hydrateGuestCourseEnrollmentsFromStorage(): Promise<void> {
  const credentials = listStoredGuestCourseEnrollmentCredentials();
  if (credentials.length === 0) {
    return;
  }
  await Promise.all(
    credentials.map(async (credential) => {
      try {
        await loadGuestSingleCourseEnrollment(credential.enrollmentId);
      } catch {
        // Skip expired/unauthorized credentials; catalog remains the seat authority.
      }
    })
  );
}

export function useGuestCourseEnrollmentReadSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void hydrateGuestCourseEnrollmentsFromStorage();
  }, [enabled]);
}

/** Sole mount-time owner of the course catalog read for `/` and `/cabinet*`. */
export function useCourseCatalogReadSync(enabled: boolean) {
  const firebaseUserId = useAuthStore((state) => state.firebaseUser?.uid);
  const authGeneration = useAuthStore((state) => state.authGeneration);

  const loadCatalog = useCallback(async () => {
    if (enabled) await reloadCourseCatalog();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void loadCatalog();
  }, [authGeneration, enabled, firebaseUserId, loadCatalog]);

  return { reloadCatalog: loadCatalog };
}
