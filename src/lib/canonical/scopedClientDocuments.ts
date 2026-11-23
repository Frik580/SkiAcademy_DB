import { auth, db, doc, onSnapshot } from '../../infrastructure/firebase';
import { callFunction } from '../functions/functionsClient';

// Firestore confirms the current assignment. Cached snapshots cannot move UI scope.
export function observeTestActorAssignment(
  uid: string,
  onAssignment: (sessionId: string | null) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    doc(db, `test_actor_assignments/${uid}`),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      const sessionId: unknown = snapshot.data()?.activeTestSessionId;
      onAssignment(typeof sessionId === 'string' ? sessionId : null);
    },
    onError ?? (() => onAssignment(null))
  );
}

export interface ScopedDocumentQuery {
  collection:
    | 'users'
    | 'instructors'
    | 'courses'
    | 'course_catalog_content'
    | 'availability_slots'
    | 'availability_hour_locks'
    | 'bookings'
    | 'notifications'
    | 'activity_logs'
    | 'wallet_ledger';
  take: number;
  where?: {
    field: 'userId' | 'instructorId' | 'status' | 'timestamp' | 'date' | '__name__';
    op: '==' | 'in' | '<';
    value: string | string[];
  }[];
  order?: {
    field: 'userId' | 'instructorId' | 'status' | 'timestamp' | 'date' | '__name__';
    direction: 'asc' | 'desc';
  }[];
}
type Document = { id: string; data: Record<string, unknown> };
type Page = {
  docs: Document[];
  cursor: string | null;
  runtimePath: string | null;
  revision: string | null;
};
let sequence = 0;
export async function getScopedDocumentPage(
  input: ScopedDocumentQuery,
  cursor?: string | null
): Promise<Page> {
  return callFunction<ScopedDocumentQuery & { cursor?: string }, Page>(
    'queryScopedClientDocuments',
    { ...input, ...(cursor ? { cursor } : {}) },
    { idempotencyKey: `read:scoped-client:${++sequence}`, maxAttempts: 1 }
  );
}
export interface ScopedDocumentSnapshot {
  docs: { id: string; data(): Record<string, unknown> }[];
  metadata: { fromCache: boolean };
  docChanges(): {
    type: 'added' | 'modified';
    doc: { id: string; data(): Record<string, unknown> };
  }[];
}

export async function getScopedDocuments(input: ScopedDocumentQuery): Promise<Page> {
  let cursor: string | null = null;
  let scanned = 0;
  const docs: Document[] = [];
  let last: Page;
  do {
    last = await getScopedDocumentPage(
      { ...input, take: Math.min(200, input.take - scanned) },
      cursor
    );
    docs.push(...last.docs);
    scanned += last.docs.length;
    cursor = last.cursor;
  } while (cursor && scanned < input.take);
  return { ...last!, docs };
}

/** Event-driven refresh, no timer or background history drain. Permission and
 * scope are resolved by the server on every refresh, not by these signal paths. */
export function subscribeScopedDocuments(
  input: Omit<ScopedDocumentQuery, 'collection'> & {
    collection:
      | 'users'
      | 'instructors'
      | 'courses'
      | 'course_catalog_content'
      | 'notifications'
      | 'activity_logs';
  },
  publish: (snapshot: ScopedDocumentSnapshot) => void,
  fail: (error: unknown) => void,
  // Consumers with an invalidation handler receive only successful snapshots
  // and can retain their data across transient refresh failures.
  invalidateScope?: () => void
): () => void {
  let active = true;
  let loading = false;
  let pending = false;
  let stop: (() => void) | undefined;
  let stopAssignment: (() => void) | undefined;
  let assignment: string | null | undefined;
  let generation = 0;
  let signalGeneration = 0;
  let path = '';
  let revision: string | null = null;
  let previous = new Map<string, string>();
  const uid = auth.currentUser?.uid;
  const isCurrentPrincipal = () => active && uid === auth.currentUser?.uid;
  const stopSignal = () => {
    signalGeneration++;
    stop?.();
    stop = undefined;
    path = '';
  };
  const clear = (keepSignal = false) => {
    generation++;
    if (!keepSignal) stopSignal();
    previous.clear();
    if (invalidateScope) invalidateScope();
    else publish({ docs: [], metadata: { fromCache: false }, docChanges: () => [] });
  };
  const scopeDenied = (error: unknown) => {
    const code = (error as { code?: string } | null)?.code;
    return (
      code === 'functions/permission-denied' ||
      code === 'functions/failed-precondition' ||
      Boolean(
        invalidateScope &&
        (code === 'functions/unauthenticated' ||
          code === 'permission-denied' ||
          code === 'unauthenticated')
      )
    );
  };
  const refresh = async () => {
    if (!isCurrentPrincipal()) return;
    if (loading) {
      pending = true;
      return;
    }
    loading = true;
    const currentGeneration = generation;
    try {
      const result = await getScopedDocuments(input);
      if (!isCurrentPrincipal() || currentGeneration !== generation) return;
      if (!result.runtimePath) throw new Error('This query has no realtime signal.');
      const testSession = /^client_read_runtime\/test\/sessions\/([^/]+)\//.exec(
        result.runtimePath
      )?.[1];
      if (testSession) {
        watchAssignment();
        if (assignment !== testSession) return;
      }
      revision = result.revision;
      const docs = result.docs.map((item) => ({ id: item.id, data: () => item.data }));
      const changes = docs.flatMap((item) => {
        const serialized = JSON.stringify(item.data());
        return previous.get(item.id) === serialized
          ? []
          : [
              {
                type: previous.has(item.id) ? ('modified' as const) : ('added' as const),
                doc: item,
              },
            ];
      });
      previous = new Map(docs.map((item) => [item.id, JSON.stringify(item.data())]));
      publish({ docs, metadata: { fromCache: false }, docChanges: () => changes });
      if (!isCurrentPrincipal() || currentGeneration !== generation) return;
      if (path !== result.runtimePath) {
        stopSignal();
        path = result.runtimePath;
        const currentSignal = signalGeneration;
        const isCurrentSignal = () => isCurrentPrincipal() && currentSignal === signalGeneration;
        stop = onSnapshot(
          doc(db, path),
          (signal) => {
            if (!isCurrentSignal()) return;
            const next = (signal.data()?.revision as string | undefined) ?? null;
            if (next !== revision) {
              revision = next;
              void refresh();
            }
          },
          (error) => {
            if (!isCurrentSignal()) return;
            if (!invalidateScope || scopeDenied(error)) clear();
            else stopSignal();
            fail(error);
          }
        );
      }
    } catch (error) {
      if (isCurrentPrincipal() && currentGeneration === generation) {
        const denied = scopeDenied(error);
        if (!invalidateScope || denied) clear(!denied);
        if (denied) watchAssignment();
        fail(error);
      }
    } finally {
      loading = false;
      if (pending && active) {
        pending = false;
        void refresh();
      }
    }
  };
  const watchAssignment = () => {
    if (!uid || stopAssignment) return;
    stopAssignment = observeTestActorAssignment(uid, (sessionId) => {
      if (!isCurrentPrincipal() || assignment === sessionId) return;
      assignment = sessionId;
      clear();
      if (sessionId) void refresh();
    });
  };
  void refresh();
  return () => {
    active = false;
    stopSignal();
    stopAssignment?.();
  };
}
