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
  type CourseCatalogReadModel,
  type QueryCourseCatalogReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  db,
  doc,
  handleFirestoreError,
  onSnapshot,
  OperationType,
} from '../../infrastructure/firebase';
import { observeTestActorAssignment } from '../../lib/canonical/scopedClientDocuments';
import {
  queryCourseCatalogReadModels,
  queryCourseEnrollmentReadModels,
} from '../../lib/canonical/canonicalReadModelClient';
import { useAuthStore } from '../auth/authStore';
import { useCoursesStore } from '../courses/coursesStore';
import { useUiStore } from '../shell/uiStore';
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

function clearCourseCatalog() {
  useUiStore.setState({
    selectedCourseForAuth: null,
    selectedCourseForDetails: null,
    selectedCourseDetailsEnrollmentId: undefined,
  });
  useCourseEnrollmentStore.setState({
    catalogRecords: [],
    catalogByCourseId: new Map(),
    catalogPage: undefined,
    catalogStatus: 'loading',
  });
}

function invalidateCourseCatalog() {
  useCourseEnrollmentStore.setState((state) => ({
    catalogRequestGeneration: state.catalogRequestGeneration + 1,
  }));
  clearCourseCatalog();
}

function isCatalogScopeError(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return ['permission-denied', 'unauthenticated', 'failed-precondition'].some(
    (denied) => code === denied || code === `functions/${denied}`
  );
}

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
      const items: CourseCatalogReadModel[] = [];
      let firstPage: QueryCourseCatalogReadModelsResult['page'];
      let cursor: string | undefined;
      let restarted = false;
      do {
        let result: QueryCourseCatalogReadModelsResult;
        try {
          result = await queryCourseCatalogReadModels({
            scope: uid ? 'product' : 'public',
            page: cursor ? { cursor } : {},
          });
        } catch (error) {
          if (!isCurrent()) return;
          const code = (error as { code?: string } | null)?.code;
          if (!cursor || restarted || (code !== 'functions/aborted' && code !== 'aborted'))
            throw error;
          items.length = 0;
          firstPage = undefined;
          cursor = undefined;
          restarted = true;
          continue;
        }
        if (!isCurrent()) return;
        if (!result.page) throw new Error('Catalog pagination is unavailable.');
        const confirmedScope = useCourseEnrollmentStore.getState().catalogPage?.scopeKey;
        if (!firstPage && confirmedScope && confirmedScope !== result.page.scopeKey) {
          clearCourseCatalog();
        }
        if (firstPage && firstPage.scopeKey !== result.page.scopeKey) {
          invalidateCourseCatalog();
          useCourseEnrollmentStore.setState({ catalogStatus: 'error', catalogLoading: false });
          return;
        }
        if (cursor && result.page.next === cursor) throw new Error('Invalid catalog continuation.');
        firstPage ??= result.page;
        items.push(...result.items);
        cursor = result.page.next ?? undefined;
      } while (cursor || !firstPage);
      useCourseEnrollmentStore.setState({
        catalogRecords: items,
        catalogByCourseId: mergeCatalogRecords(new Map(), items),
        catalogPage: firstPage,
        catalogStatus: 'ready',
      });
    } catch (error) {
      if (isCurrent()) {
        if (isCatalogScopeError(error)) invalidateCourseCatalog();
        useCourseEnrollmentStore.setState({ catalogStatus: 'error', catalogLoading: false });
      }
    } finally {
      if (isCurrent()) useCourseEnrollmentStore.getState().setCatalogLoading(false);
      if (catalogRequest?.generation === generation) catalogRequest = undefined;
    }
  })();
  catalogRequest = { generation, authGeneration, uid, promise };
  return promise;
}

