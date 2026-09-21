import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { z } from 'zod';
import {
  documentMatchesReadScope,
  identityDocumentMatchesReadScope,
  LIVE_CANONICAL_READ_SCOPE,
  TestSessionPolicyError,
  type CanonicalReadScope,
} from '@ski-academy/shared-domain';
import { CanonicalExecutionScopeError } from '../testSessions/canonicalExecutionScopeResolver';
import { peelRequestedTestSessionId } from '../testSessions/canonicalReadScopeResolver';

export type ReadScopeMatchKind = 'resource' | 'identity';

function matchesKind(
  kind: ReadScopeMatchKind,
  readScope: CanonicalReadScope,
  persisted: unknown
): boolean {
  return kind === 'identity'
    ? identityDocumentMatchesReadScope(readScope, persisted)
    : documentMatchesReadScope(readScope, persisted);
}

export function readScopeOrLive(
  readScope: CanonicalReadScope | undefined
): CanonicalReadScope {
  return readScope ?? LIVE_CANONICAL_READ_SCOPE;
}

export function parseIfVisibleInReadScope<T>(
  persisted: unknown,
  parse: (value: Record<string, unknown> | undefined) => T | undefined,
  readScope: CanonicalReadScope,
  kind: ReadScopeMatchKind = 'resource'
): T | undefined {
  if (!matchesKind(kind, readScope, persisted ?? {})) {
    return undefined;
  }
  return parse(persisted as Record<string, unknown> | undefined);
}

export function queryDocsMatchingReadScope(
  docs: readonly QueryDocumentSnapshot[],
  readScope: CanonicalReadScope,
  kind: ReadScopeMatchKind = 'resource'
): QueryDocumentSnapshot[] {
  return docs.filter((doc) => matchesKind(kind, readScope, doc.data() ?? {}));
}

export function hideSnapshotIfOutsideReadScope(
  snapshot: DocumentSnapshot,
  readScope: CanonicalReadScope,
  kind: ReadScopeMatchKind = 'resource'
): DocumentSnapshot {
  if (!snapshot.exists) return snapshot;
  if (matchesKind(kind, readScope, snapshot.data() ?? {})) return snapshot;
  return {
    exists: false,
    id: snapshot.id,
    ref: snapshot.ref,
    data: () => undefined,
    get: () => undefined,
  } as unknown as DocumentSnapshot;
}

export function scopeQuerySnapshot(
  snapshot: QuerySnapshot,
  readScope: CanonicalReadScope,
  kind: ReadScopeMatchKind = 'resource'
): QuerySnapshot {
  const docs = queryDocsMatchingReadScope(snapshot.docs, readScope, kind);
  return {
    ...snapshot,
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (callback: (doc: QueryDocumentSnapshot) => void) => {
      docs.forEach(callback);
    },
  } as QuerySnapshot;
}

export function parseReadModelCallableData<T>(
  schema: z.ZodType<T>,
  data: unknown
): { readonly input: T; readonly requestedTestSessionId?: unknown } {
  const peeled = peelRequestedTestSessionId(data);
  const parsed = schema.safeParse(peeled.rest);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'The request is invalid.');
  }
  return {
    input: parsed.data,
    ...(peeled.requestedTestSessionId === undefined
      ? {}
      : { requestedTestSessionId: peeled.requestedTestSessionId }),
  };
}

export function rethrowReadScopeHttpsError(error: unknown): never {
  if (error instanceof CanonicalExecutionScopeError) {
    const invalidArgument = error.code === 'TEST_SESSION_ID_INVALID';
    const permissionDenied =
      error.code === 'TEST_SESSION_FORBIDDEN' ||
      error.code === 'TEST_ACTOR_DISABLED' ||
      error.code === 'TEST_ACTOR_REQUEST_FORBIDDEN' ||
      error.code === 'TEST_ACTOR_ACCOUNT_INACTIVE';
    throw new HttpsError(
      invalidArgument
        ? 'invalid-argument'
        : permissionDenied
          ? 'permission-denied'
          : 'failed-precondition',
      invalidArgument
        ? 'The requested Test Session ID is invalid.'
        : permissionDenied
          ? 'This Test Session context is not permitted.'
          : 'The Test Session context is unavailable.',
      { code: error.code }
    );
  }
  if (error instanceof TestSessionPolicyError) {
    throw new HttpsError('failed-precondition', 'The Test Session is not active.', {
      code: error.code,
      ...(error.status === undefined ? {} : { status: error.status }),
    });
  }
  throw error;
}