export function retryCourseCatalog(): Promise<void> {
  useCoursesStore.getState().retryPublicCourses();
  return reloadCourseCatalog();
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
  const credential = stored.credential.participantReadCredential ?? stored.credential;
  const result = await queryCourseEnrollmentReadModels({
    scope: 'guest_single',
    enrollmentId: CourseEnrollmentIdSchema.parse(enrollmentId),
    guestActionNonce: credential.nonce,
    guestActionSignature: credential.signature,
  });
  if (useAuthStore.getState().authGeneration !== authGeneration) {
    throw new Error('Session changed while loading the guest enrollment.');
  }
  if (result.scope !== 'guest_single' || result.items.length === 0) {
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
  const authLoading = useAuthStore((state) => state.authLoading);
  const firebaseUserId = useAuthStore((state) => state.firebaseUser?.uid);
  const authGeneration = useAuthStore((state) => state.authGeneration);
  const scopeKey = useCourseEnrollmentStore((state) => state.catalogPage?.scopeKey);
  const retryNonce = useCoursesStore((state) => state.publicCoursesRetryNonce);

  const loadCatalog = useCallback(async () => {
    if (enabled && !useAuthStore.getState().authLoading) await reloadCourseCatalog();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || authLoading) return;
    void loadCatalog();
  }, [authGeneration, authLoading, enabled, firebaseUserId, loadCatalog, retryNonce]);

  useEffect(() => {
    if (!enabled || authLoading || !firebaseUserId) return;
    let active = true;
    let assignment: string | null | undefined;
    const stop = observeTestActorAssignment(
      firebaseUserId,
      (sessionId) => {
        if (!active || assignment === sessionId) return;
        const previous = assignment;
        assignment = sessionId;
        const currentScope = useCourseEnrollmentStore.getState().catalogPage?.scopeKey;
        const assignedScope = sessionId ? `test/sessions/${sessionId}` : 'live';
        if (previous === undefined && (currentScope === assignedScope || (!sessionId && !currentScope)))
          return;
        invalidateCourseCatalog();
        void loadCatalog();
      },
      (error) => {
        const currentScope = useCourseEnrollmentStore.getState().catalogPage?.scopeKey;
        // LIVE accounts cannot read TestActor assignments.
        if (!active || !currentScope?.startsWith('test/')) return;
        if (isCatalogScopeError(error)) {
          invalidateCourseCatalog();
          void loadCatalog();
        } else {
          useCourseEnrollmentStore.setState({ catalogStatus: 'error' });
        }
      }
    );
    return () => {
      active = false;
      stop?.();
    };
  }, [authGeneration, authLoading, enabled, firebaseUserId, loadCatalog, retryNonce]);

  useEffect(() => {
    if (!enabled || authLoading || !scopeKey) return;
    let active = true;
    const collections = ['courses', 'course_catalog_content'] as const;
    const unsubscribes = collections.map((collection, index) =>
      onSnapshot(
        doc(db, `client_read_runtime/${scopeKey}/collections/${collection}`),
        { includeMetadataChanges: true },
        (snapshot) => {
          const page = useCourseEnrollmentStore.getState().catalogPage;
          if (
            !active ||
            page?.scopeKey !== scopeKey ||
            snapshot.metadata.fromCache ||
            snapshot.metadata.hasPendingWrites
          )
            return;
          if ((snapshot.data()?.revision ?? null) !== page.revisions[index]) {
            // A request already in flight might have read an older snapshot.
            const inFlight = catalogRequest?.promise;
            if (inFlight) {
              void inFlight.then(() => {
                const latest = useCourseEnrollmentStore.getState().catalogPage;
                if (
                  active &&
                  latest?.scopeKey === scopeKey &&
                  (snapshot.data()?.revision ?? null) !== latest.revisions[index]
                )
                  void loadCatalog();
              });
            } else void loadCatalog();
          }
        },
        (error) => {
          if (!active || useCourseEnrollmentStore.getState().catalogPage?.scopeKey !== scopeKey)
            return;
          if (isCatalogScopeError(error)) {
            invalidateCourseCatalog();
            void loadCatalog();
          } else {
            useCourseEnrollmentStore.setState({ catalogStatus: 'error' });
            handleFirestoreError(error, OperationType.LIST, collection);
          }
        }
      )
    );
    return () => {
      active = false;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [authGeneration, authLoading, enabled, loadCatalog, retryNonce, scopeKey]);

  return { reloadCatalog: loadCatalog };
}
